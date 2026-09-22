"""Wallet + payments services — the rules of 003/004/005/006 and the two
Razorpay edge functions re-expressed in code, per module. THE MONEY CORE;
state the invariants back before touching anything:

  MONEY IS INTEGERS IN PAISE (rule 1). Every amount below is paise; no
  float touches any of these paths.

  THE LEDGER IS APPEND-ONLY (rule 2). No UPDATE, no DELETE, ever — prod's
  refuse_mutation trigger is mirrored by the Ledger model's guard, and no
  service here edits or removes a row. A mistake is corrected by a
  REVERSING ENTRY. `wallets.balance_paise` is a cache: if it disagrees
  with the sum of the ledger, the ledger is right and the balance is the
  bug. The cache is carried by prod's after-insert trigger (003); on
  SQLite this module's insert_ledger emulates that trigger — on Postgres
  it must NOT double-write it.

  SERVICES ARE THE ONLY MUTATION PATH. Nothing reaches wallets/ledger/
  payments except through this module: the client's only money writes
  are `debit` (005's wallet_debit — ref_type is ALWAYS 'order', the
  client never chooses it) and top-up ORDER CREATION, which moves no
  money at all. Credits are server-side only: payment_capture (via the
  signature-verified webhook) and service-role adjustments.

  THE CLIENT NEVER SENDS A NUMBER IT BENEFITS FROM (rule 3). spend()
  sends an amount because a debit is not one (005, verbatim). What a
  top-up CREDITS is Razorpay's captured amount, read from a payload whose
  signature was verified first — never the number the browser asked for.

  ONE WRITE PER USER ACTION (rule 5). The event row and the ledger row
  are one transaction, or neither (006).

  WEBHOOKS VERIFY SIGNATURES AND ARE IDEMPOTENT (rule 6). The signature
  is verified over the RAW body before anything in it is parsed. The
  guarantee is the two unique columns on provider_payment_id /
  provider_event_id — never an application-level "have I seen this?"
  check, which would race with its own write. A retried delivery
  violates the index and the whole block — credit included — rolls back;
  the handler answers ok/duplicate so Razorpay stops retrying.

  ATTRIBUTION NEVER ROUND-TRIPS THROUGH THE CLIENT. The wallet a capture
  credits is found through the 'created' payments row matching the order
  id — never the payload's notes. A payment that matches no order RAISES
  rather than guessing: it answers 500 and Razorpay retries an
  unattributable payment for a while, which is the loud half of the
  mistake and the right half.

  LEDGER ROWS NAME THE OTHER PARTY (013 fix 4, a services rule): the
  caller of insert_ledger builds `kind` from the counterparty's name —
  'Atharv · 20 min' in the seeker's book, the seeker's name in the
  consultant's.

HOLD AND REFUND SEMANTICS (module 7's meter and module 6's booking write
through this module now — apps.consultants.gateway's wallet functions
moved here unchanged): a hold is insert_ledger(-hold, ref_type='order',
ref_id=order_id) inside the caller's transaction; a refund is
insert_ledger(+refund, ref_type='refund', ref_id=order_id) — 013's
partial unique index ledger_one_refund_per_order makes the insert the
check: one refund per order, a retry a no-op, a race caught, never
checked for. The SQL results are byte-identical to what module 6/7's
gateways produced, because the SQL is the same.

THE RAZORPAY HALF is two services with edge-function parity:

  create_topup_order (razorpay-order/index.ts): validates the band
  (MIN_PAISE ₹100 / MAX_PAISE ₹1,00,000 — the PRD's, docs/01-PRD §4.8),
  opens the order, writes the 'created' row. Fail BEFORE checkout opens
  rather than after — a payment whose order row is missing cannot be
  attributed, so the person must never reach the card form. CORS is the
  deployed origin allowlist; the Django API answers the browser's own
  CORS middleware (apps.core.middleware), so only the refusal sentences
  travel.

  handle_webhook (razorpay-webhook/index.ts): verify-then-parse over the
  raw body, HANDLED = {payment.captured, payment.failed}, everything else
  a 200 'Ignored.', then payment_capture (006, above). 500s on capture
  failure so Razorpay retries; the reconciliation sweep is the thing that
  notices when retries gave up.

Amount-must-match-order: payment_capture REFUSES a capture whose amount
differs from the 'created' row it attributes through (500, retried,
named by reconciliation). 006 did not carry this check — the order row's
amount and Razorpay's captured amount are the same number in every
legitimate flow (checkout pays the order's exact amount, and the payload
is signature-verified), so a mismatch is not a payment but an anomaly,
and crediting either number silently is the quiet half of the mistake.
Documented deviation, deliberate.

Reconciliation (backend/tools/reconcile-payments.mjs, ported): a row
stuck at 'created' is byte-identical whether the person abandoned
checkout or paid and got nothing — only the provider knows, so the sweep
ASKES Razorpay. It is READ ONLY: it credits nothing, because a script
that mints undoes the reason the webhook is the only credit path. It
exits non-zero and names the people owed.
"""

