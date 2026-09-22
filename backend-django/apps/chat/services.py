"""Chat services — the meter of 014 as amended by 017 and 018, re-expressed
in code, statement for statement. THE highest correctness bar in the
migration; every rule below is the SQL's, not an interpretation. State the
semantics back before touching anything:

  HOLD AND SETTLE, NOT A DEBIT PER MINUTE (014). Two ledger rows per
  session, not fifty. Accept locks the wallet, works out the affordable
  minutes, DEBITS THE WHOLE HOLD and stamps expires_at = now + those
  minutes. End works out the real duration from the SERVER'S OWN
  timestamps, rounded UP to the whole minute with a one-minute MINIMUM,
  clamped to what was held, and credits back what was not used. The wallet
  can never go negative because the money is already gone; the cutoff is a
  timestamp, not a countdown, so a paused tab, a dead heartbeat or a lying
  clock cannot buy a free minute.

  NO CAP ON THE HOLD (017, decided 1 Sep). Accept holds EVERY minute the
  wallet can buy — `balance // rate`, integer division floors — so nothing
  cuts a reading short while there is money left. The knowing cost: the
  seeker's whole balance reads ₹0 for the length of the chat and nothing
  else in the app can be bought until it settles.

  ASKING COSTS NOTHING (014). session_request moves no money; the clock
  starts on the consultant's accept, never the seeker's request. Earnings
  are written at the END, not at accept — until the conversation stops,
  nobody knows what was used.

  THE LIVE-SESSION GATE (014). A message may be written only into a thread
  with a live, unexpired session on it, and only as a participant — outside
  a paid window the transcript is read-only. That is what stops chat being
  free to anyone who never presses End.

  THE SWEEPER IS NOT OPTIONAL (014/018). Every minute it settles live
  sessions past expires_at OR silent for 60 seconds (the grace: a dropped
  connection stops the meter, but a train tunnel does not end a paid
  reading), and expires requests nobody answered in 15 minutes. Without it
  an abandoned session holds the seeker's money forever and nothing
  notices.

  018'S FOUR FIXES. (1) accept takes the session row lock FIRST — two
  concurrent accepts both passing the guard wrote a second full debit and
  orphaned the first hold; the unique index does not catch it because this
  is two UPDATEs, not two INSERTs. (2) one open request per pair, an index;
  asking twice is the same ask. (3) a mode sessions cannot store is a
  refusal, not a crash. (4) a JWT-authenticated caller never writes the
  ledger note — only the sweeper (no auth.uid()) supplies a reason.

  016'S PREVIEW. threads.last_message_at / last_preview are maintained by
  prod's touch_thread trigger on every insert; this module emulates that
  write on SQLite (no triggers there) — the gateway precedent for prod's
  phase-2 balance trigger.

Money paths go through apps.wallet.services (module 8 owns wallets and
ledger; the booking/chat gateway calls moved there unchanged — same SQL,
same results); orders/order_items stay module 6's raw gateway. The fee
arithmetic reuses consultants.services.fee_paise.
Every function takes an injectable `now` (defaulting to the server clock) so
the 014 check's time-faking discipline — move started_at, never wait — ports
to pytest with zero clock jitter.
"""

from django.db import IntegrityError, connection, models, transaction
from django.db.models import Q
from django.utils import timezone

from apps.consultants import gateway
from apps.consultants.models import EarningsLedger, FEE_BPS
from apps.consultants.services import fee_paise
from apps.profiles import services as profile_services
from apps.wallet import services as wallet_services

from .models import Message, Session, Thread

# ── the product constants, named once (014) ──────────────────────────────────

GRACE_SECONDS = 60  # a blinking connection does not end a paid reading
UNANSWERED = 15 * 60  # a request nobody answered in 15 minutes is a lie on the queue
PREVIEW_CHARS = 120  # 016: left(body, 120) — characters, not bytes


# ── refusal sentences: byte-identical to 014/017/018, the UI already shows ───
# these (INSTRUCTIONS §2: the server's job is to make the string the client
# shows true, not to invent a new vocabulary).

