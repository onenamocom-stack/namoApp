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
REFUSAL_WAITING = "Waiting for them to answer."
REFUSAL_NOT_LIVE = "That session is not live."
REFUSAL_DECLINED = "They could not take the call."
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

    # LIVE ONLY — but "not live" has two meanings and the client must be
    # able to tell them apart.
    #
    # REQUESTED is not-live-YET. The seeker is sent to the call screen the
    # moment they ask, because an empty room with a countdown is a truer
    # picture of "waiting for them" than a spinner on a list. They arrive
    # before the consultant has accepted, so the first join is always
    # refused — and on 26 Sep that refusal was final: the screen asked
    # once, showed "that session is not live", and never asked again. The
    # consultant answered seven seconds later, the meter started, and the
    # seeker sat looking at an error until the money ran out.
    #
    # Everything else is not-live-ANY-MORE and there is nothing to wait
    # for. `status` goes out so the client stops guessing from a sentence.
    if session.status == Session.Status.REQUESTED:
        return {"ok": False, "reason": REFUSAL_WAITING,
                "status": session.status, "retry": True}
    if session.status != Session.Status.LIVE:
        return {
            "ok": False,
            "reason": (
                REFUSAL_DECLINED
                if session.status == Session.Status.DECLINED
                else REFUSAL_NOT_LIVE
            ),
            "status": session.status,
            "retry": False,
        }
    if session.expires_at is None or session.expires_at <= stamp:
        # The sweeper will settle it within the minute. Refusing here
        # rather than opening a room that Daily would eject them from
        # two seconds later.
        return {"ok": False, "reason": REFUSAL_EXPIRED,
                "status": session.status, "retry": False}

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
