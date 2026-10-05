"""Web push for incoming calls (6 Oct 2026). Never talks to a push service."""

import uuid
from unittest import mock

import pytest
from rest_framework.test import APIClient

from apps.notifications import push
from apps.notifications.models import PushSubscription
from tests.conftest import TEST_USER, make_claims

ME = uuid.UUID(TEST_USER)
SUB = {"endpoint": "https://fcm.googleapis.com/fcm/send/abc123",
       "keys": {"p256dh": "BPkey", "auth": "authkey"}}


@pytest.fixture
def me(sign_hs256, hs256_mode):
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {sign_hs256(make_claims())}")
    return c


@pytest.fixture
def keys(settings):
    settings.VAPID_PUBLIC_KEY = "public"
    settings.VAPID_PRIVATE_KEY = "private"


@pytest.mark.django_db
class TestSubscribing:
    def test_a_phone_registers_once_however_often_it_asks(self, me):
        for _ in range(2):
            assert me.post("/v1/notifications/push/subscribe/", SUB, format="json").json()["ok"]
        assert PushSubscription.objects.filter(profile_id=ME).count() == 1

    def test_missing_keys_are_refused(self, me):
        r = me.post("/v1/notifications/push/subscribe/",
                    {"endpoint": SUB["endpoint"], "keys": {"p256dh": "x"}}, format="json")
        assert r.status_code == 400

    def test_unsubscribe_removes_only_mine(self, me):
        PushSubscription.objects.create(profile_id=uuid.uuid4(), endpoint="https://x/other",
                                        p256dh="a", auth="b")
        me.post("/v1/notifications/push/subscribe/", SUB, format="json")
        me.post("/v1/notifications/push/unsubscribe/", {"endpoint": "https://x/other"}, format="json")
        assert PushSubscription.objects.count() == 2
        me.post("/v1/notifications/push/unsubscribe/", {"endpoint": SUB["endpoint"]}, format="json")
        assert PushSubscription.objects.count() == 1

    def test_the_key_is_served(self, me, keys):
        assert me.get("/v1/notifications/push/key/").json() == {"key": "public"}

    def test_signed_out_cannot_register(self):
        assert APIClient().post("/v1/notifications/push/subscribe/", SUB,
                                format="json").status_code in (401, 403)


@pytest.mark.django_db
class TestSending:
    def _sub(self):
        return PushSubscription.objects.create(profile_id=ME, endpoint=SUB["endpoint"],
                                               p256dh="a", auth="b")

    def test_without_keys_nothing_is_sent(self, settings):
        settings.VAPID_PRIVATE_KEY = ""
        self._sub()
        with mock.patch("pywebpush.webpush") as wp:
            assert push.send(ME, {"x": 1}) == 0
        wp.assert_not_called()

    def test_a_push_goes_to_every_phone(self, keys):
        self._sub()
        PushSubscription.objects.create(profile_id=ME, endpoint="https://x/2", p256dh="a", auth="b")
        with mock.patch("pywebpush.webpush") as wp:
            assert push.send(ME, {"type": "incoming"}) == 2
        assert wp.call_args.kwargs["ttl"] == push.TTL_SECONDS

    def test_a_gone_phone_is_forgotten(self, keys):
        from pywebpush import WebPushException

        self._sub()
        gone = WebPushException("gone", response=mock.Mock(status_code=410))
        with mock.patch("pywebpush.webpush", side_effect=gone):
            assert push.send(ME, {"x": 1}) == 0
        assert not PushSubscription.objects.exists()

    def test_any_other_failure_never_raises(self, keys):
        self._sub()
        with mock.patch("pywebpush.webpush", side_effect=RuntimeError("down")):
            assert push.send(ME, {"x": 1}) == 0
        assert PushSubscription.objects.exists()
