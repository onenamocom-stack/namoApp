from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.views import refusal_body

from . import services
from .models import Cashback, ReferralCode


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_codes(request):
    """The caller's code, minted on first ask.

    A seeker gets their N code. An approved consultant gets BOTH — the A
    code they share on posts, and the N code they can still use to bring
    a friend into the app as a seeker. The two buy different things.
    """
    from apps.consultants import services as consultant_services

    codes = {"seeker": services.code_for(request.user.pk,
                                         ReferralCode.Kind.SEEKER).code}
    if consultant_services.is_approved(request.user.pk):
        codes["consultant"] = services.code_for(
            request.user.pk, ReferralCode.Kind.CONSULTANT
        ).code
    return Response({
        "codes": codes,
        "referred": services.my_referrals(request.user.pk),
    })


class ClaimInput(serializers.Serializer):
    code = serializers.CharField(max_length=32)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def claim(request):
    """A new seeker types somebody's code. Once per account, ever."""
    serializer = ClaimInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    result = services.claim_signup(request.user.pk, serializer.validated_data["code"])
    if not result["ok"]:
        return Response(refusal_body("refused", result["reason"]), status=400)
    return Response(result)


class LinkInput(serializers.Serializer):
    product_id = serializers.UUIDField(required=False, allow_null=True)


@api_view(["POST", "GET"])
@permission_classes([IsAuthenticated])
def affiliate_link(request):
    """A shareable link with the consultant's code already in it.

    THE SERVER BUILDS IT, not the app. These get pasted into WhatsApp and
    live for months — the shape of the URL is a contract, and one made by
    string concatenation in a screen is one that cannot be corrected
    later without every old link breaking.

    With a product, it opens that product. Without one, the shop.
    """
    from apps.consultants import services as consultant_services

    if not consultant_services.is_approved(request.user.pk):
        return Response(
            refusal_body(
                "not_a_consultant",
                services.REFUSAL_CONSULTANT_LINK_NOT_YOURS,
            ),
            status=403,
        )

    data = request.data if request.method == "POST" else request.GET
    serializer = LinkInput(data=data)
    serializer.is_valid(raise_exception=True)
    return Response(
        services.affiliate_link(
            request.user.pk, serializer.validated_data.get("product_id")
        )
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_cashback(request):
    """What is owed and what has landed — both sides of the programme
    read this, because a buyer waiting out the return window and a
    consultant waiting for month end are asking the same question."""
    rows = Cashback.objects.filter(profile_id=request.user.pk)[:100]
    return Response({
        "items": [services.cashback_row(c) for c in rows],
        "pending_paise": sum(
            c.amount_paise for c in rows if c.status == Cashback.Status.PENDING
        ),
        "paid_paise": sum(
            c.amount_paise for c in rows if c.status == Cashback.Status.PAID
        ),
    })
