"""The Razorpay seam — the two Edge Functions' provider calls as one
client (backend/functions/razorpay-order/index.ts and
razorpay-webhook/index.ts, module 8 of docs/07 §6):

  POST https://api.razorpay.com/v1/orders          (order creation)
  GET  https://api.razorpay.com/v1/orders/<id>/payments   (reconciliation)

Plus the webhook signature primitive — HMAC-SHA256 of the RAW body,
hex-encoded (the webhook function's hmacHex/sameSignature pair), done
with the stdlib hmac/hashlib (no new dependency; compare_digest is the
constant-time compare the hand-rolled loop was for).

Two hard rules, both inherited from the edge functions:

- Key id / key secret / webhook secret are server-side only (rule 7):
  they come from settings, never from a request, and never appear in a
  response body or a log line. The order function's log names WHICH
  variable is missing, never its value.
- A provider failure is generic: `RazorpayError` carries a class name
  and the HTTP status, not the URL or the body Razorpay sent — requests
  exceptions embed the URL in their message and must not escape.
"""

import hashlib
import hmac
import logging

import requests

logger = logging.getLogger("apps.wallet")

DEFAULT_BASE_URL = "https://api.razorpay.com"


class RazorpayError(Exception):
    """The provider refused or could not be reached. `status` is the
    upstream HTTP status (None on a network failure); the message is
    generic on purpose."""

    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


def signatures_match(received: str, expected: str) -> bool:
    """Constant time, the stdlib way — a `==` on a signature leaks how
    many leading bytes were right, one request at a time (the edge
    function's sameSignature, verbatim)."""
    if not received or not expected:
        return False
    return hmac.compare_digest(received, expected)


def signature_hex(secret: str, raw_body: bytes) -> str:
    """The HMAC the `x-razorpay-signature` header carries: SHA-256 over
    the RAW body bytes, hex-encoded. Nothing in the body is parsed,
    trusted or acted on until this matches."""
    return hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()


class RazorpayClient:
    """Thin, testable wrapper over the two upstream calls the system
    makes. `session` is injectable so tests drive both shapes (a stub
    for order creation; a recorded-shape response for reconciliation)
    without network. Basic auth is `key_id:key_secret`, exactly the edge
    function's `btoa(`${keyId}:${keySecret}`)`."""

    def __init__(self, key_id, key_secret, base_url=DEFAULT_BASE_URL, timeout=10,
                 session=None):
        self._key_id = key_id
        self._key_secret = key_secret
        self._base_url = (base_url or DEFAULT_BASE_URL).rstrip("/")
        self._timeout = timeout
        self._session = session or requests

    def create_order(self, amount_paise, notes):
        """POST /v1/orders — opens the order checkout will pay. Amount in
        PAISE (Razorpay denominates in the smallest unit, which is what
        this system stores, rule 1). `notes` is read by a person in the
        Razorpay dashboard, never by this system — the webhook attributes
        through the 'created' payments row, so notes round-tripping
        through the client is harmless but never load-bearing. Returns
        the parsed order object (carries `id`)."""
        try:
            response = self._session.post(
                f"{self._base_url}/v1/orders",
                auth=(self._key_id, self._key_secret),
                json={"amount": amount_paise, "currency": "INR", "notes": notes},
                timeout=self._timeout,
            )
        except requests.RequestException:
            raise RazorpayError("network error") from None
        if response.status_code != 200:
            raise RazorpayError("order refused", status=response.status_code)
        try:
            return response.json()
        except ValueError:
            raise RazorpayError("unreadable response", status=response.status_code)

    def order_payments(self, order_id):
        """GET /v1/orders/<id>/payments — what actually happened to one
        order. READ ONLY, used by the reconciliation sweep only: a script
        that credits nothing, because a script that mints undoes the
        reason the webhook is the only credit path."""
        try:
            response = self._session.get(
                f"{self._base_url}/v1/orders/{order_id}/payments",
                auth=(self._key_id, self._key_secret),
                timeout=self._timeout,
            )
        except requests.RequestException:
            raise RazorpayError("network error") from None
        if response.status_code != 200:
            raise RazorpayError("lookup refused", status=response.status_code)
        try:
            return response.json()
        except ValueError:
            raise RazorpayError("unreadable response", status=response.status_code)
