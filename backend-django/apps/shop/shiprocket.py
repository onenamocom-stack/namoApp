"""Shiprocket, for the parcels.

Stage 5. Until this existed a courier name and an AWB arrived by email and
an operator typed them into the shipment by hand.

── NAMO'S OWN ACCOUNT, SO DISPATCH IS AUTOMATIC (5 Oct 2026) ────────────────
Until 5 Oct these were Abzzo's borrowed credentials, so pushing a parcel
was a button an operator pressed — a courier collecting a box from the
wrong company's address is not undoable. The account is Namo's now, so a
paid order dispatches itself: `dispatch` below pushes it, assigns a
courier and books the pickup (apps/shop/delivery.py calls it). The console
buttons stay, for the order whose dispatch failed.

The seeker pays for delivery at Shiprocket's own rate for their pincode
(`quote`), prepaid only: the wallet was debited before any of this runs.

── AND NOTHING HERE MAY BREAK AN ORDER ──────────────────────────────────────
Every call is wrapped and every failure returns a reason rather than
raising. Shiprocket being down must not stop somebody buying a gemstone,
and it must not stop an operator seeing their shipment list.
"""

import logging
import math

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
    except requests.RequestException as exc:
        logger.error("[shiprocket] login failed: %s", type(exc).__name__)
        raise ShiprocketError("Could not reach Shiprocket to sign in") from None
    if response.status_code in (400, 401, 403, 422):
        # Status only: their body echoes the email.
        raise ShiprocketError(
            f"Shiprocket refused the sign-in ({response.status_code}) — check the API "
            "user's email and password in Shiprocket → Settings → API Users"
        )
    try:
        response.raise_for_status()
        token = response.json()["token"]
    except requests.RequestException:
        raise ShiprocketError(f"Shiprocket sign-in failed ({response.status_code})") from None
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
        "pickup_location": pickup()["name"],
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


# ── before the order: where it goes, and what delivery costs ────────────────

PICKUP_KEY = "shiprocket-pickup"


def pickup():
    """{name, pincode} of the warehouse parcels leave from.

    Read from the account rather than typed into settings twice: the
    nickname set in Shiprocket (Settings → Pickup Addresses) is what a
    push must name, and its pincode is what a rate is quoted from. With
    SHIPROCKET_PICKUP blank, the account's primary address is used.
    """
    found = cache.get(PICKUP_KEY)
    if found:
        return found
    data = _call("GET", "/settings/company/pickup")
    rows = ((data.get("data") or {}).get("shipping_address")) or []
    wanted = (settings.SHIPROCKET_PICKUP or "").strip().lower()
    chosen = None
    for row in rows:
        if wanted and (row.get("pickup_location") or "").strip().lower() == wanted:
            chosen = row
            break
    if chosen is None and not wanted and rows:
        chosen = next((r for r in rows if r.get("is_primary_location")), rows[0])
    if chosen is None:
        raise ShiprocketError("No pickup address on the Shiprocket account by that name")
    found = {"name": chosen.get("pickup_location") or "",
             "pincode": str(chosen.get("pin_code") or "")}
    cache.set(PICKUP_KEY, found, 6 * 3600)
    return found


def pincode_details(pincode):
    """{city, state} for an Indian pincode, or None when nobody knows it."""
    data = _call("GET", f"/open/postcode/details?postcode={pincode}")
    # The shape is undocumented; read it loosely, and say what came back
    # (keys only — no address in it) when nothing usable did.
    details = data.get("postcode_details") or data.get("data") or data
    if isinstance(details, list):
        details = details[0] if details else {}
    city = details.get("city") or details.get("district") or ""
    if not city:
        logger.warning("[shiprocket] pincode %s: no city in keys %s", pincode, sorted(data)[:12])
        return None
    return {"city": city, "state": details.get("state") or ""}


def india_post(pincode):
    """{city, state} from India Post's public pincode directory — the
    fallback when Shiprocket knows nothing. The district is what it calls
    the city ("Gautam Buddha Nagar" for Noida), which the seeker can edit."""
    try:
        response = requests.get(f"https://api.postalpincode.in/pincode/{pincode}", timeout=8)
        rows = response.json()
        office = ((rows or [{}])[0].get("PostOffice") or [{}])[0]
    except (requests.RequestException, ValueError, AttributeError, IndexError, TypeError):
        return None
    if not office.get("District"):
        return None
    return {"city": office.get("District") or "", "state": office.get("State") or ""}


