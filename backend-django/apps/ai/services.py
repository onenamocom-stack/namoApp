"""Namo AI — quota, price, and one turn of conversation.

THE MONEY SHAPE, and why it changed
**₹9 a question** (23 Sep, Rahul's call). It was ₹9 a minute for two days.

The per-minute meter is retired: `start_session`, `heartbeat` and the
clock are gone from the live path. It worked, it was tested, and it was
answering a question nobody was asking — a metered session makes sense
when you are buying somebody's TIME, and an AI consumes none. It also
made the seeker read a clock while thinking, which is the complaint every
app in this category already has.

Per question is what it says on the tin: five free on arrival, one a day
after that, then ₹9 for each answer.

**A failed answer is refunded.** The charge is taken before the model is
called — so a question that costs money is never lost to a timeout — and
given back if no answer arrives. Somebody who paid ₹9 and got "could not
reach the astrologer" has been robbed of ₹9, and there is no version of
that which is acceptable.

`apps/ai/models.Session` and its table survive so the rows from the
metered fortnight stay readable. Nothing writes them any more.
"""

import logging

from django.db import transaction
from django.utils import timezone

from apps.chat.services import _billable_paise, _minutes_held
from apps.consultants import gateway
from apps.wallet import services as wallet_services

from . import providers
from .models import Message, Quota, Session
from .prompt import chart_block

logger = logging.getLogger("apps.ai")

# The sentences the interface shows. They live here because the server owns
# the refusal (backend/INSTRUCTIONS.md §2) — the client renders the string
# it is given and invents none of its own.
REFUSAL_NO_WALLET = "Add money to keep asking."
REFUSAL_SHORT_BALANCE = "Not enough for a question. Add money to keep going."
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


def _price_paise():
    """What one answer costs, once the free allowance is gone. ₹9.

    A setting rather than a constant because it is a price, and this one
    changed twice in three days — per minute on the 21st, per question on
    the 23rd. A price change must not need a deploy.
    """
    from django.conf import settings

    return settings.AI_PRICE_PAISE


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


# ── the meter, retired 23 Sep ───────────────────────────────────────────────
#
# start_session / heartbeat / end_session / sweep_sessions lived here and
# are deleted. Billing is per question now, so there is no clock to start
# and nothing to settle. They were removed rather than left dormant:
# retired code that still imports and half-runs is worse than no code,
# because the next person to read it cannot tell which half is live.
#
# `models.Session` and the `ai_sessions` table survive so the rows written
# during the metered fortnight stay readable. Nothing writes them.
#
# git show 6419773 has the whole thing if per-minute ever comes back.


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
        # (payload, cached) — the memo's shape, the same one apps/astro's
        # view unpacks. Taking the tuple whole was a 500 the moment a
        # profile actually had birth details: every test until then ran on
        # an account with none, so _chart_for returned None and the bug
        # could not show.
        payload, _cached = astro_services.user_chart(profile_id, birth)
        return payload
    except Exception as exc:  # noqa: BLE001 — never fail a question on this
        logger.warning("[ai] chart unavailable: %s", type(exc).__name__)
        return None


def _subject_chart(subject):
    """A chart for somebody the seeker typed in. Same failure rule as the
    caller's own chart: a chart we cannot compute becomes the prompt's
    "not available" branch, never a 500 and never invented placements."""
    try:
        from apps.astro import services as astro_services

        payload, _cached = astro_services.subject_chart(subject)
        return payload
    except Exception as exc:  # noqa: BLE001 — never fail a question on this
        logger.warning("[ai] subject chart unavailable: %s", type(exc).__name__)
        return None


def ask(profile_id, question, subject=None):
    """One question, one answer.

    Free first: the welcome five, then one a day. Only when neither is left
    does this need a running session, and the session is the seeker's to
    start — this never starts one on their behalf, because a question typed
    into a box is not consent to begin spending.

    `subject` is somebody else's birth details, typed by the seeker, for a
    question about that person rather than themselves. It is used and
    dropped: the chart is computed, the prompt is built, and **nothing about
    that person is written down** — not the name, not the date, not the
    place. They never agreed to be in this database. The consequence is
    deliberate and visible: reopen the app and the chart is gone, because
    the client holds it for the life of the conversation and nowhere else.
    """
    question = (question or "").strip()
    if not question:
        return {"ok": False, "reason": REFUSAL_EMPTY}

    now = timezone.now()
    price = _price_paise()
    charged = 0

    with transaction.atomic():
        used_free = _take_free(profile_id)
        if not used_free:
            # Charged BEFORE the model is called, and inside the same
            # transaction as the quota check — so two taps in one tick
            # cannot both find the last free message and cannot both
            # escape paying.
            paid = wallet_services.debit(profile_id, price, "Namo AI · one question")
            if not paid.get("ok"):
                state = quota_state(profile_id)
                return {
                    "ok": False,
                    "reason": paid.get("reason"),
                    "needs_money": True,
                    "price_paise": price,
                    "balance_paise": paid.get("balance_paise"),
                    "free_left": state["free_left"],
                }
            charged = price

        # Written before the call, so a question that costs money is never
        # lost to a provider timeout — the seeker can see what they asked.
        # The subject's birth details are not in it and are never stored.
        Message.objects.create(
            profile_id=profile_id, session=None, role=Message.Role.USER,
            body=question, created_at=now,
        )

    history = [
        {"role": m.role, "body": m.body} for m in history_for(profile_id)[:-1]
    ]

    if subject:
        block = chart_block(_subject_chart(subject), subject_name=subject.get("name"))
    else:
        block = chart_block(_chart_for(profile_id))

    try:
        answer = providers.ask(history, question, block)
    except providers.UpstreamError as exc:
        logger.error("[ai] upstream: %s", exc)
        # THE MONEY COMES BACK. Somebody who paid ₹9 and got "could not
        # reach the astrologer" has been robbed of ₹9, and no amount of
        # "they can just retry" makes that acceptable.
        #
        # The free message is NOT given back, deliberately: it was spent
        # on a question they can still see and retry, and refunding it on
        # every failure is a free-question generator for anybody who can
        # cause a timeout.
        if charged:
            wallet_services.credit(
                profile_id, charged, "Refund · Namo AI could not answer",
                ref_type="refund",
            )
        return {"ok": False, "reason": REFUSAL_UPSTREAM, "retryable": True,
                "refunded_paise": charged}

    reply = Message.objects.create(
        profile_id=profile_id, session=None, role=Message.Role.MODEL,
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
        "charged_paise": charged,
        "price_paise": price,
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
