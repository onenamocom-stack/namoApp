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


@pytest.mark.django_db
class TestTagPage:
    """`GET /v1/content/tag/<tag>/` (Phase 15a): whole tag, any case, any
    script; newest first, or `top` by engagement."""

    def test_whole_tag_only_any_case(self, api_client, consultant_token, roster):
        a = _publish(api_client, consultant_token, kind="post", caption="Om #Shiv").json()["id"]
        _publish(api_client, consultant_token, kind="post", caption="#shivratri tonight")
        b = _publish(api_client, consultant_token, kind="post", caption="#shiv, always").json()["id"]
        ids = [r["id"] for r in api_client.get("/v1/content/tag/shiv/").json()["results"]]
        assert ids == [b, a]

    def test_devanagari_tag(self, api_client, consultant_token, roster):
        a = _publish(api_client, consultant_token, kind="post", caption="जय #शिव").json()["id"]
        _publish(api_client, consultant_token, kind="post", caption="#शिवरात्रि")
        ids = [r["id"] for r in api_client.get("/v1/content/tag/शिव/").json()["results"]]
        assert ids == [a]

    def test_top_orders_by_engagement(
        self, api_client, consultant_token, seeker_token, second_seeker_token, roster
    ):
        liked = _publish(api_client, consultant_token, kind="post", caption="#yoga one").json()["id"]
        _publish(api_client, consultant_token, kind="post", caption="#yoga two")
        for token in (seeker_token, second_seeker_token):
            _react(api_client, token, "content", liked, "like")
        ids = [r["id"] for r in api_client.get("/v1/content/tag/yoga/?sort=top").json()["results"]]
        assert ids[0] == liked


@pytest.mark.django_db
class TestSuggestions:
    """`GET /v1/content/suggestions/` (Phase 15a)."""

    def test_friends_of_friends_first_then_active_never_self_or_followed(
        self, api_client, seeker_token, second_seeker_token, consultant_token, roster
    ):
        from .test_content import ADMIN

        # Tara follows Arjun; Arjun follows Admin. Pro posted this week.
        _react(api_client, seeker_token, "profile", SECOND_SEEKER, "follow")
        _react(api_client, second_seeker_token, "profile", ADMIN, "follow")
        _publish(api_client, consultant_token, kind="post", caption="hello")

        items = api_client.get("/v1/content/suggestions/", **auth(seeker_token)).json()["items"]
        ids = [i["id"].replace("-", "") for i in items]
        assert ids[0] == ADMIN.replace("-", "")
        assert items[0]["reason"] == "Followed by Arjun Nair"
        assert APPROVED.replace("-", "") in ids
        assert next(i for i in items if i["id"].replace("-", "") == APPROVED.replace("-", ""))["is_consultant"]
        assert SEEKER.replace("-", "") not in ids
        assert SECOND_SEEKER.replace("-", "") not in ids

    def test_signed_out_gets_active_authors(self, api_client, consultant_token, roster):
        _publish(api_client, consultant_token, kind="post", caption="hello")
        items = api_client.get("/v1/content/suggestions/").json()["items"]
        assert [i["reason"] for i in items] == ["Active this week"]


@pytest.mark.django_db
class TestCreators:
    """Creators (13 Oct 2026, Rahul): every kind of post, and a flag on
    their feed rows and author page for the blue tick."""

    def test_a_creator_may_post_a_reel_and_carries_the_flag(self, api_client, seeker_token, roster):
        from apps.profiles.models import Profile

        # Everybody posts a reel since 17 Oct 2026; the flag is the Creator's tick.
        Profile.objects.filter(id=SEEKER).update(influencer=True)
        made = _publish(api_client, seeker_token, kind="clip", caption="r", media_url="https://x/r.mp4")
        assert made.status_code == 201
        row = api_client.get("/v1/content/feed/").json()["results"][0]
        assert row["author_is_creator"] is True
        assert api_client.get(f"/v1/content/authors/{SEEKER}/").json()["is_creator"] is True

    def test_a_seeker_is_not_a_creator(self, api_client, seeker_token, roster):
        _publish(api_client, seeker_token, kind="post", caption="hi")
        assert api_client.get("/v1/content/feed/").json()["results"][0]["author_is_creator"] is False
