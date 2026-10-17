"""The upload half of the video pipeline (spec §"Upload flow", 17 Oct 2026).

  init      checks the length, the size, the person's daily limit and the
            file's hash; a known file links to the existing one and uploads
            nothing; otherwise a `videos` row at `uploading` and presigned
            URLs for every 5 MB part, valid 15 minutes.
  parts     the resume: which parts R2 already has, and fresh URLs for the
            rest (after the app was closed, or the URLs ran out).
  complete  joins the parts, checks the stored size, and moves the row to
            `processing`, which is where the worker picks it up.
  sweep     an upload not completed in 24 hours is aborted and deleted;
            a video the worker never answered for is handed over again,
            three times at most.
  done      the worker's answer: the HLS and thumbnail paths, or why not.

The same calls serve the web app and the Android app.
"""

import logging
import re

import requests
from django.conf import settings
from django.db.models import F, Q

from django.db import transaction
from django.utils import timezone

from .models import Video, VideoStatus
from .storage import get_store, part_count

logger = logging.getLogger("apps.clips")

MAX_SECONDS = 90
# After the phone's compression; the spec's hard limit.
MAX_BYTES = 30 * 1024 * 1024
# The phone could not compress: the original goes up and the worker shrinks it.
MAX_ORIGINAL_BYTES = 150 * 1024 * 1024
DAILY_LIMIT = 10
DAILY_LIMIT_VERIFIED = 50
STALE_HOURS = 24
# The worker's answer is overdue after this; then the job goes again.
WORKER_MINUTES = 10
WORKER_ATTEMPTS = 3
MIMES = ("video/mp4", "video/quicktime", "video/webm", "video/3gpp", "video/x-matroska")
CATEGORIES = ("content", "puja", "darshan", "yoga", "ayurveda", "astrology")
# Rows whose file is (or is becoming) a usable copy for a duplicate.
REUSABLE = (VideoStatus.PROCESSING, VideoStatus.IN_REVIEW, VideoStatus.LIVE)

HASH = re.compile(r"^[0-9a-f]{64}$")


class Refused(Exception):
    def __init__(self, message, status=400, reason="refused"):
        super().__init__(message)
        self.message, self.status, self.reason = message, status, reason


def _verified(user_id):
    """An approved Pro or a Creator: the spec's "verified experts"."""
    from apps.consultants.models import Consultant
    from apps.profiles import services as profiles

    return profiles.is_creator(user_id) or Consultant.objects.filter(
        profile_id=user_id, status="approved").exists()


def daily_limit(user_id):
    return DAILY_LIMIT_VERIFIED if _verified(user_id) else DAILY_LIMIT


def _today_count(user_id, now):
    return Video.objects.filter(user_id=user_id, created_at__gte=now - timezone.timedelta(days=1)) \
        .exclude(status=VideoStatus.DELETED).count()


def _row(video, **extra):
    return {
        "id": str(video.id),
        "status": video.status,
        "duplicate": video.source_video_id is not None,
        "parts": video.parts,
        "part_bytes": 5 * 1024 * 1024,
        **extra,
    }


