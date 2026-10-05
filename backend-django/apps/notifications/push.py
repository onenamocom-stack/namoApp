"""Web push — the phone rings when somebody calls (6 Oct 2026).

A consultant's phone registers itself (the browser's PushManager hands us
an endpoint and two keys); when a seeker asks for a session, every phone
that consultant registered is woken with "Rahul is calling". The service
worker on the phone (public/sw.js) turns that into a notification with
sound, a long vibration and Answer / Decline — whether or not the app is
open.

DELIVERY IS BEST-EFFORT AND NEVER BLOCKS MONEY. A push that fails changes
nothing about the session: the request still rings in the app for 45
seconds and expires on its own. A subscription the push service says is
gone (404/410) is deleted, so a reinstalled phone does not pile up dead
endpoints.

The private VAPID key is VAPID_PRIVATE_KEY in the environment, never in
the repository; without it nothing is sent and nothing breaks.
"""

import json
import logging

from django.conf import settings

from .models import PushSubscription

logger = logging.getLogger("apps.notifications.push")

TTL_SECONDS = 45  # a call that rang out is not worth delivering late


def is_configured():
    return bool(settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY)


def subscribe(profile_id, endpoint, p256dh, auth, user_agent=""):
    row, _ = PushSubscription.objects.update_or_create(
        endpoint=endpoint,
        defaults={"profile_id": profile_id, "p256dh": p256dh, "auth": auth,
                  "user_agent": (user_agent or "")[:300]},
    )
    return row


def unsubscribe(profile_id, endpoint):
    return PushSubscription.objects.filter(profile_id=profile_id, endpoint=endpoint).delete()[0]


def send(profile_id, payload, ttl=TTL_SECONDS):
    """Push `payload` to every phone this person registered. Returns how
    many accepted it. Never raises."""
    if not is_configured():
        return 0
    from pywebpush import WebPushException, webpush

    sent = 0
    for sub in PushSubscription.objects.filter(profile_id=profile_id):
        try:
            webpush(
                subscription_info={"endpoint": sub.endpoint,
                                   "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                data=json.dumps(payload),
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": settings.VAPID_SUBJECT},
                ttl=ttl,
                timeout=6,
                headers={"Urgency": "high"},
            )
            sent += 1
        except WebPushException as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status in (404, 410):
                sub.delete()
            else:
                logger.warning("[push] %s for %s", status or type(exc).__name__, str(profile_id)[:8])
        except Exception as exc:  # noqa: BLE001 — a push must never break a request
            logger.warning("[push] failed: %s", type(exc).__name__)
    return sent


def ring(session, seeker_name):
    """The incoming-call push for one session request."""
    what = "Chat" if session.mode == "chat" else ("Audio call" if session.audio_only else "Video call")
    return send(session.consultant_id, {
        "type": "incoming",
        "session_id": str(session.id),
        "title": f"{seeker_name or 'Someone'} is calling",
        "body": f"{what} · ₹{session.rate_paise // 100}/min — tap to answer",
        "mode": session.mode,
    })
