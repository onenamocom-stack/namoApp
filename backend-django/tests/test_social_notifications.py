"""Likes and follows tell the person (13 Oct 2026, docs/06 Phase 15a).

A like: once per post per IST hour, never for your own post. A follow:
once per pair, ever — unfollow and follow again does not ring twice.
"""

import pytest

from apps.notifications.models import Notification

from .conftest import make_claims
from .test_content import (  # noqa: F401 — fixtures are used by name
    APPROVED,
    SECOND_SEEKER,
    SEEKER,
    _publish,
    auth,
    content_tables,
    roster,
    second_seeker_token,
    seeker_token,
)


@pytest.fixture
def consultant_token(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims(sub=APPROVED))


@pytest.fixture
def post_id(api_client, consultant_token, roster):
    return _publish(api_client, consultant_token, kind="post", caption="a post").json()["id"]


def _react(api_client, token, target_type, target_id, kind, on=True):
    method = api_client.post if on else api_client.delete
    return method(
        "/v1/reactions/",
        data={"target_type": target_type, "target_id": target_id, "kind": kind},
        format="json",
        **auth(token),
    )


def _alerts(profile_id, kind):
    return list(Notification.objects.filter(profile_id=profile_id, kind=kind))


@pytest.mark.django_db
class TestLikeAndFollowNotifications:
    def test_a_like_tells_the_author(self, api_client, seeker_token, post_id):
        assert _react(api_client, seeker_token, "content", post_id, "like").status_code in (200, 201)
        [alert] = _alerts(APPROVED, "content.like")
        assert alert.title == "Tara Verma liked your post"
        assert alert.ref_id == post_id

    def test_likes_in_one_hour_are_one_notification(
        self, api_client, seeker_token, second_seeker_token, post_id
    ):
        _react(api_client, seeker_token, "content", post_id, "like")
        _react(api_client, second_seeker_token, "content", post_id, "like")
        _react(api_client, seeker_token, "content", post_id, "like", on=False)
        _react(api_client, seeker_token, "content", post_id, "like")
        assert len(_alerts(APPROVED, "content.like")) == 1

    def test_liking_your_own_post_says_nothing(self, api_client, consultant_token, post_id):
        _react(api_client, consultant_token, "content", post_id, "like")
        assert _alerts(APPROVED, "content.like") == []

    def test_a_follow_tells_the_person_once(self, api_client, seeker_token, roster):
        _react(api_client, seeker_token, "profile", SECOND_SEEKER, "follow")
        _react(api_client, seeker_token, "profile", SECOND_SEEKER, "follow", on=False)
        _react(api_client, seeker_token, "profile", SECOND_SEEKER, "follow")
        [alert] = _alerts(SECOND_SEEKER, "profile.follow")
        assert alert.title == "Tara Verma started following you"
        assert alert.ref_id.replace("-", "") == SEEKER.replace("-", "")

    def test_following_a_consultant_tells_them(self, api_client, seeker_token, roster):
        _react(api_client, seeker_token, "consultant", APPROVED, "follow")
        assert len(_alerts(APPROVED, "profile.follow")) == 1
