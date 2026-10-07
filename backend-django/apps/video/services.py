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


def _refuse(reason, *, session=None, actor_id=None, retry=False, **extra):
    """Every refusal, logged with the reason.

    IT WAS NOT, AND THAT COST AN EVENING. A seeker was refused four times
    while the meter ran, and the only trace was a 409 in the access log
    with no body and no line from this module — so the cause had to be
    guessed at from response byte counts. A refusal nobody can read is a
    bug nobody can fix.
    """
    logger.warning(
        "[video] refused: %s | session=%s status=%s actor=%s retry=%s",
        reason,
        str(session.id)[:8] if session else "-",
        session.status if session else "-",
        str(actor_id)[:8] if actor_id else "-",
        retry,
    )
    return {"ok": False, "reason": reason, "retry": retry, **extra}


def join(actor_id, session_id, now=None):
    """The URL and token for this person to enter this session's call.

    Both sides call this and both get their own token: same room, two
    doors. The consultant is the owner, which is what lets them admit the
    other and end the room — the seeker joining an empty room and waiting
    is the normal case, not an error.
    """
    from apps.chat.models import Session

    if not providers.is_configured():
        return _refuse(REFUSAL_UNAVAILABLE, actor_id=actor_id)

    stamp = now or timezone.now()
    session = Session.objects.filter(pk=session_id).first()
    if session is None:
        return _refuse(REFUSAL_NOT_LIVE, actor_id=actor_id)

    actor = str(actor_id).replace("-", "")
    is_consultant = str(session.consultant_id).replace("-", "") == actor
    is_seeker = str(session.seeker_id).replace("-", "") == actor
    if not (is_consultant or is_seeker):
        return _refuse(REFUSAL_NOT_YOURS, session=session, actor_id=actor_id)

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
        return _refuse(REFUSAL_WAITING, session=session, actor_id=actor_id,
                       retry=True, status=session.status)
    if session.status != Session.Status.LIVE:
        return _refuse(
            REFUSAL_DECLINED
            if session.status == Session.Status.DECLINED
            else REFUSAL_NOT_LIVE,
            session=session, actor_id=actor_id, status=session.status,
        )
    # CONNECTING (5 Oct 2026): accepted, the money held, the clock not yet
    # running. Both of them may come in; the clock starts when both are
    # here (apps.chat.services.heartbeat → both_present). The room and the
    # tokens are cut to last the connect window plus every minute held.
    if session.started_at is None:
        from apps.chat.services import CONNECT_SECONDS

        accepted = session.accepted_at or session.requested_at
        if accepted + timezone.timedelta(seconds=CONNECT_SECONDS) <= stamp:
            return _refuse(REFUSAL_EXPIRED, session=session, actor_id=actor_id,
                           status=session.status)
        minutes = (session.hold_paise or 0) // session.rate_paise + (session.free_seconds or 0) / 60
        room_until = accepted + timezone.timedelta(seconds=CONNECT_SECONDS, minutes=minutes)
    elif session.expires_at is None or session.expires_at <= stamp:
        # The sweeper will settle it within the minute. Refusing here
        # rather than opening a room that Daily would eject them from
        # two seconds later.
        return _refuse(REFUSAL_EXPIRED, session=session, actor_id=actor_id,
                       status=session.status)
    else:
        room_until = session.expires_at

    name = room_name(session.id)
    try:
        room = providers.get_room(name) or _create_or_get(name, room_until)
        from apps.profiles import services as profile_services

        token = providers.meeting_token(
            name,
            profile_services.profile_name(actor_id) or "Guest",
            is_owner=is_consultant,
            expires_at=room_until,
            audio_only=session.audio_only,
            user_id=actor_id,
        )
    except providers.UpstreamError as exc:
        logger.error("[video] daily failed for %s: %s", name, exc)
        # RETRYABLE, and the client must actually retry it. Daily
        # hiccuping for one of the two while the meter runs stranded the
        # seeker on an error screen with their money going.
        return _refuse(REFUSAL_UPSTREAM, session=session, actor_id=actor_id,
                       retry=True, status=session.status)

    return {
        "ok": True,
        "url": (room or {}).get("url"),
        "token": token,
        "room": name,
        # The client shows the same countdown the money runs on. It is
        # read from the session, never from the room — the room's own
        # `exp` is a copy, and two clocks disagreeing over somebody's
        # money is the complaint this product already avoided once.
        # While the call connects this is the ROOM's end (connect window +
        # every minute held), never empty. An app loaded before 5 Oct read an
        # empty end as "0:00 left" and hung up the call it had just joined;
        # a phone that has not reloaded must not be able to do that. The
        # money is unaffected: billing waits for `started_at`, and current
        # apps read `connecting`, not this, to know the clock has not begun.
        "expires_at": (session.expires_at or room_until).isoformat(),
        "connecting": session.started_at is None,
        "is_owner": is_consultant,
    }


def _create_or_get(name, until):
    """Both phones open the call in the same second (5 Oct 2026, seen live):
    both read "no room", both create, and Daily refuses the second with
    "already exists" — which turned one of them away for a retry. The room
    they wanted exists, so read it and carry on."""
    try:
        return providers.create_room(name, until)
    except providers.UpstreamError as exc:
        if "already exists" not in str(exc):
            raise
        return providers.get_room(name)


def both_present(session):
    """Are the seeker AND the consultant in this session's room, by the
    room's own participant list? False when Daily cannot say — the clock
    then waits for the next heartbeat rather than starting on a guess."""
    if not providers.is_configured():
        return False
    # Both phones ask every few seconds while a call connects; two seconds
    # of cache keeps that to one question to Daily per room per beat.
    from django.core.cache import cache

    key = f"daily-presence:{session.id}"
    ids = cache.get(key)
    if ids is None:
        ids = providers.present_user_ids(room_name(session.id))
        if ids is not None:
            cache.set(key, ids, 2)
    if not ids:
        return False
    want = {str(session.seeker_id).replace("-", "").lower(),
            str(session.consultant_id).replace("-", "").lower()}
    return want <= ids


def clock_started(session):
    """The paid minutes began: the room now ends exactly when they do.
    Until this the room was cut to the connect window plus every minute
    held, which would otherwise outlast the money by up to that window."""
    if not providers.is_configured() or session.expires_at is None:
        return
    try:
        providers.set_room_expiry(room_name(session.id), session.expires_at)
    except providers.UpstreamError as exc:
        # The settle is still on time — the money never depended on the
        # room. Logged, because a room outliving its money is worth knowing.
        logger.error("[video] could not move room expiry for %s: %s", session.id, exc)