import json
import logging
import uuid

from django.conf import settings
from django.db import DatabaseError, IntegrityError, connection, transaction

from .models import Payment, PaymentStatus, RefType
from .razorpay import RazorpayClient, RazorpayError, signature_hex, signatures_match

logger = logging.getLogger("apps.wallet")

# ── the top-up band, named once (the edge function's constants; the PRD's
# band, docs/01-PRD.md §4.8 — enforced server-side because the browser's
# copy is a convenience) ─────────────────────────────────────────────────────

MIN_PAISE = 10_000  #     ₹100
MAX_PAISE = 10_000_000  # ₹1,00,000

# ── refusal sentences: byte-identical to 003/005/006 and both edge
# functions — the UI already shows these (INSTRUCTIONS §2: the server's
# job is to make the string true, not to invent a new vocabulary) ────────────

REFUSAL_SIGN_IN_PAY = "Sign in to pay from your wallet."
REFUSAL_NOT_CHARGEABLE = "That is not something we can charge for."
REFUSAL_NO_WALLET = "No wallet on this account."
REFUSAL_SHORT_BALANCE = "Not enough balance"
REFUSAL_SIGN_IN_TOPUP = "Sign in to add money."
REFUSAL_BAND = "Add between ₹100 and ₹1,00,000."
REFUSAL_NOT_CONFIGURED = "Payments are not configured yet."
REFUSAL_PROVIDER = "Could not reach the payment provider. Try again."
REFUSAL_RECORD = "Could not start that payment. Try again."
REFUSAL_ORDER_NOT_YOURS = "That order is not yours."
REFUSAL_ORDER_EXPIRED = "That order has expired. Place it again."

# The webhook's answers are plain text, like the edge function's.
WEBHOOK_NOT_CONFIGURED = "Not configured."
WEBHOOK_BAD_SIGNATURE = "Bad signature."
WEBHOOK_BAD_PAYLOAD = "Bad payload."
WEBHOOK_IGNORED = "Ignored."
WEBHOOK_CAPTURE_FAILED = "Could not record that payment."

# The edge function's event map — payment.captured and payment.failed are
# the only outcomes that move money or record a terminal row.
HANDLED_EVENTS = {
    "payment.captured": PaymentStatus.CAPTURED,
    "payment.failed": PaymentStatus.FAILED,
}


class Refusal(Exception):
    """A business refusal carrying the HTTP status and the exact sentence
    the interface already shows (the edge function's `refuse`)."""

    def __init__(self, status, reason):
        super().__init__(reason)
        self.status = status
        self.reason = reason


class CaptureFailed(Exception):
    """payment_capture's internal failures — bad status, non-positive
    amount, unattributable order, amount mismatch. The webhook answers
    500 (Razorpay retries) and logs the specific message, exactly like
    the edge function logging error.message from payment_capture."""

    def __init__(self, detail):
        super().__init__(detail)
        self.detail = detail


# ── wallets / ledger: the primitives every money path serialises on ──────────


