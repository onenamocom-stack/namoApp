"""The three modules (docs/06 Phase 18, Rahul 16 Oct 2026).

  each gate      -> video and tags: Creator; Market: Seller; a Pro by being one
                    gets neither
  asking         -> Creator and Seller only, answers needed, one waiting at a
                    time, not for what you hold
  deciding       -> approve switches it on; reject needs a note; either way the
                    person hears
  status         -> held, waiting, or turned down with the note; a Pro's from
                    the consultant row
"""

import pytest

from apps.content import services as content
from apps.market import services as market
from apps.notifications.models import Notification
from apps.profiles import modules
from apps.profiles.models import ModuleRequest, Profile
from apps.referrals import services as referrals

from .test_content import (  # noqa: F401 — fixtures are used by name
    APPROVED,
    SEEKER,
    auth,
    content_tables,
    roster,
    seeker_token,
)

CREATOR_ANSWERS = {"topic": "Bhajans", "link": "https://instagram.com/x", "followers": "12000", "why": ""}


@pytest.fixture
def steps_met(monkeypatch):
    """Both steps' conditions met (tests of their counting are in
    test_content_steps.py); step 1 held, so step 2 can be asked for."""
    from apps.profiles import milestones

    monkeypatch.setattr(milestones, "progress", lambda pid, today=None: {
        "step1": {"conditions": [], "met": True}, "step2": {"conditions": [], "met": True}})
    Profile.objects.filter(pk=SEEKER).update(referrer=True)


@pytest.mark.django_db
class TestGates:
    def test_a_pro_alone_has_consulting_only(self, roster):
        Profile.objects.filter(pk=APPROVED).update(influencer=False)  # the roster's Pro is a Creator too
        assert modules.holds(APPROVED) == {"referrer": False, "creator": False, "pro": True, "seller": False}
        assert content._may_post_video(APPROVED, "authenticated") is False
        assert referrals.may_share(APPROVED) is False
        assert market.is_seller(APPROVED) is False

    def test_each_module_opens_its_own(self, roster):
        Profile.objects.filter(pk=SEEKER).update(influencer=True)
        assert content._may_post_video(SEEKER, "authenticated") is True
        assert referrals.may_share(SEEKER) is True
        assert market.is_seller(SEEKER) is False
        Profile.objects.filter(pk=SEEKER).update(influencer=False, seller=True)
        assert market.is_seller(SEEKER) is True
        assert referrals.may_share(SEEKER) is False

    def test_a_pros_views_do_not_qualify_without_creator(self, api_client, roster):
        from datetime import timedelta

        from django.utils import timezone

        from apps.content.models import Content, ContentView

        Profile.objects.filter(pk=APPROVED).update(influencer=False)
        post = Content.objects.create(author_id=APPROVED, kind="post", caption="x", status="live",
                                      published_at=timezone.now())
        assert content.qualify(post.id, SEEKER, "like") is False
        Profile.objects.filter(pk=APPROVED).update(influencer=True)
        ContentView.objects.create(content_id=post.id, viewer_id=SEEKER, created_at=timezone.now() - timedelta(minutes=1))
        assert content.qualify(post.id, SEEKER, "like") is True


@pytest.mark.django_db
class TestAsking:
    def test_ask_once_with_answers(self, api_client, seeker_token, roster, steps_met):
        url = "/v1/profiles/me/modules/creator/"
        got = api_client.post(url, {"answers": {"topic": "Bhajans"}}, format="json", **auth(seeker_token))
        assert got.status_code == 400 and "Instagram" in got.json()["message"]
        got = api_client.post(url, {"answers": CREATOR_ANSWERS}, format="json", **auth(seeker_token))
        assert got.status_code == 201
        again = api_client.post(url, {"answers": CREATOR_ANSWERS}, format="json", **auth(seeker_token))
        assert again.status_code == 409

    def test_pro_is_the_consultant_form_and_held_is_refused(self, api_client, seeker_token, roster):
        got = api_client.post("/v1/profiles/me/modules/pro/", {"answers": {}}, format="json", **auth(seeker_token))
        assert got.status_code == 400
        Profile.objects.filter(pk=SEEKER).update(seller=True)
        got = api_client.post("/v1/profiles/me/modules/seller/", {"answers": {"what": "Malas", "sample": "x"}},
                              format="json", **auth(seeker_token))
        assert got.status_code == 409


@pytest.mark.django_db
class TestDeciding:
    def test_approve_switches_it_on_and_tells_them(self, roster):
        row = modules.ask(SEEKER, "seller", {"what": "Malas", "sample": "https://x"})
        modules.decide(row, True, "admin@namo")
        assert Profile.objects.get(pk=SEEKER).seller is True
        [note] = Notification.objects.filter(profile_id=SEEKER, kind="module.seller.approved")
        assert note.title == "You are a Seller now"
        with pytest.raises(modules.Refused):
            modules.decide(row, False, "admin@namo", "late")

    def test_reject_needs_a_note_the_person_sees(self, roster, steps_met):
        row = modules.ask(SEEKER, "creator", CREATOR_ANSWERS)
        with pytest.raises(modules.Refused):
            modules.decide(row, False, "admin@namo", "")
        modules.decide(row, False, "admin@namo", "Add a public Instagram link.")
        assert Profile.objects.get(pk=SEEKER).influencer is False
        state = modules.status(SEEKER)["modules"]["creator"]
        assert state == {"held": False, "request": {"status": "rejected", "note": "Add a public Instagram link.",
                                                     "submitted_at": row.submitted_at.isoformat()}}
        assert Notification.objects.filter(profile_id=SEEKER, kind="module.creator.rejected").exists()
        # And they may ask again.
        modules.ask(SEEKER, "creator", CREATOR_ANSWERS)
        assert ModuleRequest.objects.filter(profile_id=SEEKER, status="pending").count() == 1


@pytest.mark.django_db
class TestStatus:
    def test_what_each_person_sees(self, api_client, seeker_token, roster):
        got = api_client.get("/v1/profiles/me/modules/", **auth(seeker_token)).json()
        assert {k: v["held"] for k, v in got["modules"].items()} == {
            "referrer": False, "creator": False, "pro": False, "seller": False}
        assert got["progress"]["step1"]["met"] is False
        assert [q["key"] for q in got["questions"]["creator"]] == ["topic", "link", "followers", "why"]
        assert modules.status(APPROVED)["modules"]["pro"] == {"held": True, "request": None}
