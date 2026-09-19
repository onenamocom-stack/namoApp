import json
import threading

import pytest
from django.db import connection
from django.test import Client

from apps.core.models import IdempotencyKey
from apps.media.models import MediaAsset

from .conftest import TEST_USER, make_claims

PRE_SIGN_BODY = {"kind": "image", "filename": "photo.jpg", "size_bytes": 1024, "mime": "image/jpeg"}
KEY = "idem-key-123"


@pytest.fixture
def idem_headers(sign_hs256, hs256_mode):
    token = sign_hs256(claims=make_claims())
    return {
        "HTTP_AUTHORIZATION": f"Bearer {token}",
        "HTTP_IDEMPOTENCY_KEY": KEY,
    }


@pytest.mark.django_db
class TestIdempotency:
    def test_first_request_executes_once_and_stores(self, api_client, idem_headers):
        response = api_client.post(
            "/v1/media/presign/", data=PRE_SIGN_BODY, format="json", **idem_headers
        )
        assert response.status_code == 201
        assert MediaAsset.objects.count() == 1
        record = IdempotencyKey.objects.get(key=KEY, user_id=TEST_USER)
        assert record.status_code == 201
        assert record.response_body["asset_id"] == response.json()["asset_id"]
        assert response["Idempotency-Replayed"] == "false"

    def test_replay_returns_identical_response_without_executing(
        self, api_client, idem_headers
    ):
        first = api_client.post("/v1/media/presign/", data=PRE_SIGN_BODY, format="json", **idem_headers)
        second = api_client.post("/v1/media/presign/", data=PRE_SIGN_BODY, format="json", **idem_headers)
        assert second.status_code == first.status_code == 201
        assert second.json() == first.json()
        assert second["Idempotency-Replayed"] == "true"
        assert MediaAsset.objects.count() == 1  # view did not run again

    def test_different_key_executes_again(self, api_client, idem_headers):
        api_client.post("/v1/media/presign/", data=PRE_SIGN_BODY, format="json", **idem_headers)
        other = dict(idem_headers, HTTP_IDEMPOTENCY_KEY="another-key")
        response = api_client.post("/v1/media/presign/", data=PRE_SIGN_BODY, format="json", **other)
        assert response.status_code == 201
        assert MediaAsset.objects.count() == 2

    def test_absent_key_passes_through(self, api_client, hs256_mode, sign_hs256):
        headers = {"HTTP_AUTHORIZATION": f"Bearer {sign_hs256(claims=make_claims())}"}
        response = api_client.post("/v1/media/presign/", data=PRE_SIGN_BODY, format="json", **headers)
        assert response.status_code == 201
        assert IdempotencyKey.objects.count() == 0

    def test_non_2xx_not_stored_and_key_reusable(
        self, api_client, idem_headers
    ):
        bad = dict(PRE_SIGN_BODY, mime="application/x-msdownload")
        refused = api_client.post("/v1/media/presign/", data=bad, format="json", **idem_headers)
        assert refused.status_code == 400
        assert IdempotencyKey.objects.count() == 0  # marker cleared

        # Same key, now valid: must execute (no replay of the refusal).
        ok = api_client.post("/v1/media/presign/", data=PRE_SIGN_BODY, format="json", **idem_headers)
        assert ok.status_code == 201
        assert MediaAsset.objects.count() == 1

    def test_in_flight_marker_gets_409_not_a_lie(
        self, api_client, idem_headers, hs256_mode
    ):
        IdempotencyKey.objects.create(key=KEY, user_id=TEST_USER, method="POST", path="/v1/media/presign/")
        response = api_client.post("/v1/media/presign/", data=PRE_SIGN_BODY, format="json", **idem_headers)
        assert response.status_code == 409
        assert response.json()["reason"] == "request_in_flight"
        assert MediaAsset.objects.count() == 0

    def test_unauthenticated_key_passes_through_to_401(
        self, api_client, hs256_mode, sign_hs256
    ):
        # A valid-shaped token for user A, but the view refuses it (wrong
        # secret): no idempotency row may survive.
        token = sign_hs256(claims=make_claims(), secret="not-the-server-secret")
        response = api_client.post(
            "/v1/media/presign/",
            data=PRE_SIGN_BODY,
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_IDEMPOTENCY_KEY=KEY,
        )
        assert response.status_code == 401
        assert IdempotencyKey.objects.count() == 0

    def test_keys_are_scoped_per_user(self, api_client, idem_headers, sign_hs256, hs256_mode):
        api_client.post("/v1/media/presign/", data=PRE_SIGN_BODY, format="json", **idem_headers)
        other_token = sign_hs256(claims=make_claims(sub="22222222-2222-2222-2222-222222222222"))
        response = api_client.post(
            "/v1/media/presign/",
            data=PRE_SIGN_BODY,
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {other_token}",
            HTTP_IDEMPOTENCY_KEY=KEY,
        )
        assert response.status_code == 201
        assert MediaAsset.objects.count() == 2
        assert IdempotencyKey.objects.filter(key=KEY).count() == 2


@pytest.mark.django_db(transaction=True)
class TestIdempotencyRace:
    """Two concurrent first-requests with the same key: the unique
    constraint backstops the middleware — exactly one view execution, one
    stored response; the loser reads the winner (replay or in-flight 409)."""

    def test_concurrent_first_requests_execute_once(self, hs256_mode, sign_hs256):
        token = sign_hs256(claims=make_claims())
        barrier = threading.Barrier(2)
        results = []

        def fire():
            connection.close()  # each thread gets its own connection
            client = Client()
            barrier.wait(timeout=10)
            response = client.post(
                "/v1/media/presign/",
                data=json.dumps(PRE_SIGN_BODY),
                content_type="application/json",
                HTTP_AUTHORIZATION=f"Bearer {token}",
                HTTP_IDEMPOTENCY_KEY=KEY,
            )
            results.append(response)

        threads = [threading.Thread(target=fire) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        assert all(not t.is_alive() for t in threads)

        assert MediaAsset.objects.count() == 1
        assert IdempotencyKey.objects.filter(key=KEY, user_id=TEST_USER).count() == 1
        statuses = sorted(r.status_code for r in results)
        assert statuses == [201, 201] or statuses == [201, 409]
        ok_bodies = [r.json() for r in results if r.status_code == 201]
        assert len({json.dumps(b, sort_keys=True) for b in ok_bodies}) == 1