def _xid(left, right):
    """Format-agnostic UUID comparison across Django UUIDFields (dashless
    on SQLite) and raw text/uuid columns — the gateway helper, carried
    home with the money primitives: wallets/ledger rows may arrive
    through either shape, and money reads must not depend on which."""
    return (
        f"replace(cast({left} as text), '-', '')"
        f" = replace(cast({right} as text), '-', '')"
    )


def lock_wallet_balance(profile_id):
    """The balance under a ROW LOCK (003/005's `for update`): two debits
    by the same person serialise here, so they cannot both read the same
    balance and both pass. None when there is no wallet on the account.
    Postgres takes FOR UPDATE; SQLite's file lock is the serializer and
    skips the clause (the gateway precedent)."""
    sql = (
        "select balance_paise from wallets where"
        f" {_xid('profile_id', '%s')}"
    )
    if connection.vendor == "postgresql":
        sql += " for update"
    with connection.cursor() as cursor:
        cursor.execute(sql, [str(profile_id)])
        row = cursor.fetchone()
    return row[0] if row else None


def balance_of(profile_id):
    """The balance without the lock — advisory reads only ('No wallet'
    reads as None, exactly 003's not-found branch)."""
    return lock_wallet_balance(profile_id)


def insert_ledger(wallet_id, delta_paise, kind, ref_type=None, ref_id=None, note=None):
    """THE append (003). One ledger row; the balance follows by prod's
    after-insert trigger on Postgres, and by this emulation on SQLite,
    whose fixtures have no triggers — the phase-2 trigger's exact job, so
    wallets stay correct by construction on both backends. On Postgres
    this function must NOT touch wallets: the trigger does, and a
    double-write is the bug the trigger exists to prevent.

    005's discipline lives here: ref_type is chosen by the SERVICE, never
    the client — wallet_debit's rows are always 'order'; 'payment' and
    'refund' are written server-side only."""
    if ref_type is not None and ref_type not in RefType.values:
        raise ValueError(f"unknown ref_type {ref_type!r}")
    row_id = str(uuid.uuid4())
    with transaction.atomic():  # the row and its balance carry are one
        with connection.cursor() as cursor:
            cursor.execute(
                "insert into ledger (id, wallet_id, delta_paise, kind, ref_type, ref_id,"
                " note, created_at) values (%s, %s, %s, %s, %s, %s, %s, %s)",
                [row_id, str(wallet_id), delta_paise, kind, ref_type,
                 (str(ref_id) if ref_id is not None else None), note, _now()],
            )
            if connection.vendor != "postgresql":
                cursor.execute(
                    "update wallets set balance_paise = balance_paise + %s"
                    f" where {_xid('profile_id', '%s')}",
                    [delta_paise, str(wallet_id)],
                )
    return row_id


def _now():
    from django.utils import timezone

    return timezone.now()


def ensure_wallet(profile_id):
    """The wallet row, creating it for tests/fresh databases. In prod the
    row already exists — Supabase's handle_new_user trigger made it at
    signup (auth stays on Supabase, docs/07 §6 step 10). Reachable from
    no URL: nothing client-callable creates a wallet. Raw SQL, not the
    ORM: this module's wallet/ledger truth is read and written through
    format-agnostic SQL (see _xid), and a row only the ORM can see would
    be a balance that reads as missing."""
    with connection.cursor() as cursor:
        cursor.execute(
            "insert into wallets (profile_id, balance_paise, created_at)"
            " values (%s, 0, %s) on conflict (profile_id) do nothing",
            [str(profile_id), _now()],
        )


def debit(profile_id, amount_paise, kind):
    """005's wallet_debit, statement for statement — the ONLY client-
    reachable money move, and it moves money OUT. ref_type is 'order',
    always: the client never chooses it (005 removed the parameter
    because a self-tagged 'payment' row corrupts meaning and the
    reconciliation). Returns the function's own jsonb shape:
    {ok, reason?, balance_paise?} — the UI toasts reason verbatim."""
    if amount_paise is None or amount_paise <= 0 or not str(kind or "").strip():
        return {"ok": False, "reason": REFUSAL_NOT_CHARGEABLE}
    with transaction.atomic():
        # The lock is the concurrency control: the check is against the
        # LOCKED number, never a balance the client sent.
        balance = lock_wallet_balance(profile_id)
        if balance is None:
            return {"ok": False, "reason": REFUSAL_NO_WALLET}
        if amount_paise > balance:
            return {
                "ok": False,
                "reason": REFUSAL_SHORT_BALANCE,
                "balance_paise": balance,
            }
        insert_ledger(profile_id, -amount_paise, kind, ref_type=RefType.ORDER)
    return {"ok": True, "balance_paise": balance - amount_paise}


