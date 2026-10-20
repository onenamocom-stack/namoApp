"""A darshan murti shown as a temple's YouTube video (20 Oct 2026, Rahul).

Only what plays inside Namo is added. YouTube's oEmbed answers 401 for a
video whose owner turned embedding off, and that is the check: such a
temple is refused in the console, because the app never sends anybody to
YouTube (Rahul: "jo log chalane nahi dete apni app me unhe nahi add
karenge").

No API key: oEmbed and the public channel page are enough. A channel's
current stream is read from its /live page, which carries the stream's
video id while it is live.
"""

import re
import time

import requests

TIMEOUT = 8
HEADERS = {"User-Agent": "Mozilla/5.0 (Namo console)", "Accept-Language": "en"}

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
        return "", _channel_of(f"https://www.youtube.com/{m.group(1)}")
    raise Refused("That link is not a YouTube video or channel.")


def _get(url):
    try:
        return requests.get(url, headers=HEADERS, timeout=TIMEOUT)
    except requests.RequestException:
        raise Refused("YouTube did not answer. Try again in a minute.") from None


def _channel_of(page_url):
    page = _get(page_url).text
    for pattern in PAGE_CHANNEL:
        m = pattern.search(page)
        if m:
            return m.group(1)
    raise Refused("Could not find that channel on YouTube.")


def live_video(channel_id):
    """The video id of the channel's stream if it is live now, else ""."""
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
PAGE_START = re.compile(r'"scheduledStartTime":"(\d+)"')
STREAMS_START = re.compile(r'"upcomingEventData":\{"startTime":"(\d+)"')
STATUS_SECONDS = 180


def live_status(channel_id):
    """{"live", "starts_at"} for a channel (20 Oct 2026, Rahul: "agar live
    available nahi h to time kab live hoga. Ye likh do"). `starts_at` is the
    next scheduled stream's start, unix seconds, when the temple scheduled
    one on YouTube; None otherwise. Cached three minutes per channel, and a
    YouTube that does not answer reads as not live."""
    from django.core.cache import cache

    key = f"yt-live:{channel_id}"
    hit = cache.get(key)
    if hit is not None:
        return hit
    status = {"live": False, "starts_at": None}
    try:
        page = _get(f"https://www.youtube.com/channel/{channel_id}/live").text
        if PAGE_VIDEO.search(page) and PAGE_LIVE.search(page) and not PAGE_UPCOMING.search(page):
            status["live"] = True
        else:
            starts = PAGE_START.findall(page) if PAGE_UPCOMING.search(page) else []
            if not starts:
                starts = STREAMS_START.findall(_get(f"https://www.youtube.com/channel/{channel_id}/streams").text)
            # A stream scheduled long ago that never started is not "next".
            soon = sorted(int(s) for s in starts if int(s) > time.time() - 1800)
            status["starts_at"] = soon[0] if soon else None
    except Refused:
        pass
    cache.set(key, status, STATUS_SECONDS)
    return status
