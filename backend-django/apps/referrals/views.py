from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.core.views import refusal_body

from . import services
from .models import Cashback, ReferralCode


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def influencer_stats(request):
    """The Influencer tab: the caller's code and link, signups and buyers
    this month, last month and in all, and the latest joins (dates only).
    Refused below Content step 1."""
    from apps.profiles import services as profile_services

    from . import influencer

    if not profile_services.may_refer(request.user.pk):
        return Response(
            refusal_body("not_influencer", "Your invite code earns from Content step 1. See Studio."),
            status=403,
        )
    return Response(influencer.stats(request.user.pk))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_codes(request):
    """The caller's code, minted on first ask.

    A seeker gets their N code. An approved consultant gets BOTH — the A
    code they share on posts, and the N code they can still use to bring
    a friend into the app as a seeker. The two buy different things.
    """
    codes = {"seeker": services.code_for(request.user.pk,
                                         ReferralCode.Kind.SEEKER).code}
    # A Creator holds one too (14 Oct 2026, 01-PRD §12).
    if services.may_share(request.user.pk):
        codes["consultant"] = services.code_for(
            request.user.pk, ReferralCode.Kind.CONSULTANT
        ).code
    return Response({
        "codes": codes,
        "referred": services.my_referrals(request.user.pk),
        # How long an affiliate link holds a customer (11 Oct 2026; console).
        "affiliate_days": services.attribution_days(),
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
    listing_id = serializers.UUIDField(required=False, allow_null=True)
    ebook_id = serializers.UUIDField(required=False, allow_null=True)


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
    if not services.may_share(request.user.pk):
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
            request.user.pk, serializer.validated_data.get("product_id"),
            serializer.validated_data.get("listing_id"), serializer.validated_data.get("ebook_id"),
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


class CheckLine(serializers.Serializer):
    product_id = serializers.UUIDField()
    qty = serializers.IntegerField(min_value=1, max_value=99)


class CheckInput(serializers.Serializer):
    code = serializers.CharField(max_length=32)
    subtotal_paise = serializers.IntegerField(required=False, default=0, min_value=0)
    # The basket and how it will be paid, so the answer names the real
    # cashback (9 Oct 2026). Optional: an older app sends the subtotal only.
    lines = CheckLine(many=True, required=False)
    payment = serializers.ChoiceField(choices=("online", "cod", "wallet"), required=False)


@api_view(["POST"])
@permission_classes([AllowAny])
def check(request):
    """Is this code any good, and what does it do?

    Read-only, and answers for the CALLER when there is one. Signed in,
    every rule applies — your own code, already used one, not your first
    order. Signed out, it answers only what kind of code it is, which is
    all an onboarding screen can be told before there is a session.

    Anonymous on purpose: the referral field sits on the phone screen,
    before the OTP, and a code that cannot be checked until afterwards is
    a code somebody mistypes and only finds out about later.
    """
    serializer = CheckInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    viewer = request.user.pk if request.user and request.user.is_authenticated else None
    code = serializer.validated_data["code"]
    subtotal = serializer.validated_data["subtotal_paise"]

    lines = [{"product_id": row["product_id"], "qty": row["qty"]}
             for row in serializer.validated_data.get("lines") or []]
    verdict = services.describe_code(code, viewer_id=viewer, subtotal_paise=subtotal,
                                     lines=lines, payment=serializer.validated_data.get("payment"))
    if verdict["kind"] is not None:
        return Response(verdict)

    # Not a referral code. The cart's one box takes shop coupons too, and
    # they are a different table with a different answer — a DISCOUNT,
    # which comes off the total rather than back afterwards. Tried second
    # because the referral namespace is its own shape and resolves fast.
    from apps.shop import services as shop_services

    discount, coupon, refusal = shop_services.check_coupon(code, subtotal)
    if coupon is None:
        return Response({"ok": False, "kind": None,
                         "reason": refusal or services.REFUSAL_UNKNOWN_CODE})
    return Response({
        "ok": True, "kind": "coupon", "discount_paise": discount,
        "note": f"₹{discount / 100:g} off" if discount else "Valid",
    })


class VisitInput(serializers.Serializer):
    code = serializers.CharField(max_length=32)
    product_id = serializers.UUIDField(required=False, allow_null=True)
    # When the link was opened, if before signing in. ISO 8601.
    clicked_at = serializers.DateTimeField(required=False, allow_null=True)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def visit(request):
    """The signed-in customer arrived through an astrologer's link (11 Oct
    2026): recorded for the first-order window, last link winning. Never an
    error the screen must show — a link that does not apply is a no."""
    serializer = VisitInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    return Response(services.record_visit(
        request.user.pk, data["code"], product_id=data.get("product_id"),
        clicked_at=data.get("clicked_at"),
    ))


class FirstOrderLine(serializers.Serializer):
    product_id = serializers.UUIDField()
    qty = serializers.IntegerField(min_value=1, max_value=99)


class FirstOrderInput(serializers.Serializer):
    lines = FirstOrderLine(many=True)
    payment = serializers.ChoiceField(choices=("online", "cod", "wallet"), required=False)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def first_order(request):
    """What the cart says above Pay: the first order's cashback for this
    basket and this way of paying (11 Oct 2026)."""
    serializer = FirstOrderInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    lines = [{"product_id": r["product_id"], "qty": r["qty"]} for r in data["lines"]]
    return Response(services.first_order_preview(request.user.pk, lines, data.get("payment")))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def creator_earnings(request):
    """The referral book for Studio (14 Oct 2026): Content step 1 or 2
    since 17 Oct."""
    from apps.profiles import services as profile_services

    if not profile_services.may_refer(request.user.pk):
        return Response(refusal_body("not_creator", "Only Content step 1 has this book."), status=404)
    return Response(services.creator_earnings(request.user.pk))
