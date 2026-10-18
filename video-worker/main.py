"""namo-video: the worker of the video pipeline (part D, 17 Oct 2026).

A Cloud Run service of its own, so encoding never slows the API. The API
posts a job when an upload completes:

  POST /process   x-worker-token: VIDEO_WORKER_TOKEN
  {"video_id", "source": {"bucket", "key"}, "output": {"bucket", "prefix"}}

and gets 202 at once. The job runs on this instance's own thread (the
service runs with CPU always allocated, so work after the response is not
starved), one at a time:

  1. the upload is read from the private uploads bucket
  2. encode.build: HLS 720p and 480p, the thumbnail, the moderation sheets
  3. moderate.check: the sheets through SafeSearch (part E)
  4. every file goes to the public bucket under v/{id}/, the sheets too,
     for the console's review queue
  5. the upload is deleted (the spec keeps no original)
  6. POST VIDEO_CALLBACK_URL with the result and the verdict, same token

A job lost to a restart is not lost: the API's minute sweep hands any
video still at `processing` over again, up to three times.
"""

import hmac
import json
import logging
import mimetypes
import os
import queue
import shutil
import tempfile
import threading
import time
import urllib.request

import encode
import moderate

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("namo-video")

TOKEN = os.environ.get("VIDEO_WORKER_TOKEN", "")
CALLBACK_URL = os.environ.get("VIDEO_CALLBACK_URL", "")
WAITING_MAX = 4
# Encoded files never change once written: cache them for a year.
IMMUTABLE = "public, max-age=31536000, immutable"
TYPES = {".m3u8": "application/vnd.apple.mpegurl", ".ts": "video/mp2t", ".webp": "image/webp",
         ".jpg": "image/jpeg"}

jobs = queue.Queue()
held = set()
held_lock = threading.Lock()


def _s3():
    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3", endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY"],
        aws_secret_access_key=os.environ["R2_SECRET_KEY"],
        config=Config(signature_version="s3v4", retries={"max_attempts": 4}), region_name="auto",
    )


def upload_dir(s3, local, bucket, prefix):
    sent = 0
    for root, _, files in os.walk(local):
        for name in files:
            path = os.path.join(root, name)
            rel = os.path.relpath(path, local).replace(os.sep, "/")
            ext = os.path.splitext(name)[1]
            kind = TYPES.get(ext) or mimetypes.guess_type(name)[0] or "application/octet-stream"
            s3.upload_file(path, bucket, f"{prefix}{rel}",
                           ExtraArgs={"ContentType": kind, "CacheControl": IMMUTABLE})
            sent += 1
    return sent


def report(body):
    if not CALLBACK_URL:
        log.warning("no VIDEO_CALLBACK_URL; result dropped: %s", body)
        return
    data = json.dumps(body).encode()
    for attempt in range(4):
        try:
            req = urllib.request.Request(CALLBACK_URL, data=data, method="POST", headers={
                "content-type": "application/json", "x-worker-token": TOKEN})
            with urllib.request.urlopen(req, timeout=20) as res:
                if res.status < 300:
                    return
        except Exception as err:  # noqa: BLE001 — retried, then the sweep
            log.warning("callback for %s failed (%s)", body.get("video_id"), err)
        time.sleep(2 ** attempt)


def process(job, s3=None, check=None):
    video_id = job["video_id"]
    check = check or moderate.check
    s3 = s3 or _s3()
    work = tempfile.mkdtemp(prefix=f"v-{video_id}-")
    try:
        src = os.path.join(work, "source")
        s3.download_file(job["source"]["bucket"], job["source"]["key"], src)
        out = os.path.join(work, "out")
        os.makedirs(out)
        started = time.monotonic()
        result = encode.build(src, out)
        sheets = result.pop("sheets")
        verdict = check(sheets)
        prefix = job["output"]["prefix"]
        verdict["sheets"] = [prefix + os.path.basename(p) for p in sheets]
        upload_dir(s3, out, job["output"]["bucket"], prefix)
        s3.delete_object(Bucket=job["source"]["bucket"], Key=job["source"]["key"])
        log.info("%s encoded in %.1fs: %s", video_id, time.monotonic() - started, result["versions"])
        return {"video_id": video_id, "ok": True, **result, "moderation": verdict,
                "hls_path": f"{prefix}master.m3u8", "thumb_path": f"{prefix}thumb.webp"}
    except encode.Unusable as err:
        # Nothing to retry: drop the upload, tell the API why.
        s3.delete_object(Bucket=job["source"]["bucket"], Key=job["source"]["key"])
        return {"video_id": video_id, "ok": False, "final": True, "reason": err.reason, "error": str(err)}
    except Exception as err:  # noqa: BLE001 — the API retries via the sweep
        log.exception("%s failed", video_id)
        return {"video_id": video_id, "ok": False, "final": False, "reason": "failed", "error": str(err)[:500]}
    finally:
        shutil.rmtree(work, ignore_errors=True)


def run_forever():
    while True:
        job = jobs.get()
        try:
            report(process(job))
        finally:
            with held_lock:
                held.discard(job["video_id"])


def _json(start, status, body):
    data = json.dumps(body).encode()
    start(status, [("content-type", "application/json"), ("content-length", str(len(data)))])
    return [data]


def app(environ, start):
    path, method = environ.get("PATH_INFO", ""), environ.get("REQUEST_METHOD", "")
    if path == "/" and method == "GET":
        return _json(start, "200 OK", {"ok": True, "waiting": jobs.qsize()})
    if path != "/process" or method != "POST":
        return _json(start, "404 Not Found", {"ok": False})
    given = environ.get("HTTP_X_WORKER_TOKEN", "")
    if not TOKEN or not hmac.compare_digest(given.encode(), TOKEN.encode()):
        return _json(start, "401 Unauthorized", {"ok": False})
    try:
        size = int(environ.get("CONTENT_LENGTH") or 0)
        job = json.loads(environ["wsgi.input"].read(min(size, 10_000)) or b"{}")
        job["video_id"], job["source"]["bucket"], job["source"]["key"]
        job["output"]["bucket"], job["output"]["prefix"]
    except (ValueError, KeyError, TypeError):
        return _json(start, "400 Bad Request", {"ok": False})
    with held_lock:
        if job["video_id"] in held:
            return _json(start, "202 Accepted", {"ok": True, "already": True})
        if jobs.qsize() >= WAITING_MAX:
            # Busy: the API's sweep sends it again, likely to another instance.
            return _json(start, "503 Service Unavailable", {"ok": False, "busy": True})
        held.add(job["video_id"])
    jobs.put(job)
    return _json(start, "202 Accepted", {"ok": True})


threading.Thread(target=run_forever, daemon=True, name="encoder").start()
