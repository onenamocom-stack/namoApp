"""The shop's endpoints.

Reading the catalogue is anonymous: the shop is a shopfront and a signed-
out visitor browsing it is the point. Buying needs a session, because it
spends a wallet.
"""

from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from . import services


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


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def buy(request):
    form = BuyInput(data=request.data)
    form.is_valid(raise_exception=True)
    result = services.buy(
        request.user.id,
        form.validated_data["lines"],
        coupon_code=form.validated_data.get("coupon"),
    )
    # 200 on a refusal: "out of stock" is an answer the screen shows, not a
    # transport failure, and the client's one error path stays the network.
    return Response(result)