REFUSAL_SIGN_IN = "Sign in to start a chat."
REFUSAL_SELF_CHAT = "You cannot chat with yourself."
REFUSAL_NOT_TAKING = "That consultant is not taking chats."
REFUSAL_NOT_PRICED = "That session is not priced yet."
REFUSAL_BAD_MODE = "That service cannot be started live."
REFUSAL_SHORT_BALANCE = "Not enough balance"
REFUSAL_GONE = "That request is gone."
REFUSAL_NOT_OPEN = "That request is no longer open."
REFUSAL_NO_WALLET = "No wallet on that account."
REFUSAL_ALREADY_LIVE = "You are already in a live session."
REFUSAL_NO_SESSION = "No such session."
REFUSAL_NOT_YOURS = "That is not your session."
REFUSAL_SESSION_ENDED = "That session has ended. Start another to reply."
REFUSAL_NOT_PARTICIPANT = "You are not part of that conversation."

SESSION_ROW_FIELDS = (
    "id", "seeker_id", "consultant_id", "service_id", "thread_id", "order_id",
    "mode", "rate_paise", "status", "requested_at", "started_at", "expires_at",
    "ended_at", "heartbeat_at", "hold_paise", "charged_paise", "created_at",
)


def _minutes_held(balance_paise, rate_paise):
    """017: EVERY minute the wallet can buy — `balance / rate` with integer
    division flooring, exactly the SQL. A part-minute the seeker cannot
    afford is neither held nor sold."""
    return balance_paise // rate_paise


# The billing block, in seconds. 014 charged whole minutes — a part-minute
# was a minute — and 22 Sep 2026 cut it to thirty seconds for both meters,
# the consultant's and the AI's. The rate is still quoted per minute; only
# the granularity changed, so a 1:20 session went from ₹18 to ₹13.50 at
# ₹9/min. One number, one place, because two meters must not drift.
BILLING_BLOCK_SECONDS = 30


def _billable_paise(started_at, stop, hold_paise, rate_paise):
    """What the session actually costs, integer-exact and never a float.

    Round UP to the next thirty-second block, minimum one block, clamped to
    what the hold bought. `stop` is min(now, expires_at), so a tab left open
    overnight is charged for the time it bought and not a second more.

    The paise are computed from seconds rather than from a halved rate:
    `rate_paise` is a per-MINUTE price and need not be even, and halving an
    odd one would invent or lose a paisa on every settle. Integer division
    at the end drops any fraction of a paisa, which rounds in the seeker's
    favour — the only direction a rounding error is allowed to go.
    """
    delta = stop - started_at
    total_us = (delta.days * 86400 + delta.seconds) * 1_000_000 + delta.microseconds
    block_us = BILLING_BLOCK_SECONDS * 1_000_000
    blocks = (total_us + block_us - 1) // block_us  # ceil, exact
    blocks = max(1, blocks)
    charged = (blocks * BILLING_BLOCK_SECONDS * rate_paise) // 60
    return min(charged, hold_paise)


