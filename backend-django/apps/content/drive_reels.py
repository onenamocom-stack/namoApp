"""Reels from a Google Drive folder, posted for one account through the day
(12 Oct 2026, owner).

The owner's ask: ten reels a day under Rahul Jain's account, at different
times across the day, from the Drive folder's sub-folders — folder 1 and 2
are already up, so from folder 3 on — and never from a laptop.

HOW IT RUNS. A Cloud Run Job (`manage.py post_drive_reel`) started by Cloud
Scheduler every ten minutes. Each run asks one question: is a reel due now?
The day's ten times are decided by `plan_for(date)` — one inside each tenth
of the posting window, at a minute picked by a generator seeded with the
date, so the times differ every day yet any run on the same day computes
the same ten. A run posts AT MOST ONE reel, so a missed hour catches up one
reel per run, never ten at once.

WHAT IS POSTED. The next video in order — folders by their number, files by
name — that `DriveReel` has not recorded. Downloaded from Drive with the
job's own service account (the folder is shared with it, read-only),
uploaded to the media bucket, and published as a `clip` with the file's
Drive description as the caption (none if it has none). The DriveReel row
is written in the same transaction as the post, so a Drive file is posted
once, even if two runs overlap.

ACCESS. No keys in the code or the environment: on Cloud Run the metadata
server hands out a token for the job's service account with the Drive
read-only scope. The folder must be shared with that account's email.
"""

import logging
import random
import re
import tempfile
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

import requests
from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

logger = logging.getLogger(__name__)

IST = ZoneInfo("Asia/Kolkata")
DRIVE = "https://www.googleapis.com/drive/v3"
FOLDER = "application/vnd.google-apps.folder"
METADATA_TOKEN = ("http://metadata.google.internal/computeMetadata/v1/instance/"
                  "service-accounts/default/token?scopes=https://www.googleapis.com/auth/drive.readonly")


class DriveError(Exception):
    pass


# ── the day's plan ──────────────────────────────────────────────────────────


def _clock(text):
    h, m = (int(x) for x in str(text).split(":"))
    return time(h, m)


def plan_for(day, per_day=None, start=None, end=None):
    """The day's posting times, in IST, earliest first: one inside each of
    `per_day` equal slices of the window, at a minute the date decides."""
    per_day = per_day or settings.DRIVE_REELS_PER_DAY
    begin = datetime.combine(day, _clock(start or settings.DRIVE_REELS_DAY_START), IST)
    finish = datetime.combine(day, _clock(end or settings.DRIVE_REELS_DAY_END), IST)
    slice_ = (finish - begin) / per_day
    rng = random.Random(f"namo-reels-{day.isoformat()}")
    # Never in the last tenth of a slice, so two neighbours are not minutes apart.
    return [begin + slice_ * i + timedelta(seconds=rng.uniform(0, slice_.total_seconds() * 0.9))
            for i in range(per_day)]


def due_now(now=None):
    """How many of today's reels should be up by now (IST day)."""
    now = (now or timezone.now()).astimezone(IST)
    return sum(1 for t in plan_for(now.date()) if t <= now)


def posted_today(now=None):
    from .models import DriveReel

    now = (now or timezone.now()).astimezone(IST)
    day_start = datetime.combine(now.date(), time(0, 0), IST)
    return DriveReel.objects.filter(posted_at__gte=day_start).count()


# ── Google Drive ────────────────────────────────────────────────────────────


def _token():
    try:
        r = requests.get(METADATA_TOKEN, headers={"Metadata-Flavor": "Google"}, timeout=10)
        r.raise_for_status()
        return r.json()["access_token"]
    except (requests.RequestException, KeyError, ValueError) as exc:
        raise DriveError(f"no Drive token from the metadata server: {exc}") from exc


def _list(parent, token):
    out, page = [], None
    while True:
        params = {
            "q": f"'{parent}' in parents and trashed = false",
            "fields": "nextPageToken, files(id, name, mimeType, size, description)",
            "pageSize": 1000, "supportsAllDrives": "true", "includeItemsFromAllDrives": "true",
        }
        if page:
            params["pageToken"] = page
        r = requests.get(f"{DRIVE}/files", params=params,
                         headers={"Authorization": f"Bearer {token}"}, timeout=30)
        if r.status_code >= 400:
            raise DriveError(f"Drive list {r.status_code}: {r.text[:200]}")
        body = r.json()
        out += body.get("files", [])
        page = body.get("nextPageToken")
        if not page:
            return out


def _natural(name):
    """'Folder 10' after 'Folder 9'; 'clip 2.mp4' before 'clip 10.mp4'."""
    return [int(p) if p.isdigit() else p.lower() for p in re.split(r"(\d+)", name)]


