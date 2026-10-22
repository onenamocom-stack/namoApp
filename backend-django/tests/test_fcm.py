"""The Android app's FCM ring (22 Oct 2026). Never talks to Google."""

import uuid
from types import SimpleNamespace
from unittest import mock

import pytest
from rest_framework.test import APIClient

from apps.notifications import fcm, push
from apps.notifications.models import FcmToken
from tests.conftest import TEST_USER, make_claims

ME = uuid.UUID(TEST_USER)


@pytest.fixture
def me(sign_hs256, hs256_mode):
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {sign_hs256(make_claims())}")
    return c


@pytest.fixture
def google():
    """The metadata server and FCM, stood in for."""
    fcm._token.update(value="", until=0.0)
    meta = SimpleNamespace(json=lambda: {"access_token": "tok", "expires_in": 3600}, raise_for_status=lambda: None)
    with mock.patch.object(fcm.requests, "get", return_value=meta) as get, \
         mock.patch.object(fcm.requests, "post") as post:
        post.return_value = SimpleNamespace(status_code=200, text="{}")
        yield SimpleNamespace(get=get, post=post)


@pytest.mark.django_db
class TestRegistering:
    def test_an_install_registers_once_and_follows_the_signed_in_person(self, me):
        for _ in range(2):
            assert me.post("/v1/notifications/fcm/", {"token": "abc"}, format="json").json()["ok"]
        assert FcmToken.objects.get(token="abc").profile_id == ME
        other = uuid.uuid4()
        fcm.register(other, "abc")
        assert FcmToken.objects.get(token="abc").profile_id == other
        assert FcmToken.objects.count() == 1

    def test_an_empty_token_is_refused(self, me):
        assert me.post("/v1/notifications/fcm/", {"token": " "}, format="json").status_code == 400

    def test_remove_takes_only_mine(self, me):
        FcmToken.objects.create(profile_id=uuid.uuid4(), token="theirs")
        me.post("/v1/notifications/fcm/", {"token": "mine"}, format="json")
        me.post("/v1/notifications/fcm/remove/", {"token": "theirs"}, format="json")
        me.post("/v1/notifications/fcm/remove/", {"token": "mine"}, format="json")
        assert list(FcmToken.objects.values_list("token", flat=True)) == ["theirs"]

    def test_signed_out_cannot_register(self):
        assert APIClient().post("/v1/notifications/fcm/", {"token": "x"}, format="json").status_code in (401, 403)


@pytest.mark.django_db
class TestSending:
    def test_a_high_priority_data_message_to_each_install(self, google):
        FcmToken.objects.create(profile_id=ME, token="one")
        FcmToken.objects.create(profile_id=ME, token="two")
        assert fcm.send(ME, {"type": "incoming", "n": 5}) == 2
        body = google.post.call_args.kwargs["json"]["message"]
        assert body["android"] == {"priority": "HIGH", "ttl": "45s"}
        assert body["data"] == {"type": "incoming", "n": "5"}  # strings only
        assert google.post.call_args.kwargs["headers"] == {"Authorization": "Bearer tok"}
        assert google.get.call_count == 1  # the access token is kept

    def test_an_unregistered_install_is_forgotten(self, google):
        FcmToken.objects.create(profile_id=ME, token="gone")
        google.post.return_value = SimpleNamespace(status_code=404, text='{"error":{"status":"NOT_FOUND"}}')
        assert fcm.send(ME, {"type": "x"}) == 0
        assert not FcmToken.objects.exists()

    def test_off_cloud_run_nothing_is_sent_and_nothing_breaks(self):
        FcmToken.objects.create(profile_id=ME, token="one")
        fcm._token.update(value="", until=0.0)
        with mock.patch.object(fcm.requests, "get", side_effect=OSError("no metadata")):
            assert fcm.send(ME, {"type": "x"}) == 0

    def test_no_install_no_request(self, google):
        assert fcm.send(ME, {"type": "x"}) == 0
        assert not google.get.called


@pytest.mark.django_db
class TestTheRing:
    def test_a_call_rings_the_pros_app_with_where_to_open(self, google):
        pro = uuid.uuid4()
        FcmToken.objects.create(profile_id=pro, token="pro-phone")
        session = SimpleNamespace(id=uuid.uuid4(), consultant_id=pro, seeker_id=ME, mode="video",
                                  audio_only=False, rate_paise=3000)
        push.ring(session, "Rahul")
        data = google.post.call_args.kwargs["json"]["message"]["data"]
        assert data["type"] == "incoming" and data["title"] == "Rahul is calling"
        assert data["open"] == f"/desk/ring/{session.id}"

    def test_the_seeker_hears_when_the_pro_takes_a_call(self, google):
        FcmToken.objects.create(profile_id=ME, token="seeker-phone")
        session = SimpleNamespace(id=uuid.uuid4(), consultant_id=uuid.uuid4(), seeker_id=ME, mode="audio",
                                  audio_only=True, rate_paise=3000)
        push.accepted(session, "Pandit Ji")
        data = google.post.call_args.kwargs["json"]["message"]["data"]
        assert data["type"] == "connecting" and data["title"] == "Pandit Ji is connecting your call"
        assert data["open"] == f"/call/{session.id}"
