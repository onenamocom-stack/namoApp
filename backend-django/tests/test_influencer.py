"""Influencers (3 Oct 2026): signups with their code, and how many paid."""

import uuid
from datetime import datetime, timezone as dt_tz

import pytest

from apps.analytics.models import Attribution, Source
from apps.profiles.models import Profile
from apps.referrals import influencer, services
from apps.referrals.models import Referral, ReferralCode, ReferralKind
from apps.wallet.models import Payment

from .conftest import OTHER_USER, TEST_USER, make_claims

STAR = TEST_USER
STRANGER = OTHER_USER
UTC = dt_tz.utc


def at(y, m, d, hh=12):
    return datetime(y, m, d, hh, tzinfo=UTC)


def auth(token):
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


@pytest.fixture
def star():
    Profile.objects.all().delete()
    Profile.objects.create(id=STAR, phone="9000000001", name="A Star", influencer=True)
    Profile.objects.create(id=STRANGER, phone="9000000002", name="Someone")
    return STAR


def joined(when, *, paid=None, status=Payment.Status.CAPTURED):
    """A person who claimed STAR's code `when`, optionally paying `paid`."""
    pid = uuid.uuid4()
    Profile.objects.create(id=pid, phone=str(pid)[:15], name="Joiner")
    Referral.objects.create(
        kind=ReferralKind.SIGNUP, referrer_id=STAR, referee_id=pid, code="NTEST234", created_at=when,
    )
    if paid:
        Payment.objects.create(profile_id=pid, amount_paise=10000, status=status, created_at=paid)
    return pid


@pytest.mark.django_db
class TestStats:
    def test_signups_and_buyers_by_period(self, star):
        now = at(2026, 10, 15)
        joined(at(2026, 10, 2), paid=at(2026, 10, 3))   # joined and paid this month
        joined(at(2026, 9, 20), paid=at(2026, 10, 5))   # joined last month, paid this month
        joined(at(2026, 9, 21), paid=at(2026, 9, 22))   # both last month
        joined(at(2026, 10, 4))                          # joined, never paid
        joined(at(2026, 10, 6), paid=at(2026, 10, 7), status=Payment.Status.CREATED)  # never completed

        p = influencer.stats(STAR, now=now)["periods"]
        assert p["this_month"] == {"signups": 3, "buyers": 2}
        assert p["last_month"] == {"signups": 2, "buyers": 1}
        assert p["lifetime"] == {"signups": 5, "buyers": 3}

    def test_first_payment_only_counts_once(self, star):
        pid = joined(at(2026, 10, 2), paid=at(2026, 10, 3))
        Payment.objects.create(profile_id=pid, amount_paise=50000, status="captured", created_at=at(2026, 10, 9))
        p = influencer.stats(STAR, now=at(2026, 10, 15))["periods"]
        assert p["this_month"]["buyers"] == 1

    def test_someone_elses_signups_never_count(self, star):
        pid = uuid.uuid4()
        Profile.objects.create(id=pid, phone="9000000003", name="Other's friend")
        Referral.objects.create(kind=ReferralKind.SIGNUP, referrer_id=STRANGER, referee_id=pid, code="NOTHER23")
        assert influencer.stats(STAR)["periods"]["lifetime"] == {"signups": 0, "buyers": 0}

    def test_recent_carries_dates_and_nothing_that_identifies_anyone(self, star):
        joined(at(2026, 10, 2), paid=at(2026, 10, 3))
        joined(at(2026, 10, 4))
        body = influencer.stats(STAR, now=at(2026, 10, 15))
        assert body["recent"] == [
            {"joined_on": "2026-10-04", "bought_on": None},
            {"joined_on": "2026-10-02", "bought_on": "2026-10-03"},
        ]
        assert body["code"].startswith("N")
        assert body["link"].endswith(f"/onboarding?ref={body['code']}")


@pytest.mark.django_db
class TestApi:
    URL = "/v1/referrals/influencer/"

    def test_only_an_influencer_sees_the_tab(self, api_client, sign_hs256, hs256_mode, star):
        assert api_client.get(self.URL, **auth(sign_hs256(claims=make_claims(sub=STAR)))).status_code == 200
        assert api_client.get(self.URL, **auth(sign_hs256(claims=make_claims(sub=STRANGER)))).status_code == 403
        assert api_client.get(self.URL).status_code == 401

    def test_the_profile_says_who_is_an_influencer(self, api_client, sign_hs256, hs256_mode, star):
        me = api_client.get("/v1/profiles/me/", **auth(sign_hs256(claims=make_claims(sub=STAR)))).json()
        assert me["influencer"] is True


@pytest.mark.django_db
def test_claiming_a_code_records_first_touch(star):
    code = services.code_for(STAR, ReferralCode.Kind.SEEKER).code
    assert services.claim_signup(STRANGER, code)["ok"] is True
    row = Attribution.objects.get(profile_id=STRANGER)
    assert row.source == Source.REFERRAL
    assert str(row.referrer_id) == str(STAR)


@pytest.mark.django_db
def test_console_shows_what_an_influencer_brought(star):
    from django.urls import reverse

    from apps.console.models import Tier

    from .test_console import _admin

    joined(at(2026, 10, 2), paid=at(2026, 10, 3))
    client, _ = _admin(Tier.FULFILMENT)
    page = client.get(reverse("namo:profiles_profile_changelist") + "?influencer__exact=1")
    assert page.status_code == 200
    assert "1 joined · 1 paid" in page.content.decode()
