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


class _Posted:
    def __init__(self, status=202):
        self.calls, self.status = [], status

    def __call__(self, url, json=None, timeout=None, headers=None):
        self.calls.append({"url": url, "json": json, "headers": headers})
        return type("R", (), {"status_code": self.status})()


def _processing(api_client, token):
    row = Video.objects.get(pk=_init(api_client, token).json()["id"])
    _arrive(row.upload_id, 3, 12 * MB)
    return row


@pytest.mark.django_db
class TestWorker:
    @pytest.fixture(autouse=True)
    def worker(self, settings, monkeypatch):
        settings.VIDEO_WORKER_URL, settings.VIDEO_WORKER_TOKEN = "https://worker.test", "wt"
        settings.R2_BUCKET = "namo-media"
        self.post = _Posted()
        monkeypatch.setattr(services.requests, "post", self.post)

    def _done(self, api_client, body, token="wt"):
        return api_client.post("/v1/videos/worker/done/", body, format="json", HTTP_X_WORKER_TOKEN=token)

    def test_complete_hands_the_job_to_the_worker(self, api_client, token, me):
        row = _processing(api_client, token)
        api_client.post(f"/v1/videos/{row.id}/complete/", {}, format="json", **auth(token))
        [call] = self.post.calls
        assert call["url"] == "https://worker.test/process" and call["headers"]["x-worker-token"] == "wt"
        assert call["json"]["source"]["key"] == row.upload_key
        assert call["json"]["output"] == {"bucket": "namo-media", "prefix": f"v/{row.id}/"}
        row.refresh_from_db()
        assert row.attempts == 1 and row.claimed_at is not None

    def test_the_answer_fills_the_video_and_its_duplicates(self, api_client, token, me):
        row = _processing(api_client, token)
        api_client.post(f"/v1/videos/{row.id}/complete/", {}, format="json", **auth(token))
        twin = Video.objects.get(pk=_init(api_client, token).json()["id"])
        assert twin.source_video_id == row.id and twin.status == "processing"
        body = {"video_id": str(row.id), "ok": True, "hls_path": f"v/{row.id}/master.m3u8",
                "thumb_path": f"v/{row.id}/thumb.webp", "duration_s": 41.9, "width": 720, "height": 1280}
        assert self._done(api_client, body, token="wrong").status_code == 401
        assert self._done(api_client, body).json()["changed"] is True
        for v in (row, twin):
            v.refresh_from_db()
            assert v.status == "in_review" and v.hls_path.endswith("master.m3u8") and v.height == 1280
        # A second answer for the same video changes nothing.
        assert self._done(api_client, body).json()["changed"] is False
        got = api_client.get(f"/v1/videos/{twin.id}/", **auth(token)).json()
        assert got["thumb_url"].endswith("thumb.webp") and got["width"] == 720

    def test_a_refused_file_is_deleted_with_its_reason(self, api_client, token, me):
        row = _processing(api_client, token)
        api_client.post(f"/v1/videos/{row.id}/complete/", {}, format="json", **auth(token))
        self._done(api_client, {"video_id": str(row.id), "ok": False, "final": True,
                                "reason": "too_long", "error": "too_long: 95.0s"})
        got = api_client.get(f"/v1/videos/{row.id}/", **auth(token)).json()
        assert got["status"] == "deleted" and got["reason"] == "too_long"

    def test_the_sweep_sends_it_again_then_gives_up(self, api_client, token, me):
        row = _processing(api_client, token)
        api_client.post(f"/v1/videos/{row.id}/complete/", {}, format="json", **auth(token))
        self._done(api_client, {"video_id": str(row.id), "ok": False, "final": False, "error": "disk full"})
        later = timezone.now() + timezone.timedelta(minutes=2)
        assert services.redispatch(later) == 1 and len(self.post.calls) == 2
        # Claimed again: nothing more until it is overdue.
        assert services.redispatch(later) == 0
        services.redispatch(later + timezone.timedelta(minutes=11))
        row.refresh_from_db()
        assert row.attempts == 3 and row.status == "processing"
        services.redispatch(later + timezone.timedelta(minutes=30))
        row.refresh_from_db()
        assert row.status == "deleted" and row.error.startswith("failed:")

    def test_without_a_worker_nothing_is_retried(self, api_client, token, me, settings):
        settings.VIDEO_WORKER_URL = ""
        row = _processing(api_client, token)
        api_client.post(f"/v1/videos/{row.id}/complete/", {}, format="json", **auth(token))
        assert self.post.calls == [] and services.redispatch(timezone.now() + timezone.timedelta(hours=2)) == 0
        row.refresh_from_db()
        assert row.status == "processing" and row.attempts == 0


CLEAR = {"engine": "safesearch", "images": 1, "adult": "VERY_UNLIKELY", "violence": "UNLIKELY",
         "racy": "UNLIKELY", "medical": "UNLIKELY", "spoof": "VERY_UNLIKELY", "sheets": ["v/x/sheet_1.jpg"]}


