"""Reshare — a `reactions` row of kind 'repost' (30 Sep 2026).

Somebody else's post or reel on your profile and in the feed under your
name. The rules: signed in, not blocked, a publicly visible post, never your
own; toggling off removes it; the author is notified once; the feed's
repost_count and the /reposts/ list agree; a post that stops being public,
or a resharer who is blocked, drops out of the list.
"""

import pytest
from django.utils import timezone

from apps.content.services import REPOST_OWN_REFUSAL
from apps.reactions.models import Reaction

from .conftest import make_claims
from .test_content import (  # noqa: F401 — fixtures are used by name
    APPROVED,
    SECOND_SEEKER,
    SEEKER,
    _publish,
    _set_consultant_status,
    admin_token,
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
    return _publish(api_client, consultant_token, kind="post", caption="worth sharing").json()["id"]


def _repost(api_client, token, cid, on=True):
    method = api_client.post if on else api_client.delete
    return method(
        "/v1/reactions/",
        data={"target_type": "content", "target_id": cid, "kind": "repost"},
        format="json",
        **auth(token),
    )


def _flat(v):
    return str(v).replace("-", "")


@pytest.mark.django_db
class TestReposts:
    def test_reshare_shows_in_list_and_count(
        self, api_client, seeker_token, second_seeker_token, post_id
    ):
        assert _repost(api_client, seeker_token, post_id).status_code in (200, 201)
        _repost(api_client, second_seeker_token, post_id)
        rows = api_client.get("/v1/content/reposts/").json()
        assert len(rows) == 2
        assert rows[0]["post"]["id"] == post_id
        assert {r["reposted_by_name"] for r in rows} == {"Tara Verma", "Arjun Nair"}
        feed = api_client.get("/v1/content/feed/").json()["results"][0]
        assert feed["repost_count"] == 2

    def test_by_person(self, api_client, seeker_token, second_seeker_token, post_id):
        _repost(api_client, seeker_token, post_id)
        _repost(api_client, second_seeker_token, post_id)
        mine = api_client.get(f"/v1/content/reposts/?by={SEEKER}").json()
        assert len(mine) == 1
        assert _flat(mine[0]["reposted_by"]) == _flat(SEEKER)

    def test_twice_is_one(self, api_client, seeker_token, post_id):
        _repost(api_client, seeker_token, post_id)
        _repost(api_client, seeker_token, post_id)
        assert Reaction.objects.filter(kind="repost").count() == 1

    def test_undo(self, api_client, seeker_token, post_id):
        _repost(api_client, seeker_token, post_id)
        _repost(api_client, seeker_token, post_id, on=False)
        assert api_client.get("/v1/content/reposts/").json() == []

    def test_not_your_own(self, api_client, consultant_token, post_id):
        response = _repost(api_client, consultant_token, post_id)
        assert response.status_code == 403
        assert response.json()["message"] == REPOST_OWN_REFUSAL
        assert not Reaction.objects.filter(kind="repost").exists()

    def test_blocked_cannot_and_drops_out(self, api_client, seeker_token, second_seeker_token, post_id):
        from apps.profiles.models import Profile

        _repost(api_client, seeker_token, post_id)
        Profile.objects.filter(pk=SEEKER).update(blocked_at=timezone.now())
        assert api_client.get("/v1/content/reposts/").json() == []
        # A blocked person is refused a new reshare outright.
        Profile.objects.filter(pk=SECOND_SEEKER).update(blocked_at=timezone.now())
        assert _repost(api_client, second_seeker_token, post_id).status_code == 403

    def test_hidden_post_refused_and_drops_out(self, api_client, seeker_token, post_id):
        _repost(api_client, seeker_token, post_id)
        _set_consultant_status(APPROVED, "pending")
        assert api_client.get("/v1/content/reposts/").json() == []

    def test_author_notified_once(self, api_client, seeker_token, post_id):
        from apps.notifications.models import Notification

        _repost(api_client, seeker_token, post_id)
        _repost(api_client, seeker_token, post_id)  # idempotent, no second alert
        notes = Notification.objects.filter(kind="content.repost")
        assert notes.count() == 1
        assert notes.get().title == "Tara Verma reshared your post"
        assert _flat(notes.get().profile_id) == _flat(APPROVED)

    def test_likes_still_work(self, api_client, seeker_token, post_id):
        """The repost rules must not leak onto the other kinds."""
        response = api_client.post(
            "/v1/reactions/",
            data={"target_type": "content", "target_id": post_id, "kind": "like"},
            format="json",
            **auth(seeker_token),
        )
        assert response.status_code in (200, 201)
