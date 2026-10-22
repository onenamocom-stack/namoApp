"""Firebase Cloud Messaging: the Android app's own ring (22 Oct 2026).

The web push in push.py rings once with the system sound. The Android app
(com.onenamo.app) also listens to FCM: a high-priority data message wakes
its native code, which shows a full-screen call (on the lock screen too)
ringing until Answer or Decline, and opens the app on that call.

Sent with FCM's HTTP v1 API as the server's own Cloud Run service account,
whose token comes from the metadata server: no key in the repository or the
environment. The account needs the Firebase Cloud Messaging role on the
project (FCM_PROJECT). Off Cloud Run there is no metadata server, so nothing
is sent. Best-effort like web push: a failure changes nothing about the
session, and a token FCM calls unregistered is deleted.
"""

import logging
import time

import requests
from django.conf import settings
from django.utils import timezone

from .models import FcmToken

logger = logging.getLogger("apps.notifications.fcm")

TTL = "45s"  # a call that rang out is not worth delivering late
METADATA = ("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"
            "?scopes=https://www.googleapis.com/auth/firebase.messaging")
_token = {"value": "", "until": 0.0}


def register(profile_id, token):
    """This install may now be rung for the caller. A token moves with the
    install: signing in as someone else moves it to them."""
    token = (token or "").strip()
    if not token or len(token) > 4096:
        return False
    FcmToken.objects.update_or_create(token=token, defaults={"profile_id": profile_id,
                                                             "updated_at": timezone.now()})
    return True


def unregister(profile_id, token):
    return FcmToken.objects.filter(profile_id=profile_id, token=token).delete()[0]


def _access_token():
    if _token["value"] and _token["until"] > time.time() + 60:
        return _token["value"]
    r = requests.get(METADATA, headers={"Metadata-Flavor": "Google"}, timeout=2)
    r.raise_for_status()
    d = r.json()
    _token.update(value=d["access_token"], until=time.time() + int(d.get("expires_in", 300)))
    return _token["value"]


def send(profile_id, data):
    """A data message to every install this person registered. `data` values
    are sent as strings. Returns how many FCM accepted. Never raises."""
    tokens = list(FcmToken.objects.filter(profile_id=profile_id))
    if not tokens or not settings.FCM_PROJECT:
        return 0
    try:
        bearer = _access_token()
    except Exception as exc:  # noqa: BLE001 - not on Cloud Run, or no metadata server
        logger.info("[fcm] no credentials: %s", type(exc).__name__)
        return 0
    url = f"https://fcm.googleapis.com/v1/projects/{settings.FCM_PROJECT}/messages:send"
    body_data = {k: str(v) for k, v in data.items() if v is not None}
    sent = 0
    for row in tokens:
        try:
            r = requests.post(url, timeout=6, headers={"Authorization": f"Bearer {bearer}"}, json={
                "message": {"token": row.token, "data": body_data,
                            "android": {"priority": "HIGH", "ttl": TTL}}})
            if r.status_code == 200:
                sent += 1
            elif r.status_code == 404 or "UNREGISTERED" in r.text:
                row.delete()
            else:
                logger.warning("[fcm] %s for %s", r.status_code, str(profile_id)[:8])
        except Exception as exc:  # noqa: BLE001 - a ring must never break a request
            logger.warning("[fcm] failed: %s", type(exc).__name__)
    return sent
