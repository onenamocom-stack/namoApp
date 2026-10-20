"""Temples' live YouTube darshan (20 Oct 2026, Rahul): only a stream that
plays inside other apps is added; the app reads when each is live."""

from datetime import datetime
from unittest import mock

import pytest

from apps.bhakti import youtube
from apps.bhakti.models import LiveDarshan
from apps.console.models import Tier

from .test_console import _admin

VIDEO = "dQw4w9WgXcQ"
CHANNEL = "UC" + "a" * 22
ADD = "/console/bhakti/livedarshan/add/"


class _Got:
    def __init__(self, status=200, text=""):
        self.status_code, self.text = status, text


def _youtube(oembed=200, live_page=""):
    def get(url, **kw):
        if "oembed" in url:
            return _Got(oembed)
        if url.endswith("/live"):
            return _Got(200, live_page)
        return _Got(200, f'"channelId":"UC{"b" * 22}" ... "externalId":"{CHANNEL}"')
    return mock.patch("apps.bhakti.youtube.requests.get", side_effect=get)


def at(h, m=0):
    return datetime(2026, 10, 20, h, m, tzinfo=youtube.IST)


class TestLinks:
    @pytest.mark.parametrize("url", [f"https://www.youtube.com/watch?v={VIDEO}", f"https://youtu.be/{VIDEO}",
                                     f"https://www.youtube.com/live/{VIDEO}?si=x"])
    def test_a_video_link(self, url):
        assert youtube.parse(url) == (VIDEO, "")

    def test_a_channel_and_a_handle(self):
        assert youtube.parse(f"https://www.youtube.com/channel/{CHANNEL}") == ("", CHANNEL)
        with _youtube():
            assert youtube.parse("https://www.youtube.com/@ShriMahakal") == ("", CHANNEL)

    def test_not_youtube(self):
        with pytest.raises(youtube.Refused):
            youtube.parse("https://example.com/live")

    def test_embedding_off_is_refused(self):
        with _youtube(oembed=401), pytest.raises(youtube.Refused, match="cannot be added"):
            youtube.check(f"https://youtu.be/{VIDEO}")

    def test_a_channel_live_now_is_checked_through_its_stream(self):
        page = f'<link rel="canonical" href="https://www.youtube.com/watch?v={VIDEO}">'
        with _youtube(oembed=401, live_page=page), pytest.raises(youtube.Refused):
            youtube.check(f"https://www.youtube.com/channel/{CHANNEL}")
        with _youtube(live_page=page):
            assert youtube.check(f"https://www.youtube.com/channel/{CHANNEL}") == ("", CHANNEL, "")


class TestHours:
    def test_spans_and_the_next_start(self):
        hours = "05:00-12:00, 16:00-22:00"
        assert youtube.live_now(hours, at(6)) and not youtube.live_now(hours, at(13))
        assert youtube.next_start(hours, at(13)) == "16:00"
        assert youtube.next_start(hours, at(23)) == "05:00"
        assert youtube.live_now("", at(3))

    @pytest.mark.parametrize("bad", ["5am-12", "12:00-05:00", "25:00-26:00"])
    def test_bad_hours(self, bad):
        with pytest.raises(youtube.Refused):
            youtube.parse_hours(bad)


@pytest.mark.django_db
class TestConsoleAndApi:
    def _form(self, **over):
        form = {"temple": "Shri Mahakaleshwar", "location": "Ujjain", "youtube_url": f"https://youtu.be/{VIDEO}",
                "hours": "", "image_url": "", "sort": 0, "active": "on"}
        form.update(over)
        return form

    def test_added_when_it_plays_in_other_apps(self, api_client):
        client, _ = _admin(Tier.FULFILMENT)
        with _youtube():
            assert client.post(ADD, self._form()).status_code == 302
        row = LiveDarshan.objects.get()
        assert row.video_id == VIDEO
        [card] = api_client.get("/v1/bhakti/darshan/live/").json()
        assert card["embed_url"].startswith(f"https://www.youtube-nocookie.com/embed/{VIDEO}")
        assert card["live"] is True and card["image_url"].endswith(f"{VIDEO}/hqdefault.jpg")

    def test_refused_when_it_does_not(self):
        client, _ = _admin(Tier.FULFILMENT)
        with _youtube(oembed=401):
            got = client.post(ADD, self._form())
        assert got.status_code == 200 and b"cannot be added" in got.content
        assert not LiveDarshan.objects.exists()

    def test_inactive_rows_are_not_shown(self, api_client):
        LiveDarshan.objects.create(temple="Off", youtube_url="x", video_id=VIDEO, active=False)
        assert api_client.get("/v1/bhakti/darshan/live/").json() == []
