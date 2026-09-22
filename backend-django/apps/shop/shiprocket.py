"""Shiprocket, for the parcels.

Stage 5, and the last of the console build. Until this existed a courier
name and an AWB arrived by email and an operator typed them into the
shipment by hand — which works, and does not scale past a few orders a day.

── THE ACCOUNT IS BORROWED, AND THAT DECIDES THE DESIGN ─────────────────────
These are Abzzo's credentials, shared for now exactly as Razorpay's were
(21 Sep). Two consequences, and the second is why nothing here is
automatic:

  * Namo's shipments appear in Abzzo's Shiprocket dashboard.
  * The labels carry Abzzo's pickup address and branding.

So pushing a parcel is an ACTION AN OPERATOR TAKES, never a side effect of
payment. A real courier collecting a real box from the wrong company's
address, triggered by a webhook at three in the morning, is not a mistake
that can be undone with a database update. When Namo has its own account
this can become automatic; the code is the same either way and the
decision lives in one place.

── AND NOTHING HERE MAY BREAK AN ORDER ──────────────────────────────────────
Every call is wrapped and every failure returns a reason rather than
raising. Shiprocket being down must not stop somebody buying a gemstone,
and it must not stop an operator seeing their shipment list.
"""

import logging

import requests
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger("apps.shop.shiprocket")

BASE = "https://apiv2.shiprocket.in/v1/external"
TOKEN_KEY = "shiprocket-token"
# Their tokens last 24 hours; 23 leaves room for a slow clock rather than
# discovering the expiry mid-push.
TOKEN_TTL = 23 * 3600
TIMEOUT = 20


class ShiprocketError(Exception):
    """Never carries the provider's raw body: an auth failure echoes the
    email, and a validation error echoes the customer's address."""


def is_configured():
    return bool(settings.SHIPROCKET_EMAIL and settings.SHIPROCKET_PASSWORD)


def _token(refresh=False):
    if not refresh:
        token = cache.get(TOKEN_KEY)
        if token:
            return token
    if not is_configured():
        raise ShiprocketError("Shiprocket is not configured")
    try:
        response = requests.post(
            f"{BASE}/auth/login",
            json={"email": settings.SHIPROCKET_EMAIL,
                  "password": settings.SHIPROCKET_PASSWORD},
            timeout=TIMEOUT,
        )
        response.raise_for_status()
        token = response.json()["token"]
    except requests.RequestException as exc:
        logger.error("[shiprocket] login failed: %s", type(exc).__name__)
        raise ShiprocketError("Could not sign in to Shiprocket") from None
    except (KeyError, ValueError):
        raise ShiprocketError("Shiprocket returned no token") from None
    cache.set(TOKEN_KEY, token, TOKEN_TTL)
    return token


def _call(method, path, payload=None, _retried=False):
    """One request, with a single retry on 401.

    The token is cached for 23 hours and Shiprocket can still invalidate it
    early — a password change, a session revoked on their side. One forced
    refresh turns that from "every push fails until the cache expires" into
    a hiccup nobody notices. Exactly one: a genuine credential problem
    should fail, not loop.
    """
    try:
        response = requests.request(
            method, f"{BASE}{path}",
            json=payload,
            headers={"Authorization": f"Bearer {_token()}",
                     "Content-Type": "application/json"},
            timeout=TIMEOUT,
        )
    except requests.RequestException as exc:
        logger.error("[shiprocket] %s %s: %s", method, path, type(exc).__name__)
        raise ShiprocketError("Could not reach Shiprocket") from None

    if response.status_code == 401 and not _retried:
        cache.delete(TOKEN_KEY)
        _token(refresh=True)
        return _call(method, path, payload, _retried=True)

    if response.status_code >= 400:
        # Status only. Their 422 body repeats the address back.
        logger.error("[shiprocket] %s %s -> %s", method, path, response.status_code)
        raise ShiprocketError(f"Shiprocket refused the request ({response.status_code})")
    try:
        return response.json()
    except ValueError:
        raise ShiprocketError("Shiprocket returned something unreadable") from None


def _order_payload(shipment):
    """One parcel, as Shiprocket wants it.

    The address is the jsonb SNAPSHOT on the shipment, not the seeker's
    current saved address — a seeker who moves house must not rewrite where
    a parcel already went.
    """
    address = shipment.address or {}
    items = [
        {
            "name": item.title[:100],
            "sku": str(item.item_id)[:40],
            "units": item.qty,
            # Shiprocket prices in rupees. This is the ONE boundary in the
            # product where paise become a decimal, and it is a string on
            # the wire rather than a float.
            "selling_price": f"{item.unit_price_paise / 100:.2f}",
        }
        for item in shipment.order.items.all()
        if item.item_type == "product"
    ]
    return {
        "order_id": str(shipment.order_id),
        "order_date": shipment.order.created_at.strftime("%Y-%m-%d %H:%M"),
        "pickup_location": settings.SHIPROCKET_PICKUP,
        "billing_customer_name": address.get("name", ""),
        "billing_last_name": "",
        "billing_address": address.get("line1", ""),
        "billing_address_2": address.get("line2", "") or "",
        "billing_city": address.get("city", ""),
        "billing_pincode": shipment.pincode,
        "billing_state": address.get("state", ""),
        "billing_country": "India",
        "billing_email": address.get("email", "") or "",
        "billing_phone": address.get("phone", ""),
        "shipping_is_billing": True,
        "order_items": items,
        # Prepaid always: the wallet was already debited, and a courier
        # collecting cash for something already paid for is a refund
        # conversation nobody wants.
        "payment_method": "Prepaid",
        "sub_total": f"{shipment.order.total_paise / 100:.2f}",
        # Shiprocket wants centimetres and kilograms.
        "length": 15, "breadth": 12, "height": 8,
        "weight": max(shipment.weight_grams, 50) / 1000,
    }


def push(shipment):
    """Create the order on Shiprocket. Returns their shipment id."""
    data = _call("POST", "/orders/create/adhoc", _order_payload(shipment))
    provider_id = data.get("shipment_id") or data.get("order_id")
    if not provider_id:
        raise ShiprocketError("Shiprocket created nothing we can track")
    return str(provider_id)


def assign_awb(provider_shipment_id):
    """Let Shiprocket pick the courier and give us a tracking number."""
    data = _call("POST", "/courier/assign/awb",
                 {"shipment_id": str(provider_shipment_id)})
    payload = (data.get("response") or {}).get("data") or {}
    awb = payload.get("awb_code")
    courier = payload.get("courier_name")
    if not awb:
        raise ShiprocketError("Shiprocket assigned no AWB")
    return {"awb": awb, "courier": courier or ""}


def track(awb):
    """Where the parcel is. Read-only and safe to call often."""
    data = _call("GET", f"/courier/track/awb/{awb}")
    payload = (data.get("tracking_data") or {})
    return {
        "status": (payload.get("shipment_track") or [{}])[0].get("current_status", ""),
        "delivered_date": (payload.get("shipment_track") or [{}])[0].get("delivered_date"),
    }
