"""The daily moderation queue (14 Oct 2026, Phase 15d): a link from an
account under a week old, and the same words three times in a day from one
person, land in the console's queue. Nothing is hidden until an admin
decides; many people writing the same words is not flagged."""

import uuid
from datetime import timedelta

import pytest
from django.contrib.auth.models import User
from django.test import Client
from django.urls import reverse
from django.utils import timezone

from apps.console.models import AdminUser, Tier
from apps.content.models import Comment, Content, ModerationFlag
from apps.content import moderation
from apps.profiles.models import Profile

from .test_content import (  # noqa: F401 — fixtures are used by name
    SECOND_SEEKER,
    SEEKER,
    _publish,
    auth,
    content_tables,
    roster,
    second_seeker_token,
    seeker_token,
)


def _comment(c, token, cid, body):
    return c.post(f"/v1/content/{cid}/comments/", data={"body": body}, format="json", **auth(token))


def _age(profile_id, days):
    Profile.objects.filter(pk=profile_id).update(created_at=timezone.now() - timedelta(days=days))


def _operator():
    pid = uuid.uuid4()
    Profile.objects.create(id=pid, phone=str(pid)[:15], name="Operator")
    user = User.objects.create_user(username=f"op{pid.hex[:8]}", is_staff=True)
    AdminUser.objects.create(profile_id=pid, tier=Tier.FULFILMENT, active=True, operator=user)
    client = Client()
    client.force_login(user)
    return client


@pytest.mark.django_db
class TestFinders:
    def test_links_are_recognised(self):
        for text in ("see https://x.co", "www.cheap.in now", "join wa.me/9199", "buy at deals.shop"):
            assert moderation.has_link(text), text
        for text in ("Jai Shri Ram", "Om Namah Shivaya. 108 times today.", "Ram.Ram"):
            assert not moderation.has_link(text), text

    def test_a_new_account_posting_a_link_is_flagged(self, api_client, seeker_token, roster):
        _age(SEEKER, 2)
        _publish(api_client, seeker_token, kind="post", caption="Earn fast: www.cheap.in")
        flag = ModerationFlag.objects.get()
        assert flag.kind == "new_link" and flag.target_type == "post"
        # Flagged, not hidden.
        assert Content.objects.get().status == "live"

    def test_an_old_account_posting_a_link_is_not(self, api_client, seeker_token, roster):
        _age(SEEKER, 30)
        _publish(api_client, seeker_token, kind="post", caption="My temple: www.mandir.in")
        assert not ModerationFlag.objects.exists()

    def test_the_same_words_three_times_from_one_person(self, api_client, seeker_token, roster):
        _age(SEEKER, 30)
        cid = _publish(api_client, seeker_token, kind="post", caption="p").json()["id"]
        for _ in range(3):
            _comment(api_client, seeker_token, cid, "Follow me back please")
        assert ModerationFlag.objects.filter(kind="repeated", target_type="comment").count() == 1

    def test_the_same_words_from_many_people_is_not_flagged(
        self, api_client, seeker_token, second_seeker_token, roster
    ):
        _age(SEEKER, 30)
        _age(SECOND_SEEKER, 30)
        cid = _publish(api_client, seeker_token, kind="post", caption="Aarti").json()["id"]
        for token in (seeker_token, second_seeker_token):
            for _ in range(2):
                _comment(api_client, token, cid, "Jai Shri Ram")
        assert not ModerationFlag.objects.exists()


@pytest.mark.django_db
class TestTheQueue:
    def test_remove_it_takes_the_comment_down_and_keeps_the_account(
        self, api_client, seeker_token, roster
    ):
        _age(SEEKER, 1)
        cid = _publish(api_client, seeker_token, kind="post", caption="hello").json()["id"]
        _comment(api_client, seeker_token, cid, "cheap gems at gems.shop")
        flag = ModerationFlag.objects.get(target_type="comment")
        client = _operator()
        client.post(reverse("namo:content_moderationflag_changelist"),
                    {"action": "remove_it", "_selected_action": [str(flag.pk)]})
        flag.refresh_from_db()
        assert flag.status == "removed" and flag.decided_by
        assert Comment.objects.get(pk=flag.target_id).status == "removed"
        assert Profile.objects.get(pk=SEEKER).blocked_at is None

    def test_looks_fine_leaves_it_up(self, api_client, seeker_token, roster):
        _age(SEEKER, 1)
        _publish(api_client, seeker_token, kind="post", caption="my blog www.myblog.in")
        flag = ModerationFlag.objects.get()
        client = _operator()
        page = client.get(reverse("namo:content_moderationflag_changelist"))
        assert page.status_code == 200 and b"myblog" in page.content
        client.post(reverse("namo:content_moderationflag_changelist"),
                    {"action": "looks_fine", "_selected_action": [str(flag.pk)]})
        flag.refresh_from_db()
        assert flag.status == "cleared"
        assert Content.objects.get().status == "live"
