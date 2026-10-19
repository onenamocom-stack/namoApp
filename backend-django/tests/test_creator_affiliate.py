"""Creators earn as astrologers do (14 Oct 2026, 01-PRD §12): an A code,
tagged products, and 10% of a first order through their link, paid into
their own book (`creator_earnings`) when the cashback matures."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.consultants.models import Consultant, EarningsLedger
from apps.profiles.models import Profile
from apps.referrals import services
from apps.referrals.models import Cashback, CreatorEarning, ReferralCode
from apps.shop import services as shop_services
from apps.shop.models import Shipment

from .conftest import make_claims
from .test_referrals import BUYER, PRICE, TENTH, _fund, people, product  # noqa: F401


@pytest.fixture(autouse=True)
def _old_rates(settings):
    """These tests pin the referral mechanics at the rates they were written
    for — 10% to each side. The rates are settings; since 15 Oct 2026 the
    defaults are 6% to the sharer and 0 to the buyer (test_market.TestRates,
    test_referral_offers.TestTodaysRates)."""
    settings.REFERRAL_SHARER_BPS = 1000
    settings.REFERRAL_BUYER_BPS = 1000


CREATOR = "c7c7c7c7-1111-2222-3333-444444444444"


@pytest.fixture
def creator(people):
    Profile.objects.create(id=CREATOR, phone="c", name="A Creator", influencer=True)


def _buy(product):
    _fund(BUYER, PRICE)
    return shop_services.buy(BUYER, [{"product_id": str(product.id), "qty": 1}])


def _auth(sign_hs256, sub):
    return {"HTTP_AUTHORIZATION": f"Bearer {sign_hs256(claims=make_claims(sub=sub))}"}


@pytest.mark.django_db
class TestCreatorAffiliate:
    def test_a_creator_link_pays_into_their_own_book(self, creator, product):
        code = services.code_for(CREATOR, ReferralCode.Kind.CONSULTANT).code
        assert services.record_visit(BUYER, code)["recorded"] is True
        order = _buy(product)
        assert Cashback.objects.get(side="referrer").profile_id.hex == CREATOR.replace("-", "")

        services.on_shipment_status(order["order_id"], Shipment.Status.DELIVERED)
        Cashback.objects.update(matures_at=timezone.now() - timedelta(minutes=1))
        assert services.mature_due() == 2
        row = CreatorEarning.objects.get()
        assert row.amount_paise == TENTH and str(row.profile_id) == CREATOR
        assert not EarningsLedger.objects.exists()
        # The sweep again pays nothing twice.
        services.mature_due()
        assert CreatorEarning.objects.count() == 1

    def test_a_flag_removed_stops_new_earning(self, creator, product):
        code = services.code_for(CREATOR, ReferralCode.Kind.CONSULTANT).code
        Profile.objects.filter(id=CREATOR).update(influencer=False)
        assert services.record_visit(BUYER, code)["recorded"] is False

    def test_a_consultant_buying_through_a_creator_earns_nothing(self, creator, product):
        Consultant.objects.create(profile_id=BUYER, category="Astrologer", status="approved")
        code = services.code_for(CREATOR, ReferralCode.Kind.CONSULTANT).code
        assert services.record_visit(BUYER, code)["recorded"] is False

    def test_codes_link_and_book_over_the_api(self, api_client, sign_hs256, hs256_mode, creator):
        headers = _auth(sign_hs256, CREATOR)
        codes = api_client.get("/v1/referrals/me/", **headers).json()["codes"]
        assert len(codes["consultant"]) == 4
        link = api_client.post("/v1/referrals/link/", {}, format="json", **headers)
        assert link.status_code == 200 and f"ref={codes['consultant']}" in link.json()["url"]
        book = api_client.get("/v1/referrals/creator-earnings/", **headers).json()
        assert book["lifetime_paise"] == 0 and book["pending_paise"] == 0
        seeker = _auth(sign_hs256, BUYER)
        assert api_client.get("/v1/referrals/creator-earnings/", **seeker).status_code == 404
