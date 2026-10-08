"""Delivery: where a parcel goes, what it costs to send, and getting it sent.

── THE ORDER OF EVENTS ─────────────────────────────────────────────────────
  1. The seeker picks or adds an address in the cart.
  2. `make_quote` asks Shiprocket what that pincode costs at the cart's
     weight and writes a `shipping_quotes` row that lives 30 minutes.
  3. Buy names the address and the quote. `use_quote` (inside the
     purchase transaction) checks both belong to the buyer, the quote is
     fresh, unused and for this cart's weight, and burns it. The fee goes
     on the order as a `shipping` line and the shipment row is written —
     all of it in the one transaction that took the money.
  4. After the commit the app calls dispatch for the order; `dispatch`
     pushes it to Shiprocket, assigns a courier and books the pickup. Each
     step skips itself when already done, so a retry from the console or a
     second call from the app finishes the job rather than repeating it.
  5. Shiprocket's webhook (`apply_tracking`) moves it forward from there.

The amount is never the client's (rule 3): the quote row holds it, and the
client only names the row.
"""

import logging
import re
from datetime import datetime, timedelta
from datetime import timezone as dt_timezone

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from . import shiprocket
from .models import Order, Product, Shipment, ShippingAddress, ShippingQuote

logger = logging.getLogger("apps.shop.delivery")

QUOTE_TTL = timedelta(minutes=30)
# Orders before this are the prototype's test parcels (two still read
# `ready`). Nothing automatic sends them; the console's button can.
AUTO_DISPATCH_FROM = datetime(2026, 10, 4, 18, 30, tzinfo=dt_timezone.utc)  # 5 Oct, 00:00 IST
PINCODE = re.compile(r"^[1-9][0-9]{5}$")
PHONE = re.compile(r"^[6-9][0-9]{9}$")

# The order a parcel moves through. A courier update may only move it
# FORWARD: a late "IN TRANSIT" must not walk back a delivered parcel.
RANK = {
    Shipment.Status.AWAITING_PAYMENT: 0,
    Shipment.Status.READY: 1,
    Shipment.Status.SHIPPED: 2,
    Shipment.Status.DELIVERED: 3,
    Shipment.Status.RETURNED: 4,
    Shipment.Status.CANCELLED: 4,
}

NOT_SET_UP = "Delivery is not set up yet. Try again later."
NOT_SERVED = "No courier delivers to this pincode yet."
UNREACHABLE = "Could not reach the courier service. Try again."


class DeliveryRefused(Exception):
    def __init__(self, reason):
        super().__init__(reason)
        self.reason = reason


# ── addresses ──────────────────────────────────────────────────────────────


def address_row(a):
    return {
        "id": str(a.id), "name": a.name, "phone": a.phone,
        "line1": a.line1, "line2": a.line2 or "",
        "city": a.city, "state": a.state, "pincode": a.pincode,
    }


def list_addresses(profile_id):
    rows = ShippingAddress.objects.filter(profile_id=profile_id).order_by("-created_at")[:10]
    return [address_row(a) for a in rows]


def clean_phone(raw):
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    return digits


def save_address(profile_id, data):
    """Returns (row, None) or (None, reason)."""
    fields = {k: (data.get(k) or "").strip() for k in
              ("name", "phone", "line1", "line2", "city", "state", "pincode")}
    fields["phone"] = clean_phone(fields["phone"])
    if not fields["name"]:
        return None, "Add the name the parcel is for."
    if not PHONE.match(fields["phone"]):
        return None, "Add a 10-digit mobile number the courier can call."
    if not PINCODE.match(fields["pincode"]):
        return None, "Add a 6-digit pincode."
    if len(fields["line1"]) < 5:
        return None, "Add the house number and street."
    if not fields["city"] or not fields["state"]:
        return None, "Add the city and state."
    for key, limit in (("name", 80), ("line1", 200), ("line2", 200), ("city", 60), ("state", 60)):
        fields[key] = fields[key][:limit]
    fields["line2"] = fields["line2"] or None
    row = ShippingAddress.objects.create(profile_id=profile_id, **fields)
    return address_row(row), None


def delete_address(profile_id, address_id):
    # Past parcels keep their own snapshot (shipments.address), so removing
    # a saved address rewrites nothing that was sent.
    return ShippingAddress.objects.filter(pk=address_id, profile_id=profile_id).delete()[0] > 0


def lookup_pincode(pincode):
    """{city, state, areas} for a pincode, or None. India Post first (no
    sign-in, and it lists the areas), Shiprocket when India Post does not
    answer. Cached a day: a pincode's district does not move."""
    from django.core.cache import cache

    if not PINCODE.match(pincode or ""):
        return None
    key = f"pincode:{pincode}"
    cached = cache.get(key)
    if cached:
        return cached
    place = shiprocket.india_post(pincode)
    if place is None and shiprocket.is_configured():
        try:
            place = shiprocket.pincode_details(pincode)
        except shiprocket.ShiprocketError:
            place = None
    if place:
        place.setdefault("areas", [])
        cache.set(key, place, 24 * 3600)
    return place


