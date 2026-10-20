"""A darshan murti shown as a temple's YouTube video (20 Oct 2026, Rahul).

Only what plays inside Namo is added. YouTube's oEmbed answers 401 for a
video whose owner turned embedding off, and that is the check: such a
temple is refused in the console, because the app never sends anybody to
YouTube (Rahul: "jo log chalane nahi dete apni app me unhe nahi add
karenge").

Embedding is checked with oEmbed. Channels, live streams, schedules and
recordings come from the YouTube Data API when YOUTUBE_API_KEY is set, and
from the public pages otherwise (which a data centre cannot read; below).
"""

import logging
import re
import time

import requests

TIMEOUT = 8
logger = logging.getLogger("apps.bhakti")

# A browser's agent and the consent cookies: from a data centre YouTube may
# otherwise answer a consent or check page instead of the channel.
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/141.0.0.0 Safari/537.36",
    "Accept-Language": "en-IN,en;q=0.9",
    "Cookie": "CONSENT=YES+cb; SOCS=CAI",
}

VIDEO = re.compile(r"(?:v=|youtu\.be/|/live/|/embed/|/shorts/)([A-Za-z0-9_-]{11})")
CHANNEL = re.compile(r"/channel/(UC[A-Za-z0-9_-]{22})")
HANDLE = re.compile(r"youtube\.com/(@[A-Za-z0-9._-]+)")
# The channel's own id, most certain first: a handle's page also names
# other channels (featured, related) in `channelId`.
PAGE_CHANNEL = (
    re.compile(r'<link rel="canonical" href="https://www\.youtube\.com/channel/(UC[A-Za-z0-9_-]{22})"'),
    re.compile(r'"externalId":"(UC[A-Za-z0-9_-]{22})"'),
    re.compile(r'"browseId":"(UC[A-Za-z0-9_-]{22})"'),
)
PAGE_VIDEO = re.compile(r'<link rel="canonical" href="https://www\.youtube\.com/watch\?v=([A-Za-z0-9_-]{11})"')


class Refused(Exception):
    pass


def parse(url):
    """(video_id, channel_id) from what was pasted: a watch, youtu.be,
    /live/ or /embed/ link gives the video; a /channel/UC… or @handle link
    the channel (a handle is looked up)."""
    url = (url or "").strip()
    if not re.match(r"^https?://(www\.|m\.)?(youtube\.com|youtu\.be)/", url):
        raise Refused("Paste a YouTube link: a live video, or the temple's channel.")
    m = VIDEO.search(url)
    if m:
        return m.group(1), ""
    m = CHANNEL.search(url)
    if m:
        return "", m.group(1)
    m = HANDLE.search(url)
    if m:
        return "", _channel_of(m.group(1))
    raise Refused("That link is not a YouTube video or channel.")


def _get(url):
    try:
        return requests.get(url, headers=HEADERS, timeout=TIMEOUT)
    except requests.RequestException:
        raise Refused("YouTube did not answer. Try again in a minute.") from None


def _channel_of(handle):
    if _key():
        return _api_channel(handle)
    page = _get(f"https://www.youtube.com/{handle}").text
    for pattern in PAGE_CHANNEL:
        m = pattern.search(page)
        if m:
            return m.group(1)
    raise Refused("Could not find that channel on YouTube.")


def live_video(channel_id):
    """The video id of the channel's stream if it is live now, else ""."""
    if _key():
        return _api_status(channel_id)["live_video"]
    m = PAGE_VIDEO.search(_get(f"https://www.youtube.com/channel/{channel_id}/live").text)
    return m.group(1) if m else ""


def check_embeddable(video_id):
    """Refuse a video that will not play inside another app."""
    got = _get(f"https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v={video_id}")
    if got.status_code in (401, 403):
        raise Refused("This temple's YouTube does not allow playing inside other apps. It cannot be added.")
    if got.status_code == 404:
        raise Refused("That video is not on YouTube, or it is private.")
    if got.status_code != 200:
        raise Refused("YouTube did not answer. Try again in a minute.")


def check(url):
    """(video_id, channel_id, note) for the console, or Refused. A channel
    not live at this moment cannot be checked; the note says so."""
    video_id, channel_id = parse(url)
    if video_id:
        check_embeddable(video_id)
        return video_id, "", ""
    now = live_video(channel_id)
    if now:
        check_embeddable(now)
        return "", channel_id, ""
    return "", channel_id, ("The channel is not live right now, so whether it plays in other apps could not be "
                            "checked. Open the preview here while it is live; if it does not play, untick Active.")


