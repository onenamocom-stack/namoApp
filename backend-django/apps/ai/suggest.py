"""Suggested replies for a consultant, mid-chat (20 Oct 2026, Rahul: "chat
me pro ko suggested text ... according to what is the question of seeker";
then "सुझाव button sahi h").

The Pro taps सुझाव; this reads the session's last messages and the seeker's
chart and answers three short replies. A tap puts one in the Pro's box to
edit; nothing is ever sent by itself and the seeker sees none of it.

Free to the Pro, so it is bounded: a few seconds between asks and a daily
ceiling per consultant. Only the consultant of a live session on the
thread may ask, and only for that thread.
"""

import logging
import re

from django.core.cache import cache
from django.utils import timezone

from . import providers
from .prompt import chart_block

logger = logging.getLogger("apps.ai")

HISTORY = 12
COOLDOWN_SECONDS = 4
DAILY_LIMIT = 300

SYSTEM = """You help an astrologer on NAMO reply to a seeker in a live paid chat.
The astrologer reads your suggestions and chooses; you never speak to the
seeker yourself.

Write SUGGESTED REPLIES: three different replies the astrologer could send
next, answering the seeker's latest message.
- Each is one or two short sentences, written as the astrologer, to the seeker.
- Use the seeker's own language and script: Hindi in Devanagari, Hinglish in
  Latin letters, English in English.
- Ground them in the chart below when it speaks to the question; never invent
  a placement the chart does not show. If the birth details are missing, one
  reply asks for date, time and place of birth.
- Make the three different: one answers directly, one asks the question that
  would sharpen the reading, one gives a remedy or next step.
- No guarantees. No medical, legal or financial instruction. Nothing about
  death, disease or pregnancy as a prediction.
- No emoji. No greeting unless the seeker only greeted.

Answer with exactly three lines, each starting "1. ", "2. ", "3. ", and nothing else."""

LINE = re.compile(r"^\s*(?:[1-3][.)]|[-*•])\s*(.+?)\s*$")


class Refused(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def _parse(text):
    out = []
    for raw in (text or "").splitlines():
        m = LINE.match(raw)
        line = (m.group(1) if m else raw).strip().strip('"')
        if line and line not in out:
            out.append(line[:400])
    return out[:3]


def suggest(consultant_id, thread_id, now=None):
    """Three replies for the consultant of a live session on `thread_id`."""
    from apps.chat.models import Message, Session, Thread
    from .services import _chart_for

    now = now or timezone.now()
    thread = Thread.objects.filter(pk=thread_id).first()
    if thread is None or str(thread.consultant_id) != str(consultant_id):
        raise Refused(403, "not_consultant", "Only the consultant of this chat gets suggestions.")
    live = Session.objects.filter(
        thread_id=thread_id, consultant_id=consultant_id, status=Session.Status.LIVE, expires_at__gt=now,
    ).exists()
    if not live:
        raise Refused(409, "session_ended", "Suggestions are for a live session.")

    if not cache.add(f"suggest-wait:{consultant_id}", 1, COOLDOWN_SECONDS):
        raise Refused(429, "too_soon", "Wait a moment before asking again.")
    day = f"suggest-day:{consultant_id}:{now.date().isoformat()}"
    cache.add(day, 0, 86400)
    if cache.incr(day) > DAILY_LIMIT:
        raise Refused(429, "daily_limit", "That is today's suggestions. Write this one yourself.")

    rows = list(Message.objects.filter(thread_id=thread_id).order_by("-created_at")[:HISTORY])
    rows.reverse()
    if not any(str(m.sender_id) == str(thread.seeker_id) for m in rows):
        raise Refused(409, "nothing_yet", "The seeker has not written yet.")
    # The transcript goes as one message, labelled, rather than as turns:
    # a seeker may write three lines in a row, and a model API that wants
    # turns to alternate refuses that.
    transcript = "\n".join(
        f"{'Seeker' if str(m.sender_id) == str(thread.seeker_id) else 'Astrologer'}: {m.body}" for m in rows
    )
    system = f"{SYSTEM}\n\n{chart_block(_chart_for(thread.seeker_id))}"
    try:
        got = providers.get_provider().answer(
            system, [], f"THE CHAT SO FAR, oldest first:\n{transcript}\n\nSuggest the astrologer's next reply.")
    except providers.UpstreamError as exc:
        logger.warning("[ai] suggest failed: %s", type(exc).__name__)
        raise Refused(503, "upstream", "Suggestions did not come. Try again.") from None
    replies = _parse(got.get("text"))
    if not replies:
        raise Refused(503, "upstream", "Suggestions did not come. Try again.")
    return replies