def init(user_id, *, sha256, size_bytes, duration_s, mime="video/mp4", original=False,
         category="content", now=None):
    now = now or timezone.now()
    from apps.profiles.models import Profile

    if Profile.objects.filter(pk=user_id, blocked_at__isnull=False).exists():
        raise Refused("This account cannot post.", status=403, reason="blocked")
    sha256 = (sha256 or "").lower()
    if not HASH.match(sha256):
        raise Refused("Choose the video again.", reason="bad_hash")
    if mime not in MIMES:
        raise Refused("That file is not a video we can play.", reason="bad_type")
    if not duration_s or duration_s <= 0 or duration_s > MAX_SECONDS + 0.5:
        raise Refused(f"Videos can be up to {MAX_SECONDS} seconds.", reason="too_long")
    cap = MAX_ORIGINAL_BYTES if original else MAX_BYTES
    if not size_bytes or size_bytes <= 0 or size_bytes > cap:
        raise Refused(f"Videos can be up to {cap // (1024 * 1024)} MB.", reason="too_big")
    category = category if category in CATEGORIES else "content"
    limit = daily_limit(user_id)
    if _today_count(user_id, now) >= limit:
        raise Refused(f"You can post {limit} videos a day. Try again tomorrow.", status=429, reason="daily_limit")

    same = (Video.objects.filter(source_hash=sha256, status__in=REUSABLE, source_video__isnull=True)
            .order_by("created_at").first())
    if same is not None:
        # The file is already here: link to it, upload nothing (spec 2c).
        copy = Video.objects.create(
            user_id=user_id, status=same.status, source_hash=sha256, duration_s=same.duration_s,
            size_bytes=same.size_bytes, mime=same.mime, source_video=same, category=category,
            hls_path=same.hls_path, thumb_path=same.thumb_path, preview_path=same.preview_path,
            moderation=same.moderation, completed_at=now, processed_at=same.processed_at,
        )
        return _row(copy, urls=[])

    video = Video(user_id=user_id, source_hash=sha256, duration_s=float(duration_s),
                  size_bytes=int(size_bytes), mime=mime, needs_compress=bool(original),
                  category=category, created_at=now)
    video.upload_key = f"uploads/{video.id}/source"
    video.parts = part_count(size_bytes)
    store = get_store()
    video.upload_id = store.start(video.upload_key, mime)
    video.save()
    return _row(video, urls=store.part_urls(video.upload_key, video.upload_id, range(1, video.parts + 1)))


def _mine(user_id, video_id):
    video = Video.objects.filter(pk=video_id, user_id=user_id).first()
    if video is None:
        raise Refused("That video is not yours.", status=404, reason="not_found")
    return video


def parts(user_id, video_id):
    """What R2 has, and fresh URLs for the parts still to send."""
    video = _mine(user_id, video_id)
    if video.status != VideoStatus.UPLOADING:
        return _row(video, done=[], urls=[])
    store = get_store()
    done = store.parts_done(video.upload_key, video.upload_id)
    missing = [n for n in range(1, video.parts + 1) if n not in done]
    return _row(video, done=sorted(done), urls=store.part_urls(video.upload_key, video.upload_id, missing))


def complete(user_id, video_id, sent=None, now=None):
    """Join the parts and hand the video to the worker. `sent` is
    {part_number: etag} from the phone; R2's own list wins when it can be
    read, so a phone that lost its etags can still finish."""
    now = now or timezone.now()
    with transaction.atomic():
        video = Video.objects.select_for_update().filter(pk=video_id, user_id=user_id).first()
        if video is None:
            raise Refused("That video is not yours.", status=404, reason="not_found")
        if video.status != VideoStatus.UPLOADING:
            return _row(video)
        store = get_store()
        done = store.parts_done(video.upload_key, video.upload_id) or {int(k): v for k, v in (sent or {}).items()}
        missing = [n for n in range(1, video.parts + 1) if n not in done]
        if missing:
            raise Refused(f"{len(missing)} part(s) did not arrive. Keep the app open to finish.",
                          status=409, reason="parts_missing")
        stored = store.finish(video.upload_key, video.upload_id, done)
        broken = stored is not None and stored != video.size_bytes
        if broken:
            # Saved, not raised here: a refusal inside the block would roll
            # the deletion back with it.
            store.abort(video.upload_key, video.upload_id)
            video.status, video.error = VideoStatus.DELETED, f"size {stored} != {video.size_bytes}"
            video.save(update_fields=["status", "error"])
        else:
            video.status, video.completed_at = VideoStatus.PROCESSING, now
            video.save(update_fields=["status", "completed_at"])
    if broken:
        raise Refused("The upload arrived broken. Post it again.", status=409, reason="size_mismatch")
    enqueue(video)
    return _row(video)