def embed_url(row):
    """The player for a DarshanImage's YouTube link, or ""."""
    if row.youtube_video_id:
        return (f"https://www.youtube-nocookie.com/embed/{row.youtube_video_id}"
                "?autoplay=1&playsinline=1&rel=0&modestbranding=1")
    if row.youtube_channel_id:
        return f"https://www.youtube.com/embed/live_stream?channel={row.youtube_channel_id}&autoplay=1&playsinline=1&rel=0"
    return ""


def thumbnail(row):
    """The video's own picture, for a YouTube murti with no photo."""
    if row.youtube_video_id:
        return f"https://i.ytimg.com/vi/{row.youtube_video_id}/hqdefault.jpg"
    return ""


# What a channel's /live page says about its next stream, while none is on.
PAGE_LIVE = re.compile(r'"isLive":true')
PAGE_UPCOMING = re.compile(r'"isUpcoming":true')
PAGE_BOT_CHECK = re.compile(r'"status":"LOGIN_REQUIRED"')
PAGE_START = re.compile(r'"scheduledStartTime":"(\d+)"')
STREAMS_START = re.compile(r'"upcomingEventData":\{"startTime":"(\d+)"')
STREAMS_VIDEO = re.compile(r'"videoId":"([A-Za-z0-9_-]{11})"')
# A finished stream's watch page: when it ran, and whether it plays in
# other apps.
WATCH_STARTED = re.compile(r'"startTimestamp":"([^"]+)"')
WATCH_ENDED = re.compile(r'"endTimestamp":"([^"]+)"')
WATCH_EMBEDS = re.compile(r'"playableInEmbed":true')
STATUS_SECONDS = 180
LAST_SECONDS = 1800
LAST_TRIES = 4


def recording_url(video_id):
    """The player for a temple's past stream, started at its beginning."""
    return (f"https://www.youtube-nocookie.com/embed/{video_id}"
            "?autoplay=1&playsinline=1&rel=0&modestbranding=1")


def _last_stream(channel_id, streams_page):
    """{"video_id", "started_at"} of the channel's latest finished stream
    that plays in other apps, or None. Cached half an hour: it changes once
    a stream ends, not every minute."""
    from django.core.cache import cache

    key = f"yt-last:{channel_id}"
    hit = cache.get(key)
    if hit is not None:
        return hit or None
    found = {}
    seen = []
    for video_id in STREAMS_VIDEO.findall(streams_page):
        if video_id in seen:
            continue
        seen.append(video_id)
        if len(seen) > LAST_TRIES:
            break
        page = _get(f"https://www.youtube.com/watch?v={video_id}").text
        started = WATCH_STARTED.search(page)
        if started and WATCH_ENDED.search(page) and WATCH_EMBEDS.search(page):
            found = {"video_id": video_id, "started_at": started.group(1)}
            break
    cache.set(key, found, LAST_SECONDS)
    return found or None


