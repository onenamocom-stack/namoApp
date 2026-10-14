"""Deleting in messages (14 Oct 2026, Rahul): your own message for both
people, and a whole chat for yourself only."""

import pytest

from apps.dms.models import DmMessage

from .test_content import (  # noqa: F401 — fixtures are used by name
    SECOND_SEEKER,
    SEEKER,
    auth,
    content_tables,
    roster,
    second_seeker_token,
    seeker_token,
)


def _open_thread(c, me, them):
    tid = c.post("/v1/dms/start/", {"to": SECOND_SEEKER}, format="json", **auth(me)).json()["id"]
    first = c.post(f"/v1/dms/threads/{tid}/send/", {"body": "Jai Jinendra"}, format="json", **auth(me)).json()
    c.post(f"/v1/dms/threads/{tid}/send/", {"body": "Pranam"}, format="json", **auth(them))  # accepts
    return tid, first["id"]


def _items(c, token, tid):
    return c.get(f"/v1/dms/threads/{tid}/messages/", **auth(token)).json()["items"]


@pytest.mark.django_db
class TestDeleteMessage:
    def test_the_sender_deletes_it_for_both(self, api_client, seeker_token, second_seeker_token, roster):
        tid, mid = _open_thread(api_client, seeker_token, second_seeker_token)
        out = api_client.post(f"/v1/dms/threads/{tid}/messages/{mid}/delete/", **auth(seeker_token))
        assert out.status_code == 200 and out.json()["deleted"] is True and out.json()["body"] is None
        for token in (seeker_token, second_seeker_token):
            row = next(m for m in _items(api_client, token, tid) if m["id"] == mid)
            assert row["deleted"] is True and row["body"] is None
        # The words are gone from the database too.
        assert "Jai" not in DmMessage.objects.get(pk=mid).body

    def test_nobody_deletes_someone_elses(self, api_client, seeker_token, second_seeker_token, roster):
        tid, mid = _open_thread(api_client, seeker_token, second_seeker_token)
        out = api_client.post(f"/v1/dms/threads/{tid}/messages/{mid}/delete/", **auth(second_seeker_token))
        assert out.status_code == 403

    def test_deleting_the_last_message_changes_the_preview(self, api_client, seeker_token, second_seeker_token, roster):
        tid, _ = _open_thread(api_client, seeker_token, second_seeker_token)
        last = api_client.post(f"/v1/dms/threads/{tid}/send/", {"body": "secret"}, format="json", **auth(seeker_token)).json()["id"]
        api_client.post(f"/v1/dms/threads/{tid}/messages/{last}/delete/", **auth(seeker_token))
        row = api_client.get("/v1/dms/threads/", **auth(second_seeker_token)).json()["items"][0]
        assert row["last_preview"] == "This message was deleted"


@pytest.mark.django_db
class TestDeleteChat:
    def test_clearing_hides_it_for_me_only_until_a_new_message(
        self, api_client, seeker_token, second_seeker_token, roster
    ):
        tid, _ = _open_thread(api_client, seeker_token, second_seeker_token)
        assert api_client.post(f"/v1/dms/threads/{tid}/clear/", **auth(seeker_token)).status_code == 200
        assert api_client.get("/v1/dms/threads/", **auth(seeker_token)).json()["items"] == []
        assert _items(api_client, seeker_token, tid) == []
        # The other side still has everything.
        assert len(_items(api_client, second_seeker_token, tid)) == 2
        # A new message brings it back, from that message on.
        api_client.post(f"/v1/dms/threads/{tid}/send/", {"body": "Aaj aaoge?"}, format="json", **auth(second_seeker_token))
        mine = api_client.get("/v1/dms/threads/", **auth(seeker_token)).json()
        assert len(mine["items"]) == 1 and mine["items"][0]["unread"] == 1 and mine["unread"] == 1
        assert [m["body"] for m in _items(api_client, seeker_token, tid)] == ["Aaj aaoge?"]
