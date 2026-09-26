"""Joining the call that a paid session already bought.

THE MONEY IS NOT HERE. `apps/chat` holds the meter: it takes the hold at
accept, stamps `expires_at`, settles at end, and the sweeper closes what
nobody closed. This module only hands out a door for the window that
money already bought — so a failure here refuses the JOIN and never the
session, and a consultant who cannot get a room has not been paid for a
call that did not happen.

THE ROOM NAME IS DERIVED, NOT STORED. `namo-<session id>` — deterministic,
so no column on `sessions` and nothing to drift. Two people joining the
same session ask for the same name and Daily returns the same room.
"""

import logging

from django.utils import timezone

from . import providers

logger = logging.getLogger("apps.video")

REFUSAL_UNAVAILABLE = "Video calling is not switched on yet."
REFUSAL_NOT_LIVE = "That session is not live."
REFUSAL_NOT_YOURS = "That session is not yours."
REFUSAL_EXPIRED = "That session has ended."
REFUSAL_UPSTREAM = "Could not open the call. Try again."


def room_name(session_id):
    return f"namo-{str(session_id).replace('-', '')}"


def join(actor_id, session_id, now=None):
    """The URL and token for this person to enter this session's call.

    Both sides call this and both get their own token: same room, two
    doors. The consultant is the owner, which is what lets them admit the
    other and end the room — the seeker joining an empty room and waiting
    is the normal case, not an error.
    """
    from apps.chat.models import Session

    if not providers.is_configured():
        return {"ok": False, "reason": REFUSAL_UNAVAILABLE}

    stamp = now or timezone.now()
    session = Session.objects.filter(pk=session_id).first()
    if session is None:
        return {"ok": False, "reason": REFUSAL_NOT_LIVE}

    actor = str(actor_id).replace("-", "")
    is_consultant = str(session.consultant_id).replace("-", "") == actor
    is_seeker = str(session.seeker_id).replace("-", "") == actor
    if not (is_consultant or is_seeker):
        return {"ok": False, "reason": REFUSAL_NOT_YOURS}

    # LIVE ONLY. A requested session has taken no money and bought no
    # window; an ended one has been settled. Neither has a door.
    if session.status != Session.Status.LIVE:
        return {"ok": False, "reason": REFUSAL_NOT_LIVE}
    if session.expires_at is None or session.expires_at <= stamp:
        # The sweeper will settle it within the minute. Refusing here
        # rather than opening a room that Daily would eject them from
        # two seconds later.
        return {"ok": False, "reason": REFUSAL_EXPIRED}

    name = room_name(session.id)
    try:
        room = providers.get_room(name) or providers.create_room(
            name, session.expires_at
        )
        from apps.profiles import services as profile_services

        token = providers.meeting_token(
            name,
            profile_services.profile_name(actor_id) or "Guest",
            is_owner=is_consultant,
            expires_at=session.expires_at,
        )
    except providers.UpstreamError as exc:
        logger.error("[video] %s: %s", name, exc)
        return {"ok": False, "reason": REFUSAL_UPSTREAM, "retryable": True}

    return {
        "ok": True,
        "url": (room or {}).get("url"),
        "token": token,
        "room": name,
        # The client shows the same countdown the money runs on. It is
        # read from the session, never from the room — the room's own
        # `exp` is a copy, and two clocks disagreeing over somebody's
        # money is the complaint this product already avoided once.
        "expires_at": session.expires_at.isoformat(),
        "is_owner": is_consultant,
    }