def live_status(channel_id):
    """{"live", "starts_at", "last"} for a channel (20 Oct 2026, Rahul: "agar
    live available nahi h to time kab live hoga. Ye likh do"). `starts_at`
    is the next scheduled stream's start, unix seconds, when the temple
    scheduled one on YouTube; None otherwise. `last`, while off air, is the
    temple's latest finished stream, played as a recording (Rahul: "jinka
    nahi h live unka jo last live available h wo dikha de"):
    {"video_id", "started_at" (ISO), "embed_url"}, or None. Cached three
    minutes per channel, and a YouTube that does not answer reads as not
    live."""
    from django.core.cache import cache

    key = f"yt-live:{channel_id}"
    hit = cache.get(key)
    if hit is not None:
        return hit
    if _key():
        try:
            got = _api_status(channel_id)
            status = {"live": got["live"], "starts_at": got["starts_at"], "last": None if got["live"] else got["last"]}
        except Refused:
            # The API failing must not darken the frame: play the live player.
            status = {"live": True, "starts_at": None, "last": None}
        cache.set(key, status, API_SECONDS)
        return status
    status = {"live": False, "starts_at": None, "last": None}
    try:
        got = _get(f"https://www.youtube.com/channel/{channel_id}/live")
        page = got.text
        if "ytInitialData" not in page or PAGE_BOT_CHECK.search(page):
            # Not the channel's page (a consent page, YouTube's "confirm
            # you're not a bot", an error): we cannot tell, so the live
            # player plays as it did before the check, and YouTube's own
            # player says if nothing is on. 20 Oct 2026: from Cloud Run (a
            # data centre) YouTube answers every page with the bot check,
            # so every channel read as off air and every frame went dark.
            title = re.search(r"<title>([^<]{0,80})", page)
            logger.warning("[darshan] youtube unreadable: %s %s %s bytes %r", channel_id, got.status_code,
                           len(page), title.group(1) if title else "")
            status["live"] = True
            cache.set(key, status, STATUS_SECONDS)
            return status
        if PAGE_VIDEO.search(page) and PAGE_LIVE.search(page) and not PAGE_UPCOMING.search(page):
            status["live"] = True
        else:
            streams = _get(f"https://www.youtube.com/channel/{channel_id}/streams").text
            starts = (PAGE_START.findall(page) if PAGE_UPCOMING.search(page) else []) or STREAMS_START.findall(streams)
            # A stream scheduled long ago that never started is not "next".
            soon = sorted(int(s) for s in starts if int(s) > time.time() - 1800)
            status["starts_at"] = soon[0] if soon else None
            last = _last_stream(channel_id, streams)
            if last:
                status["last"] = {**last, "embed_url": recording_url(last["video_id"])}
    except Refused:
        pass
    cache.set(key, status, STATUS_SECONDS)
    return status


# YouTube Data API v3 (20 Oct 2026). A data centre gets YouTube's "confirm
# you're not a bot" on every channel and watch page, so from Cloud Run the
# pages above say nothing; the API does. Used whenever YOUTUBE_API_KEY is
# set (the owner sets it by hand in the server's secrets). Two calls a
# check, one unit each: the channel's uploads (live, upcoming and finished
# streams are all in it, newest first) and those videos' broadcast details.
API = "https://www.googleapis.com/youtube/v3/"
API_SECONDS = 600


def _key():
    from django.conf import settings

    return getattr(settings, "YOUTUBE_API_KEY", "")


def _api(endpoint, **params):
    try:
        got = requests.get(API + endpoint, params={**params, "key": _key()}, timeout=TIMEOUT)
    except requests.RequestException:
        raise Refused("YouTube did not answer. Try again in a minute.") from None
    if got.status_code != 200:
        # Never the body: an error can carry the key back.
        logger.warning("[darshan] youtube api %s answered %s", endpoint, got.status_code)
        raise Refused("YouTube did not answer. Try again in a minute.")
    return got.json()


def _api_channel(handle):
    items = _api("channels", part="id", forHandle=handle).get("items") or []
    if not items:
        raise Refused("Could not find that channel on YouTube.")
    return items[0]["id"]


def _unix(stamp):
    from datetime import datetime

    return int(datetime.fromisoformat(stamp.replace("Z", "+00:00")).timestamp())


def _api_status(channel_id):
    """{"live", "live_video", "starts_at", "last"} from the API."""
    uploads = "UU" + channel_id[2:]
    items = _api("playlistItems", part="contentDetails", playlistId=uploads, maxResults=50).get("items") or []
    ids = [i["contentDetails"]["videoId"] for i in items]
    status = {"live": False, "live_video": "", "starts_at": None, "last": None}
    if not ids:
        return status
    videos = {
        v["id"]: v
        for v in _api("videos", part="snippet,liveStreamingDetails,status", id=",".join(ids)).get("items") or []
    }
    now = time.time()
    soon = []
    for video_id in ids:  # newest first
        v = videos.get(video_id)
        if not v or not v.get("status", {}).get("embeddable"):
            continue
        state = v.get("snippet", {}).get("liveBroadcastContent")
        details = v.get("liveStreamingDetails") or {}
        if state == "live" and not status["live"]:
            status["live"], status["live_video"] = True, video_id
        elif state == "upcoming" and details.get("scheduledStartTime"):
            at = _unix(details["scheduledStartTime"])
            if at > now - 1800:
                soon.append(at)
        elif status["last"] is None and details.get("actualEndTime") and details.get("actualStartTime"):
            status["last"] = {"video_id": video_id, "started_at": details["actualStartTime"],
                              "embed_url": recording_url(video_id)}
    status["starts_at"] = min(soon) if soon else None
    return status
