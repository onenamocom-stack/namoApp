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
    Rahul: "agar live available nahi h to time kab live hoga"). Without the
    Data API key nothing is fetched: the public pages answer a data centre
    with a bot check, so every channel plays the live player."""

    @pytest.fixture(autouse=True)
    def _fresh_cache(self, settings):
        from django.core.cache import cache
        settings.YOUTUBE_API_KEY = ""
        cache.clear()

    def test_without_a_key_every_channel_plays_and_nothing_is_fetched(self):
        with mock.patch("apps.bhakti.youtube.requests.get", side_effect=AssertionError("fetched")):
            assert youtube.live_status(CHANNEL) == {"live": True, "starts_at": None, "last": None}

    @pytest.mark.django_db
    def test_the_endpoint_and_the_list(self, api_client):
        deity = DarshanDeity.objects.create(name="Shiva", sort=1)
        row = DarshanImage.objects.create(deity=deity, youtube_url="https://www.youtube.com/@x",
                                          youtube_channel_id=CHANNEL, live_hours="Daily 5-7 AM")
        photo = DarshanImage.objects.create(deity=deity, image_url="/a.jpg", sort=1)
        got = _mine(api_client, deity)["images"]
        assert got[0]["checks_live"] is True and got[0]["live_hours"] == "Daily 5-7 AM"
        assert got[1]["checks_live"] is False
        assert api_client.get(f"/v1/bhakti/darshan/{row.pk}/live/").json() == {"live": True, "starts_at": None, "last": None}
        assert api_client.get(f"/v1/bhakti/darshan/{photo.pk}/live/").status_code == 404


class TestDataApi:
    """With YOUTUBE_API_KEY set, channels, live streams, schedules and
    recordings come from the Data API: a data centre gets YouTube's bot check
    on the public pages (20 Oct 2026)."""

    @pytest.fixture(autouse=True)
    def _key_and_cache(self, settings):
        from django.core.cache import cache
        settings.YOUTUBE_API_KEY = "test-key"
        cache.clear()

    def _api(self, videos, handle_id=CHANNEL, status=200, live_search=(), done_search=()):
        class _J(_Got):
            def __init__(self, body, code=200):
                super().__init__(code, "")
                self.body = body

            def json(self):
                return self.body

        def get(url, params=None, **kw):
            assert params["key"] == "test-key"
            if url.endswith("/channels"):
                return _J({"items": [{"id": handle_id}]})
            if url.endswith("/playlistItems"):
                assert params["playlistId"] == "UU" + CHANNEL[2:]
                return _J({"items": [{"contentDetails": {"videoId": v["id"]}} for v in videos]}, status)
            if url.endswith("/videos"):
                return _J({"items": videos})
            if url.endswith("/search"):
                found = live_search if params["eventType"] == "live" else done_search
                return _J({"items": [{"id": {"videoId": v}} for v in found]})
            raise AssertionError(url)
        return mock.patch("apps.bhakti.youtube.requests.get", side_effect=get)

    @staticmethod
    def _video(vid, state="none", embeddable=True, **details):
        return {"id": vid, "snippet": {"liveBroadcastContent": state}, "status": {"embeddable": embeddable},
                "liveStreamingDetails": details}

    def test_a_handle(self):
        with self._api([]):
            assert youtube.parse("https://www.youtube.com/@ShriMahakal") == ("", CHANNEL)

    def test_live_now(self):
        with self._api([self._video("l" * 11, "live", actualStartTime="2026-10-20T01:00:00Z")]):
            got = youtube.live_status(CHANNEL)
            # The stream itself, not the channel's live player (20 Oct 2026).
            assert got["live"] is True and got["last"] is None and "/embed/" + "l" * 11 in got["embed_url"]
            assert youtube.live_video(CHANNEL) == "l" * 11

    def test_off_air_the_next_and_the_last_that_embeds(self):
        import time
        soon = int(time.time()) + 3600
        from datetime import datetime, timezone
        iso = datetime.fromtimestamp(soon, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        videos = [
            self._video("u" * 11, "upcoming", scheduledStartTime=iso),
            self._video("n" * 11, embeddable=False, actualStartTime="2026-10-19T02:00:00Z",
                        actualEndTime="2026-10-19T03:00:00Z"),
            self._video("r" * 11, actualStartTime="2026-10-18T02:00:00Z", actualEndTime="2026-10-18T03:00:00Z"),
        ]
        with self._api(videos):
            got = youtube.live_status(CHANNEL)
        assert got["live"] is False and got["starts_at"] == soon
        assert got["last"]["video_id"] == "r" * 11 and got["last"]["started_at"] == "2026-10-18T02:00:00Z"

    def test_the_api_failing_plays_the_live_player(self):
        with self._api([self._video("x" * 11)], status=403):
            assert youtube.live_status(CHANNEL)["live"] is True

    def test_nothing_in_the_newest_fifty_asks_whether_it_is_live(self):
        # A 24-hour stream older than the newest fifty uploads: search finds it.
        with self._api([self._video("s" * 11)], live_search=["s" * 11]):
            got = youtube.live_status(CHANNEL)
            assert got["live"] is True and "/embed/" + "s" * 11 in got["embed_url"]

    def test_a_24_hour_stream_behind_a_finished_one_is_found(self):
        """Salangpur, 24 Oct 2026: a finished stream among the newest fifty,
        the round-the-clock one further back."""
        done = self._video("d" * 11, actualStartTime="2026-10-23T02:00:00Z", actualEndTime="2026-10-23T03:00:00Z")
        with self._api([done], live_search=["z" * 11]):
            assert youtube.live_status(CHANNEL)["live"] is False  # an ordinary channel: off air
            got = youtube.live_status(CHANNEL, always_on=True)
        assert got["live"] is True and "/embed/" + "z" * 11 in got["embed_url"]

    def test_a_24_hour_temple_really_off_air_keeps_its_last_stream(self):
        done = self._video("d" * 11, actualStartTime="2026-10-23T02:00:00Z", actualEndTime="2026-10-23T03:00:00Z")
        with self._api([done]):
            got = youtube.live_status(CHANNEL, always_on=True)
        assert got["live"] is False and got["last"]["video_id"] == "d" * 11

    def test_not_live_and_nothing_recent_plays_the_last_stream_search_finds(self):
        old = self._video("o" * 11, actualStartTime="2026-01-20T02:00:00Z", actualEndTime="2026-01-20T03:00:00Z")
        with self._api([self._video("s" * 11), old], done_search=["o" * 11]):
            got = youtube.live_status(CHANNEL)
        assert got["live"] is False and got["last"]["video_id"] == "o" * 11

    def test_not_live_and_no_stream_at_all_is_off_air_not_an_empty_player(self):
        """Siddhivinayak, 20 Oct 2026: the live player of a channel with nothing
        on shows "Video unavailable". Off air, the frame shows the photo."""
        with self._api([self._video("s" * 11)]):
            assert youtube.live_status(CHANNEL) == {"live": False, "starts_at": None, "last": None}