def check():
    """For the console's "Check Shiprocket" button: sign in afresh, read
    the pickup address, and quote a 500 g parcel to New Delhi. Returns
    lines to show. Places nothing."""
    cache.delete(TOKEN_KEY)
    cache.delete(PICKUP_KEY)
    lines = []
    _token(refresh=True)
    lines.append("Signed in.")
    found = pickup()
    lines.append(f"Pickup: {found['name']} ({found['pincode']}).")
    got = quote("110001", 500)
    lines.append(
        f"500 g to 110001: ₹{got['amount_paise'] // 100} by {got['courier']}" if got
        else "No courier for 110001 — check the account's couriers."
    )
    return lines


def quote(delivery_pincode, weight_grams):
    """What delivery to this pincode costs, prepaid.

    Returns {amount_paise, courier, etd_days} or None when no courier
    serves the pincode. Shiprocket's recommended courier when it names one
    — the same choice `assign_awb` makes without a courier id — else the
    cheapest. Rounded UP to a whole rupee: the courier's ₹67.85 is charged
    as ₹68, never as ₹67.
    """
    origin = pickup()["pincode"]
    weight = max(weight_grams, 50) / 1000
    data = _call(
        "GET",
        f"/courier/serviceability/?pickup_postcode={origin}"
        f"&delivery_postcode={delivery_pincode}&weight={weight}&cod=0",
    )
    body = data.get("data") or {}
    couriers = body.get("available_courier_companies") or []
    if not couriers:
        return None
    best = body.get("recommended_courier_company_id")
    chosen = next((c for c in couriers if c.get("courier_company_id") == best), None)
    if chosen is None:
        chosen = min(couriers, key=lambda c: float(c.get("rate") or c.get("freight_charge") or 0))
    rate = float(chosen.get("rate") or chosen.get("freight_charge") or 0)
    days = chosen.get("estimated_delivery_days")
    try:
        days = int(days) if days not in (None, "") else None
    except (TypeError, ValueError):
        days = None
    return {
        "amount_paise": math.ceil(rate) * 100,
        "courier": chosen.get("courier_name") or "",
        "etd_days": days,
    }


# ── after the order: the courier comes ──────────────────────────────────────


def generate_pickup(provider_shipment_id):
    """Book the courier's visit. A second call for a booked shipment is
    refused by Shiprocket; that refusal is not an error worth stopping on."""
    try:
        _call("POST", "/courier/generate/pickup",
              {"shipment_id": [str(provider_shipment_id)]})
        return True
    except ShiprocketError as exc:
        logger.warning("[shiprocket] pickup for %s: %s", provider_shipment_id, exc)
        return False


def label(provider_shipment_id):
    """The PDF to print and tape on the box."""
    data = _call("POST", "/courier/generate/label",
                 {"shipment_id": [str(provider_shipment_id)]})
    url = data.get("label_url")
    if not url:
        raise ShiprocketError("Shiprocket made no label")
    return url


def tracking_url(awb):
    """Shiprocket's public tracking page. No sign-in, safe to hand a seeker."""
    return f"https://shiprocket.co/tracking/{awb}" if awb else None


def classify(raw_status):
    """A courier's status words to one of ours, or None for "no change".

    Couriers say a great many things ("REACHED AT DESTINATION HUB"); the
    seeker needs four. RTO — return to origin — is checked before
    DELIVERED, because "RTO DELIVERED" means the parcel came back.
    """
    text = (raw_status or "").upper()
    if not text:
        return None
    if "RTO" in text or "RETURN" in text:
        return "returned"
    if "CANCEL" in text:
        return "cancelled"
    if "DELIVERED" in text and "UNDELIVERED" not in text and "OUT FOR" not in text:
        return "delivered"
    if any(w in text for w in ("PICKED", "TRANSIT", "SHIPPED", "OUT FOR", "REACHED",
                               "DISPATCH", "UNDELIVERED", "DELAY", "HUB")):
        return "shipped"
    return None
