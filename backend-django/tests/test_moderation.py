"""Who may post video, who may be blocked, and what a report does.

Three things arrive together because they are one feature: the seeker
asked for video-by-flag *because* a flag can be revoked, and revoking is
what an admin does after reading a report. Testing them apart would test
three halves.

THE RULE THAT MATTERS MOST IS THE NEGATIVE ONE. A report does not remove a
post and does not block anybody, however many of them there are. Auto-hide
at N reports hands any N accounts the power to silence anyone, and the
test for that is at the bottom of this file because it is the one that
will be deleted first by somebody trying to be helpful.
"""

import uuid

import pytest
from django.test import Client
from django.utils import timezone

from apps.content import services
from apps.content.models import Content, Report
from apps.content.services import (
    BLOCKED_REFUSAL, SELF_REPORT_REFUSAL, VIDEO_REFUSAL,
)
from apps.profiles import services as profile_services
from apps.profiles.models import Profile

from .conftest import OTHER_USER, TEST_USER, make_claims

SEEKER = TEST_USER
OTHER = OTHER_USER
ADMIN = "aaaaaaaa-5555-6666-7777-888888888888"
APPROVED = "bbbbbbbb-5555-6666-7777-888888888888"


def auth(token):
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


@pytest.fixture
def seeker_token(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims(sub=SEEKER))


@pytest.fixture
def other_token(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims(sub=OTHER))


@pytest.fixture
def people():
    Profile.objects.all().delete()
    for pid, name in ((SEEKER, "A Seeker"), (OTHER, "Somebody Else"),
                      (APPROVED, "An Astrologer")):
        Profile.objects.create(id=pid, phone=str(pid), name=name)
    yield


def _post(author=SEEKER, kind=Content.Kind.POST):
    return Content.objects.create(
        author_id=author, kind=kind, caption="a photo",
        media_url="https://example.test/x.jpg",
        status=Content.Status.LIVE, published_at=timezone.now(),
    )


# ── who may post what ───────────────────────────────────────────────────────


@pytest.mark.django_db
class TestWhoMayPost:
    """Text and images for everyone; video behind a flag, a consultant row
    or the admin claim."""

    def test_anyone_may_post_text_and_a_photo(self, people, client, seeker_token):
        for kind in ("post", "article"):
            response = client.post(
                "/v1/content/publish/",
                data={"kind": kind, "caption": "hello", "body": "hello",
                      "media_url": "https://example.test/x.jpg"},
                content_type="application/json", **auth(seeker_token),
            )
            assert response.status_code == 201, kind

    def test_an_ordinary_seeker_cannot_post_video(self, people, client, seeker_token):
        response = client.post(
            "/v1/content/publish/",
            data={"kind": "clip", "media_url": "https://example.test/x.mp4"},
            content_type="application/json", **auth(seeker_token),
        )
        assert response.status_code == 403
        assert response.json()["message"] == VIDEO_REFUSAL

    def test_the_flag_grants_video_without_making_them_a_consultant(
        self, people, client, seeker_token
    ):
        """The whole point of the flag. An influencer who joins as an
        ordinary user gets reels; they do not get a rate card, a place in
        the astrologer list, or a booking calendar."""
        profile_services.set_video_enabled(SEEKER, True)

        response = client.post(
            "/v1/content/publish/",
            data={"kind": "clip", "media_url": "https://example.test/x.mp4"},
            content_type="application/json", **auth(seeker_token),
        )
        assert response.status_code == 201

        from apps.consultants.models import Consultant
        assert not Consultant.objects.filter(profile_id=SEEKER).exists(), (
            "the flag made them a consultant, which is exactly what it exists to avoid"
        )

    def test_revoking_the_flag_takes_video_away_again(self, people, client, seeker_token):
        profile_services.set_video_enabled(SEEKER, True)
        profile_services.set_video_enabled(SEEKER, False)
        response = client.post(
            "/v1/content/publish/",
            data={"kind": "clip", "media_url": "https://example.test/x.mp4"},
            content_type="application/json", **auth(seeker_token),
        )
        assert response.status_code == 403


# ── blocking ────────────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestBlocking:
    def test_a_blocked_account_cannot_post_anything(self, people, client, seeker_token):
        """Not even text. The refusal is about the account, so the sentence
        has to be about the account too."""
        profile_services.set_blocked(SEEKER, True, reason="reported")
        response = client.post(
            "/v1/content/publish/",
            data={"kind": "post", "caption": "hi", "media_url": "https://example.test/x.jpg"},
            content_type="application/json", **auth(seeker_token),
        )
        assert response.status_code == 403
        assert response.json()["message"] == BLOCKED_REFUSAL

    def test_blocking_hides_their_posts_from_the_feed(self, people, client):
        _post()
        assert services.feed_page()[0], "precondition: the post is in the feed"
        profile_services.set_blocked(SEEKER, True)
        assert services.feed_page()[0] == []

    def test_blocking_deletes_nothing_and_unblocking_puts_it_back(self, people):
        """A removed account in a dispute is evidence, and an appeal that
        succeeds has to be able to restore what was hidden."""
        post = _post()
        profile_services.set_blocked(SEEKER, True)
        assert Content.objects.filter(pk=post.pk, status=Content.Status.LIVE).exists()

        profile_services.set_blocked(SEEKER, False)
        assert len(services.feed_page()[0]) == 1

    def test_the_flag_does_not_survive_a_block(self, people):
        """Somebody blocked for what they posted does not keep the
        permission to post more of it."""
        profile_services.set_video_enabled(SEEKER, True)
        profile_services.set_blocked(SEEKER, True)
        assert profile_services.video_enabled(SEEKER) is False


