"""A darshan murti shown as a photo, a video or a temple's YouTube video
(20 Oct 2026, Rahul: "either image or video or yt video link in darshan
deity"). Only a YouTube stream that plays inside other apps is taken."""

from unittest import mock

import pytest

from apps.bhakti import youtube
from apps.bhakti.models import DarshanDeity, DarshanImage
from apps.console.models import Tier

from .test_console import _admin

VIDEO = "dQw4w9WgXcQ"
CHANNEL = "UC" + "a" * 22
ADD = "/console/bhakti/darshanimage/add/"


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


def _mine(api_client, deity):
    return next(d for d in api_client.get("/v1/bhakti/darshan/").json() if d["id"] == str(deity.pk))


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


@pytest.mark.django_db
class TestConsoleAndApi:
    @pytest.fixture
    def deity(self):
        return DarshanDeity.objects.create(name="Test deity", sort=-1)

    def _form(self, deity, **over):
        form = {"deity": deity.pk, "temple": "Shri Mahakaleshwar", "location": "Ujjain", "temple_hi": "",
                "location_hi": "", "image_url": "", "video_url": "", "youtube_url": "", "title": "", "credit": "",
                "sort": 0, "active": "on"}
        form.update(over)
        return form

    def test_a_youtube_murti_that_plays_in_other_apps(self, api_client, deity):
        client, _ = _admin(Tier.FULFILMENT)
        with _youtube():
            got = client.post(ADD, self._form(deity, youtube_url=f"https://youtu.be/{VIDEO}"))
        assert got.status_code == 302
        assert DarshanImage.objects.get(deity=deity).youtube_video_id == VIDEO
        d = _mine(api_client, deity)
        [m] = d["images"]
        assert m["kind"] == "youtube" and m["embed_url"].startswith(f"https://www.youtube-nocookie.com/embed/{VIDEO}")
        assert m["image_url"].endswith(f"{VIDEO}/hqdefault.jpg")

    def test_a_youtube_link_that_does_not_is_refused(self, deity):
        client, _ = _admin(Tier.FULFILMENT)
        with _youtube(oembed=401):
            got = client.post(ADD, self._form(deity, youtube_url=f"https://youtu.be/{VIDEO}"))
        assert got.status_code == 200 and b"cannot be added" in got.content
        assert not DarshanImage.objects.filter(deity=deity).exists()

    def test_a_video_and_a_photo(self, api_client, deity):
        DarshanImage.objects.create(deity=deity, video_url="https://media.1namo.com/v.mp4",
                                    image_url="https://media.1namo.com/c.jpg", sort=0)
        DarshanImage.objects.create(deity=deity, image_url="/deities/shiva-1.webp", sort=1)
        d = _mine(api_client, deity)
        assert [(m["kind"], m["video_url"]) for m in d["images"]] == [
            ("video", "https://media.1namo.com/v.mp4"), ("image", "")]

    def test_one_of_the_three_is_needed(self, deity):
        client, _ = _admin(Tier.FULFILMENT)
        got = client.post(ADD, self._form(deity))
        assert b"Add a photo, a video or a YouTube link" in got.content