def credit(wallet_id, amount_paise, kind, ref_type, ref_id=None, note=None):
    """THE server-side credit path — the only ways in here are
    payment_capture (a signature-verified Razorpay capture) and a
    service-role adjustment (003's hand-typed recipe, reachable from no
    URL). Validates like debit; the caller's transaction owns the row."""
    if amount_paise is None or amount_paise <= 0 or not str(kind or "").strip():
        raise ValueError("a credit needs a positive amount and a kind")
    return insert_ledger(wallet_id, amount_paise, kind, ref_type=ref_type,
                         ref_id=ref_id, note=note)


def list_ledger(profile_id, after=None, limit=50):
    """The wallet's own ledger rows, newest first — the ledger_select_own
    policy as a query (RLS parity: caller-scoped, no user id in the
    filter). Keyset-paged (docs/07 §3.1): `after` is the id of the last
    row the caller saw; the next page is every row strictly older, ties
    on created_at broken by id, so a page can never gap or duplicate
    while new rows land. Rows come back raw (snake_case) — DRF renders
    them exactly like PostgREST did, and the client shapes them."""
    limit = min(max(int(limit or 50), 1), 200)
    where = f"where {_xid('wallet_id', '%s')}"
    params = [str(profile_id)]
    if after is not None:
        with connection.cursor() as cursor:
            cursor.execute(
                f"select created_at, id from ledger where {_xid('id', '%s')}",
                [str(after)],
            )
            anchor = cursor.fetchone()
        if anchor is not None:
            where += (
                " and (created_at < %s or (created_at = %s and id < %s))"
            )
            params.extend([anchor[0], anchor[0], str(after)])
        # An unknown anchor: from the beginning — it should always be a
        # row the server itself handed out.
    with connection.cursor() as cursor:
        cursor.execute(
            f"select id, wallet_id, delta_paise, kind, ref_type, ref_id, note,"
            f" created_at from ledger {where}"
            f" order by created_at desc, id desc limit %s",
            params + [limit],
        )
        columns = [c[0] for c in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]


# ── Razorpay order creation (razorpay-order/index.ts) ────────────────────────


def pending_order(order_id):
    """(profile_id, status, total_paise, still_held) for one order, or None.
    A shop or Academy order is held for 30 minutes (028/031); past that the
    sweeper puts its stock or seat back, so it is not paid for."""
    with connection.cursor() as cursor:
        cursor.execute(
            "select profile_id, status, total_paise,"
            "       coalesce(expires_at > now(), false) from orders where id = %s",
            [str(order_id)],
        )
        return cursor.fetchone()


