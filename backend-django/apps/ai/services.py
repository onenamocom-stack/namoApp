"""Namo AI — quota, meter, and one turn of conversation.

THE MONEY SHAPE, and why it is what it is
The seeker chose per-minute over per-message (21 Sep 2026), matching how
every Indian astrology app bills a human astrologer. It is the model with
the loudest complaint against it — "the timer never stops", thinking and
typing are billable — so two things here answer that complaint directly
rather than papering over it:

  * The hold is the whole wallet, floored to minutes, taken up front. The
    clock cannot run past what was held, so an abandoned tab spends what it
    bought and not a rupee more.
  * Unused minutes are refunded at settle, always. Ending early is cheaper,
    which is the opposite of what the complaint describes.

The arithmetic is imported from chat.services rather than copied. Two
implementations of the same billing rule drift, and the drift is money.
"""

import logging

from django.db import transaction
from django.utils import timezone

from apps.chat.services import _billable_minutes, _minutes_held
from apps.consultants import gateway
from apps.wallet import services as wallet_services

from . import providers
from .models import Message, Quota, Session
from .prompt import chart_block

logger = logging.getLogger("apps.ai")

# The sentences the interface shows. They live here because the server owns
# the refusal (backend/INSTRUCTIONS.md §2) — the client renders the string
# it is given and invents none of its own.
REFUSAL_NO_WALLET = "Add money before you start a session."
REFUSAL_SHORT_BALANCE = "Not enough for a minute. Add money to keep going."
REFUSAL_ALREADY_LIVE = "You already have a session running."
REFUSAL_NO_SESSION = "Start a session to keep asking."
REFUSAL_SESSION_OVER = "That session has ended."
REFUSAL_NOT_YOURS = "That is not your session."
REFUSAL_EMPTY = "Type a question first."
REFUSAL_UPSTREAM = "Could not reach the astrologer. Try again."

# How many past messages the model sees. The seeker asked for "last 20,
# flushed after a month". Twenty is also what keeps the bill flat: every
# turn re-sends the whole window, so an uncapped history costs more with
# each question asked.
HISTORY_LIMIT = 20

def _welcome_free():
    """Once per account, never refilled. A setting rather than a constant so
    it can be raised for a testing window and put back with one env var —
    the alternative was a flag that skips the quota entirely, and a flag
    like that is exactly the kind of thing that gets left on."""
    from django.conf import settings

    return settings.AI_WELCOME_FREE


def _daily_free():
    from django.conf import settings

    return settings.AI_DAILY_FREE


def _ist_today():
    """The calendar the product already uses (docs/02-TRD.md §10). IST has
    no DST, so the shift is a constant and this needs no zone database."""
    return (timezone.now() + timezone.timedelta(hours=5, minutes=30)).date()


# ── quota ────────────────────────────────────────────────────────────────────


def quota_state(profile_id):
    """What is free right now, without spending anything. The panel reads
    this to decide whether to show a question box or a Start button."""
    row = Quota.objects.filter(profile_id=profile_id).first()
    welcome_left = _welcome_free() - (row.welcome_used if row else 0)
    if welcome_left > 0:
        return {"free_left": welcome_left, "kind": "welcome"}
    # Every free message stamps the day, the welcome ones included, so a
    # fresh account has none left on the day its fifth was spent — "one a
    # day FROM THE NEXT DAY", which is what was asked for.
    used_today = row.daily_used if (row and row.last_free_on == _ist_today()) else 0
    return {"free_left": max(0, _daily_free() - used_today), "kind": "daily"}


def _take_free(profile_id):
    """Spend one free message if there is one. Returns True if it did.

    Inside the caller's transaction and behind a row lock: two taps in the
    same second must not both find the last free message. select_for_update
    is what makes "five free" mean five.
    """
    row = (
        Quota.objects.select_for_update()
        .filter(profile_id=profile_id)
        .first()
    )
    if row is None:
        row = Quota.objects.create(profile_id=profile_id)
        row = Quota.objects.select_for_update().get(profile_id=profile_id)

    today = _ist_today()

    if row.welcome_used < _welcome_free():
        # The day is stamped here too, and that is not bookkeeping — it is
        # the rule. The daily allowance starts the day AFTER, so somebody
        # who burns the welcome five on a Monday gets their next free
        # message on Tuesday, not six on Monday. The stamp fills the day's
        # allowance so the daily branch below cannot also fire.
        row.welcome_used += 1
        row.last_free_on = today
        row.daily_used = _daily_free()
        row.save(update_fields=("welcome_used", "last_free_on", "daily_used"))
        return True

    if row.last_free_on != today:
        row.last_free_on = today
        row.daily_used = 1
        row.save(update_fields=("last_free_on", "daily_used"))
        return True

    if row.daily_used < _daily_free():
        row.daily_used += 1
        row.save(update_fields=("daily_used",))
        return True

    return False


