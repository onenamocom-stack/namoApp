"""Each product's own cashback on a first order through an astrologer's code
(9 Oct 2026, owner): a ₹700 item set to "flat ₹500" gives the buyer ₹500 in
the wallet and the astrologer 10% of the ₹200 left. Prepaid only — cash on
delivery gives the buyer nothing. Products left on the default behave as
before. apps/shop/offers.py, apps/referrals/services.cashback_split."""

import pytest

from apps.referrals import services
from apps.referrals.models import Cashback, ReferralCode
from apps.shop import offers
from apps.shop import services as shop_services
from apps.shop.models import Order, Product, ShopCategory

from .test_referrals import BUYER, PRO, _code, _fund, people  # noqa: F401 — fixture by name

SEVEN_HUNDRED = 70_000


@pytest.fixture
def item(db):
    cat = ShopCategory.objects.create(name="Gemstones", sort=1)
    return Product.objects.create(
        category=cat, name="Ganesh idol", price_paise=SEVEN_HUNDRED,
        stock=10, active=True, tax_rate_bps=0, weight_grams=50,
    )


def _rule(product, text):
    kind, value, cap = offers.parse(text)
    Product.objects.filter(pk=product.pk).update(
        referral_cashback_kind=kind, referral_cashback_value=value, referral_cashback_cap_paise=cap)
    product.refresh_from_db()
    return product


def _sides():
    return {r.side: r.amount_paise for r in Cashback.objects.all()}


@pytest.mark.django_db
class TestTheSplit:
    def test_flat_500_on_700_gives_the_buyer_500_and_the_astrologer_20(self, people, item):
        _rule(item, "flat 500")
        _fund(BUYER, SEVEN_HUNDRED)
        code = _code(PRO, ReferralCode.Kind.CONSULTANT)
        result = shop_services.buy(BUYER, [{"product_id": str(item.id), "qty": 1}], coupon_code=code)
        assert result["ok"] and result["total_paise"] == SEVEN_HUNDRED  # paid in full
        assert result["cashback_paise"] == 50_000
        assert _sides() == {"buyer": 50_000, "referrer": 2_000}

    def test_it_counts_per_item(self, people, item):
        _rule(item, "flat 500")
        assert services.cashback_split([(item, SEVEN_HUNDRED, 2)], prepaid=True) == (100_000, 4_000)

    def test_never_more_than_the_line_cost(self, people, item):
        _rule(item, "flat 900")
        assert services.cashback_split([(item, SEVEN_HUNDRED, 1)], prepaid=True) == (SEVEN_HUNDRED, 0)

    def test_a_percent_capped_per_item(self, people, item):
        _rule(item, "10% upto 30")
        assert services.cashback_split([(item, SEVEN_HUNDRED, 2)], prepaid=True) == (6_000, 13_400)  # 10% of 1,400 − 60

    def test_none_gives_the_buyer_nothing_and_the_astrologer_their_10(self, people, item):
        _rule(item, "none")
        assert services.cashback_split([(item, SEVEN_HUNDRED, 1)], prepaid=True) == (0, 7_000)

    def test_the_default_is_unchanged(self, people, item):
        assert services.cashback_split([(item, SEVEN_HUNDRED, 1)], prepaid=True) == (7_000, 7_000)

    def test_cash_on_delivery_gives_the_buyer_nothing(self, people, item):
        _rule(item, "flat 500")
        assert services.cashback_split([(item, SEVEN_HUNDRED, 1)], prepaid=False) == (0, 7_000)
        Product.objects.filter(pk=item.pk).update(referral_cashback_kind="default")
        item.refresh_from_db()
        assert services.cashback_split([(item, SEVEN_HUNDRED, 1)], prepaid=False) == (0, 7_000)

    def test_a_mixed_basket(self, people, item):
        plain = Product.objects.create(category=item.category, name="Mala", price_paise=100_000,
                                       stock=5, active=True, weight_grams=20)
        _rule(item, "flat 500")
        assert services.cashback_split([(item, SEVEN_HUNDRED, 1), (plain, 100_000, 1)], prepaid=True) == (
            50_000 + 10_000, 2_000 + 10_000)


@pytest.mark.django_db
class TestTheCartPreview:
    def test_online_names_the_amount_and_cod_says_pay_online(self, people, item):
        _rule(item, "flat 500")
        code = _code(PRO, ReferralCode.Kind.CONSULTANT)
        lines = [{"product_id": item.id, "qty": 1}]
        online = services.describe_code(code, viewer_id=BUYER, lines=lines, payment="online")
        assert online["ok"] and online["cashback_paise"] == 50_000 and "₹500 back" in online["note"]
        cod = services.describe_code(code, viewer_id=BUYER, lines=lines, payment="cod")
        assert cod["ok"] and cod["cashback_paise"] == 0 and "Pay online" in cod["note"]


@pytest.mark.django_db
class TestTheOfferIsNotBurned:
    def test_a_cancelled_order_does_not_use_up_the_first_order_offer(self, people, item):
        _fund(BUYER, SEVEN_HUNDRED * 2)
        code = _code(PRO, ReferralCode.Kind.CONSULTANT)
        first = shop_services.buy(BUYER, [{"product_id": str(item.id), "qty": 1}], coupon_code=code)
        Order.objects.filter(pk=first["order_id"]).update(status=Order.Status.CANCELLED)
        assert services.check_coupon(BUYER, code)["ok"] is True


class TestTheRuleText:
    @pytest.mark.parametrize("text,kind,value,cap", [
        ("", "default", None, None),
        ("none", "none", None, None),
        ("flat 500", "flat", 50_000, None),
        ("₹250", "flat", 25_000, None),
        ("10%", "percent", 1_000, None),
        ("12.5% upto 100", "percent", 1_250, 10_000),
    ])
    def test_parse(self, text, kind, value, cap):
        assert offers.parse(text) == (kind, value, cap)

    def test_nonsense_is_refused_with_the_form_to_use(self):
        with pytest.raises(ValueError, match="flat 500"):
            offers.parse("lots")