# ── the quote ──────────────────────────────────────────────────────────────


def cart_weight(lines):
    """Grams, from the product rows — never from the client."""
    ids = [str(line["product_id"]) for line in lines]
    weights = {str(k): v for k, v in
               Product.objects.filter(pk__in=ids).values_list("id", "weight_grams")}
    return sum((weights.get(str(line["product_id"])) or 100) * int(line.get("qty") or 1)
               for line in lines)


def make_quote(profile_id, address_id, lines):
    """{ok, quote_id, amount_paise, courier, etd_days} or {ok: False, reason}."""
    address = ShippingAddress.objects.filter(pk=address_id, profile_id=profile_id).first()
    if address is None:
        return {"ok": False, "reason": "Choose a delivery address."}
    if not shiprocket.is_configured():
        return {"ok": False, "reason": NOT_SET_UP}
    weight = cart_weight(lines)
    try:
        found = shiprocket.quote(address.pincode, weight)
    except shiprocket.ShiprocketError as exc:
        # Said in the log, not only to the seeker: "could not reach" hid a
        # refused sign-in for a day (6 Oct 2026). The message has no
        # credentials in it — shiprocket.py never echoes their body.
        logger.error("[delivery] quote failed: %s", exc)
        return {"ok": False, "reason": UNREACHABLE}
    if found is None:
        return {"ok": False, "reason": NOT_SERVED}
    # Cash on delivery is asked separately: a pincode a courier serves
    # prepaid may have none that will collect cash. A failure here only
    # takes COD off the table; paying online still works.
    try:
        cod = shiprocket.cod_available(address.pincode, weight)
    except shiprocket.ShiprocketError:
        cod = False
    quote = ShippingQuote.objects.create(
        profile_id=profile_id, pincode=address.pincode, weight_grams=weight,
        amount_paise=found["amount_paise"], courier=found["courier"] or None,
        etd_days=found["etd_days"], cod_available=cod,
        expires_at=timezone.now() + QUOTE_TTL,
    )
    return {
        "ok": True, "quote_id": str(quote.id), "amount_paise": charged_paise(quote),
        # What the courier charges Namo, whether or not the seeker pays it.
        "courier_paise": quote.amount_paise,
        "courier": found["courier"], "etd_days": found["etd_days"],
        "cod_available": cod, "cod_fee_bps": settings.COD_FEE_BPS,
        "cod_max_paise": settings.COD_MAX_PAISE,
    }


def use_quote(profile_id, address_id, quote_id, weight_grams):
    """Inside the purchase transaction. Burns the quote; returns
    (address, amount_paise, cod_available) or raises DeliveryRefused."""
    address = ShippingAddress.objects.filter(pk=address_id, profile_id=profile_id).first()
    if address is None:
        raise DeliveryRefused("Choose a delivery address.")
    quote = ShippingQuote.objects.filter(pk=quote_id, profile_id=profile_id).first()
    stale = "The delivery charge has changed. Check it and pay again."
    if quote is None or quote.pincode != address.pincode or quote.weight_grams != weight_grams:
        raise DeliveryRefused(stale)
    if quote.expires_at <= timezone.now():
        raise DeliveryRefused(stale)
    # Conditional, so two taps on Pay cannot both spend one quote.
    burned = ShippingQuote.objects.filter(pk=quote.pk, used_at=None).update(used_at=timezone.now())
    if not burned:
        raise DeliveryRefused(stale)
    return address, charged_paise(quote), quote.cod_available


def charged_paise(quote):
    """What the seeker pays for delivery: nothing while `DELIVERY_FREE` is on
    (8 Oct 2026, Rahul: "we will not charge delivery cost") — Namo pays the
    courier. The quote still keeps the courier's rate; the pincode is still
    checked, and cash on delivery still asked, exactly as before."""
    return 0 if settings.DELIVERY_FREE else quote.amount_paise


def order_follows_shipment(order_id, status):
    """A cash-on-delivery order is settled by its parcel (6 Oct 2026).
    Delivered: the courier has the cash, the order is PAID. Returned or
    cancelled before that: nothing was paid, the order is CANCELLED and its
    stock goes back on the shelf. Once only — the row is locked and only a
    PENDING order moves. A wallet order is not touched: it was paid at
    checkout, and a returned prepaid parcel is refunded by hand
    (docs/01-PRD.md §4.6)."""
    from django.db.models import F

    with transaction.atomic():
        order = Order.objects.select_for_update().filter(pk=order_id).first()
        if order is None or order.payment_method != Order.PaymentMethod.COD:
            return None
        if order.status != Order.Status.PENDING:
            return order.status
        if status == Shipment.Status.DELIVERED:
            order.status = Order.Status.PAID
        elif status in (Shipment.Status.RETURNED, Shipment.Status.CANCELLED):
            order.status = Order.Status.CANCELLED
            for item in order.items.filter(item_type="product"):
                Product.objects.filter(pk=item.item_id).update(stock=F("stock") + item.qty)
        else:
            return order.status
        order.save(update_fields=["status"])
        return order.status


