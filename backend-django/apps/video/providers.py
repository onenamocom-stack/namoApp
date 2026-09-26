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
    """A private two-person room that dies with the money.

    `exp` IS THE SESSION'S OWN `expires_at`, and `eject_at_room_exp`
    enforces it. Without that pair the call continues after the hold runs
    out — the sweeper settles the money on time and the two of them keep
    talking for free, which is the one failure that makes per-minute
    billing meaningless.

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


def meeting_token(room_name, user_name, is_owner, expires_at):
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
    data = _call("POST", "/meeting-tokens", payload)
    return (data or {}).get("token")