# ── the meter ────────────────────────────────────────────────────────────────


def live_session(profile_id, now=None):
    """The caller's running session, or None. Anything past its expiry is
    not live however the row is labelled — the sweeper settles it, and
    until it does this must not let another question through."""
    now = now or timezone.now()
    return (
        Session.objects.filter(
            profile_id=profile_id, status=Session.Status.LIVE, expires_at__gt=now
        )
        .order_by("-started_at")
        .first()
    )


def start_session(profile_id, now=None):
    """Start the clock. No request/accept dance — there is nobody to accept.

    The whole wallet is held, floored to minutes, exactly as chat.accept
    does it. Holding the whole balance rather than a slice is what lets the
    seeker keep asking without a top-up interrupting them mid-thought; the
    refund at settle is what makes that fair.
    """
    now = now or timezone.now()
    rate = _rate_paise()

    with transaction.atomic():
        if live_session(profile_id, now):
            return {"ok": False, "reason": REFUSAL_ALREADY_LIVE}

        balance = wallet_services.lock_wallet_balance(profile_id)
        if balance is None:
            return {"ok": False, "reason": REFUSAL_NO_WALLET}

        minutes = _minutes_held(balance, rate)
        if minutes < 1:
            return {
                "ok": False,
                "reason": REFUSAL_SHORT_BALANCE,
                "balance_paise": balance,
            }

        hold = minutes * rate
        session = Session.objects.create(
            profile_id=profile_id,
            rate_paise=rate,
            started_at=now,
            expires_at=now + timezone.timedelta(minutes=minutes),
            heartbeat_at=now,
            hold_paise=hold,
        )

        # An order, exactly as chat.accept writes one — and for a reason
        # beyond symmetry: `ledger.ref_type` is a closed CHECK of
        # order/payment/refund/adjustment, so a debit has to point at an
        # order to be writable at all, and 013's one-refund-per-order index
        # is what makes the settle idempotent. item_type is 'session'
        # because that is what this is and because the CHECK on
        # order_items has no 'ai' member; the title is what tells the two
        # apart on a statement.
        order_id = gateway.insert_order(profile_id, hold)
        gateway.insert_order_item(
            order_id,
            item_type="session",
            item_id=session.id,
            title="Namo AI · chat",
            unit_price_paise=rate,
        )
        session.order_id = order_id
        session.save(update_fields=("order_id",))

        wallet_services.insert_ledger(
            profile_id,
            -hold,
            f"Namo AI · {minutes} min held",
            ref_type="order",
            ref_id=order_id,
        )

    return {
        "ok": True,
        "session_id": str(session.id),
        "rate_paise": rate,
        "seconds_left": minutes * 60,
        "minutes_held": minutes,
    }


def end_session(profile_id, session_id, reason=None, now=None):
    """Settle. Charged is the minutes used, rounded up, capped at the hold;
    the rest comes back. Idempotent — a pressed End racing the sweeper must
    not refund twice."""
    now = now or timezone.now()
    session = Session.objects.filter(pk=session_id).first()
    if session is None:
        return {"ok": False, "reason": REFUSAL_SESSION_OVER}
    if profile_id is not None and str(session.profile_id) != str(profile_id):
        return {"ok": False, "reason": REFUSAL_NOT_YOURS}
    if session.status != Session.Status.LIVE:
        return {"ok": True, "already_ended": True, "charged_paise": session.charged_paise}

    stop = min(now, session.expires_at)
    minutes = _billable_minutes(
        session.started_at, stop, session.hold_paise, session.rate_paise
    )
    charged = minutes * session.rate_paise
    refund = session.hold_paise - charged

    # The UPDATE is the claim. Whoever's update returns 1 owns the settle,
    # and only that one writes the refund — the same guard chat.end_session
    # uses, and for the same race (a pressed End meeting the sweeper).
    claimed = Session.objects.filter(
        pk=session.id, status=Session.Status.LIVE
    ).update(status=Session.Status.ENDED, ended_at=now, charged_paise=charged)
    if claimed == 0:
        settled = Session.objects.get(pk=session.id)
        return {"ok": True, "already_ended": True, "charged_paise": settled.charged_paise}

    # 013's partial unique index allows one refund per order, which is what
    # makes a pressed End racing the sweeper credit once even if both get
    # past the claim above.
    if refund > 0:
        wallet_services.insert_ledger(
            session.profile_id,
            refund,
            "Refund · unused minutes",
            ref_type="refund",
            ref_id=session.order_id,
            note=reason or "ended",
        )
    # The order opened at the hold is restated at what was actually spent,
    # so a statement and the ledger agree.
    if session.order_id:
        gateway.set_order_total(session.order_id, charged)

    return {"ok": True, "charged_paise": charged, "refund_paise": refund,
            "minutes": minutes}


