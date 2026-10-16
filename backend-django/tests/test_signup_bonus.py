"""₹25 a sign-up (16 Oct 2026, Rahul: "If code is shared by pro creator or
seller anybody - he will get ₹25 per user"; "Add this income in content
income").

  who earns   -> a Creator, a Seller or an approved Pro; a plain seeker's
                 code still gives AI questions only
  how much    -> the console's figure; 0 turns it off; once per person
  where       -> content earnings, and the statement's Commission line;
                 a voided one is not paid; void refused once on a statement
"""

import uuid
from datetime import date, datetime

import pytest
from django.utils import timezone

from apps.consultants import payouts
from apps.consultants.models import PayoutStatement
from apps.content import services as content
from apps.profiles.models import Profile
from apps.referrals import influencer, services
from apps.referrals.models import AffiliateSettings, SignupBonus

from .test_content import APPROVED, SECOND_SEEKER, SEEKER, content_tables, roster  # noqa: F401


def newcomer():
    pid = uuid.uuid4()
    Profile.objects.create(id=pid, phone=str(pid.int)[:10], name="New")
    return pid


def code(pid):
    return services.code_for(pid, "seeker").code


@pytest.mark.django_db
class TestWhoEarns:
    def test_a_creator_earns_25(self, roster):
        Profile.objects.filter(pk=SEEKER).update(influencer=True)
        assert services.claim_signup(newcomer(), code(SEEKER))["ok"]
        [b] = SignupBonus.objects.all()
        assert str(b.referrer_id) == SEEKER and b.amount_paise == 2500

    def test_a_seller_and_a_pro_earn(self, roster):
        Profile.objects.filter(pk=SEEKER).update(seller=True)
        services.claim_signup(newcomer(), code(SEEKER))
        services.claim_signup(newcomer(), code(APPROVED))
        assert {str(b.referrer_id) for b in SignupBonus.objects.all()} == {SEEKER, APPROVED}

    def test_a_plain_seeker_does_not(self, roster):
        assert services.claim_signup(newcomer(), code(SECOND_SEEKER))["ok"]
        assert not SignupBonus.objects.exists()

    def test_the_console_figure_and_off(self, roster):
        Profile.objects.filter(pk=SEEKER).update(influencer=True)
        AffiliateSettings.objects.create(pk=1, attribution_days=15, signup_bonus_paise=4000)
        services.claim_signup(newcomer(), code(SEEKER))
        AffiliateSettings.objects.filter(pk=1).update(signup_bonus_paise=0)
        services.claim_signup(newcomer(), code(SEEKER))
        assert list(SignupBonus.objects.values_list("amount_paise", flat=True)) == [4000]

    def test_once_per_person(self, roster):
        Profile.objects.filter(pk=SEEKER).update(influencer=True)
        Profile.objects.filter(pk=SECOND_SEEKER).update(influencer=True)
        who = newcomer()
        services.claim_signup(who, code(SEEKER))
        assert not services.claim_signup(who, code(SECOND_SEEKER))["ok"]
        assert SignupBonus.objects.count() == 1


@pytest.mark.django_db
class TestWhere:
    def test_content_earnings_and_the_influencer_tab(self, roster):
        Profile.objects.filter(pk=SEEKER).update(influencer=True)
        services.claim_signup(newcomer(), code(SEEKER))
        services.claim_signup(newcomer(), code(SEEKER))
        body = content.content_earnings(SEEKER, "this_month")
        assert body["signups"] == {"count": 2, "paise": 5000} and body["earnings_paise"] == 5000
        tab = influencer.stats(SEEKER)
        assert tab["per_signup_paise"] == 2500 and tab["periods"]["this_month"]["earned_paise"] == 5000

    def test_statement_content_line_and_void(self, roster):
        Profile.objects.filter(pk=SEEKER).update(influencer=True)
        services.claim_signup(newcomer(), code(SEEKER))
        services.claim_signup(newcomer(), code(SEEKER))
        sept = timezone.make_aware(datetime(2026, 9, 10, 12))
        SignupBonus.objects.update(created_at=sept)
        first, second = SignupBonus.objects.all()
        services.void_signup_bonus(first, "fake", "finance@namo")
        assert payouts.lines(SEEKER, date(2026, 9, 1))["commission"] == 2500
        assert content.content_earnings(SEEKER, "this_month")["signups"]["count"] == 0
        payouts.build(date(2026, 9, 1), today=date(2026, 10, 7))
        assert PayoutStatement.objects.get(profile_id=SEEKER).commission_paise == 2500
        with pytest.raises(ValueError):
            services.void_signup_bonus(second, "late", "finance@namo")
