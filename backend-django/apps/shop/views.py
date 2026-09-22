"""Phase 10 endpoints — /v1/shop and /v1/academy, the seeker half.

Call for call with what src/lib/shop.js and src/lib/academy.js did against
Supabase before the move:

  shop.js     catalogue reads            -> GET  /v1/shop/catalogue/
              shipping_addresses r/w     -> GET/POST /v1/shop/addresses/
              functions.invoke('shop-quote') -> POST /v1/shop/quote/
              rpc('shop_checkout')       -> POST /v1/shop/checkout/
              rpc('shop_order_cancel')   -> POST /v1/shop/orders/<id>/cancel/
              orders.status              -> GET  /v1/shop/orders/<id>/
              shipments + orders + lines -> GET  /v1/shop/orders/
  academy.js  courses/outline/events     -> GET  /v1/academy/
              course_lessons             -> GET  /v1/academy/courses/<id>/lessons/
              academy_event_links        -> GET  /v1/academy/event-links/
              course_materials           -> GET  /v1/academy/materials/
              storage.createSignedUrl    -> POST /v1/academy/materials/url/
              rpc('academy_enrol')       -> POST /v1/academy/enrol/

The old `admin` Edge Function has no endpoint here: the console replaced it
(HANDOFF §22), behind its own login.

The SQL functions' own jsonb is the 200 body, so every refusal sentence
reaches the screen byte for byte, the way /v1/wallet/spend/ does it.
"""

from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from . import services


def _refused(refusal):
    return Response({"ok": False, "reason": refusal.reason}, status=refusal.status)


def _uid(request):
    return request.user.pk if request.user.is_authenticated else None


class AddressInput(serializers.Serializer):
    # The CHECKs in 028 are the validation; these only make the types right.
    name = serializers.CharField()
    phone = serializers.CharField()
    line1 = serializers.CharField()
    line2 = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)
    city = serializers.CharField()
    state = serializers.CharField()
    pincode = serializers.CharField()


class QuoteInput(serializers.Serializer):
    items = serializers.JSONField()
    address_id = serializers.UUIDField()


class CheckoutInput(serializers.Serializer):
    # Nullable on purpose: shop_checkout answers a missing address or quote
    # with its own sentence, and that sentence is the contract.
    items = serializers.JSONField()
    address_id = serializers.UUIDField(allow_null=True)
    quote_id = serializers.UUIDField(allow_null=True)
    pay = serializers.CharField(allow_null=True)


class EnrolInput(serializers.Serializer):
    item_type = serializers.CharField()
    item_id = serializers.UUIDField()
    pay = serializers.CharField()


class MaterialInput(serializers.Serializer):
    path = serializers.CharField()


def _valid(serializer_class, request):
    serializer = serializer_class(data=request.data)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


# ── Shop ─────────────────────────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([AllowAny])
def catalogue(request):
    return Response(services.catalogue())


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def addresses(request):
    if request.method == "GET":
        return Response(services.list_addresses(request.user.pk))
    try:
        return Response(services.save_address(request.user.pk, _valid(AddressInput, request)))
    except services.Refusal as refusal:
        return _refused(refusal)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def quote(request):
    data = _valid(QuoteInput, request)
    try:
        return Response(services.quote(request.user.pk, data["items"], data["address_id"]))
    except services.Refusal as refusal:
        return _refused(refusal)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def checkout(request):
    data = _valid(CheckoutInput, request)
    return Response(
        services.checkout(
            request.user.pk, data["items"], data["address_id"], data["quote_id"], data["pay"]
        )
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_orders(request):
    return Response(services.my_orders(request.user.pk))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def order_status(request, order_id):
    """Somebody else's order and no order read the same: 404."""
    status = services.order_status(request.user.pk, order_id)
    if status is None:
        return Response({"ok": False, "reason": "No such order."}, status=404)
    return Response({"ok": True, "status": status})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancel_order(request, order_id):
    return Response(services.cancel_order(request.user.pk, order_id))


# ── Academy ──────────────────────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([AllowAny])
def academy(request):
    return Response(services.academy(_uid(request)))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def lessons(request, course_id):
    return Response(services.lessons(request.user.pk, course_id))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def event_links(request):
    return Response(services.event_links(request.user.pk))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def materials(request):
    return Response(services.materials(request.user.pk))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def material_url(request):
    try:
        return Response(services.material_url(request.user.pk, _valid(MaterialInput, request)["path"]))
    except services.Refusal as refusal:
        return _refused(refusal)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def enrol(request):
    data = _valid(EnrolInput, request)
    return Response(services.enrol(request.user.pk, data["item_type"], data["item_id"], data["pay"]))