def heartbeat(profile_id, session_id, now=None):
    """The clock on screen. The server's seconds_left always wins — the
    browser counts down between beats for smoothness, never for truth."""
    now = now or timezone.now()
    session = Session.objects.filter(pk=session_id, profile_id=profile_id).first()
    if session is None or session.status != Session.Status.LIVE:
        return {"ok": True, "live": False, "seconds_left": 0}

    remaining = session.expires_at - now
    seconds_left = max(0, int(remaining.total_seconds()))
    Session.objects.filter(pk=session.id).update(heartbeat_at=now)
    return {
        "ok": True,
        "live": seconds_left > 0,
        "seconds_left": seconds_left,
        "rate_paise": session.rate_paise,
    }


def sweep_sessions(now=None):
    """Settle everything past its expiry. Runs on the same one-minute
    schedule as the consultant sweeper; without it an abandoned tab leaves
    a session 'live' forever and the held minutes never come back."""
    now = now or timezone.now()
    settled = 0
    for session in Session.objects.filter(
        status=Session.Status.LIVE, expires_at__lte=now
    ):
        result = end_session(None, session.id, reason="swept", now=now)
        if result.get("ok") and not result.get("already_ended"):
            settled += 1
    return {"settled": settled}


def _rate_paise():
    from django.conf import settings

    return settings.AI_RATE_PAISE


# ── the conversation ─────────────────────────────────────────────────────────


def history_for(profile_id, limit=HISTORY_LIMIT):
    """The last `limit` messages, oldest-first — the order a model reads."""
    rows = list(
        Message.objects.filter(profile_id=profile_id)
        .order_by("-created_at", "-id")[:limit]
    )
    rows.reverse()
    return rows


def _chart_for(profile_id):
    """The caller's natal chart, or None. A failure here is not fatal: the
    prompt has a branch for a missing chart that says so out loud, which is
    a better answer than a 500 — and far better than the model filling the
    gap with invented placements."""
    try:
        from apps.astro import services as astro_services

        birth = astro_services.get_birth_details(profile_id)
        if not birth or not birth.get("birth_date"):
            return None
        return astro_services.user_chart(profile_id, birth)
    except Exception as exc:  # noqa: BLE001 — never fail a question on this
        logger.warning("[ai] chart unavailable: %s", type(exc).__name__)
        return None


def ask(profile_id, question):
    """One question, one answer.

    Free first: the welcome five, then one a day. Only when neither is left
    does this need a running session, and the session is the seeker's to
    start — this never starts one on their behalf, because a question typed
    into a box is not consent to begin spending.
    """
    question = (question or "").strip()
    if not question:
        return {"ok": False, "reason": REFUSAL_EMPTY}

    now = timezone.now()

    with transaction.atomic():
        used_free = _take_free(profile_id)
        session = None
        if not used_free:
            session = live_session(profile_id, now)
            if session is None:
                state = quota_state(profile_id)
                return {
                    "ok": False,
                    "reason": REFUSAL_NO_SESSION,
                    "needs_session": True,
                    "free_left": state["free_left"],
                    "rate_paise": _rate_paise(),
                }

        # Written before the call, so a question that costs money is never
        # lost to a provider timeout — the seeker can see what they asked.
        Message.objects.create(
            profile_id=profile_id, session=session, role=Message.Role.USER,
            body=question, created_at=now,
        )

    history = [
        {"role": m.role, "body": m.body} for m in history_for(profile_id)[:-1]
    ]

    try:
        answer = providers.ask(history, question, chart_block(_chart_for(profile_id)))
    except providers.UpstreamError as exc:
        logger.error("[ai] upstream: %s", exc)
        # The free message is NOT given back. It was spent on a question the
        # seeker can still see and retry, and refunding it on every failure
        # is a free-question generator for anyone who can cause a timeout.
        # A paid minute is different — the clock refunds itself at settle.
        return {"ok": False, "reason": REFUSAL_UPSTREAM, "retryable": True}

    reply = Message.objects.create(
        profile_id=profile_id, session=session, role=Message.Role.MODEL,
        body=answer["text"], tokens_in=answer.get("tokens_in"),
        tokens_out=answer.get("tokens_out"),
    )

    state = quota_state(profile_id)
    return {
        "ok": True,
        "id": str(reply.id),
        "text": reply.body,
        "created_at": reply.created_at.isoformat(),
        "free_left": state["free_left"],
        "session_id": str(session.id) if session else None,
    }


def transcript(profile_id, limit=HISTORY_LIMIT):
    """What the panel renders on open."""
    return [
        {
            "id": str(m.id),
            "role": m.role,
            "text": m.body,
            "created_at": m.created_at.isoformat(),
        }
        for m in history_for(profile_id, limit)
    ]