def create_topup_order(profile_id, amount_paise=None, client=None, key_id=None, order_id=None):
    """Opens a Razorpay order so the browser can start checkout. This
    function does NOT credit anything: it writes the 'created' row, the
    only record tying a Razorpay order id to one of our profiles.

    Idempotency: the module-1 Idempotency-Key middleware replays a
    retried POST without re-executing it, and on Postgres a racing
    double-submit of the same key meets the (key, user) unique index —
    two checkouts cannot open from one tap (the client's toppingUpRef
    guard is the first line, as today).

    The band below is the PRD's, enforced here because the browser's copy
    of it is a convenience. Amount in paise, both directions (rule 1).

    Phase 10: `order_id` instead of an amount pays for a pending shop or
    Academy order. The amount is the ORDER's, read here — the client says
    only which order — and the top-up band does not apply: a ₹640 camphor
    set is not a top-up. The 'created' row carries the order id, which is
    what lets payment_capture settle it.
    """
    if order_id is not None:
        order = pending_order(order_id)
        if order is None or str(uuid.UUID(str(order[0]))) != str(uuid.UUID(str(profile_id))):
            raise Refusal(404, REFUSAL_ORDER_NOT_YOURS)
        if order[1] != "pending" or not order[3]:
            raise Refusal(409, REFUSAL_ORDER_EXPIRED)
        amount_paise = order[2]
    elif (
        not isinstance(amount_paise, int)
        or isinstance(amount_paise, bool)
        or amount_paise < MIN_PAISE
        or amount_paise > MAX_PAISE
    ):
        raise Refusal(400, REFUSAL_BAND)
    key_id = key_id or getattr(settings, "RAZORPAY_KEY_ID", "")
    key_secret = getattr(settings, "RAZORPAY_KEY_SECRET", "")
    if not key_id or not key_secret:
        # Named individually — "one of these two is missing" sent someone
        # to the wrong dashboard page once already.
        logger.error(
            "[order] not configured: %s",
            " and ".join(
                name for name, value in (("RAZORPAY_KEY_ID", key_id),
                                         ("RAZORPAY_KEY_SECRET", key_secret))
                if not value
            ),
        )
        raise Refusal(500, REFUSAL_NOT_CONFIGURED)
    client = client or RazorpayClient(
        key_id, key_secret, base_url=getattr(settings, "RAZORPAY_BASE_URL", "")
    )
    try:
        notes = {"profile_id": str(profile_id)}
        if order_id is not None:
            notes["shop_order_id"] = str(order_id)
        order = client.create_order(amount_paise, notes=notes)
    except RazorpayError as exc:
        logger.error("[order] razorpay refused: %s", exc.status)
        raise Refusal(502, REFUSAL_PROVIDER) from None
    try:
        Payment.objects.create(
            profile_id=profile_id,
            provider_order_id=order["id"],
            amount_paise=amount_paise,
            status=PaymentStatus.CREATED,
            order_id=order_id,
        )
    except Exception:
        # Fail before checkout opens rather than after: a payment whose
        # order row is missing cannot be attributed, and the webhook will
        # refuse to credit it — better the person never reaches the card
        # form than pays into nothing.
        logger.exception("[order] could not record order")
        raise Refusal(500, REFUSAL_RECORD) from None
    return {
        "ok": True,
        "order_id": order["id"],
        "amount_paise": amount_paise,
        "key_id": key_id,
    }


def topup_status(profile_id, order_id):
    """The client-visible outcome of one top-up — the latest payments row
    for this caller's own order (the payments_select_own policy as a
    query). None when the order is not the caller's or never existed, so
    ids do not leak existence. The top-up flow polls the balance, but
    this is the honest 'what happened to that payment' read the settling
    screen can ask for."""
    row = (
        Payment.objects.filter(profile_id=profile_id, provider_order_id=str(order_id))
        .exclude(status=PaymentStatus.CREATED)
        .order_by("-created_at")
        .first()
    )
    if row is None:
        return None
    return {
        "order_id": str(order_id),
        "status": row.status,
        "amount_paise": row.amount_paise,
        "provider_payment_id": row.provider_payment_id,
    }


# ── the webhook (razorpay-webhook/index.ts) and the credit (006) ─────────────


