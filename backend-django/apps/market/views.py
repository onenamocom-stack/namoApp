"""The Market's sellers over HTTP, `/v1/market/` (15 Oct 2026, Phase 17).

Anonymous: browse the approved listings and open one. Signed in: take a
free one, open what you own. A seller (Pro or Creator): list, edit,
withdraw, see earnings, and (a Creator) say where the money goes. Paying
for a listing is the wallet's `POST /v1/wallet/pay/ {sku: 'listing', ref}`.
"""

from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.core.views import refusal_body

from . import services
from .models import Listing, ListingKind
from .services import Refused


def _refused(err):
    return Response(refusal_body("refused", err.message), status=err.status)


def _viewer(request):
    return request.user.pk if getattr(request.user, "is_authenticated", False) else None


@api_view(["GET"])
@permission_classes([AllowAny])
def listings(request):
    """Approved listings: `?kind=` narrows to one kind, `?seller=` to one
    seller (their profile's Shop tab)."""
    kind = request.query_params.get("kind") or None
    if kind and kind not in ListingKind.values:
        return Response([])
    return Response(services.browse(kind=kind, seller_id=request.query_params.get("seller") or None))


@api_view(["GET"])
@permission_classes([AllowAny])
def listing(request, listing_id):
    row = services.detail(listing_id, viewer=_viewer(request))
    if row is None:
        return Response(refusal_body("not_found", "That is not on the Market."), status=404)
    return Response(row)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def take(request, listing_id):
    """A free listing, taken."""
    try:
        services.take_free(request.user.pk, listing_id)
    except Refused as err:
        return _refused(err)
    return Response({"ok": True})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def access(request, listing_id):
    listing = Listing.objects.filter(pk=listing_id).first()
    if listing is None:
        return Response(refusal_body("not_found", "That is not on the Market."), status=404)
    try:
        return Response({"ok": True, **services.access(request.user.pk, listing)})
    except Refused as err:
        return _refused(err)


@api_view(["GET"])
@permission_classes([AllowAny])
def preview(request, listing_id, index):
    listing = services.live(listing_id)
    if listing is None:
        return Response(refusal_body("not_found", "That is not on the Market."), status=404)
    try:
        return Response({"ok": True, "url": services.preview(listing, int(index))})
    except Refused as err:
        return _refused(err)


class LessonInput(serializers.Serializer):
    title = serializers.CharField(max_length=200)
    minutes = serializers.IntegerField(required=False, default=0, min_value=0, max_value=600)
    asset_id = serializers.UUIDField()
    preview = serializers.BooleanField(required=False, default=False)


class ListingInput(serializers.Serializer):
    kind = serializers.ChoiceField(choices=ListingKind.choices, required=False)
    title = serializers.CharField(max_length=200)
    description = serializers.CharField(required=False, allow_blank=True, default="", max_length=20000)
    cover_url = serializers.CharField(required=False, allow_blank=True, default="")
    price_paise = serializers.IntegerField(required=False, default=0, min_value=0)
    mrp_paise = serializers.IntegerField(required=False, allow_null=True, default=None)
    file_asset_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    lessons = LessonInput(many=True, required=False, default=list)
    language = serializers.CharField(required=False, allow_blank=True, default="")
    starts_at = serializers.DateTimeField(required=False, allow_null=True, default=None)
    duration_minutes = serializers.IntegerField(required=False, allow_null=True, default=None)
    seats = serializers.IntegerField(required=False, allow_null=True, default=None)
    join_url = serializers.CharField(required=False, allow_blank=True, default="")
    category_name = serializers.CharField(required=False, allow_blank=True, default="")
    stock = serializers.IntegerField(required=False, allow_null=True, default=None)
    weight_grams = serializers.IntegerField(required=False, allow_null=True, default=None)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def my_listings(request):
    if request.method == "GET":
        return Response({"seller": services.is_seller(request.user.pk), "listings": services.mine(request.user.pk)})
    form = ListingInput(data=request.data)
    form.is_valid(raise_exception=True)
    try:
        row = services.create(request.user.pk, form.validated_data)
    except Refused as err:
        return _refused(err)
    return Response({"ok": True, "id": str(row.id)}, status=201)


@api_view(["PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def my_listing(request, listing_id):
    try:
        if request.method == "DELETE":
            services.withdraw(request.user.pk, listing_id)
            return Response({"ok": True})
        form = ListingInput(data=request.data)
        form.is_valid(raise_exception=True)
        services.update(request.user.pk, listing_id, form.validated_data)
    except Refused as err:
        return _refused(err)
    return Response({"ok": True})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_earnings(request):
    return Response(services.earnings(request.user.pk))


class BankInput(serializers.Serializer):
    account_holder = serializers.CharField(max_length=120)
    account_number = serializers.CharField(required=False, allow_blank=True, default="", max_length=30)
    ifsc = serializers.CharField(required=False, allow_blank=True, default="", max_length=11)
    upi_id = serializers.CharField(required=False, allow_blank=True, default="", max_length=100)
    pan = serializers.CharField(required=False, allow_blank=True, default="", max_length=10)


@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated])
def my_bank(request):
    """A Creator's payout account. A Pro's is their payout details, on
    Dashboard → Payout details."""
    from apps.consultants import services as consultants

    pro = consultants.is_approved(request.user.pk)
    if request.method == "GET":
        return Response({"pro": pro, "bank": None if pro else services.bank(request.user.pk)})
    if pro:
        return Response(refusal_body("refused", "Your payout details are on Dashboard → Payout details."), status=400)
    form = BankInput(data=request.data)
    form.is_valid(raise_exception=True)
    try:
        return Response({"ok": True, "bank": services.save_bank(request.user.pk, form.validated_data)})
    except Refused as err:
        return _refused(err)
