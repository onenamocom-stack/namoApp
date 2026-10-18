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
from django.db import IntegrityError, connection, transaction

from .models import Payment, PaymentStatus, RefType
from .phonepe import PhonePeClient, PhonePeError, webhook_authorized

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

# The webhook's answers are plain text, like the edge function's.
WEBHOOK_NOT_CONFIGURED = "Not configured."
WEBHOOK_BAD_SIGNATURE = "Bad signature."
WEBHOOK_BAD_PAYLOAD = "Bad payload."
WEBHOOK_IGNORED = "Ignored."
WEBHOOK_CAPTURE_FAILED = "Could not record that payment."

# PhonePe's order events (17 Oct 2026). The status is read from
# `payload.state`, never from the event's name (PhonePe's own rule).
HANDLED_EVENTS = {"checkout.order.completed", "checkout.order.failed"}
PHONEPE_STATES = {"COMPLETED": PaymentStatus.CAPTURED, "FAILED": PaymentStatus.FAILED}

PROVIDER = "phonepe"
REFUSAL_NOT_PAID = "That payment did not go through."
REFUSAL_PENDING = "Your payment is still being processed. It lands on its own once your bank confirms."
REFUSAL_UNCONFIRMED = "That payment could not be confirmed."


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


# ── PhonePe checkout (17 Oct 2026; Razorpay before) ─────────────────────────


def _client(client=None):
    """The PhonePe client from settings, or Refusal(500) naming (in the
    log only) which setting is missing."""
    if client is not None:
        return client
    values = {
        "PHONEPE_CLIENT_ID": getattr(settings, "PHONEPE_CLIENT_ID", ""),
        "PHONEPE_CLIENT_SECRET": getattr(settings, "PHONEPE_CLIENT_SECRET", ""),
        "PHONEPE_CLIENT_VERSION": getattr(settings, "PHONEPE_CLIENT_VERSION", ""),
    }
    missing = [name for name, value in values.items() if not value]
    if missing:
        logger.error("[pay] not configured: %s", " and ".join(missing))
        raise Refusal(500, REFUSAL_NOT_CONFIGURED)
    return PhonePeClient(
        values["PHONEPE_CLIENT_ID"], values["PHONEPE_CLIENT_SECRET"], values["PHONEPE_CLIENT_VERSION"],
        env=getattr(settings, "PHONEPE_ENV", "production") or "production",
    )


def _new_order_id():
    """Our merchant order id: N + 32 hex, inside PhonePe's 63 characters."""
    return f"N{uuid.uuid4().hex}"


def _open_checkout(profile_id, amount_paise, client=None, **purpose):
    """Opens one PhonePe checkout and writes its 'created' row, the only
    record tying the order to one of our profiles (and, through `purpose`,
    to a shop order or something kept). Our own id is the merchant order
    id, so the status check and the webhook both find the row by it.
    Nothing is credited here. Returns {order_id, amount_paise, url}.

    A PhonePe order is paid at most once, so its terminal row's
    `provider_payment_id` is the merchant order id too: the status check
    and the webhook write the same key, and the unique index lets only
    one of them through."""
    client = _client(client)
    merchant_order_id = _new_order_id()
    try:
        opened = client.create_payment(
            merchant_order_id, amount_paise,
            redirect_url=getattr(settings, "PHONEPE_REDIRECT_URL", "") or "https://1namo.com/wallet",
            meta={"udf1": str(profile_id)},
        )
    except PhonePeError as exc:
        logger.error("[pay] phonepe refused: %s %s", exc.status, exc.code)
        raise Refusal(502, REFUSAL_PROVIDER) from None
    try:
        Payment.objects.create(
            profile_id=profile_id, provider=PROVIDER, provider_order_id=merchant_order_id,
            amount_paise=amount_paise, status=PaymentStatus.CREATED, **purpose,
        )
    except Exception:
        # Fail before checkout opens rather than after: a payment whose
        # order row is missing cannot be attributed.
        logger.exception("[pay] could not record order")
        raise Refusal(500, REFUSAL_RECORD) from None
    return {"order_id": merchant_order_id, "amount_paise": amount_paise, "url": opened["url"]}


def create_topup_order(profile_id, amount_paise, client=None):
    """Opens a checkout to add money. Credits nothing: the capture does,
    once PhonePe says the order is COMPLETED.

    The band below is the PRD's, enforced here because the browser's copy
    of it is a convenience. Amount in paise, both directions (rule 1).
    """
    if (
        not isinstance(amount_paise, int)
        or isinstance(amount_paise, bool)
        or amount_paise < MIN_PAISE
        or amount_paise > MAX_PAISE
    ):
        raise Refusal(400, REFUSAL_BAND)
    return {"ok": True, **_open_checkout(profile_id, amount_paise, client)}