def snapshot(address):
    """What is written on the shipment. A copy, not a link: editing a saved
    address must not rewrite where a parcel already went."""
    return {
        "name": address.name, "phone": address.phone, "line1": address.line1,
        "line2": address.line2 or "", "city": address.city, "state": address.state,
    }


# ── after payment ──────────────────────────────────────────────────────────


def dispatch(order_id, force=False):
    """Push, courier, pickup — whichever of them is not done yet.

    Holds the shipment's row lock across the calls, so two dispatches of
    one order (the app's and a console retry) run one after the other and
    the second finds the work done. Returns a short word for the log.
    Never raises: a Shiprocket failure leaves the shipment where it got to,
    for the console's Dispatch button.
    """
    if not shiprocket.is_configured():
        return "not-configured"
    with transaction.atomic():
        shipment = (
            Shipment.objects.select_for_update()
            .select_related("order").filter(pk=order_id).first()
        )
        if shipment is None:
            return "no-shipment"
        if not force and shipment.order.created_at < AUTO_DISPATCH_FROM:
            return "too-old"
        if RANK.get(shipment.status, 0) >= RANK[Shipment.Status.DELIVERED]:
            return "finished"
        # An online order whose payment has not been captured is not sent
        # (6 Oct 2026); order_paid dispatches it when it is. Read off the
        # ORDER: a cash-on-delivery order is pending too, and ships.
        order = shipment.order
        if order.status != Order.Status.PAID and order.payment_method == Order.PaymentMethod.ONLINE:
            return "awaiting-payment"
        # The failure is caught INSIDE the transaction, so whatever step
        # did succeed (a push that got its id) commits rather than being
        # rolled back and pushed twice next time.
        try:
            _dispatch_steps(shipment)
        except shiprocket.ShiprocketError as exc:
            logger.error("[delivery] dispatch %s stopped: %s", order_id, exc)
            return "failed"
        return "dispatched"


def _dispatch_steps(shipment):
    now = timezone.now()
    if not shipment.provider_order_id:
        shipment.provider_order_id = shiprocket.push(shipment)
        shipment.status = Shipment.Status.READY
        shipment.updated_at = now
        shipment.save(update_fields=("provider_order_id", "status", "updated_at"))
    if not shipment.awb:
        got = shiprocket.assign_awb(shipment.provider_order_id)
        shipment.awb, shipment.courier = got["awb"], got["courier"] or None
        shipment.status = Shipment.Status.SHIPPED
        shipment.shipped_at = shipment.shipped_at or now
        shipment.tracking_status = "PICKUP SCHEDULED"
        shipment.updated_at = now
        shipment.save(update_fields=("awb", "courier", "status", "shipped_at",
                                     "tracking_status", "updated_at"))
        shiprocket.generate_pickup(shipment.provider_order_id)
    if not shipment.label_url:
        try:
            shipment.label_url = shiprocket.label(shipment.provider_order_id)
            shipment.save(update_fields=("label_url",))
        except shiprocket.ShiprocketError:
            pass  # the console can make one later; the parcel still goes


def apply_tracking(shipment, raw_status, when=None):
    """A courier status for one shipment. Forward only; delivery starts the
    referral cashback's clock and a return or cancellation kills it.
    Returns True when our status moved."""
    from apps.referrals import services as referral_services

    now = when or timezone.now()
    target = shiprocket.classify(raw_status)
    fields = {"tracking_status": (raw_status or "")[:80] or None, "updated_at": timezone.now()}
    moved = False
    if target and RANK[target] > RANK.get(shipment.status, 0):
        fields["status"] = target
        if target == Shipment.Status.SHIPPED and not shipment.shipped_at:
            fields["shipped_at"] = now
        if target == Shipment.Status.DELIVERED and not shipment.delivered_at:
            fields["delivered_at"] = now
        moved = True
    Shipment.objects.filter(pk=shipment.pk).update(**fields)
    if moved:
        order_follows_shipment(shipment.order_id, fields["status"])
        referral_services.on_shipment_status(shipment.order_id, fields["status"])
    return moved


def refresh(shipment):
    """Ask Shiprocket where it is, for a shipment the webhook has not moved."""
    if not shipment.awb:
        return False
    state = shiprocket.track(shipment.awb)
    return apply_tracking(shipment, state["status"])
