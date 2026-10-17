"""The PhonePe PG seam (17 Oct 2026, Rahul: "Razorpay पूरा हटाना hai").
PhonePe Standard Checkout v2, three calls:

  POST {identity}/v1/oauth/token                  (an access token)
  POST {pg}/checkout/v2/pay                       (open a checkout)
  GET  {pg}/checkout/v2/order/<merchantOrderId>/status

Plus the webhook check: PhonePe sends `Authorization: SHA256(user:pass)`,
the username and password set on the PhonePe dashboard and in our
settings; a delivery without the match is ignored.

The same two hard rules Razorpay's seam had:

- Client id / secret / version and the webhook password are server-side
  only: from settings, never from a request, never in a response body or
  a log line.
- A provider failure is generic: `PhonePeError` carries a short message
  and the HTTP status, never the URL or the body PhonePe sent.
"""

import hashlib
import hmac
import logging
import threading
import time

import requests

logger = logging.getLogger("apps.wallet")

HOSTS = {
    "production": {
        "token": "https://api.phonepe.com/apis/identity-manager/v1/oauth/token",
        "pg": "https://api.phonepe.com/apis/pg",
    },
    "sandbox": {
        "token": "https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token",
        "pg": "https://api-preprod.phonepe.com/apis/pg-sandbox",
    },
}

# A token is refreshed this many seconds before PhonePe says it expires.
TOKEN_MARGIN = 120

_token_lock = threading.Lock()
_token_cache = {}  # (env, client_id) -> (token, expires_at epoch seconds)


class PhonePeError(Exception):
    """PhonePe refused or could not be reached. `status` is the upstream
    HTTP status (None on a network failure); the message is generic."""

    def __init__(self, message, status=None, code=None):
        super().__init__(message)
        self.status = status
        self.code = code


def webhook_hash(username: str, password: str) -> str:
    """What PhonePe puts in the webhook's Authorization header: SHA-256 of
    `username:password`, hex."""
    return hashlib.sha256(f"{username}:{password}".encode("utf-8")).hexdigest()


def webhook_authorized(header: str, username: str, password: str) -> bool:
    """Constant time. The header is the bare hex hash; a `SHA256 ` prefix
    is accepted too, since the documentation shows both."""
    if not header or not username or not password:
        return False
    received = header.strip()
    if received.lower().startswith("sha256"):
        received = received[6:].strip(" =:")
    return hmac.compare_digest(received.lower(), webhook_hash(username, password))


class PhonePeClient:
    """Thin, testable wrapper. `session` is injectable so tests drive it
    without the network."""

    def __init__(self, client_id, client_secret, client_version, env="production",
                 timeout=10, session=None):
        if env not in HOSTS:
            raise ValueError(f"unknown PhonePe environment {env!r}")
        self._client_id = client_id
        self._client_secret = client_secret
        self._client_version = str(client_version)
        self._env = env
        self._hosts = HOSTS[env]
        self._timeout = timeout
        self._session = session or requests

    def _token(self):
        key = (self._env, self._client_id)
        now = time.time()
        with _token_lock:
            cached = _token_cache.get(key)
            if cached and cached[1] - TOKEN_MARGIN > now:
                return cached[0]
            try:
                response = self._session.post(
                    self._hosts["token"],
                    data={
                        "client_id": self._client_id,
                        "client_version": self._client_version,
                        "client_secret": self._client_secret,
                        "grant_type": "client_credentials",
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    timeout=self._timeout,
                )
            except requests.RequestException:
                raise PhonePeError("network error") from None
            if response.status_code != 200:
                raise PhonePeError("token refused", status=response.status_code)
            try:
                body = response.json()
            except ValueError:
                raise PhonePeError("unreadable token", status=response.status_code) from None
            token = body.get("access_token")
            if not token:
                raise PhonePeError("no token", status=response.status_code)
            expires_at = body.get("expires_at") or (now + 600)
            if expires_at > 10**11:  # milliseconds
                expires_at = expires_at / 1000
            _token_cache[key] = (token, float(expires_at))
            return token

    def _headers(self):
        return {"Content-Type": "application/json", "Authorization": f"O-Bearer {self._token()}"}

    def create_payment(self, merchant_order_id, amount_paise, redirect_url, meta=None,
                       expire_after=1200):
        """POST /checkout/v2/pay. Amount in paise (minimum 100). Returns
        {"order_id": PhonePe's id, "url": the checkout page}."""
        body = {
            "merchantOrderId": merchant_order_id,
            "amount": amount_paise,
            "expireAfter": expire_after,
            "paymentFlow": {
                "type": "PG_CHECKOUT",
                "merchantUrls": {"redirectUrl": redirect_url},
            },
        }
        if meta:
            body["metaInfo"] = {k: str(v)[:256] for k, v in meta.items()}
        try:
            response = self._session.post(
                f"{self._hosts['pg']}/checkout/v2/pay",
                json=body, headers=self._headers(), timeout=self._timeout,
            )
        except requests.RequestException:
            raise PhonePeError("network error") from None
        if response.status_code != 200:
            raise PhonePeError("payment refused", status=response.status_code, code=_code(response))
        try:
            data = response.json()
        except ValueError:
            raise PhonePeError("unreadable response", status=response.status_code) from None
        if not data.get("redirectUrl"):
            raise PhonePeError("no checkout url", status=response.status_code)
        return {"order_id": data.get("orderId"), "url": data["redirectUrl"]}

    def order_status(self, merchant_order_id):
        """GET /checkout/v2/order/<id>/status. Returns PhonePe's body:
        `state` is PENDING, COMPLETED or FAILED, `orderId`, `amount`."""
        try:
            response = self._session.get(
                f"{self._hosts['pg']}/checkout/v2/order/{merchant_order_id}/status",
                params={"details": "false"}, headers=self._headers(), timeout=self._timeout,
            )
        except requests.RequestException:
            raise PhonePeError("network error") from None
        if response.status_code != 200:
            raise PhonePeError("status refused", status=response.status_code, code=_code(response))
        try:
            return response.json()
        except ValueError:
            raise PhonePeError("unreadable response", status=response.status_code) from None


def _code(response):
    try:
        return (response.json() or {}).get("code")
    except ValueError:
        return None