def open_shop_payment(profile_id, amount_paise, shop_order_id, client=None):
    """A checkout for one shop order (6 Oct 2026). The 'created' row
    carries `shop_order_id`, so the capture settles that order instead of
    crediting the wallet. No top-up band: the amount is the order's own.
    Returns {order_id, amount_paise, url} or raises Refusal."""
    return _open_checkout(profile_id, amount_paise, client, shop_order_id=shop_order_id)


def ebook_pay_online():
    return bool(getattr(settings, "EBOOK_PAY_ONLINE", False))


def pay_mode(sku):
    """How `sku` is paid for: 'online' (PhonePe) or 'wallet'."""
    from .models import Sku

    if sku == Sku.LISTING:
        return "online"  # a Market listing is always paid at the gateway
    return "online" if sku == Sku.EBOOK and ebook_pay_online() else "wallet"


def open_entitlement_payment(profile_id, sku, ref="", client=None):
    """A PhonePe checkout for something kept (15 Oct 2026: an e-book, when
    EBOOK_PAY_ONLINE is on). The price is the server's; the 'created' row
    names what it buys, so the capture grants it rather than crediting the
    wallet. Already owned: {already: True} and no order. Returns
    {already: False, order_id, amount_paise, key_id} or raises Refusal."""
    ref = ref or ""
    if pay_mode(sku) != "online":
        raise Refusal(400, REFUSAL_UNKNOWN_SKU)
    price = sku_price(sku, ref)
    if not price:
        raise Refusal(400, REFUSAL_UNKNOWN_SKU)
    if owns(profile_id, sku, ref):
        return {"already": True}
    opened = _open_checkout(profile_id, price, client, entitlement_sku=sku, entitlement_ref=ref)
    return {"already": False, **opened}


def _grant_paid(profile_id, sku, ref, amount_paise):
    """The capture of a gateway payment for something kept. Forever things
    only (an e-book). Already owned — two checkouts raced, or a second tab
    — and the money is not lost: it goes to the wallet, and the log says
    why. A savepoint, so the unique index refusing the row rolls back only
    the grant, never the payments row around it."""
    from .models import Entitlement

    try:
        with transaction.atomic():
            if owns(profile_id, sku, ref):
                raise IntegrityError("already owned")
            row = Entitlement.objects.create(profile_id=profile_id, sku=sku, ref=ref or "",
                                             price_paise=amount_paise)
            if sku == "ebook":
                _ebook_sharer(row)
            if sku == "listing":
                # The seller's share is written with the grant, or neither.
                from apps.market import services as market

                market.on_listing_paid(profile_id, ref, amount_paise)
    except IntegrityError:
        logger.warning("[sku-pay] %s %s paid twice by %s; credited to wallet", sku, ref, profile_id)
        credit(profile_id, amount_paise, f"{_sku_label(sku)} already yours", ref_type=RefType.PAYMENT)


def confirm_checkout(profile_id, provider_order_id, client=None):
    """The checkout closed: ask PhonePe what happened to the order and
    settle it now, rather than when the webhook lands. Only the caller's
    own 'created' row can be confirmed. COMPLETED is captured through
    payment_capture (the webhook, arriving later with the same PhonePe
    order id, finds it recorded and changes nothing); FAILED is recorded;
    PENDING is left for the webhook."""
    created = Payment.objects.filter(
        provider_order_id=str(provider_order_id), status=PaymentStatus.CREATED, profile_id=profile_id,
    ).first()
    if created is None:
        return {"ok": False, "reason": REFUSAL_UNCONFIRMED}
    try:
        state = _client(client).order_status(provider_order_id)
    except (PhonePeError, Refusal) as exc:
        logger.error("[confirm] status lookup failed: %s", getattr(exc, "status", exc))
        return {"ok": False, "pending": True, "reason": REFUSAL_PENDING}
    status = PHONEPE_STATES.get(state.get("state"))
    if status is None:
        return {"ok": False, "pending": True, "reason": REFUSAL_PENDING}
    try:
        result = payment_capture(
            event_id=None, order_id=provider_order_id,
            payment_id=provider_order_id,
            amount_paise=_paise(state.get("amount"), created.amount_paise) if status == PaymentStatus.CAPTURED
            else created.amount_paise,
            status=status, raw={"source": "status", **state},
        )
    except CaptureFailed as exc:
        logger.error("[confirm] capture refused: %s", exc.detail)
        return {"ok": False, "reason": REFUSAL_UNCONFIRMED}
    if status == PaymentStatus.FAILED:
        return {"ok": False, "reason": REFUSAL_NOT_PAID}
    return {"ok": True, **{k: v for k, v in result.items() if k != "ok"}}