def _billable_minutes(started_at, stop, hold_paise, rate_paise):
    """Kept for the labels only — "3 min chat" on an earnings row. The money
    comes from `_billable_paise`; these two must never both be used to
    compute a charge."""
    delta = stop - started_at
    total_us = (delta.days * 86400 + delta.seconds) * 1_000_000 + delta.microseconds
    minute_us = 60 * 1_000_000
    minutes = max(1, (total_us + minute_us - 1) // minute_us)
    return min(minutes, hold_paise // rate_paise)


def _touch_thread(thread_id, created_at, body):
    """016's touch_thread trigger, emulated on SQLite (the test fixture has
    no triggers); on Postgres prod's trigger does this job and the gateway
    must NOT double-write it — the consultants-gateway precedent."""
    if connection.vendor == "postgresql":
        return
    Thread.objects.filter(pk=thread_id).update(
        last_message_at=created_at, last_preview=body[:PREVIEW_CHARS]
    )


# ── ask for a session (014; 018 fixes 2 and 3) ───────────────────────────────


def request_chat(seeker_id, consultant_id, service_id, now=None):
    """The knock on the door. NO MONEY MOVES HERE — a consultant who never
    answers has cost the seeker nothing, which is the opposite of a booking
    (that charges up front because it claims a slot somebody else wanted).

    The balance check here is advisory only ("refuse before anyone waits");
    the number that matters is re-checked under the wallet lock at accept.
    Asking twice is the same ask: sessions_one_open_request is the
    guarantee (018 fix 2), the conflicting insert is caught and the request
    already waiting is returned."""
    from apps.consultants.models import ConsultantService, ConsultantStatus

    if str(consultant_id) == str(seeker_id):
        return {"ok": False, "reason": REFUSAL_SELF_CHAT}
    service = (
        ConsultantService.objects.filter(
            pk=service_id,
            consultant_id=consultant_id,
            active=True,
            billing="per_minute",
            consultant__status=ConsultantStatus.APPROVED,
        )
        .select_related("consultant")
        .first()
    )
    if service is None:
        return {"ok": False, "reason": REFUSAL_NOT_TAKING}
    if service.price_paise <= 0:
        return {"ok": False, "reason": REFUSAL_NOT_PRICED}
    # 018 fix 3: consultant_services.mode permits 'booking', sessions.mode
    # does not — a mode the session cannot store is a refusal, not a crash.
    if service.mode not in Session.Mode.values:
        return {"ok": False, "reason": REFUSAL_BAD_MODE}

    balance = _balance_of(seeker_id)
    if balance < service.price_paise:
        return {"ok": False, "reason": REFUSAL_SHORT_BALANCE,
                "rate_paise": service.price_paise}

    try:
        with transaction.atomic():  # savepoint: the lost race rolls back only the insert
            session = Session.objects.create(
                seeker_id=seeker_id,
                consultant_id=consultant_id,
                service_id=service.id,
                mode=service.mode,
                rate_paise=service.price_paise,
                status=Session.Status.REQUESTED,
            )
    except IntegrityError:
        # 23505 on sessions_one_open_request — the same ask. The index is
        # the guarantee; this read returns the request already waiting.
        session = Session.objects.get(
            seeker_id=seeker_id, consultant_id=consultant_id,
            status=Session.Status.REQUESTED,
        )
    return {"ok": True, "session_id": str(session.id), "rate_paise": session.rate_paise}


def _balance_of(profile_id):
    """The wallet balance with prod's coalesce (014): no wallet row reads
    as 0. Unlocked — advisory checks only; the locked number is taken at
    accept inside the transaction."""
    with connection.cursor() as cursor:
        cursor.execute(
            "select coalesce((select balance_paise from wallets where profile_id = %s), 0)",
            [str(profile_id)],
        )
        return cursor.fetchone()[0]


# ── accept, and start the meter (014; 017 removes the cap; 018 fix 1) ────────


def accept_chat(consultant_id, session_id, now=None):
    """The consultant's join — THE money transaction. One block, exactly as
    014/017/018: the session ROW LOCK first (018 fix 1: two concurrent
    accepts both read 'requested' under READ COMMITTED; the second must
    serialise here and find the status already moved — the unique index
    does not catch this, it is two UPDATEs, not two INSERTs), then the
    wallet lock, the affordable minutes off the LOCKED balance (no cap,
    017), the order and its one line, the thread upsert (one per pair,
    forever), the live transition, the whole-hold debit. The unique index
    sessions_one_live_per_consultant is the backstop for a SECOND request
    from another seeker; its 23505 is caught and translated, exactly like
    the slot claim. Earnings are NOT written here — the consultant earns
    what was used, and that is not known until the session ends."""
    now = now or timezone.now()
    try:
        with transaction.atomic():
            # THE LOCK (018 fix 1). Postgres: FOR UPDATE; the loser waits,
            # re-reads, and finds status moved. SQLite (tests): the
            # transaction's IMMEDIATE write lock serialises at BEGIN, before
            # any read, so the loser reads the winner's commit.
            session = (
                Session.objects.select_for_update().filter(pk=session_id).first()
            )
            if session is None:
                return {"ok": False, "reason": REFUSAL_GONE}
            # Only the consultant accepts, and only out of 'requested' — the
            # same edge as the booking policy: no reaching back into a
            # session already resolved.
            if str(session.consultant_id) != str(consultant_id) or (
                session.status != Session.Status.REQUESTED
            ):
                return {"ok": False, "reason": REFUSAL_NOT_OPEN}

            balance = wallet_services.lock_wallet_balance(session.seeker_id)
            if balance is None:
                return {"ok": False, "reason": REFUSAL_NO_WALLET}
            minutes = _minutes_held(balance, session.rate_paise)
            if minutes < 1:
                # 013 fix 2's shape from module 6: its own branch, not a
                # shared sentinel. Nothing written yet, the read-only early
                # return is safe — there is no block to unwind.
                return {"ok": False, "reason": REFUSAL_SHORT_BALANCE,
                        "balance_paise": balance}
            hold = minutes * session.rate_paise

            pro_name = gateway.profile_name(consultant_id)
            label = f"{pro_name or 'Consultation'} · chat"

            order_id = gateway.insert_order(session.seeker_id, hold)
            gateway.insert_order_item(
                order_id,
                item_type="session",
                item_id=session.service_id,
                title=label,
                unit_price_paise=session.rate_paise,
            )

            # The transcript. One per pair, forever.
            thread, _ = Thread.objects.get_or_create(
                seeker_id=session.seeker_id, consultant_id=session.consultant_id
            )

            session.status = Session.Status.LIVE
            session.started_at = now
            session.expires_at = now + timezone.timedelta(minutes=minutes)
            session.heartbeat_at = now
            session.hold_paise = hold
            session.thread_id = thread.id
            session.order_id = order_id
            session.save(
                update_fields=(
                    "status", "started_at", "expires_at", "heartbeat_at",
                    "hold_paise", "thread_id", "order_id",
                )
            )

            # The hold. Two ledger rows per session, not fifty; the wallet
            # follows by prod's phase-2 trigger and by the gateway's
            # emulation on SQLite.
            wallet_services.insert_ledger(
                session.seeker_id, -hold,
                f"{label} · {minutes} min held",
                ref_type="order", ref_id=order_id,
            )
    except IntegrityError:
        # 23505 on sessions_one_live_per_consultant — a second seeker's
        # request racing into a live session. The index is the conflict
        # check; the whole block unwinds.
        return {"ok": False, "reason": REFUSAL_ALREADY_LIVE}
    return {
        "ok": True,
        "session_id": str(session.id),
        "thread_id": str(thread.id),
        "minutes_held": minutes,
        "hold_paise": hold,
        "expires_at": session.expires_at,
    }


# ── end, and settle (014; 018 fix 4) ─────────────────────────────────────────


def end_session(actor_id, session_id, reason=None, now=None):
    """Either party may end it, and the sweeper ends the ones nobody does.
    IDEMPOTENT: a second End is the ordinary case (both sides press it),
    not an error, and it must not settle twice.

    The state change is a conditional UPDATE (status='live' in the WHERE) —
    018 fix 1's shape applied where the settle lives: two racing settles
    serialise on the row, the loser's CAS matches zero rows, and it returns
    already_ended having written nothing. The ledger's
    ledger_one_refund_per_order unique index is the second backstop where a
    refund is due; where the whole hold was used there is no refund row, so
    the CAS is the guarantee that matters.

    018 fix 4: a JWT-authenticated caller never writes the ledger's note —
    only the sweeper (actor_id None, prod's auth.uid()-is-null case)
    supplies a reason; the note lands 'ended' otherwise."""
    now = now or timezone.now()
    with transaction.atomic():
        session = Session.objects.select_for_update().filter(pk=session_id).first()
        if session is None:
            return {"ok": False, "reason": REFUSAL_NO_SESSION}
        if session.status != Session.Status.LIVE:
            return {"ok": True, "already_ended": True,
                    "charged_paise": session.charged_paise}
        if actor_id is not None and str(actor_id) not in (
            str(session.seeker_id), str(session.consultant_id)
        ):
            return {"ok": False, "reason": REFUSAL_NOT_YOURS}

        note = reason if actor_id is None else "ended"
        stop = min(now, session.expires_at)
        charged = _billable_paise(
            session.started_at, stop, session.hold_paise, session.rate_paise
        )
        # Label only — what the earnings row says, not what anybody pays.
        minutes = _billable_minutes(
            session.started_at, stop, session.hold_paise, session.rate_paise
        )
        refund = session.hold_paise - charged

        claimed = Session.objects.filter(
            pk=session.id, status=Session.Status.LIVE
        ).update(
            status=Session.Status.ENDED, ended_at=now, charged_paise=charged
        )
        if claimed == 0:
            # Lost the race between the read and the write — the other
            # settle (a pressed End, a concurrent sweep) committed first.
            settled = Session.objects.get(pk=session.id)
            return {"ok": True, "already_ended": True,
                    "charged_paise": settled.charged_paise}

        # The unused minutes come back. ref_type='refund' and 013's unique
        # index mean one per order — exactly right: one settle per session.
        if refund > 0:
            wallet_services.insert_ledger(
                session.seeker_id, refund, "Refund · unused minutes",
                ref_type="refund", ref_id=session.order_id, note=note,
            )
        gateway.set_order_total(session.order_id, charged)

        # The consultant earns what was USED — this is why earnings are
        # written here and not at accept: at accept nobody knows how long
        # anyone will talk.
        seeker_name = gateway.profile_name(session.seeker_id)
        fee = fee_paise(charged)
        EarningsLedger.objects.create(
            consultant_id=session.consultant_id,
            booking=None,
            gross_paise=charged,
            fee_bps=FEE_BPS,
            fee_paise=fee,
            net_paise=charged - fee,
            kind=f"{seeker_name or 'Session'} · {minutes} min chat",
        )
    return {"ok": True, "minutes": minutes,
            "charged_paise": charged, "refunded_paise": refund}


# ── the heartbeat, and what it is NOT (014) ──────────────────────────────────


def heartbeat(actor_id, session_id, now=None):
    """Says "still here" and asks how long is left. It does NOT advance the
    meter and cannot extend anything — the cutoff is expires_at on the
    server. A client that stops calling this loses nothing it paid for; it
    just gets swept sooner (the 60-second grace). Note the expired-but-not-
    yet-swept case answers live:true with seconds_left 0, exactly like the
    SQL: only the sweeper ends a session."""
    now = now or timezone.now()
    session = Session.objects.filter(pk=session_id).first()
    if session is None or str(actor_id) not in (
        str(session.seeker_id), str(session.consultant_id)
    ):
        return {"ok": False, "reason": REFUSAL_NOT_YOURS}
    if session.status != Session.Status.LIVE:
        return {"ok": True, "live": False, "seconds_left": 0}
    Session.objects.filter(pk=session.id).update(heartbeat_at=now)
    remaining = session.expires_at - now
    seconds_left = max(0, int(remaining.total_seconds()))
    return {"ok": True, "live": True, "seconds_left": seconds_left,
            "rate_paise": session.rate_paise}


# ── the sweeper (014; 018 adds request expiry) ───────────────────────────────


def sweep_sessions(now=None):
    """The single implementation of the sweep — a management command wraps
    this on a scheduler, and when Celery lands one @shared_task wraps it
    too, never reimplementing it (tasks/README). Two jobs, 018:

    1. Settle live sessions past expires_at OR silent for the grace period
       — `coalesce(heartbeat_at, started_at) < now - 60s`, the drop policy:
       a connection that blinks does not end a paid reading, one that is
       gone does. The reason is decided per row ('time ran out' vs
       'connection lost') and lands in the refund's ledger note — which is
       exactly 018 fix 4's allowance: only the sweeper supplies a reason.
    2. Expire requests nobody answered in 15 minutes. No money is involved
       — a request never cost anything, so this is a status change and
       nothing else (018).

    Idempotent and race-safe: the candidates are claimed FOR UPDATE SKIP
    LOCKED (disjoint slices for overlapping runs; on SQLite, whose file
    lock serialises writers, the claim degrades to the lock itself), and
    end_session's conditional settle means a session swept twice — or swept
    while its End is pressed — settles exactly once."""
    now = now or timezone.now()
    grace_before = now - timezone.timedelta(seconds=GRACE_SECONDS)
    candidates = (
        Session.objects.select_for_update(skip_locked=True)
        .filter(status=Session.Status.LIVE)
        .filter(
            Q(expires_at__lte=now)
            | Q(heartbeat_at__isnull=True, started_at__lt=grace_before)
            | Q(heartbeat_at__lt=grace_before)
        )
        .order_by("id")
    )
    settled = 0
    # select_for_update needs an explicit transaction on Postgres — SQLite
    # silently ignores it, so the unit suite never exercised this. Without
    # the atomic block the sweeper crashes on the first live candidate and
    # expired sessions are never settled (holds leak).
    with transaction.atomic():
        for session in candidates:
            reason = "time ran out" if session.expires_at <= now else "connection lost"
            result = end_session(None, session.id, reason=reason, now=now)
            # Count what THIS run actually settled. A concurrent sweeper (or a
            # pressed End) that got there first is reported already_ended — on
            # Postgres SKIP LOCKED hides its rows entirely, on SQLite the file
            # lock serialises after the snapshot; either way the sum across
            # overlapping runs is one settle per session.
            if not result.get("already_ended"):
                settled += 1
    expired_requests = Session.objects.filter(
        status=Session.Status.REQUESTED,
        requested_at__lt=now - timezone.timedelta(seconds=UNANSWERED),
    ).update(status=Session.Status.EXPIRED)
    return {"settled": settled, "expired_requests": expired_requests}


# ── threads and messages (014's read side; 016's preview; the live gate) ─────


def _participant_check(actor_id, thread):
    """The threads/messages select policy (014): the transcript is readable
    by its two participants, always. Returns the refusal or None."""
    if str(actor_id) not in (str(thread.seeker_id), str(thread.consultant_id)):
        return REFUSAL_NOT_PARTICIPANT
    return None


def send_message(sender_id, thread_id, body, now=None):
    """THE ONE DIRECT CLIENT WRITE IN V1 (014), and the meter is what bounds
    it — a message is accepted only into a thread with a live, UNEXPIRED
    session on it, and only as yourself. Outside a paid window the
    transcript is read-only: that is what stops chat being free to anyone
    who simply never presses End. The gate reads the LIVE session row, so
    the exact cutoff instant is the server's expires_at, never the
    client's clock. Returns the inserted row (the sender renders it
    immediately rather than waiting for a poll echo) or the refusal."""
    now = now or timezone.now()
    text = (body or "").strip()
    if not text:
        return {"ok": False, "reason": REFUSAL_SESSION_ENDED}
    thread = Thread.objects.filter(pk=thread_id).first()
    if thread is None:
        return {"ok": False, "reason": REFUSAL_NOT_PARTICIPANT}
    refusal = _participant_check(sender_id, thread)
    if refusal is not None:
        return {"ok": False, "reason": refusal}
    live = Session.objects.filter(
        thread_id=thread.id, status=Session.Status.LIVE, expires_at__gt=now
    ).exists()
    if not live:
        return {"ok": False, "reason": REFUSAL_SESSION_ENDED}
    with transaction.atomic():
        message = Message.objects.create(
            thread_id=thread.id, sender_id=sender_id, body=text
        )
        _touch_thread(thread.id, message.created_at, text)
    return {"ok": True, "message": _message_row(message)}


def _message_row(message):
    """The messages row exactly as PostgREST returned it (snake_case, all
    seven columns) — the client renders m.sender_id / m.body / m.created_at
    straight off this."""
    return {
        "id": str(message.id),
        "thread_id": str(message.thread_id),
        "sender_id": str(message.sender_id),
        "body": message.body,
        "created_at": message.created_at,
        "read_at": message.read_at,
    }


def list_messages(actor_id, thread_id, after=None, limit=500, now=None):
    """The transcript, oldest first. Participant-only (the RLS policy;
    anyone else gets a refusal, not an empty list — a silent empty would
    read as "no messages yet" to someone probing ids).

    Paging is keyset, not offset (docs/07 §3.1): `after` is the id of the
    last row the caller saw; the next page is every row strictly after its
    (created_at, id) pair. Ties on created_at (two messages in the same
    microsecond are possible under race) break on id, so a cursor page can
    never gap or duplicate. The polling transport the staged client uses
    pages forward with a cursor while new rows land; the union of its pages
    is the transcript exactly once. An unknown anchor returns the thread
    from the start rather than an error — the anchor should always be a row
    the server itself handed out."""
    thread = Thread.objects.filter(pk=thread_id).first()
    if thread is None:
        return None
    refusal = _participant_check(actor_id, thread)
    if refusal is not None:
        return None
    rows = Message.objects.filter(thread_id=thread.id)
    if after is not None:
        anchor = Message.objects.filter(pk=after, thread_id=thread.id).first()
        if anchor is not None:
            rows = rows.filter(
                Q(created_at__gt=anchor.created_at)
                | Q(created_at=anchor.created_at, pk__gt=anchor.pk)
            )
        # An unknown anchor: from the beginning. Duplicates are de-duped
        # client-side by id; a hole never is, so never guess forward.
    rows = rows.order_by("created_at", "id")[:limit]
    return [_message_row(row) for row in rows]


def mark_read(actor_id, thread_id, now=None):
    """Mark the OTHER party's messages read — read_at is the only column a
    client may write on messages (014's column grant), and the server
    stamps it with the server clock, never a client-sent time (rule 3).
    Own-side counts are untouched: unread clears on open, right side only
    (HANDOFF done-condition 3)."""
    thread = Thread.objects.filter(pk=thread_id).first()
    if thread is None:
        return None
    refusal = _participant_check(actor_id, thread)
    if refusal is not None:
        return None
    Message.objects.filter(
        thread_id=thread.id, read_at__isnull=True
    ).exclude(sender_id=actor_id).update(read_at=now or timezone.now())
    return {"ok": True}


def _name_expr(outer_field):
    """The threads_view name join as an ORM subquery — module 9 owns
    profiles, so the join is all-Django (profiles.services.name_subquery)."""
    return profile_services.name_subquery(outer_field)


def list_threads(actor_id):
    """`threads_view` (014) as a queryset result: the caller's threads —
    seeker or consultant — carrying the OTHER party's name (profiles is
    own-row-only; the bare table gives a UUID), the unread count (messages
    not mine, not read), and the live session id on the thread, if any.
    Ordered last_message_at DESC with NULLs last, exactly the client's
    `nullsFirst: false`; a tie falls back to created_at for stability."""
    base = Thread.objects.filter(
        Q(seeker_id=actor_id) | Q(consultant_id=actor_id)
    )
    threads = list(
        base.annotate(
            seeker_name=_name_expr("seeker_id"),
            consultant_name=_name_expr("consultant_id"),
        ).order_by(
            models.F("last_message_at").desc(nulls_last=True), "-created_at"
        )
    )
    live_by_thread = {
        str(session.thread_id): str(session.id)
        for session in Session.objects.filter(
            thread_id__in=[t.id for t in threads], status=Session.Status.LIVE
        )
    }
    unread_counts = {
        str(thread_id): count
        for thread_id, count in Message.objects.filter(
            thread_id__in=[t.id for t in threads], read_at__isnull=True
        )
        .exclude(sender_id=actor_id)
        .values_list("thread_id")
        .annotate(count=models.Count("id"))
    }
    return [
        {
            "id": str(thread.id),
            "seeker_id": str(thread.seeker_id),
            "consultant_id": str(thread.consultant_id),
            "last_message_at": thread.last_message_at,
            "last_preview": thread.last_preview,
            "created_at": thread.created_at,
            "seeker_name": thread.seeker_name,
            "consultant_name": thread.consultant_name,
            "unread": unread_counts.get(str(thread.id), 0),
            "live_session_id": live_by_thread.get(str(thread.id)),
        }
        for thread in threads
    ]


def list_sessions(actor_id):
    """My sessions, either side of them, newest first, capped the way the
    client reads them (supabase's limit(50)) — the sessions_select_mine
    policy is the scoping: a stranger simply sees no rows (014, and the
    check's assertion 11)."""
    rows = Session.objects.filter(
        Q(seeker_id=actor_id) | Q(consultant_id=actor_id)
    ).order_by("-requested_at")[:50]
    # Raw values: DRF renders UUIDs to strings and datetimes to ISO-8601 in
    # the response, the exact shapes PostgREST returned.
    return [
        {field: getattr(row, field) for field in SESSION_ROW_FIELDS} for row in rows
    ]
