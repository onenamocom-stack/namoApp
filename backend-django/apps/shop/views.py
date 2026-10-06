"""The shop's endpoints.

Reading the catalogue is anonymous: the shop is a shopfront and a signed-
out visitor browsing it is the point. Buying needs a session, because it
spends a wallet.
"""

import hmac
import json
import logging

from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from . import delivery, services
from .models import Order, Shipment

logger = logging.getLogger("apps.shop")


@api_view(["GET"])
@permission_classes([AllowAny])
def catalogue(request):
    """Everything on sale, sold-out items included.

    A shelf with a greyed-out label is a shop; a shelf that silently loses
    items is a bug report. `active=False` is different — that is the
    console's delete, and those never appear.
    """
    products = services.list_products(category=request.GET.get("category"))
    return Response([services.product_row(p) for p in products])


@api_view(["GET"])
@permission_classes([AllowAny])
def categories(request):
    """The category tiles and subcategory pills, in the console's order."""
    return Response(services.list_categories())


@api_view(["GET"])
@permission_classes([AllowAny])
def product(request, key):
    """One product's page, by id or slug. A product taken down is a 404."""
    found = services.find_product(key)
    if found is None:
        return Response({"ok": False, "reason": "That product is not in the shop."}, status=404)
    return Response(services.product_detail(found))


class ConfirmInput(serializers.Serializer):
    razorpay_order_id = serializers.CharField(max_length=64)
    razorpay_payment_id = serializers.CharField(max_length=64)
    razorpay_signature = serializers.CharField(max_length=256)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def confirm_payment(request, order_id):
    """Razorpay's checkout succeeded: its signed answer settles the order
    now (the webhook confirms it again later, harmlessly)."""
    from apps.wallet import services as wallet_services

    form = ConfirmInput(data=request.data)
    form.is_valid(raise_exception=True)
    d = form.validated_data
    result = wallet_services.confirm_checkout(
        request.user.id, d["razorpay_order_id"], d["razorpay_payment_id"], d["razorpay_signature"],
    )
    if not result.get("ok"):
        return Response(result)
    order = Order.objects.filter(pk=order_id, profile_id=request.user.id).first()
    return Response({"ok": True, "status": order.status if order else None})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def abandon_payment(request, order_id):
    """The buyer closed Razorpay without paying: the order lapses now and
    the stock goes back, rather than in fifteen minutes."""
    return Response({"ok": True, "lapsed": services.lapse(order_id, profile_id=request.user.id)})


class Line(serializers.Serializer):
    product_id = serializers.UUIDField()
    qty = serializers.IntegerField(min_value=1, max_value=services.MAX_QTY_PER_LINE)


class BuyInput(serializers.Serializer):
    """What is bought — never what it costs.

    Rule 3: the client sends nothing it benefits from changing. The price
    comes from the product row at the moment of purchase, so a doctored
    body buys the same gemstone at the same price.
    """

    lines = Line(many=True)
    coupon = serializers.CharField(required=False, allow_blank=True, max_length=32)
    # Where it goes and which delivery quote it was priced at. Required:
    # every product is a parcel, and the fee is part of the total.
    address_id = serializers.UUIDField()
    quote_id = serializers.UUIDField()
    # How it is paid (6 Oct 2026): the wallet now, or cash to the courier.
    payment = serializers.ChoiceField(choices=["online", "wallet", "cod"], required=False, default="wallet")


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def buy(request):
    form = BuyInput(data=request.data)
    form.is_valid(raise_exception=True)
    result = services.buy(
        request.user.id,
        form.validated_data["lines"],
        coupon_code=form.validated_data.get("coupon"),
        delivery={"address_id": form.validated_data["address_id"],
                  "quote_id": form.validated_data["quote_id"]},
        payment=form.validated_data["payment"],
    )
    # 200 on a refusal: "out of stock" is an answer the screen shows, not a
    # transport failure, and the client's one error path stays the network.
    return Response(result)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def orders(request):
    """The caller's order history. Always their own — there is no
    profile_id parameter, because a route that takes one is a route that
    reads somebody else's purchases."""
    return Response({"items": services.order_history(request.user.pk)})


# ── delivery ────────────────────────────────────────────────────────────────


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def addresses(request):
    """The caller's saved addresses, or a new one."""
    if request.method == "GET":
        return Response({"items": delivery.list_addresses(request.user.pk)})
    row, reason = delivery.save_address(request.user.pk, request.data or {})
    if reason:
        return Response({"ok": False, "reason": reason})
    return Response({"ok": True, "address": row})


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def address(request, address_id):
    return Response({"ok": delivery.delete_address(request.user.pk, address_id)})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def pincode(request, code):
    """City and state for a pincode, to fill the form. Null when unknown —
    the seeker types them instead."""
    return Response({"place": delivery.lookup_pincode(code)})


class QuoteInput(serializers.Serializer):
    address_id = serializers.UUIDField()
    lines = Line(many=True)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def quote(request):
    form = QuoteInput(data=request.data)
    form.is_valid(raise_exception=True)
    return Response(delivery.make_quote(
        request.user.pk, form.validated_data["address_id"], form.validated_data["lines"]
    ))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def dispatch(request, order_id):
    """Send a paid parcel. The app calls this right after Buy and does not
    wait for it; it is idempotent, so a second call finishes rather than
    repeats. Own orders only."""
    if not Order.objects.filter(pk=order_id, profile_id=request.user.pk).exists():
        return Response({"ok": False}, status=404)
    return Response({"ok": True, "result": delivery.dispatch(order_id)})


@csrf_exempt
@require_POST
def tracking_hook(request):
    """Shiprocket's tracking webhook (Settings → API → Webhooks).

    The token Shiprocket sends in `x-api-key` is the credential. Always
    200 once the token is right — Shiprocket disables a webhook that keeps
    failing, and a parcel we do not know is not their problem to retry.
    The path avoids "shiprocket", "sr" and "kr": their form refuses URLs
    containing those.
    """
    expected = settings.SHIPROCKET_WEBHOOK_TOKEN
    given = request.headers.get("x-api-key", "")
    if not expected or not hmac.compare_digest(given.encode(), expected.encode()):
        return JsonResponse({"ok": False}, status=401)
    try:
        body = json.loads(request.body or b"{}")
    except ValueError:
        return JsonResponse({"ok": True, "note": "unreadable"})
    awb = str(body.get("awb") or "").strip()
    shipment = None
    if awb:
        shipment = Shipment.objects.filter(awb=awb).first()
    if shipment is None and body.get("order_id"):
        # Our order id is what was pushed as theirs (channel order id).
        shipment = Shipment.objects.filter(pk=_order_uuid(body.get("order_id"))).first()
    if shipment is None:
        return JsonResponse({"ok": True, "note": "unknown"})
    if awb and not shipment.awb:
        Shipment.objects.filter(pk=shipment.pk).update(
            awb=awb, courier=body.get("courier_name") or shipment.courier
        )
    raw = body.get("current_status") or body.get("shipment_status") or ""
    moved = delivery.apply_tracking(shipment, raw)
    return JsonResponse({"ok": True, "moved": moved})


def _order_uuid(value):
    import uuid

    try:
        return uuid.UUID(str(value).strip())
    except ValueError:
        return None
