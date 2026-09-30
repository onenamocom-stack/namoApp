"""Comments on posts and reels (content_comments, 30 Sep 2026).

Until this table the comment icon toasted "Replies — prototype only". The
rules: anyone signed in and not blocked may comment on publicly visible
content; the thread reads oldest first and anonymously; the commenter, the
post's author or an admin may remove a comment, nobody else; removal is a
status; the post's author is notified of other people's comments; the feed's
comment_count agrees with the list.
"""

import pytest
from django.utils import timezone

from apps.content.models import Comment
from apps.content.services import COMMENT_EMPTY_REFUSAL, COMMENT_LONG_REFUSAL

from .conftest import make_claims
from .test_content import (  # noqa: F401 — fixtures are used by name
    APPROVED,
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
    response = _publish(api_client, consultant_token, kind="post", caption="a post")
    return response.json()["id"]


def _comment(api_client, token, cid, body):
    return api_client.post(
        f"/v1/content/{cid}/comments/", data={"body": body}, format="json", **auth(token)
    )


def _thread(api_client, cid):
    return api_client.get(f"/v1/content/{cid}/comments/").json()


@pytest.mark.django_db
class TestComments:
    def test_comment_and_read_back_in_order(
        self, api_client, seeker_token, second_seeker_token, post_id
    ):
        first = _comment(api_client, seeker_token, post_id, "  first  ")
        assert first.status_code == 201
        assert first.json()["body"] == "first"  # trimmed
        assert first.json()["author_name"] == "Tara Verma"
        _comment(api_client, second_seeker_token, post_id, "second")
        thread = _thread(api_client, post_id)  # anonymous read
        assert [c["body"] for c in thread] == ["first", "second"]
        assert str(thread[0]["author_id"]) == SEEKER

    def test_feed_count_matches(self, api_client, seeker_token, post_id):
        _comment(api_client, seeker_token, post_id, "one")
        _comment(api_client, seeker_token, post_id, "two")
        row = api_client.get("/v1/content/feed/").json()["results"][0]
        assert row["comment_count"] == 2

    def test_empty_and_too_long_refused(self, api_client, seeker_token, post_id):
        empty = _comment(api_client, seeker_token, post_id, "   ")
        assert empty.status_code == 400
        assert COMMENT_EMPTY_REFUSAL in empty.content.decode()
        long = _comment(api_client, seeker_token, post_id, "x" * 1001)
        assert long.status_code == 400
        assert COMMENT_LONG_REFUSAL in long.content.decode()
        assert Comment.objects.count() == 0

    def test_needs_a_session(self, api_client, post_id):
        response = api_client.post(
            f"/v1/content/{post_id}/comments/", data={"body": "hi"}, format="json"
        )
        assert response.status_code == 401

    def test_blocked_person_cannot_comment_and_disappears(
        self, api_client, seeker_token, post_id
    ):
        from apps.profiles.models import Profile

        _comment(api_client, seeker_token, post_id, "before")
        Profile.objects.filter(pk=SEEKER).update(blocked_at=timezone.now())
        assert _comment(api_client, seeker_token, post_id, "after").status_code == 403
        assert _thread(api_client, post_id) == []
        row = api_client.get("/v1/content/feed/").json()["results"][0]
        assert row["comment_count"] == 0

    def test_hidden_post_is_a_404(self, api_client, seeker_token, post_id):
        _set_consultant_status(APPROVED, "pending")
        assert _comment(api_client, seeker_token, post_id, "hi").status_code == 404
        assert api_client.get(f"/v1/content/{post_id}/comments/").status_code == 404

    def test_post_author_is_notified_not_for_own(
        self, api_client, seeker_token, consultant_token, post_id
    ):
        from apps.notifications.models import Notification

        _comment(api_client, seeker_token, post_id, "lovely")
        _comment(api_client, consultant_token, post_id, "thank you")
        notes = Notification.objects.filter(kind="content.comment")
        assert notes.count() == 1
        note = notes.get()
        assert str(note.profile_id).replace("-", "") == APPROVED.replace("-", "")
        assert note.title == "Tara Verma commented on your post"


@pytest.mark.django_db
class TestRemoval:
    def _remove(self, api_client, token, comment_id):
        return api_client.post(f"/v1/content/comments/{comment_id}/remove/", **auth(token))

    def test_commenter_removes_own(self, api_client, seeker_token, post_id):
        cid = _comment(api_client, seeker_token, post_id, "oops").json()["id"]
        assert self._remove(api_client, seeker_token, cid).status_code == 200
        assert _thread(api_client, post_id) == []
        # A status, never a DELETE.
        assert Comment.objects.get(pk=cid).status == Comment.Status.REMOVED

    def test_post_author_removes_any_on_their_post(
        self, api_client, seeker_token, consultant_token, post_id
    ):
        cid = _comment(api_client, seeker_token, post_id, "rude").json()["id"]
        assert self._remove(api_client, consultant_token, cid).status_code == 200

    def test_stranger_cannot(self, api_client, seeker_token, second_seeker_token, post_id):
        cid = _comment(api_client, seeker_token, post_id, "mine").json()["id"]
        assert self._remove(api_client, second_seeker_token, cid).status_code == 403
        assert len(_thread(api_client, post_id)) == 1

    def test_admin_can(self, api_client, seeker_token, admin_token, post_id):
        cid = _comment(api_client, seeker_token, post_id, "spam").json()["id"]
        assert self._remove(api_client, admin_token, cid).status_code == 200