# ── reporting ───────────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestReporting:
    def test_a_post_can_be_reported(self, people, client, other_token):
        post = _post()
        response = client.post(
            f"/v1/content/{post.pk}/report/",
            data={"reason": "spam", "note": "selling something"},
            content_type="application/json", **auth(other_token),
        )
        assert response.status_code == 201
        row = Report.objects.get()
        assert row.reason == "spam"
        assert str(row.subject_id).replace("-", "") == str(SEEKER).replace("-", "")
        assert row.status == Report.Status.OPEN

    def test_a_person_can_be_reported_without_a_post(self, people, client, other_token):
        """The half that makes "reported many times" answerable when the
        offender deletes and reposts."""
        response = client.post(
            f"/v1/content/authors/{SEEKER}/report/",
            data={"reason": "abuse"},
            content_type="application/json", **auth(other_token),
        )
        assert response.status_code == 201
        assert Report.objects.get().content_id is None

    def test_reporting_twice_is_not_an_error_and_does_not_double_the_count(
        self, people, client, other_token
    ):
        """The seeker's intent was "I have told you about this", and it is
        true the second time. A refusal here just invites another tap."""
        post = _post()
        for _ in range(3):
            response = client.post(
                f"/v1/content/{post.pk}/report/", data={"reason": "spam"},
                content_type="application/json", **auth(other_token),
            )
            assert response.status_code in (200, 201)
        assert Report.objects.count() == 1
        assert services.reports_against(SEEKER)["total"] == 1

    def test_nobody_reports_their_own_post(self, people, client, seeker_token):
        post = _post()
        response = client.post(
            f"/v1/content/{post.pk}/report/", data={"reason": "spam"},
            content_type="application/json", **auth(seeker_token),
        )
        assert response.status_code == 403
        assert response.json()["message"] == SELF_REPORT_REFUSAL

    def test_a_reason_outside_the_list_is_refused(self, people, client, other_token):
        post = _post()
        response = client.post(
            f"/v1/content/{post.pk}/report/", data={"reason": "i just dont like it"},
            content_type="application/json", **auth(other_token),
        )
        assert response.status_code == 400

    def test_reporting_needs_a_signed_in_account(self, people, client):
        """Anonymous reports are a denial-of-service tool with extra steps:
        no cost to file and no account to rate-limit."""
        post = _post()
        response = client.post(
            f"/v1/content/{post.pk}/report/", data={"reason": "spam"},
            content_type="application/json",
        )
        assert response.status_code == 401

    def test_the_count_is_people_not_reports(self, people, client, other_token):
        """Two different people, two posts, one subject — the console's
        "reported N times" must mean N humans."""
        first, second = _post(), _post()
        for post in (first, second):
            client.post(f"/v1/content/{post.pk}/report/", data={"reason": "spam"},
                        content_type="application/json", **auth(other_token))
        assert services.reports_against(SEEKER)["total"] == 2


# ── what a report does NOT do ───────────────────────────────────────────────


@pytest.mark.django_db
class TestAReportIsNotAVerdict:
    """The negative rule. Do not delete these.

    Every "hide it at N reports" feature ever shipped became an appeals
    backlog, because N accounts acting together is not evidence of
    anything. An admin reads and decides; that is the seeker's own
    instruction — *"admin dhyaan se dekhega"*.
    """

    def test_many_reports_do_not_remove_the_post(self, people, client, sign_hs256, hs256_mode):
        post = _post()
        for _ in range(8):
            stranger = str(uuid.uuid4())
            Profile.objects.create(id=stranger, phone=stranger, name="A Stranger")
            token = sign_hs256(claims=make_claims(sub=stranger))
            client.post(f"/v1/content/{post.pk}/report/", data={"reason": "abuse"},
                        content_type="application/json", **auth(token))

        assert services.reports_against(SEEKER)["total"] == 8
        post.refresh_from_db()
        assert post.status == Content.Status.LIVE, "eight accounts removed a post by themselves"
        assert len(services.feed_page()[0]) == 1

    def test_many_reports_do_not_block_the_account(self, people, client, other_token):
        _post()
        client.post(f"/v1/content/authors/{SEEKER}/report/", data={"reason": "abuse"},
                    content_type="application/json", **auth(other_token))
        assert Profile.objects.get(pk=SEEKER).blocked_at is None

    def test_an_admin_removing_the_post_leaves_the_account_alone(self, people):
        """The lighter action stays lighter. One bad post is not a bad
        person."""
        post = _post()
        services.admin_remove_content(post.pk)
        post.refresh_from_db()
        assert post.status == Content.Status.REMOVED
        assert Profile.objects.get(pk=SEEKER).blocked_at is None

    def test_resolving_records_who_decided_and_what_they_did(self, people, client, other_token):
        post = _post()
        client.post(f"/v1/content/{post.pk}/report/", data={"reason": "spam"},
                    content_type="application/json", **auth(other_token))
        report = Report.objects.get()

        assert services.resolve_report(
            report.pk, admin_profile_id=ADMIN, upheld=True, outcome="post removed") is True

        report.refresh_from_db()
        assert report.status == Report.Status.UPHELD
        assert report.outcome == "post removed"
        assert report.reviewed_at is not None

    def test_a_decided_report_is_not_decided_twice(self, people, client, other_token):
        post = _post()
        client.post(f"/v1/content/{post.pk}/report/", data={"reason": "spam"},
                    content_type="application/json", **auth(other_token))
        report = Report.objects.get()
        services.resolve_report(report.pk, admin_profile_id=ADMIN, upheld=False,
                                outcome="dismissed")
        assert services.resolve_report(
            report.pk, admin_profile_id=ADMIN, upheld=True, outcome="post removed") is False
