"""Daily.co, as thin as it can be.

WHY DAILY AND NOT WEBRTC BY HAND: a two-person call needs signalling,
TURN servers for the third of Indian networks behind symmetric NAT, and
a renegotiation path when somebody switches from wifi to mobile data
mid-sentence. None of that is the product.

DORMANT WITHOUT A KEY. `is_configured()` is false when the settings are
empty and every caller checks it, so a missing key degrades to "video is
unavailable" and never to a session that bills for a call nobody can
join. The transport is not the money.
"""

import logging

import requests
from django.conf import settings

logger = logging.getLogger("apps.video")

API = "https://api.daily.co/v1"
TIMEOUT = 12


class UpstreamError(Exception):
    """Daily said no, or said nothing. The caller refuses the JOIN, never
    the session — a consultant who cannot get a room must not have the
    seeker's money settled as though the call happened."""


def is_configured():
    return bool(settings.DAILY_API_KEY and settings.DAILY_DOMAIN)


def _headers():
    return {
        "Authorization": f"Bearer {settings.DAILY_API_KEY}",
        "Content-Type": "application/json",
    }


def _call(method, path, payload=None):
    try:
        response = requests.request(
            method, f"{API}{path}", headers=_headers(), json=payload, timeout=TIMEOUT
        )
    except requests.RequestException as exc:
        raise UpstreamError(str(exc)) from exc
    if response.status_code == 404:
        return None
    if response.status_code >= 400:
        raise UpstreamError(f"{response.status_code} {response.text[:200]}")
    return response.json()


def get_room(name):
    return _call("GET", f"/rooms/{name}")


def create_room(name, expires_at):
    """A private two-person room.

    `exp` is a BACKSTOP, not the money (9 Oct 2026). Daily fixes a meeting's
    end when the meeting starts and ignores a later change to `exp`, so a
    room cut to the paid minutes hung up a call the seeker had just
    recharged (seen live, 8 Oct). The session's settle closes the room
    (`services.close_room`); `exp` only guarantees a room nobody closed
    does not live for ever.

    `max_participants: 2` because this is a consultation, not a room
    whose link can be forwarded.
    """
    return _call("POST", "/rooms", {
        "name": name,
        "privacy": "private",
        "properties": {
            "exp": int(expires_at.timestamp()),
            "max_participants": 2,
            "eject_at_room_exp": True,
            "enable_prejoin_ui": True,
            "enable_chat": False,
            # Recording stays OFF and is a policy line, not a default
            # waiting to be flipped — these are people's marriages, money
            # and illnesses, and recording them needs consent this
            # product has not asked for.
            "enable_recording": (
                "cloud" if settings.DAILY_ENABLE_RECORDING else False
            ),
        },
    })


def meeting_token(room_name, user_name, is_owner, expires_at, audio_only=False, user_id=None):
    """One token per person per session. Private rooms cannot be joined
    without one, so a forwarded link is a link to a locked door.

    The token expires with the room. A token that outlives the hold is a
    way back into a call that has been paid for and closed.
    """
    payload = {"properties": {
        "room_name": room_name,
        "user_name": (user_name or "Guest")[:60],
        "is_owner": bool(is_owner),
        "exp": int(expires_at.timestamp()),
    }}
    if user_id:
        # The profile id, so the room's participant list says WHO is in it
        # and the server can start the clock on its own evidence.
        payload["properties"]["user_id"] = str(user_id).replace("-", "")[:36]
    if audio_only:
        # An audio call is VOICE ONLY (7 Oct 2026): the token lets this
        # person send audio and nothing else — no camera, no screen — so it
        # is enforced by Daily, not by a hidden button, and the call is
        # billed at Daily's audio rate. It used to start with the camera off
        # and let either person switch it on.
        payload["properties"]["start_video_off"] = True
        payload["properties"]["enable_screenshare"] = False
        payload["properties"]["permissions"] = {"canSend": ["audio"]}
    data = _call("POST", "/meeting-tokens", payload)
    return (data or {}).get("token")


def set_can_send(name, can_send):
    """Change what everybody in the room may send, live (7 Oct 2026): False
    while a session is paused for a recharge, so the pause is silent and not
    a free two minutes; back to audio, or everything, when it resumes.
    Raises UpstreamError."""
    return _call("POST", f"/rooms/{name}/update-permissions", {
        "data": {"*": {"canSend": can_send}},
    })


def eject(name, user_ids):
    """Put these people out of the room's meeting now. Raises UpstreamError."""
    return _call("POST", f"/rooms/{name}/eject", {"user_ids": list(user_ids)})


def delete_room(name):
    """Delete the room, so nobody can join it again. Raises UpstreamError."""
    return _call("DELETE", f"/rooms/{name}")


def present_user_ids(room_name):
    """Who is in the room right now, by the user_id on their token — or
    None when Daily cannot say. Never guesses: an unknown answer must not
    start anybody's clock."""
    try:
        data = _call("GET", f"/rooms/{room_name}/presence")
    except UpstreamError as exc:
        logger.warning("[video] presence for %s failed: %s", room_name, exc)
        return None
    if data is None:
        return set()
    out = set()
    for row in data.get("data") or []:
        uid = row.get("userId") or row.get("user_id")
        if uid:
            out.add(str(uid).replace("-", "").lower())
    return out
