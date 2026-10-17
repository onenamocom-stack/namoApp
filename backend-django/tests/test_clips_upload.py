"""The video pipeline's upload half (17 Oct 2026, Rahul's spec): init with
hash, size and length; parts in 5 MB; resume; complete; the duplicate
link; the daily limit; the 24-hour sweep. Storage is the local fake."""

import uuid

import pytest
from django.utils import timezone

from apps.clips import services
from apps.clips.models import Video
from apps.clips.storage import LocalStore, part_count
from apps.profiles.models import Profile

from .conftest import OTHER_USER, TEST_USER, make_claims
from .test_astro import auth

HASH = "a" * 64
MB = 1024 * 1024


@pytest.fixture(autouse=True)
def local(settings):
    settings.MEDIA_PROVIDER = "local"
    LocalStore.uploads.clear()


@pytest.fixture
def me(db):
    Profile.objects.create(id=TEST_USER, phone="9000000001", name="Tara Verma")
    return TEST_USER


@pytest.fixture
def token(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims())


def _init(client, token, **over):
    body = {"sha256": HASH, "size_bytes": 12 * MB, "duration_s": 42.5, **over}
    return client.post("/v1/videos/init/", body, format="json", **auth(token))


def _arrive(upload_id, n, size):
    LocalStore.uploads[upload_id]["parts"] = {i: f'"etag{i}"' for i in range(1, n + 1)}
    LocalStore.uploads[upload_id]["size"] = size


@pytest.mark.django_db
class TestUpload:
    def test_init_gives_a_url_per_five_mb_part(self, api_client, token, me):
        got = _init(api_client, token).json()
        assert got["ok"] and got["status"] == "uploading" and got["duplicate"] is False
        assert got["parts"] == 3 == len(got["urls"]) == part_count(12 * MB)
        assert [u["part_number"] for u in got["urls"]] == [1, 2, 3]
        row = Video.objects.get()
        assert str(row.user_id) == TEST_USER and row.upload_key == f"uploads/{row.id}/source"

    def test_limits_on_length_size_and_type(self, api_client, token, me):
        assert _init(api_client, token, duration_s=91.5).json()["reason"] == "too_long"
        assert _init(api_client, token, size_bytes=31 * MB).json()["reason"] == "too_big"
        assert _init(api_client, token, size_bytes=120 * MB, original=True).status_code == 201
        assert _init(api_client, token, sha256="a" * 64, size_bytes=151 * MB, original=True).json()["reason"] == "too_big"
        assert _init(api_client, token, mime="image/png").json()["reason"] == "bad_type"
        assert _init(api_client, token, sha256="nothex").json()["reason"] == "bad_hash"

    def test_resume_then_complete_hands_it_to_the_worker(self, api_client, token, me):
        got = _init(api_client, token).json()
        row = Video.objects.get(pk=got["id"])
        LocalStore.uploads[row.upload_id]["parts"] = {1: '"e1"'}
        resume = api_client.get(f"/v1/videos/{row.id}/parts/", **auth(token)).json()
        assert resume["done"] == [1] and [u["part_number"] for u in resume["urls"]] == [2, 3]
        early = api_client.post(f"/v1/videos/{row.id}/complete/", {}, format="json", **auth(token))
        assert early.status_code == 409 and early.json()["reason"] == "parts_missing"
        _arrive(row.upload_id, 3, 12 * MB)
        done = api_client.post(f"/v1/videos/{row.id}/complete/", {}, format="json", **auth(token)).json()
        assert done["status"] == "processing"
        row.refresh_from_db()
        assert row.completed_at is not None

    def test_a_broken_upload_is_dropped(self, api_client, token, me):
        row = Video.objects.get(pk=_init(api_client, token).json()["id"])
        _arrive(row.upload_id, 3, 11 * MB)
        got = api_client.post(f"/v1/videos/{row.id}/complete/", {}, format="json", **auth(token))
        assert got.status_code == 409 and got.json()["reason"] == "size_mismatch"
        row.refresh_from_db()
        assert row.status == "deleted"

    def test_only_the_owner_sees_or_finishes_it(self, api_client, token, me, sign_hs256):
        row = Video.objects.get(pk=_init(api_client, token).json()["id"])
        other = sign_hs256(claims=make_claims(sub=OTHER_USER))
        assert api_client.get(f"/v1/videos/{row.id}/", **auth(other)).status_code == 404
        assert api_client.post(f"/v1/videos/{row.id}/complete/", {}, format="json", **auth(other)).status_code == 404
        assert api_client.post("/v1/videos/init/", {}, format="json").status_code == 401


@pytest.mark.django_db
class TestGuardrails:
    def test_the_same_file_links_instead_of_uploading(self, api_client, token, me, sign_hs256):
        first = Video.objects.create(user_id=OTHER_USER, status="live", source_hash=HASH, duration_s=40,
                                     size_bytes=12 * MB, hls_path="v/x/master.m3u8", thumb_path="v/x/thumb.webp")
        got = _init(api_client, token).json()
        assert got["duplicate"] is True and got["urls"] == [] and got["status"] == "live"
        copy = Video.objects.get(pk=got["id"])
        assert copy.source_video_id == first.id and copy.hls_path == first.hls_path
        detail = api_client.get(f"/v1/videos/{copy.id}/", **auth(token)).json()
        assert detail["hls_url"].endswith("v/x/master.m3u8")

    def test_ten_a_day_fifty_for_a_creator(self, api_client, token, me):
        for i in range(10):
            assert _init(api_client, token, sha256=f"{i:064x}").status_code == 201
        refused = _init(api_client, token, sha256="f" * 64)
        assert refused.status_code == 429 and refused.json()["reason"] == "daily_limit"
        Profile.objects.filter(pk=TEST_USER).update(influencer=True)
        assert services.daily_limit(TEST_USER) == 50
        assert _init(api_client, token, sha256="f" * 64).status_code == 201

    def test_a_blocked_account_cannot_start(self, api_client, token, me):
        Profile.objects.filter(pk=TEST_USER).update(blocked_at=timezone.now())
        assert _init(api_client, token).status_code == 403

    def test_unfinished_uploads_go_after_a_day(self, api_client, token, me):
        row = Video.objects.get(pk=_init(api_client, token).json()["id"])
        assert services.sweep_stale() == 0
        assert services.sweep_stale(timezone.now() + timezone.timedelta(hours=25)) == 1
        row.refresh_from_db()
        assert row.status == "deleted" and row.upload_id not in LocalStore.uploads
