"""A temple's YouTube live darshan (20 Oct 2026, Rahul).

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
from datetime import datetime
from zoneinfo import ZoneInfo

import requests

IST = ZoneInfo("Asia/Kolkata")
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
HOURS = re.compile(r"^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$")


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


def parse_hours(text):
    """[(start_minute, end_minute)] from "05:00-12:00, 16:00-22:00", IST;
    [] is all day. Refused on anything else."""
    spans = []
    for part in [p.strip() for p in (text or "").split(",") if p.strip()]:
        m = HOURS.match(part)
        if not m:
            raise Refused('Write the hours like "05:00-12:00, 16:00-22:00", or leave it empty for all day.')
        h1, m1, h2, m2 = (int(g) for g in m.groups())
        if h1 > 23 or h2 > 24 or m1 > 59 or m2 > 59:
            raise Refused(f"{part} is not a time of day.")
        start, end = h1 * 60 + m1, h2 * 60 + m2
        if end <= start:
            raise Refused(f"{part}: the end is before the start.")
        spans.append((start, end))
    return spans


def live_now(hours, now=None):
    spans = parse_hours(hours)
    if not spans:
        return True
    local = (now or datetime.now(IST)).astimezone(IST)
    minute = local.hour * 60 + local.minute
    return any(start <= minute < end for start, end in spans)


def next_start(hours, now=None):
    """"HH:MM" of the next span's start today or tomorrow, or None."""
    spans = parse_hours(hours)
    if not spans:
        return None
    local = (now or datetime.now(IST)).astimezone(IST)
    minute = local.hour * 60 + local.minute
    later = [s for s, _ in spans if s > minute]
    start = min(later) if later else min(s for s, _ in spans)
    return f"{start // 60:02d}:{start % 60:02d}"


def embed_url(row):
    if row.video_id:
        return f"https://www.youtube-nocookie.com/embed/{row.video_id}?autoplay=1&playsinline=1&rel=0&modestbranding=1"
    return f"https://www.youtube.com/embed/live_stream?channel={row.channel_id}&autoplay=1&playsinline=1&rel=0"


def thumbnail(row):
    if row.image_url:
        return row.image_url
    if row.video_id:
        return f"https://i.ytimg.com/vi/{row.video_id}/hqdefault.jpg"
    return ""
