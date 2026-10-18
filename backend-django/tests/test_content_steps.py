"""The Content module's two steps (Rahul, 17 Oct 2026; docs/01 §12).

  step 1  100 followers, 10 live videos, 30 days: granted on asking, no
          console; tags, links and the A code earn, sign-ups pay
  step 2  500 followers, 3 videos and 100,000 views in 90 days: then the
          request, which the console approves; pay on views, the tick
"""

import uuid
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.content.models import Content, ContentView
from apps.notifications.models import Notification
from apps.profiles import milestones, modules
from apps.profiles import services as profile_services
from apps.profiles.models import ModuleRequest, Profile
from apps.reactions.models import Reaction
from apps.referrals import services as referrals

from .test_content import (  # noqa: F401 — fixtures are used by name
    APPROVED,
    SEEKER,
    auth,
    content_tables,
    roster,
    seeker_token,
)


def _followers(n):
    Reaction.objects.bulk_create([
        Reaction(actor_id=uuid.uuid4(), target_type="profile", target_id=SEEKER, kind="follow")
        for _ in range(n)])


def _videos(n, days_ago=1, views=0):
    now = timezone.now()
    for _ in range(n):
        row = Content.objects.create(author_id=SEEKER, kind="clip", caption="x", status="live",
                                     media_url="https://x/v.mp4", published_at=now,
                                     created_at=now - timedelta(days=days_ago))
        if views:
            ContentView.objects.create(content=row, viewer_id=uuid.uuid4(), views=views,
                                       day=timezone.localdate() - timedelta(days=days_ago))


def _joined(days):
    Profile.objects.filter(pk=SEEKER).update(created_at=timezone.now() - timedelta(days=days))


@pytest.mark.django_db
class TestStepOne:
    def test_the_bar_counts_what_is_done(self, roster):
        _followers(40)
        _videos(10)
        _joined(5)
        step = milestones.progress(SEEKER)["step1"]
        assert {r["key"]: (r["have"], r["need"], r["done"]) for r in step["conditions"]} == {
            "followers": (40, 100, False), "videos": (10, 10, True), "days": (5, 30, False)}
        assert step["met"] is False

    def test_short_of_it_is_refused_with_what_is_left(self, api_client, seeker_token, roster):
        _followers(99)
        _videos(10)
        _joined(31)
        got = api_client.post("/v1/profiles/me/modules/referrer/", {}, format="json", **auth(seeker_token))
        assert got.status_code == 409 and got.json()["message"] == "Not yet: followers 99 of 100."
        assert Profile.objects.get(pk=SEEKER).referrer is False

    def test_met_is_granted_at_once_and_opens_referral_earning(self, api_client, seeker_token, roster):
        _followers(100)
        _videos(10)
        _joined(30)
        assert referrals.may_share(SEEKER) is False
        got = api_client.post("/v1/profiles/me/modules/referrer/", {}, format="json", **auth(seeker_token))
        assert got.status_code == 201 and got.json()["status"] == "approved"
        assert Profile.objects.get(pk=SEEKER).referrer is True
        row = ModuleRequest.objects.get(profile_id=SEEKER)
        assert row.module == "referrer" and row.reviewed_by.startswith("automatic")
        assert Notification.objects.filter(profile_id=SEEKER, kind="module.referrer.approved").exists()
        # Tags, links and sign-ups earn; views do not, and there is no tick.
        assert referrals.may_share(SEEKER) and referrals.earns_on_signups(SEEKER)
        assert profile_services.is_creator(SEEKER) is False
        assert modules.holds(SEEKER)["referrer"] is True


@pytest.mark.django_db
class TestStepTwo:
    def test_step_one_first(self, roster):
        with pytest.raises(modules.Refused, match="step 1 first"):
            modules.ask(SEEKER, "creator", {})

    def test_views_in_the_last_ninety_days_only(self, roster):
        _followers(500)
        _videos(9, days_ago=10, views=11_000)
        _videos(1, days_ago=200, views=50_000)
        step = milestones.progress(SEEKER)["step2"]
        have = {r["key"]: r["have"] for r in step["conditions"]}
        assert have == {"followers": 500, "videos_90d": 9, "views_90d": 99_000} and step["met"] is False
        _videos(1, days_ago=3, views=1_000)
        assert milestones.progress(SEEKER)["step2"]["met"] is True

    def test_met_opens_the_request_the_console_decides(self, roster):
        Profile.objects.filter(pk=SEEKER).update(referrer=True)
        _followers(500)
        _videos(3, days_ago=5, views=34_000)  # 3 videos are enough (17 Oct)
        row = modules.ask(SEEKER, "creator", {"topic": "Bhajans", "link": "https://x", "followers": "1"})
        assert row.status == "pending" and Profile.objects.get(pk=SEEKER).influencer is False
        modules.decide(row, True, "admin@namo")
        assert profile_services.is_creator(SEEKER) is True

    def test_todays_creators_hold_both_steps(self, roster):
        Profile.objects.filter(pk=SEEKER).update(influencer=True)
        assert modules.holds(SEEKER)["referrer"] is True and profile_services.may_refer(SEEKER)


@pytest.mark.django_db
def test_the_tick_is_step_two_and_pro_only(roster):
    """Rahul, 17 Oct 2026: no tick for a Seller or for step 1."""
    def ticked(pid):
        return Profile.objects.filter(pk=pid).annotate(t=profile_services.creator_subquery("id")) \
            .values_list("t", flat=True).first()

    Profile.objects.filter(pk=SEEKER).update(seller=True, referrer=True)
    assert ticked(SEEKER) is False
    Profile.objects.filter(pk=SEEKER).update(influencer=True)
    assert ticked(SEEKER) is True