def payment_capture(event_id, order_id, payment_id, amount_paise, status, raw):
    """006's payment_capture, statement for statement — the ONLY path by
    which money enters a wallet. One transaction: the event row and the
    ledger row, or neither. Returns the function's own jsonb shape; a
    retried delivery returns {ok: True, duplicate: True} because the
    unique index — never a check — caught it and rolled the block back.

    The amount credited is Razorpay's, from a payload whose signature was
    verified before this ran; the wallet is found through the 'created'
    row matching the order id, never the payload's notes. A capture whose
    amount differs from the order it attributes through is refused
    (see the module header's amount-must-match-order)."""
    if status not in (PaymentStatus.CAPTURED, PaymentStatus.FAILED):
        raise CaptureFailed(f"payment_capture handles captured and failed, not {status}")
    if amount_paise is None or amount_paise <= 0:
        raise CaptureFailed(f"payment {payment_id} has no positive amount")
    with connection.cursor() as cursor:
        cursor.execute(
            "select profile_id, amount_paise, order_id from payments"
            " where provider_order_id = %s and status = 'created'"
            " order by created_at desc limit 1",
            [str(order_id)],
        )
        created = cursor.fetchone()
    if created is None:
        raise CaptureFailed(f"no order {order_id} on this system")
    profile_id, order_amount, shop_order = created
    # Canonical dashed form whatever the backend stored (Django keeps
    # UUIDFields dashless on SQLite) — the value is returned to the
    # webhook log and feeds the ORM payment row.
    profile_id = str(uuid.UUID(str(profile_id)))
    if amount_paise != order_amount:
        raise CaptureFailed(
            f"payment {payment_id} captured {amount_paise} against order"
            f" {order_id} opened for {order_amount}"
        )
    try:
        with transaction.atomic():
            Payment.objects.create(
                profile_id=profile_id,
                provider_order_id=str(order_id),
                provider_payment_id=str(payment_id),
                provider_event_id=(str(event_id) if event_id is not None else None),
                amount_paise=amount_paise,
                status=status,
                raw=raw,
                order_id=shop_order,
            )
            settle = None
            if status == PaymentStatus.CAPTURED:
                # The balance is not touched here. The after-insert
                # trigger on `ledger` moves it (003), emulated by
                # insert_ledger on SQLite — so the credit and the cache
                # cannot disagree.
                credit(
                    profile_id,
                    amount_paise,
                    "Added money",
                    ref_type=RefType.PAYMENT,
                )
                if shop_order is not None:
                    settle = settle_order(shop_order)
    except IntegrityError:
        # A retried delivery: provider_payment_id or provider_event_id
        # already exists. The ordinary case, not an error — everything
        # above, the credit included, has rolled back with the block.
        return {"ok": True, "duplicate": True}
    return {
        "ok": True,
        "duplicate": False,
        "profile_id": str(profile_id),
        "shop_order": str(shop_order) if shop_order is not None else None,
        "settle": settle,
    }


def settle_order(order_id):
    """028's tail of payment_capture: the money just landed, so spend it on
    the order it was opened for — inside the capture's transaction, through
    the one settle the shop, the Academy and wallet checkout all share
    (shop_order_settle). Any failure but a short balance rolls the credit
    back with it, the webhook answers 500 and Razorpay retries the whole
    delivery. A short balance, or an order the sweeper already released,
    leaves the money in the wallet: the safe half."""
    try:
        with transaction.atomic(), connection.cursor() as cursor:
            cursor.execute("select public.shop_order_settle(%s)", [str(order_id)])
            return cursor.fetchone()[0]
    except DatabaseError as exc:
        if getattr(exc.__cause__, "sqlstate", None) == "WB001":
            return {"ok": True, "settled": False, "status": "short"}
        raise