def _number(name):
    m = re.search(r"\d+", name)
    return int(m.group()) if m else None


_LONG_ID = re.compile(r"\d{12,}")


def already_up():
    """The long numeric ids (Instagram's) in the names of every video
    already on the app — the 48 seeded from folders 1 and 2 are named
    `seed-<id>….mp4` — so a Drive file with the same id is never posted
    again, whoever put the first copy up."""
    from .models import Content

    ids = set()
    for url in Content.objects.filter(kind="clip").exclude(media_url=None).values_list("media_url", flat=True):
        ids.update(_LONG_ID.findall(url.rsplit("/", 1)[-1]))
    return ids


def _ids_in(name):
    return set(_LONG_ID.findall(name))


def queue(token=None, root=None, from_folder=None):
    """Every video still to post, in order: [(folder name, file dict)].

    Folders by their number (a folder with no number after the numbered
    ones), only those numbered `from_folder` or more; files by name."""
    from .models import DriveReel

    token = token or _token()
    root = root or settings.DRIVE_REELS_FOLDER_ID
    from_folder = from_folder if from_folder is not None else settings.DRIVE_REELS_FROM_FOLDER
    done = set(DriveReel.objects.values_list("drive_file_id", flat=True))
    up = already_up()
    folders = [f for f in _list(root, token) if f["mimeType"] == FOLDER]
    folders = [f for f in folders if (_number(f["name"]) or 10**9) >= from_folder]
    folders.sort(key=lambda f: (_number(f["name"]) or 10**9, _natural(f["name"])))
    out = []
    for folder in folders:
        files = [f for f in _list(folder["id"], token)
                 if f.get("mimeType", "").startswith("video/") and f["id"] not in done
                 and not (_ids_in(f["name"]) & up)]
        files.sort(key=lambda f: _natural(f["name"]))
        out += [(folder["name"], f) for f in files]
    return out


def _download(file_id, token, into):
    with requests.get(f"{DRIVE}/files/{file_id}", params={"alt": "media", "supportsAllDrives": "true"},
                      headers={"Authorization": f"Bearer {token}"}, stream=True, timeout=120) as r:
        if r.status_code >= 400:
            raise DriveError(f"Drive download {r.status_code}: {r.text[:200]}")
        for chunk in r.iter_content(1024 * 1024):
            into.write(chunk)
    into.flush()
    into.seek(0)


# ── posting ─────────────────────────────────────────────────────────────────


def post_one(token=None, now=None):
    """Post the next video in the queue. Returns what was posted, or None
    when the queue is empty."""
    from apps.media import providers as media

    from . import services
    from .models import DriveReel

    token = token or _token()
    pending = queue(token)
    if not pending:
        logger.warning("[reels] nothing left to post in the Drive folder")
        return None
    folder, f = pending[0]
    limit = settings.DRIVE_REELS_MAX_BYTES
    if f.get("size") and int(f["size"]) > limit:
        # Recorded as skipped, so one oversized file does not block the queue.
        DriveReel.objects.create(drive_file_id=f["id"], folder=folder, file_name=f["name"],
                                 skipped_reason=f"over {limit // (1024 * 1024)} MB")
        logger.error("[reels] skipped %s/%s: too large (%s bytes)", folder, f["name"], f["size"])
        return {"skipped": f["name"]}
    author = settings.DRIVE_REELS_AUTHOR_ID
    with tempfile.TemporaryFile() as tmp:
        _download(f["id"], token, tmp)
        key = media.make_bucket_key(author, "clip", re.sub(r"[^\w.-]", "-", f["name"]))
        url = media.get_provider().put_bytes(key, tmp, f.get("mimeType") or "video/mp4")
    try:
        with transaction.atomic():
            DriveReel.objects.create(drive_file_id=f["id"], folder=folder, file_name=f["name"])
            row = services.publish_content(
                author, "consultant", kind="clip",
                caption=(f.get("description") or "").strip() or None, media_url=url,
            )
            DriveReel.objects.filter(drive_file_id=f["id"]).update(
                content_id=row.id, posted_at=timezone.now())
    except IntegrityError:
        # Another run posted this file a moment ago.
        logger.warning("[reels] %s was posted by another run", f["name"])
        return None
    logger.info("[reels] posted %s/%s as %s", folder, f["name"], row.id)
    return {"posted": f["name"], "folder": folder, "content_id": str(row.id)}


def tick(now=None):
    """One scheduler run: post one reel if today's plan says one is due."""
    due, done = due_now(now), posted_today(now)
    if done >= due:
        return {"due": due, "posted_today": done, "action": None}
    return {"due": due, "posted_today": done, "action": post_one(now=now)}
