"""Astrologers' affiliate links with a window (11 Oct 2026, owner).

A customer who arrives through an astrologer's link is that astrologer's for
the window (15 days, set in the console), whole store. Another astrologer's
link before the first order replaces it and the window starts again. Only the
FIRST order pays the astrologer; after the window, or after the first order,
links change nothing. The buyer's first-order cashback needs no link."""

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.consultants.models import Consultant
from apps.profiles.models import Profile
from apps.referrals import services
from apps.referrals.models import AffiliateSettings, AffiliateVisit, Cashback, ReferralCode
from apps.shop import services as shop_services
from apps.shop.models import Order, Shipment

from .conftest import make_claims  # noqa: F401
from .test_referrals import BUYER, PRICE, PRO, TENTH, _code, _fund, people, product  # noqa: F401

PRO2 = "eeeeeeee-1111-2222-3333-444444444444"
DAY = timezone.timedelta(days=1)


@pytest.fixture
def two_pros(people):
    Profile.objects.create(id=PRO2, phone="e", name="Second Astrologer")
    Consultant.objects.create(profile_id=PRO2, category="Astrologer", status="approved")


def _buy(product):
    _fund(BUYER, PRICE)
    return shop_services.buy(BUYER, [{"product_id": str(product.id), "qty": 1}])


def _owed():
    return {(r.side, str(r.profile_id)): r.amount_paise for r in Cashback.objects.all()}


def _age(days):
    """Move every recorded click `days` into the past, window and all."""
    for v in AffiliateVisit.objects.all():
        AffiliateVisit.objects.filter(pk=v.pk).update(
            clicked_at=v.clicked_at - days * DAY, expires_at=v.expires_at - days * DAY)


@pytest.mark.django_db
class TestTheWindow:
    def test_a_first_order_inside_the_window_pays_the_astrologer(self, people, product):
        services.record_visit(BUYER, _code(PRO, ReferralCode.Kind.CONSULTANT))
        result = _buy(product)
        assert result["ok"] and result["cashback_paise"] == TENTH
        assert _owed() == {("buyer", BUYER): TENTH, ("referrer", PRO): TENTH}
        assert AffiliateVisit.objects.get().order_id is not None

    def test_after_the_window_no_commission_but_the_buyer_still_gets_theirs(self, people, product):
        services.record_visit(BUYER, _code(PRO, ReferralCode.Kind.CONSULTANT))
        _age(16)
        result = _buy(product)
        assert result["cashback_paise"] == TENTH
        assert _owed() == {("buyer", BUYER): TENTH}

    def test_no_link_at_all_still_gets_the_first_order_cashback(self, people, product):
        assert _buy(product)["cashback_paise"] == TENTH
        assert _owed() == {("buyer", BUYER): TENTH}

    def test_the_last_link_wins(self, two_pros, product):
        services.record_visit(BUYER, _code(PRO, ReferralCode.Kind.CONSULTANT))
        services.record_visit(BUYER, _code(PRO2, ReferralCode.Kind.CONSULTANT))
        _buy(product)
        assert ("referrer", PRO2) in _owed() and ("referrer", PRO) not in _owed()

    def test_a_new_link_starts_the_window_again(self, two_pros, product):
        services.record_visit(BUYER, _code(PRO, ReferralCode.Kind.CONSULTANT))
        _age(10)
        services.record_visit(BUYER, _code(PRO2, ReferralCode.Kind.CONSULTANT))
        _age(10)  # 20 days after the first link, 10 after the second
        _buy(product)
        assert ("referrer", PRO2) in _owed()

    def test_after_the_first_order_links_change_nothing(self, two_pros, product):
        _buy(product)
        answer = services.record_visit(BUYER, _code(PRO2, ReferralCode.Kind.CONSULTANT))
        assert answer["recorded"] is False
        _fund(BUYER, PRICE)
        second = shop_services.buy(BUYER, [{"product_id": str(product.id), "qty": 1}])
        assert second["cashback_paise"] == 0
        assert not Cashback.objects.filter(side="referrer").exists()

    def test_a_cancelled_first_order_does_not_use_the_link_up(self, people, product):
        services.record_visit(BUYER, _code(PRO, ReferralCode.Kind.CONSULTANT))
        first = _buy(product)
        Order.objects.filter(pk=first["order_id"]).update(status=Order.Status.CANCELLED)
        Cashback.objects.update(status=Cashback.Status.CANCELLED)
        # The link was spent on that order; a fresh click holds them again.
        services.record_visit(BUYER, _code(PRO, ReferralCode.Kind.CONSULTANT))
        second = _buy(product)
        assert second["cashback_paise"] == TENTH
        assert Cashback.objects.filter(order_id=second["order_id"], side="referrer").exists()

    def test_the_window_is_set_in_the_console(self, people, product):
        AffiliateSettings.objects.create(pk=1, attribution_days=3)
        services.record_visit(BUYER, _code(PRO, ReferralCode.Kind.CONSULTANT))
        _age(4)
        _buy(product)
        assert ("referrer", PRO) not in _owed()

    def test_a_click_before_sign_in_counts_from_when_it_happened(self, people):
        then = timezone.now() - 5 * DAY
        services.record_visit(BUYER, _code(PRO, ReferralCode.Kind.CONSULTANT), clicked_at=then)
        visit = AffiliateVisit.objects.get()
        assert abs((visit.expires_at - (then + 15 * DAY)).total_seconds()) < 1
        future = timezone.now() + 5 * DAY
        services.record_visit(BUYER, _code(PRO, ReferralCode.Kind.CONSULTANT), clicked_at=future)
        assert AffiliateVisit.objects.get().clicked_at <= timezone.now()

    def test_an_old_astrologer_code_at_checkout_counts_as_the_link(self, people, product):
        _fund(BUYER, PRICE)
        result = shop_services.buy(BUYER, [{"product_id": str(product.id), "qty": 1}],
                                   coupon_code=_code(PRO, ReferralCode.Kind.CONSULTANT))
        assert result["discount_paise"] == 0 and ("referrer", PRO) in _owed()


