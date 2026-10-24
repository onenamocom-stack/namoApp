"""A darshan murti shown as a temple's YouTube video (20 Oct 2026, Rahul).

Only what plays inside Namo is added. YouTube's oEmbed answers 401 for a
video whose owner turned embedding off, and that is the check: such a
temple is refused in the console, because the app never sends anybody to
YouTube (Rahul: "jo log chalane nahi dete apni app me unhe nahi add
karenge").

Embedding is checked with oEmbed. Channels, live streams, schedules and
recordings come from the YouTube Data API when YOUTUBE_API_KEY is set, and
the console's checks fall back to the public pages without it (which a data
centre cannot read reliably; see live_status).
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


def recording_url(video_id):
    """The player for a temple's past stream, started at its beginning."""
    return (f"https://www.youtube-nocookie.com/embed/{video_id}"
            "?autoplay=1&playsinline=1&rel=0&modestbranding=1")


def live_status(channel_id, always_on=False):
    """{"live", "starts_at", "last"} for a channel (20 Oct 2026, Rahul: "agar
    live available nahi h to time kab live hoga. Ye likh do"). `starts_at`
    is the next scheduled stream's start, unix seconds, when the temple
    scheduled one on YouTube; None otherwise. `last`, while off air, is the
    temple's latest finished stream, played as a recording (Rahul: "jinka
    nahi h live unka jo last live available h wo dikha de"):
    {"video_id", "started_at" (ISO), "embed_url"}, or None.

    From the Data API only. The public pages were read for this first, and
    from Cloud Run YouTube answers them with "confirm you're not a bot" (on
    every page, or on some and not others), so channels read as off air with
    nothing to play and the frames went dark (20 Oct 2026). Without a key,
    or when the API fails, every channel plays YouTube's live player, which
    says itself when nothing is on.

    `always_on`: the temple streams round the clock ("Usually live 24
    hours"). Its stream can be months old, behind fifty newer uploads with a
    finished one among them, so it read as off air (24 Oct 2026, Rahul:
    Salangpur said 24 hours and showed no Live button). Such a channel not
    found live among its uploads is also searched for a live broadcast."""
    from django.core.cache import cache

    if not _key():
        return {"live": True, "starts_at": None, "last": None}
    key = f"yt-live:{channel_id}{':24h' if always_on else ''}"
    hit = cache.get(key)
    if hit is not None:
        return hit
    seconds = API_SECONDS
    try:
        got = _api_status(channel_id)
        status = {"live": got["live"], "starts_at": got["starts_at"], "last": None if got["live"] else got["last"]}
        if got["live"] and got["live_video"]:
            # Play THE stream, not the channel's live player: for some channels
            # (Siddhivinayak, live since 3 Oct) the channel player says "This
            # video is unavailable" while the stream itself plays (20 Oct 2026).
            status["embed_url"] = recording_url(got["live_video"])
        if not status["live"] and status["last"] is not None and always_on:
            # A round-the-clock stream behind newer finished ones: one live
            # search (100 units), kept three hours either way.
            found = _api("search", part="id", channelId=channel_id, eventType="live", type="video",
                         maxResults=1).get("items") or []
            if found:
                status = {"live": True, "starts_at": None, "last": None,
                          "embed_url": recording_url(found[0]["id"]["videoId"])}
            seconds = SEARCH_SECONDS
        elif not status["live"] and status["last"] is None:
            # Nothing among the newest fifty: a channel that uploads many
            # videos a day (Tirupati's SVBC, a 24-hour stream started weeks
            # ago) keeps its stream further back. ASK, rather than assume
            # it is live: the live player of a channel with nothing on says
            # "Video unavailable" (Siddhivinayak, 20 Oct 2026, Raghu). Two
            # searches (100 units each), so this answer keeps three hours.
            deeper = _api_search_status(channel_id)
            status["live"], status["last"] = deeper["live"], deeper["last"]
            if deeper.get("embed_url"):
                status["embed_url"] = deeper["embed_url"]
            seconds = SEARCH_SECONDS
    except Refused:
        status = {"live": True, "starts_at": None, "last": None}
    cache.set(key, status, seconds)
    return status


# YouTube Data API v3 (20 Oct 2026). A data centre gets YouTube's "confirm
# you're not a bot" on channel and watch pages, so from Cloud Run the pages
# say nothing reliable; the API does. Used whenever YOUTUBE_API_KEY is
# set (the owner sets it by hand in the server's secrets). Two calls a
# check, one unit each: the channel's uploads (live, upcoming and finished
# streams are all in it, newest first) and those videos' broadcast details.
API = "https://www.googleapis.com/youtube/v3/"
API_SECONDS = 900
# A channel whose newest fifty hold no stream is searched instead (two calls,
# 100 units each), so its answer keeps longer: 43 channels and a few of them
# searched at most eight times a day stay inside the 10,000 free units.
SEARCH_SECONDS = 3 * 3600


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


def _api_search_status(channel_id):
    """{"live", "last"} for a channel whose recent uploads hold no stream:
    YouTube's search for its live broadcast, then for its latest finished
    one that may be embedded. Neither: off air with nothing to play, so the
    frame shows the murti's photo and the timings, never an empty player."""
    found = _api("search", part="id", channelId=channel_id, eventType="live", type="video",
                 maxResults=1).get("items") or []
    if found:
        return {"live": True, "last": None, "embed_url": recording_url(found[0]["id"]["videoId"])}
    done = [i["id"]["videoId"] for i in _api("search", part="id", channelId=channel_id,
                                              eventType="completed", type="video", order="date",
                                              maxResults=5).get("items") or []]
    if not done:
        return {"live": False, "last": None}
    for v in _api("videos", part="status,liveStreamingDetails", id=",".join(done)).get("items") or []:
        details = v.get("liveStreamingDetails") or {}
        if v.get("status", {}).get("embeddable") and details.get("actualStartTime"):
            return {"live": False, "last": {"video_id": v["id"], "started_at": details["actualStartTime"],
                                            "embed_url": recording_url(v["id"])}}
    return {"live": False, "last": None}
