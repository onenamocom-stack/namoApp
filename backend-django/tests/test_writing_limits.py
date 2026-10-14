"""How fast one person may write (14 Oct 2026, Phase 15d): the
done-condition is that an account posting twenty comments in a minute is
stopped. Counted from their own rows, so every server instance agrees."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.content.models import Comment, Content
from apps.core import limits

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


@pytest.mark.django_db
class TestWritingLimits:
    def test_twenty_comments_in_a_minute_are_stopped_at_ten(self, api_client, seeker_token, roster):
        cid = _publish(api_client, seeker_token, kind="post", caption="p").json()["id"]
        codes = [_comment(api_client, seeker_token, cid, f"c{i}").status_code for i in range(20)]
        assert codes[:10] == [201] * 10
        assert set(codes[10:]) == {429}
        refused = _comment(api_client, seeker_token, cid, "again")
        assert refused.json()["reason"] == "too_fast"
        assert "commenting too fast" in refused.json()["message"]
        assert Comment.objects.filter(author_id=SEEKER).count() == 10

    def test_the_minute_passes_and_comments_flow_again(self, api_client, seeker_token, roster):
        cid = _publish(api_client, seeker_token, kind="post", caption="p").json()["id"]
        for i in range(10):
            _comment(api_client, seeker_token, cid, f"c{i}")
        Comment.objects.filter(author_id=SEEKER).update(created_at=timezone.now() - timedelta(minutes=2))
        assert _comment(api_client, seeker_token, cid, "later").status_code == 201

    def test_posts_stop_at_ten_an_hour(self, api_client, seeker_token, roster):
        codes = [_publish(api_client, seeker_token, kind="post", caption=f"p{i}").status_code for i in range(11)]
        assert codes[:10] == [201] * 10 and codes[10] == 429
        assert Content.objects.filter(author_id=SEEKER).count() == 10

    def test_messages_stop_at_thirty_a_minute(
        self, api_client, seeker_token, second_seeker_token, roster
    ):
        tid = api_client.post("/v1/dms/start/", {"to": SECOND_SEEKER}, format="json", **auth(seeker_token)).json()["id"]
        send = lambda token, body: api_client.post(  # noqa: E731
            f"/v1/dms/threads/{tid}/send/", {"body": body}, format="json", **auth(token))
        assert send(seeker_token, "hello").status_code == 201
        assert send(second_seeker_token, "hi").status_code == 201  # a reply accepts
        codes = [send(seeker_token, f"m{i}").status_code for i in range(30)]
        assert codes[:29] == [201] * 29 and codes[29] == 429
        assert "too fast" in send(seeker_token, "x").json()["message"]

    def test_first_broken_names_the_rule(self):
        rows = Comment.objects.none()
        assert limits.first_broken(rows, limits.COMMENTS) is None