@pytest.mark.django_db
class TestDeliveryAndReturns:
    def test_a_return_cancels_a_buyer_only_cashback(self, people, product):
        order_id = _buy(product)["order_id"]
        services.on_shipment_status(order_id, Shipment.Status.RETURNED)
        assert Cashback.objects.get().status == Cashback.Status.CANCELLED

    def test_delivery_starts_the_clock_on_a_buyer_only_cashback(self, people, product):
        order_id = _buy(product)["order_id"]
        services.on_shipment_status(order_id, Shipment.Status.DELIVERED)
        assert Cashback.objects.get().matures_at is not None


@pytest.mark.django_db
class TestTheEndpoints:
    def _client(self, hs256_mode, sign_hs256):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {sign_hs256(make_claims(sub=BUYER))}")
        return c

    def test_visit_and_preview(self, hs256_mode, sign_hs256, people, product):
        c = self._client(hs256_mode, sign_hs256)
        got = c.post("/v1/referrals/visit/", {"code": _code(PRO, ReferralCode.Kind.CONSULTANT)},
                     format="json").json()
        assert got["recorded"] is True
        lines = [{"product_id": str(product.id), "qty": 1}]
        online = c.post("/v1/referrals/first-order/", {"lines": lines, "payment": "online"}, format="json").json()
        assert online["first_order"] is True and online["cashback_paise"] == TENTH
        cod = c.post("/v1/referrals/first-order/", {"lines": lines, "payment": "cod"}, format="json").json()
        assert cod["cashback_paise"] == 0 and "online" in cod["note"]


@pytest.mark.django_db
class TestTheConsole:
    def test_finance_sees_the_visits_and_sets_the_window(self, people):
        from django.urls import reverse

        from apps.console.models import Tier

        from .test_shop_console import _admin

        services.record_visit(BUYER, _code(PRO, ReferralCode.Kind.CONSULTANT))
        client, _ = _admin(Tier.FINANCE)
        page = client.get(reverse("namo:referrals_affiliatevisit_changelist"))
        assert page.status_code == 200 and b"Holding" in page.content
        saved = client.post(reverse("namo:referrals_affiliatesettings_add"), {"attribution_days": 10})
        assert saved.status_code == 302
        assert services.attribution_days() == 10