def handle_webhook(raw_body: bytes, signature: str, event_id):
    """The edge function's Deno.serve handler as a service. VERIFY, THEN
    PARSE: nothing in the body is worth reading until the HMAC of the
    raw bytes matches the header — the signature IS the authentication
    (verify_jwt = false on the function, because Razorpay cannot present
    a Supabase JWT).

    Returns {"status", "body", "json"} — the view answers it verbatim.
    """
    secret = getattr(settings, "RAZORPAY_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("[webhook] RAZORPAY_WEBHOOK_SECRET is not set")
        return {"status": 500, "body": WEBHOOK_NOT_CONFIGURED, "json": None}
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    if not signatures_match(signature or "", signature_hex(secret, raw_body)):
        logger.error("[webhook] signature did not match; body ignored")
        return {"status": 401, "body": WEBHOOK_BAD_SIGNATURE, "json": None}
    try:
        event = json.loads(raw_body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return {"status": 400, "body": WEBHOOK_BAD_PAYLOAD, "json": None}
    status = HANDLED_EVENTS.get(event.get("event"))
    # 200, deliberately: an event we do not handle is not a failure, and
    # a non-2xx would have Razorpay retrying it until it gave up.
    if status is None:
        return {"status": 200, "body": WEBHOOK_IGNORED, "json": None}
    payment = (event.get("payload") or {}).get("payment", {}).get("entity") or {}
    if not payment.get("id") or not payment.get("order_id"):
        logger.error("[webhook] %s carried no payment entity", event.get("event"))
        return {"status": 400, "body": WEBHOOK_BAD_PAYLOAD, "json": None}
    try:
        result = payment_capture(
            event_id=event_id,
            order_id=payment["order_id"],
            payment_id=payment["id"],
            # Razorpay denominates in paise, which is what this stores.
            amount_paise=payment.get("amount"),
            status=status,
            raw=event,
        )
    except CaptureFailed as exc:
        # 500 so Razorpay retries. The failure modes are an unattributable
        # order, an amount that does not match it, or a database that is
        # down — all worth another delivery.
        logger.error("[webhook] payment_capture failed: %s", exc.detail)
        return {"status": 500, "body": WEBHOOK_CAPTURE_FAILED, "json": None}
    logger.info(
        "[webhook] %s %s duplicate=%s",
        status, payment["id"], result.get("duplicate"),
    )
    return {"status": 200, "body": None, "json": result}


# ── the reconciliation sweep (backend/tools/reconcile-payments.mjs) ──────────


def find_unresolved_orders():
    """Every order stuck at 'created' with no terminal sibling — the rows
    a `created` status cannot tell apart: abandoned checkout and lost
    payment are byte-identical inside the database. That gap is not
    theoretical: a captured payment was lost once, the webhook deliveries
    bounced off a wrong secret, Razorpay gave up, and nothing anywhere
    noticed until a person went looking."""
    with connection.cursor() as cursor:
        cursor.execute(
            "select provider_order_id from payments where status = 'created'"
            " and provider_order_id is not null"
            " and provider_order_id not in"
            " (select provider_order_id from payments where status <> 'created'"
            "  and provider_order_id is not null)"
            " order by created_at asc"
        )
        return [row[0] for row in cursor.fetchall()]


def reconcile(client=None):
    """READ ONLY, deliberately: it credits nothing, because a script that
    mints undoes the reason the webhook is the only credit path. Asks
    Razorpay what actually happened to every unresolved order and returns
    the report the management command prints:

      owed        — captured/authorized payments with no credit here; the
                    people who paid and received nothing (exit non-zero)
      failed      — attempts exist, all failed at Razorpay
      abandoned   — no payment attempts at all
      unknown     — Razorpay could not say (check by hand)

    `client` is injectable; without one it is built from settings and a
    missing key id/secret raises Refusal(500, REFUSAL_NOT_CONFIGURED).
    """
    if client is None:
        key_id = getattr(settings, "RAZORPAY_KEY_ID", "")
        key_secret = getattr(settings, "RAZORPAY_KEY_SECRET", "")
        if not key_id or not key_secret:
            raise Refusal(500, REFUSAL_NOT_CONFIGURED)
        client = RazorpayClient(
            key_id, key_secret, base_url=getattr(settings, "RAZORPAY_BASE_URL", "")
        )
    unresolved = find_unresolved_orders()
    report = {"orders": 0, "owed": [], "failed": [], "abandoned": [], "unknown": []}
    for order_id in unresolved:
        report["orders"] += 1
        try:
            payload = client.order_payments(order_id)
        except RazorpayError:
            report["unknown"].append(order_id)
            continue
        items = payload.get("items") or []
        captured = [p for p in items if p.get("status") in ("captured", "authorized")]
        if captured:
            # The case this sweep exists for: their money left, ours
            # never arrived.
            report["owed"].append(
                {
                    "order_id": order_id,
                    "payments": [
                        {"id": p.get("id"), "status": p.get("status"),
                         "amount_paise": p.get("amount")}
                        for p in captured
                    ],
                }
            )
        elif items:
            report["failed"].append(
                {
                    "order_id": order_id,
                    "attempts": len(items),
                    "reason": items[-1].get("error_description") or "failed",
                }
            )
        else:
            report["abandoned"].append(order_id)
    return report