def _paise(value, fallback):
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


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

    The amount credited is the provider's, from a payload that was
    authenticated (or a status PhonePe answered) before this ran; the wallet is found through the 'created'
    row matching the order id, never the payload's notes. A capture whose
    amount differs from the order it attributes through is refused
    (see the module header's amount-must-match-order)."""
    if status not in (PaymentStatus.CAPTURED, PaymentStatus.FAILED):
        raise CaptureFailed(f"payment_capture handles captured and failed, not {status}")
    if amount_paise is None or amount_paise <= 0:
        raise CaptureFailed(f"payment {payment_id} has no positive amount")
    with connection.cursor() as cursor:
        cursor.execute(
            "select profile_id, amount_paise, shop_order_id, entitlement_sku, entitlement_ref"
            " from payments"
            " where provider_order_id = %s and status = 'created'"
            " order by created_at desc limit 1",
            [str(order_id)],
        )
        created = cursor.fetchone()
    if created is None:
        raise CaptureFailed(f"no order {order_id} on this system")
    profile_id, order_amount, shop_order_id, entitlement_sku, entitlement_ref = created
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
                provider=PROVIDER,
                provider_order_id=str(order_id),
                provider_payment_id=str(payment_id),
                provider_event_id=(str(event_id) if event_id is not None else None),
                amount_paise=amount_paise,
                status=status,
                raw=raw,
                shop_order_id=shop_order_id,
                entitlement_sku=entitlement_sku,
                entitlement_ref=entitlement_ref,
            )
            if status == PaymentStatus.CAPTURED and shop_order_id:
                # A shop order paid directly (6 Oct 2026): the order is
                # settled, nothing is credited. If it had already lapsed —
                # the window closed, the stock went back — the money is
                # not lost: it goes to the wallet, and the log says why.
                from apps.shop import services as shop_services

                settled = shop_services.order_paid(shop_order_id)
                if settled == "lapsed":
                    logger.warning("[shop-pay] %s paid after its order lapsed; credited to wallet", shop_order_id)
                    credit(profile_id, amount_paise, "Market payment after the order lapsed",
                           ref_type=RefType.PAYMENT)
            elif status == PaymentStatus.CAPTURED and entitlement_sku:
                # Something kept, paid at the gateway (15 Oct 2026): it is
                # granted, nothing is credited.
                _grant_paid(profile_id, entitlement_sku, entitlement_ref or "", amount_paise)
            elif status == PaymentStatus.CAPTURED:
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
    except IntegrityError:
        # A retried delivery: provider_payment_id or provider_event_id
        # already exists. The ordinary case, not an error — everything
        # above, the credit included, has rolled back with the block.
        return {"ok": True, "duplicate": True}
    return {
        "ok": True,
        "duplicate": False,
        "profile_id": str(profile_id),
    }