def enqueue(video, now=None):
    """Hand the video to the worker (namo-video). Counted as an attempt
    whether or not the post arrives: the sweep sends it again later, and
    gives up after three. Without VIDEO_WORKER_URL the row waits."""
    url = settings.VIDEO_WORKER_URL
    if not url:
        logger.info("[clips] %s ready; no worker configured", video.id)
        return False
    from .storage import uploads_bucket

    Video.objects.filter(pk=video.pk).update(claimed_at=now or timezone.now(), attempts=F("attempts") + 1)
    job = {
        "video_id": str(video.id),
        "source": {"bucket": uploads_bucket(), "key": video.upload_key},
        "output": {"bucket": settings.R2_BUCKET, "prefix": f"v/{video.id}/"},
    }
    try:
        got = requests.post(url.rstrip("/") + "/process", json=job, timeout=8,
                            headers={"x-worker-token": settings.VIDEO_WORKER_TOKEN})
    except requests.RequestException as err:
        logger.warning("[clips] worker unreachable for %s: %s", video.id, err)
        return False
    if got.status_code != 202:
        logger.warning("[clips] worker refused %s: %s", video.id, got.status_code)
    return got.status_code == 202


def _with_copies(video):
    """The video and every duplicate linked to it, which share its files."""
    return Video.objects.filter(Q(pk=video.pk) | Q(source_video=video))


def worker_done(body, now=None):
    """The worker's answer. Idempotent: only a video still at
    `processing` changes. A clean encode goes to `in_review`, where the
    moderation step (part E) takes it; a final refusal (not a video, too
    long) deletes it; a failure waits for the sweep to send it again."""
    now = now or timezone.now()
    with transaction.atomic():
        video = (Video.objects.select_for_update()
                 .filter(pk=body.get("video_id"), source_video__isnull=True).first())
        if video is None or video.status != VideoStatus.PROCESSING:
            return False
        if body.get("ok"):
            _with_copies(video).update(
                status=VideoStatus.IN_REVIEW, hls_path=str(body.get("hls_path") or ""),
                thumb_path=str(body.get("thumb_path") or ""),
                duration_s=float(body.get("duration_s") or video.duration_s),
                width=int(body.get("width") or 0), height=int(body.get("height") or 0),
                processed_at=now, error="",
            )
        elif body.get("final"):
            reason = str(body.get("reason") or "failed")
            _with_copies(video).update(status=VideoStatus.DELETED,
                                       error=f"{reason}: {str(body.get('error') or '')}"[:500])
        else:
            Video.objects.filter(pk=video.pk).update(claimed_at=None, error=str(body.get("error") or "")[:500])
    return True


def redispatch(now=None):
    """Videos the worker has not answered for: sent again, or, after the
    third try, deleted with the reason. Runs in the minute sweep."""
    if not settings.VIDEO_WORKER_URL:
        return 0
    now = now or timezone.now()
    waiting = Q(claimed_at__isnull=True, completed_at__lt=now - timezone.timedelta(minutes=1))
    overdue = Q(claimed_at__lt=now - timezone.timedelta(minutes=WORKER_MINUTES))
    stuck = Video.objects.filter(waiting | overdue, status=VideoStatus.PROCESSING, source_video__isnull=True)
    n = 0
    for video in stuck.order_by("completed_at")[:20]:
        if video.attempts >= WORKER_ATTEMPTS:
            _with_copies(video).update(
                status=VideoStatus.DELETED,
                error=f"failed: not processed after {video.attempts} tries. {video.error}"[:500])
        else:
            enqueue(video, now)
        n += 1
    return n


def state(user_id, video_id):
    video = _mine(user_id, video_id)
    from apps.media.providers import public_url

    return _row(
        video,
        hls_url=public_url(video.hls_path) if video.hls_path else None,
        thumb_url=public_url(video.thumb_path) if video.thumb_path else None,
        width=video.width, height=video.height, duration_s=video.duration_s,
        # Why a video went: "too_long", "not_a_video", "failed".
        reason=(video.error.split(":", 1)[0] or None) if video.status == VideoStatus.DELETED else None,
    )


def sweep_stale(now=None):
    """Uploads not completed within 24 hours are aborted (spec step 6)."""
    now = now or timezone.now()
    stale = Video.objects.filter(status=VideoStatus.UPLOADING,
                                 created_at__lt=now - timezone.timedelta(hours=STALE_HOURS))
    store = get_store()
    n = 0
    for video in stale:
        store.abort(video.upload_key, video.upload_id)
        video.status, video.error = VideoStatus.DELETED, "upload not completed in 24 hours"
        video.save(update_fields=["status", "error"])
        n += 1
    return n

