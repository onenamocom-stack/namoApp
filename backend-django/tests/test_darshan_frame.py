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
