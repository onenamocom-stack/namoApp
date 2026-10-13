"""Person-to-person messages, `/v1/dms/` (13 Oct 2026, docs/06 Phase 15b).

The done-condition: a blocked person's message is refused by the server;
a paid consultation still meters exactly as before (test_chat* unchanged).
"""

import pytest
from django.utils import timezone

from apps.dms.models import DmThread
from apps.notifications.models import Notification

from .conftest import make_claims
from .test_content import (  # noqa: F401 — fixtures are used by name
    ADMIN,
    APPROVED,
    SECOND_SEEKER,
    SEEKER,
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
def admin_person_token(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims(sub=ADMIN))


def _start(c, token, to):
    return c.post("/v1/dms/start/", {"to": to}, format="json", **auth(token))


def _send(c, token, tid, body):
    return c.post(f"/v1/dms/threads/{tid}/send/", {"body": body}, format="json", **auth(token))


def _follow(c, token, who, kind="profile"):
    c.post("/v1/reactions/", {"target_type": kind, "target_id": who, "kind": "follow"}, format="json", **auth(token))


def _box(c, token, which="inbox"):
    return c.get(f"/v1/dms/threads/?box={which}", **auth(token)).json()


@pytest.mark.django_db
class TestRequests:
    def test_a_stranger_gets_one_message_until_accepted(
        self, api_client, seeker_token, second_seeker_token, roster
    ):
        tid = _start(api_client, seeker_token, SECOND_SEEKER).json()["id"]
        assert _send(api_client, seeker_token, tid, "Jai Jinendra").status_code == 201
        second = _send(api_client, seeker_token, tid, "hello?")
        assert second.status_code == 403
        assert "not accepted" in second.json()["message"]
        # It waits in their Requests, not their inbox.
        assert [r["id"] for r in _box(api_client, second_seeker_token, "requests")["items"]] == [tid]
        assert _box(api_client, second_seeker_token)["items"] == []
        # Their reply accepts it; both may write.
        assert _send(api_client, second_seeker_token, tid, "Jai Jinendra!").status_code == 201
        assert _send(api_client, seeker_token, tid, "kaise ho").status_code == 201
        assert _box(api_client, second_seeker_token)["items"][0]["state"] == "open"

    def test_someone_who_follows_you_skips_the_request(
        self, api_client, seeker_token, second_seeker_token, roster
    ):
        _follow(api_client, second_seeker_token, SEEKER)
        tid = _start(api_client, seeker_token, SECOND_SEEKER).json()["id"]
        _send(api_client, seeker_token, tid, "one")
        assert _send(api_client, seeker_token, tid, "two").status_code == 201

    def test_declined_means_no_more(self, api_client, seeker_token, second_seeker_token, roster):
        tid = _start(api_client, seeker_token, SECOND_SEEKER).json()["id"]
        _send(api_client, seeker_token, tid, "hi")
        api_client.post(f"/v1/dms/threads/{tid}/decline/", **auth(second_seeker_token))
        assert _box(api_client, second_seeker_token, "requests")["items"] == []
        refused = _send(api_client, seeker_token, tid, "again")
        assert refused.status_code == 403 and "declined" in refused.json()["message"]


@pytest.mark.django_db
class TestBlocks:
    def test_a_blocked_persons_message_is_refused_both_ways(
        self, api_client, seeker_token, second_seeker_token, roster
    ):
        _follow(api_client, second_seeker_token, SEEKER)
        tid = _start(api_client, seeker_token, SECOND_SEEKER).json()["id"]
        _send(api_client, seeker_token, tid, "hi")
        api_client.post("/v1/dms/block/", {"profile_id": SEEKER}, format="json", **auth(second_seeker_token))
        assert _send(api_client, seeker_token, tid, "hello").status_code == 403
        assert _send(api_client, second_seeker_token, tid, "bye").status_code == 403
        api_client.delete("/v1/dms/block/", {"profile_id": SEEKER}, format="json", **auth(second_seeker_token))
        assert _send(api_client, seeker_token, tid, "sorry").status_code == 201

    def test_a_moderated_account_cannot_send(self, api_client, seeker_token, roster):
        from apps.profiles.models import Profile

        tid = _start(api_client, seeker_token, SECOND_SEEKER).json()["id"]
        Profile.objects.filter(id=SEEKER).update(blocked_at=timezone.now())
        assert _send(api_client, seeker_token, tid, "hi").status_code == 403

    def test_a_stranger_cannot_read_or_write(
        self, api_client, seeker_token, admin_person_token, roster
    ):
        tid = _start(api_client, seeker_token, SECOND_SEEKER).json()["id"]
        assert api_client.get(f"/v1/dms/threads/{tid}/messages/", **auth(admin_person_token)).status_code == 404
        assert _send(api_client, admin_person_token, tid, "hi").status_code == 404


@pytest.mark.django_db
class TestConsultantsKeepTheirPaidChat:
    def test_a_seeker_cannot_start_a_free_message_to_a_consultant(
        self, api_client, seeker_token, roster
    ):
        refused = _start(api_client, seeker_token, APPROVED)
        assert refused.status_code == 403
        assert "paid chat" in refused.json()["message"]

    def test_a_consultant_may_start_one(self, api_client, consultant_token, seeker_token, roster):
        tid = _start(api_client, consultant_token, SEEKER).json()["id"]
        assert _send(api_client, consultant_token, tid, "Thank you for the session").status_code == 201
        assert _send(api_client, seeker_token, tid, "Thank you!").status_code == 201

    def test_a_consultant_who_follows_you_can_be_written_to(
        self, api_client, consultant_token, seeker_token, roster
    ):
        _follow(api_client, consultant_token, SEEKER)
        assert _start(api_client, seeker_token, APPROVED).status_code == 200


@pytest.mark.django_db
class TestOne:
    def test_one_conversation_per_pair_whoever_starts(
        self, api_client, seeker_token, second_seeker_token, roster
    ):
        a = _start(api_client, seeker_token, SECOND_SEEKER).json()["id"]
        b = _start(api_client, second_seeker_token, SEEKER).json()["id"]
        assert a == b and DmThread.objects.count() == 1

    def test_the_other_person_is_told_once_an_hour_without_the_words(
        self, api_client, seeker_token, second_seeker_token, roster
    ):
        _follow(api_client, second_seeker_token, SEEKER)
        tid = _start(api_client, seeker_token, SECOND_SEEKER).json()["id"]
        for text in ("one", "two", "three"):
            _send(api_client, seeker_token, tid, text)
        [alert] = Notification.objects.filter(profile_id=SECOND_SEEKER, kind="dm.message")
        assert alert.title == "Tara Verma sent you a message"
        assert alert.body is None

    def test_read_clears_unread(self, api_client, seeker_token, second_seeker_token, roster):
        _follow(api_client, second_seeker_token, SEEKER)
        tid = _start(api_client, seeker_token, SECOND_SEEKER).json()["id"]
        _send(api_client, seeker_token, tid, "one")
        assert _box(api_client, second_seeker_token)["unread"] == 1
        api_client.post(f"/v1/dms/threads/{tid}/read/", **auth(second_seeker_token))
        assert _box(api_client, second_seeker_token)["unread"] == 0

    def test_you_cannot_message_yourself(self, api_client, seeker_token, roster):
        assert _start(api_client, seeker_token, SEEKER).status_code == 400