def handle_webhook(raw_body: bytes, authorization: str):
    """PhonePe's callback. VERIFY, THEN PARSE: the Authorization header
    must be SHA-256 of the username and password set on PhonePe's
    dashboard; nothing in the body is read until it matches. The status
    comes from `payload.state`. Returns {"status", "body", "json"}.
    """
    username = getattr(settings, "PHONEPE_WEBHOOK_USER", "")
    password = getattr(settings, "PHONEPE_WEBHOOK_PASSWORD", "")
    if not username or not password:
        logger.error("[webhook] PHONEPE_WEBHOOK_USER or PHONEPE_WEBHOOK_PASSWORD is not set")
        return {"status": 500, "body": WEBHOOK_NOT_CONFIGURED, "json": None}
    if not webhook_authorized(authorization or "", username, password):
        logger.error("[webhook] authorization did not match; body ignored")
        return {"status": 401, "body": WEBHOOK_BAD_SIGNATURE, "json": None}
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    try:
        event = json.loads(raw_body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return {"status": 400, "body": WEBHOOK_BAD_PAYLOAD, "json": None}
    payload = event.get("payload") or {}
    status = PHONEPE_STATES.get(payload.get("state"))
    # 200, deliberately: an event we do not handle (refunds, a pending
    # state) is not a failure, and a non-2xx would have PhonePe retrying.
    if event.get("event") not in HANDLED_EVENTS or status is None:
        return {"status": 200, "body": WEBHOOK_IGNORED, "json": None}
    merchant_order_id = payload.get("merchantOrderId")
    if not merchant_order_id:
        logger.error("[webhook] %s carried no order ids", event.get("event"))
        return {"status": 400, "body": WEBHOOK_BAD_PAYLOAD, "json": None}
    amount = _paise(payload.get("amount"), None)
    if status == PaymentStatus.FAILED and not amount:
        amount = Payment.objects.filter(
            provider_order_id=merchant_order_id, status=PaymentStatus.CREATED
        ).values_list("amount_paise", flat=True).first()
    try:
        result = payment_capture(
            event_id=None, order_id=merchant_order_id, payment_id=merchant_order_id,
            amount_paise=amount, status=status, raw=event,
        )
    except CaptureFailed as exc:
        # 500 so PhonePe retries: an unattributable order, an amount that
        # does not match it, or a database that is down.
        logger.error("[webhook] payment_capture failed: %s", exc.detail)
        return {"status": 500, "body": WEBHOOK_CAPTURE_FAILED, "json": None}
    logger.info("[webhook] %s %s duplicate=%s", status, merchant_order_id, result.get("duplicate"))
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
    PhonePe what actually happened to every unresolved order and returns
    the report the management command prints:

      owed        — captured/authorized payments with no credit here; the
                    people who paid and received nothing (exit non-zero)
      failed      — PhonePe says the order FAILED
      abandoned   — no payment attempts at all
      unknown     — still PENDING, or PhonePe could not say (check by hand)

    `client` is injectable; without one it is built from settings and a
    missing client id/secret/version raises Refusal(500, REFUSAL_NOT_CONFIGURED).
    """
    client = _client(client)
    unresolved = find_unresolved_orders()
    report = {"orders": 0, "owed": [], "failed": [], "abandoned": [], "unknown": []}
    for order_id in unresolved:
        report["orders"] += 1
        try:
            state = client.order_status(order_id)
        except PhonePeError as exc:
            # An order PhonePe never heard of was never paid.
            if exc.code in ("INVALID_MERCHANT_ORDER_ID", "ORDER_NOT_FOUND"):
                report["abandoned"].append(order_id)
            else:
                report["unknown"].append(order_id)
            continue
        if state.get("state") == "COMPLETED":
            # The case this sweep exists for: their money left, ours
            # never arrived.
            report["owed"].append({
                "order_id": order_id,
                "payments": [{"id": state.get("orderId"), "status": "COMPLETED",
                              "amount_paise": _paise(state.get("amount"), None)}],
            })
        elif state.get("state") == "FAILED":
            report["failed"].append({"order_id": order_id, "attempts": 1,
                                     "reason": state.get("errorCode") or "failed"})
        else:
            report["unknown"].append(order_id)
    return report


# ── entitlements: things bought from the wallet that stay bought ─────────────
# (30 Sep 2026) An e-book, one muhurat judged against your chart, a month of
# personal predictions. Same money rules as everything above: the price is
# the server's, the ledger row and the entitlement row are one transaction,
# and the wallet row lock serialises one person's taps.

REFUSAL_UNKNOWN_SKU = "That is not something we sell."
REFUSAL_PAY_ONLINE = "Pay for this at checkout. The wallet does not sell it."


def _now_utc():
    from django.utils import timezone

    return timezone.now()


def sku_price(sku, ref=""):
    """What `sku` costs, in paise, or None when it is not for sale. The
    e-book's price is its own catalogue row's — a book can be free (NULL),
    and a free book is not something to buy."""
    from .models import Sku

    if sku == Sku.PREDICTION:
        return settings.PREDICTION_PRICE_PAISE
    if sku == Sku.MUHURAT:
        return settings.MUHURAT_ME_PRICE_PAISE
    if sku == Sku.EBOOK:
        from django.core.exceptions import ValidationError

        from apps.bhakti.models import BhaktiAsset

        try:
            return (
                BhaktiAsset.objects.filter(pk=ref, kind="ebook", active=True)
                .values_list("price_paise", flat=True)
                .first()
            )
        except (ValueError, ValidationError):  # not a uuid — nothing to sell
            return None
    if sku == Sku.LISTING:
        from apps.market import services as market

        return market.price_to_pay(ref)
    return None


def active_entitlement(profile_id, sku, ref=""):
    """The row that grants `sku`/`ref` right now, or None: a forever row,
    or a dated one whose window contains now. A prediction bought ahead
    (starting when the current one ends) is not active until it starts."""
    from django.db.models import Q

    from .models import Entitlement

    now = _now_utc()
    return (
        Entitlement.objects.filter(profile_id=profile_id, sku=sku, ref=ref or "")
        .filter(Q(expires_at__isnull=True) | Q(starts_at__lte=now, expires_at__gt=now))
        .first()
    )


def owns(profile_id, sku, ref=""):
    return active_entitlement(profile_id, sku, ref) is not None


def _paid_until(profile_id, sku, ref=""):
    """The furthest expiry of any dated row still to run — what "until"
    means to somebody who bought twice."""
    from .models import Entitlement

    return (
        Entitlement.objects.filter(profile_id=profile_id, sku=sku, ref=ref or "",
                                   expires_at__gt=_now_utc())
        .order_by("-expires_at").values_list("expires_at", flat=True).first()
    )


def entitlement_state(profile_id, sku, ref=""):
    """What the screen needs before it offers a button: owned or not, until
    when, and the price if not."""
    row = active_entitlement(profile_id, sku, ref)
    until = _paid_until(profile_id, sku, ref) if row and row.expires_at else None
    return {
        "owned": row is not None,
        "expires_at": until.isoformat() if until else None,
        "price_paise": sku_price(sku, ref),
        "pay": pay_mode(sku),
    }


def buy(profile_id, sku, ref=""):
    """Charge the wallet and grant `sku`/`ref`. Returns debit's own shape
    — {ok, reason?, balance_paise?} — plus `expires_at` on success.

    Buying a forever-thing you already own charges nothing and says so
    (`already: True`); a double tap lands here, not on a second charge.
    A prediction bought while one is running starts where it ends.
    """
    from datetime import timedelta

    from .models import Entitlement, Sku

    ref = ref or ""
    if sku not in Sku.values:
        return {"ok": False, "reason": REFUSAL_UNKNOWN_SKU}
    price = sku_price(sku, ref)
    if not price:
        return {"ok": False, "reason": REFUSAL_UNKNOWN_SKU}
    if pay_mode(sku) == "online":
        return {"ok": False, "reason": REFUSAL_PAY_ONLINE}

    with transaction.atomic():
        # The lock first: two taps by the same person queue here, so the
        # second sees the first one's row below.
        if lock_wallet_balance(profile_id) is None:
            return {"ok": False, "reason": REFUSAL_NO_WALLET}
        current = active_entitlement(profile_id, sku, ref)
        if current is not None and current.expires_at is None:
            return {"ok": True, "already": True, "expires_at": None,
                    "balance_paise": balance_of(profile_id)}

        now = _now_utc()
        starts = now
        expires = None
        if sku == Sku.PREDICTION:
            starts = _paid_until(profile_id, sku, ref) or now
            expires = starts + timedelta(days=settings.PREDICTION_DAYS)

        row = Entitlement(profile_id=profile_id, sku=sku, ref=ref, price_paise=price,
                          starts_at=starts, expires_at=expires)
        balance = balance_of(profile_id)
        if price > balance:
            return {"ok": False, "reason": REFUSAL_SHORT_BALANCE, "balance_paise": balance}
        row.save()
        insert_ledger(profile_id, -price, _sku_label(sku), ref_type=RefType.ORDER, ref_id=row.id)
        if sku == Sku.EBOOK:
            _ebook_sharer(row)
    return {"ok": True, "already": False,
            "expires_at": expires.isoformat() if expires else None,
            "balance_paise": balance - price}


def _ebook_sharer(row):
    """An e-book bought through a Pro's or a Creator's link or tag pays them
    6% of it, from Namo's own (15 Oct 2026, Rahul) — the same rule as a
    Market listing: new customer or old, the purchase uses the click up."""
    from apps.bhakti.models import BhaktiAsset
    from apps.referrals import services as referrals

    sharer = referrals.holding(row.profile_id)
    if sharer is None:
        return
    type(row).objects.filter(pk=row.pk).update(referrer_id=sharer)
    title = BhaktiAsset.objects.filter(pk=row.ref).values_list("title", flat=True).first() or "E-book"
    amount = row.price_paise * settings.REFERRAL_SHARER_BPS // 10_000
    if amount > 0:
        referrals.credit_sharer(sharer, amount, f"E-book · {title}")


def _sku_label(sku):
    """The ledger line, in the statement's own words."""
    return {
        "ebook": "E-book",
        "muhurat": "Muhurat · judged against your chart",
        "prediction": "Predictions · 30 days",
        "listing": "Market",
    }.get(sku, sku)
