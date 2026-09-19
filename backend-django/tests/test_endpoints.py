import time
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.core.pagination import keyset_page
from apps.media.models import MediaAsset

from .conftest import make_claims


@pytest.mark.django_db
class TestHealth:
    def test_health_ok_and_allowany(self, api_client):
        response = api_client.get("/v1/health/")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
        assert "version" in response.json()

    def test_every_response_carries_request_id(self, api_client):
        response = api_client.get("/v1/health/")
        request_id = response["X-Request-Id"]
        assert len(request_id) == 36  # uuid
        assert response["X-Request-Id"] == request_id


@pytest.mark.django_db
class TestMe:
    def test_me_requires_auth(self, api_client):
        response = api_client.get("/v1/me/")
        assert response.status_code == 401
        assert response.json()["reason"] == "unauthenticated"

    def test_me_echoes_claims(self, api_client, hs256_mode, sign_hs256, auth_headers):
        claims = make_claims(phone="+919999900002")
        response = api_client.get("/v1/me/", **auth_headers(sign_hs256(claims=claims)))
        assert response.status_code == 200
        payload = response.json()
        assert payload["phone"] == "+919999900002"
        assert payload["claims"]["iss"] == claims["iss"]


@pytest.mark.django_db
class TestRateLimiting:
    def test_anon_burst_limited(self, api_client, monkeypatch):
        from django.core.cache import cache

        cache.clear()  # other tests may have spent this endpoint's budget
        # DRF binds THROTTLE_RATES as a class attribute at import time, so
        # override_settings(REST_FRAMEWORK=...) cannot change it — patch the
        # class attribute itself.
        monkeypatch.setattr(
            "rest_framework.throttling.SimpleRateThrottle.THROTTLE_RATES",
            {"anon": "3/minute", "user": "5/minute"},
        )
        for _ in range(3):
            assert api_client.get("/v1/health/").status_code == 200
        response = api_client.get("/v1/health/")
        assert response.status_code == 429
        assert response.json()["reason"] == "throttled"


@pytest.mark.django_db
class TestKeysetPagination:
    def _seed(self, count=25):
        base = timezone.now() - timedelta(seconds=count)
        assets = []
        for i in range(count):
            assets.append(
                MediaAsset(
                    owner="00000000-0000-0000-0000-000000000000",
                    kind="image",
                    bucket_key=f"images/test/{i}.jpg",
                    mime="image/jpeg",
                    size_bytes=100,
                    created_at=base + timedelta(seconds=i),
                )
            )
        MediaAsset.objects.bulk_create(assets)

    def test_pages_are_newest_first_and_non_overlapping(self):
        self._seed()
        rows, next_id = keyset_page(MediaAsset.objects.all(), limit=10)
        assert len(rows) == 10
        created = [r.created_at for r in rows]
        assert created == sorted(created, reverse=True)

        rows2, next_id2 = keyset_page(MediaAsset.objects.all(), after_id=next_id, limit=10)
        assert {r.id for r in rows}.isdisjoint({r.id for r in rows2})
        assert rows2[0].created_at < rows[-1].created_at

        rows3, next_id3 = keyset_page(MediaAsset.objects.all(), after_id=next_id2, limit=10)
        assert len(rows3) == 5
        assert next_id3 is None  # short page: no further pages

    def test_full_walk_covers_every_row_once(self):
        self._seed(23)
        seen = []
        after = None
        while True:
            rows, after = keyset_page(MediaAsset.objects.all(), after_id=after, limit=7)
            seen.extend(rows)
            if after is None:
                break
        assert len(seen) == 23
        assert len({r.id for r in seen}) == 23

    def test_bad_anchor_returns_from_start(self):
        self._seed(5)
        rows, _ = keyset_page(MediaAsset.objects.all(), after_id="00000000-0000-0000-0000-000000000000", limit=3)
        assert len(rows) == 3