class TestLiveStatus:
    """When a temple's channel is off air, when it goes live (20 Oct 2026,
    Rahul: "agar live available nahi h to time kab live hoga")."""

    @pytest.fixture(autouse=True)
    def _fresh_cache(self):
        from django.core.cache import cache
        cache.clear()

    def _status(self, live_page="", streams=""):
        def get(url, **kw):
            return _Got(200, "ytInitialData " + live_page if url.endswith("/live") else streams)
        with mock.patch("apps.bhakti.youtube.requests.get", side_effect=get):
            return youtube.live_status(CHANNEL)

    def test_live_now(self):
        page = f'<link rel="canonical" href="https://www.youtube.com/watch?v={VIDEO}"> "isLive":true'
        assert self._status(page) == {"live": True, "starts_at": None, "last": None}

    def test_a_scheduled_stream_gives_its_start(self):
        import time
        at = int(time.time()) + 3600
        page = (f'<link rel="canonical" href="https://www.youtube.com/watch?v={VIDEO}"> '
                f'"isUpcoming":true "scheduledStartTime":"{at}"')
        assert self._status(page) == {"live": False, "starts_at": at, "last": None}

    def test_falls_back_to_the_streams_tab_and_skips_stale_ones(self):
        import time
        old, soon = int(time.time()) - 86400, int(time.time()) + 7200
        streams = (f'"upcomingEventData":{{"startTime":"{old}"}} '
                   f'"upcomingEventData":{{"startTime":"{soon}"}}')
        assert self._status("<html>", streams) == {"live": False, "starts_at": soon, "last": None}

    def test_a_page_it_cannot_read_plays_the_live_player(self):
        def get(url, **kw):
            return _Got(200, "<title>Before you continue to YouTube</title>")
        with mock.patch("apps.bhakti.youtube.requests.get", side_effect=get):
            assert youtube.live_status(CHANNEL)["live"] is True

    def test_youtubes_bot_check_plays_the_live_player(self):
        page = 'ytInitialData "playabilityStatus":{"status":"LOGIN_REQUIRED","reason":"Sign in to confirm"}'
        assert self._status(page)["live"] is True

    def test_nothing_scheduled(self):
        assert self._status("<html>", "<html>") == {"live": False, "starts_at": None, "last": None}

    @pytest.mark.django_db
    def test_the_endpoint_and_the_list(self, api_client):
        deity = DarshanDeity.objects.create(name="Shiva", sort=1)
        row = DarshanImage.objects.create(deity=deity, youtube_url="https://www.youtube.com/@x",
                                          youtube_channel_id=CHANNEL, live_hours="Daily 5-7 AM")
        photo = DarshanImage.objects.create(deity=deity, image_url="/a.jpg", sort=1)
        got = _mine(api_client, deity)["images"]
        assert got[0]["checks_live"] is True and got[0]["live_hours"] == "Daily 5-7 AM"
        assert got[1]["checks_live"] is False
        with mock.patch("apps.bhakti.youtube.requests.get", side_effect=lambda url, **kw: _Got(200, "ytInitialData")):
            assert api_client.get(f"/v1/bhakti/darshan/{row.pk}/live/").json() == {"live": False, "starts_at": None, "last": None}
        assert api_client.get(f"/v1/bhakti/darshan/{photo.pk}/live/").status_code == 404


class TestLastStream:
    """Off air, the temple's latest finished stream plays as a recording
    (20 Oct 2026, Rahul: "jo last live available h wo dikha de")."""

    @pytest.fixture(autouse=True)
    def _fresh_cache(self):
        from django.core.cache import cache
        cache.clear()

    def _status(self, watch):
        old, new = "a" * 11, "b" * 11

        def get(url, **kw):
            if url.endswith("/live"):
                return _Got(200, "ytInitialData <html>")
            if url.endswith("/streams"):
                return _Got(200, f'"videoId":"{new}" "videoId":"{new}" "videoId":"{old}"')
            return _Got(200, watch.get(url.rsplit("=", 1)[1], ""))
        with mock.patch("apps.bhakti.youtube.requests.get", side_effect=get):
            return youtube.live_status(CHANNEL)

    def test_the_latest_finished_stream_that_embeds(self):
        done = '"startTimestamp":"2026-10-19T02:00:00+00:00" "endTimestamp":"2026-10-19T03:00:00+00:00"'
        got = self._status({"b" * 11: done, "a" * 11: done + ' "playableInEmbed":true'})["last"]
        assert got["video_id"] == "a" * 11 and got["started_at"] == "2026-10-19T02:00:00+00:00"
        assert got["embed_url"].startswith("https://www.youtube-nocookie.com/embed/" + "a" * 11)

    def test_none_when_nothing_finished(self):
        assert self._status({"b" * 11: '"startTimestamp":"x" "playableInEmbed":true'})["last"] is None
