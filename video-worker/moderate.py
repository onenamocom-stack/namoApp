"""The video pipeline's moderation check (part E, 17 Oct 2026; Rahul:
Google Cloud Vision SafeSearch, a frame every 10 seconds, nine frames to
one image).

`check(paths)` sends the sheets in one Vision call and returns the worst
likelihood seen on any sheet for each SafeSearch category:

  {"engine": "safesearch", "images": 1, "adult": "VERY_UNLIKELY",
   "violence": "UNLIKELY", "racy": "POSSIBLE", "medical": ..., "spoof": ...}

or, when Vision cannot be asked or does not answer, {"engine":
"safesearch", "error": "..."} — the API then sends the video to the
console's review queue rather than guessing. The worker decides nothing:
what counts as clear, doubtful or a violation is the API's rule.

The credential is the Cloud Run service account's, from the metadata
server; the Vision API must be enabled on the project. Nothing to set.
"""

import base64
import json
import logging
import os
import urllib.request

log = logging.getLogger("namo-video")

VISION_URL = "https://vision.googleapis.com/v1/images:annotate"
TOKEN_URL = ("http://metadata.google.internal/computeMetadata/v1/"
             "instance/service-accounts/default/token")
CATEGORIES = ("adult", "violence", "racy", "medical", "spoof")
LEVELS = ("UNKNOWN", "VERY_UNLIKELY", "UNLIKELY", "POSSIBLE", "LIKELY", "VERY_LIKELY")
# Vision takes up to 16 images a call; a 90-second video is one.
PER_CALL = 16


def _token():
    req = urllib.request.Request(TOKEN_URL, headers={"Metadata-Flavor": "Google"})
    with urllib.request.urlopen(req, timeout=5) as res:
        return json.loads(res.read())["access_token"]


def _post(body):
    req = urllib.request.Request(VISION_URL, data=json.dumps(body).encode(), method="POST", headers={
        "content-type": "application/json", "authorization": f"Bearer {_token()}"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read())


def worst(annotations):
    """The highest likelihood per category across the sheets' answers."""
    out = {}
    for name in CATEGORIES:
        seen = [a.get(name, "UNKNOWN") for a in annotations]
        out[name] = max(seen, key=lambda v: LEVELS.index(v) if v in LEVELS else 0) if seen else "UNKNOWN"
    return out


def check(paths, post=None):
    post = post or _post
    if os.environ.get("MODERATION", "safesearch") == "off":
        return {"engine": "off", "error": "moderation is off"}
    if not paths:
        return {"engine": "safesearch", "error": "no frames"}
    annotations = []
    try:
        for start in range(0, len(paths), PER_CALL):
            requests = []
            for path in paths[start:start + PER_CALL]:
                with open(path, "rb") as f:
                    content = base64.b64encode(f.read()).decode()
                requests.append({"image": {"content": content},
                                 "features": [{"type": "SAFE_SEARCH_DETECTION"}]})
            got = post({"requests": requests})
            for answer in got.get("responses") or []:
                if "error" in answer or "safeSearchAnnotation" not in answer:
                    raise RuntimeError(str(answer.get("error") or "no answer")[:300])
                annotations.append(answer["safeSearchAnnotation"])
        if len(annotations) != len(paths):
            raise RuntimeError(f"{len(annotations)} answers for {len(paths)} images")
    except Exception as err:  # noqa: BLE001 — the video goes to the queue instead
        log.warning("safesearch failed: %s", err)
        return {"engine": "safesearch", "error": str(err)[:300]}
    return {"engine": "safesearch", "images": len(paths), **worst(annotations)}