class TestJudge:
    """Part E's rule (17 Oct 2026): SafeSearch's worst likelihood over the
    sheets to clear, doubt or violation."""

    def test_the_three_outcomes(self):
        from apps.clips import moderation as m

        assert m.judge(CLEAR) == m.CLEAR
        assert m.judge({**CLEAR, "adult": "VERY_LIKELY"}) == m.VIOLATION
        assert m.judge({**CLEAR, "violence": "VERY_LIKELY"}) == m.VIOLATION
        assert m.judge({**CLEAR, "adult": "POSSIBLE"}) == m.DOUBT
        assert m.judge({**CLEAR, "racy": "LIKELY"}) == m.DOUBT
        # Fire in an aarti reads as violence POSSIBLE: not enough to hold it.
        assert m.judge({**CLEAR, "violence": "POSSIBLE"}) == m.CLEAR

    def test_no_verdict_is_a_doubt(self):
        from apps.clips import moderation as m

        assert m.judge({}) == m.judge(None) == m.DOUBT
        assert m.judge({"engine": "safesearch", "error": "403"}) == m.DOUBT


@pytest.mark.django_db
class TestModeration:
    @pytest.fixture(autouse=True)
    def worker(self, settings, monkeypatch):
        settings.VIDEO_WORKER_URL, settings.VIDEO_WORKER_TOKEN = "https://worker.test", "wt"
        settings.R2_BUCKET = "namo-media"
        monkeypatch.setattr(services.requests, "post", _Posted())
        LocalStore.deleted.clear()

    def _encoded(self, api_client, token, verdict, sha=HASH):
        row = Video.objects.get(pk=_init(api_client, token, sha256=sha).json()["id"])
        _arrive(row.upload_id, 3, 12 * MB)
        api_client.post(f"/v1/videos/{row.id}/complete/", {}, format="json", **auth(token))
        body = {"video_id": str(row.id), "ok": True, "hls_path": f"v/{row.id}/master.m3u8",
                "thumb_path": f"v/{row.id}/thumb.webp", "duration_s": 30, "width": 720, "height": 1280,
                "moderation": verdict}
        api_client.post("/v1/videos/worker/done/", body, format="json", HTTP_X_WORKER_TOKEN="wt")
        row.refresh_from_db()
        return row

    def test_a_creator_with_clear_frames_goes_live(self, api_client, token, me):
        Profile.objects.filter(pk=TEST_USER).update(influencer=True)
        row = self._encoded(api_client, token, CLEAR)
        assert row.status == "live" and row.moderation["outcome"] == "clear"

    def test_anybody_else_waits_for_their_first_three(self, api_client, token, me):
        for i in range(3):
            row = self._encoded(api_client, token, CLEAR, sha=f"{i}" * 64)
            assert row.status == "in_review"
            services.approve(row)
        assert self._encoded(api_client, token, CLEAR, sha="d" * 64).status == "live"

    def test_doubtful_frames_wait_even_for_a_creator(self, api_client, token, me):
        Profile.objects.filter(pk=TEST_USER).update(influencer=True)
        assert self._encoded(api_client, token, {**CLEAR, "racy": "LIKELY"}).status == "in_review"
        assert self._encoded(api_client, token, None, sha="e" * 64).status == "in_review"

    def test_a_violation_is_rejected_deleted_and_never_posted_again(self, api_client, token, me):
        Profile.objects.filter(pk=TEST_USER).update(influencer=True)
        row = self._encoded(api_client, token, {**CLEAR, "adult": "VERY_LIKELY"})
        assert row.status == "rejected" and row.error.startswith("safesearch: adult VERY_LIKELY")
        assert LocalStore.deleted == [f"v/{row.id}/"]
        got = api_client.get(f"/v1/videos/{row.id}/", **auth(token)).json()
        assert got["reason"] == "safesearch"
        again = _init(api_client, token)
        assert again.status_code == 403 and again.json()["reason"] == "rejected"

    def test_a_moderator_rejects_the_file_and_its_copies(self, api_client, token, me, sign_hs256):
        row = self._encoded(api_client, token, CLEAR)
        Profile.objects.create(id=OTHER_USER, phone="9000000002", name="Other")
        other = sign_hs256(claims=make_claims(sub=OTHER_USER))
        twin = Video.objects.get(pk=_init(api_client, other).json()["id"])
        assert twin.status == "in_review"
        assert services.reject(twin, by="mod") == 2
        for v in (row, twin):
            v.refresh_from_db()
            assert v.status == "rejected" and v.moderation["reviewed"] == "rejected"
        assert LocalStore.deleted == [f"v/{row.id}/"]


@pytest.mark.django_db
def test_the_console_queue_shows_the_frames_and_approves():
    from django.urls import reverse

    from apps.console.models import AdminAction, Tier

    from .test_console import _admin

    client, _ = _admin(Tier.FULFILMENT)
    owner = uuid.uuid4()
    Profile.objects.create(id=owner, phone="9000000009", name="Meera Joshi")
    row = Video.objects.create(user_id=owner, status="in_review", source_hash=HASH, duration_s=30,
                               size_bytes=MB, thumb_path="v/x/thumb.webp",
                               moderation={**CLEAR, "racy": "LIKELY", "outcome": "doubt"})
    Video.objects.create(user_id=owner, status="live", source_hash="b" * 64, duration_s=9, size_bytes=MB)
    url = reverse("namo:clips_video_changelist")
    page = client.get(url).content.decode()
    assert "Meera Joshi" in page and "sheet_1.jpg" in page and "racy likely" in page
    assert page.count("9 s") == 0  # the live one is not in the queue
    client.post(url, {"action": "approve", "_selected_action": [str(row.pk)]})
    row.refresh_from_db()
    assert row.status == "live" and row.moderation["reviewed"] == "approved"
    assert AdminAction.objects.filter(action="video.approve").exists()
