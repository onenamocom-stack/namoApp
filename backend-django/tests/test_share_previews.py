"""Link previews for shared blogs and products (6 Oct 2026, Rahul: a blog
shared on WhatsApp should carry its banner as the thumbnail)."""

import io

import pytest
import requests
from django.core.cache import cache
from PIL import Image

from apps.content import share
from apps.content.models import Content
from apps.shop.models import Product, ShopCategory

INDEX = (
    '<!doctype html><html><head><meta charset="utf-8" /><title>Namo</title>'
    '<meta name="description" content="generic" />'
    '<meta property="og:title" content="Namo" /><meta property="og:image" content="https://1namo.com/og.png" />'
    '<script type="module" src="/assets/index-abc.js"></script></head><body><div id="root"></div></body></html>'
)


class _Resp:
    def __init__(self, text=None, content=None, status=200):
        self.text, self.content, self.status_code = text, content, status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(str(self.status_code))


def _png(w=2400, h=1600):
    out = io.BytesIO()
    Image.new("RGB", (w, h), (200, 90, 30)).save(out, format="PNG")
    return out.getvalue()


@pytest.fixture
def network(monkeypatch):
    cache.clear()
    calls = []

    def fake_get(url, timeout=None):
        calls.append(url)
        if url.endswith("app.html"):
            return _Resp(text=INDEX)
        if url.endswith(".png"):
            return _Resp(content=_png())
        return _Resp(status=404)

    monkeypatch.setattr(share.requests, "get", fake_get)
    return calls


@pytest.fixture
def blog(db):
    return Content.objects.create(
        author_id="11111111-2222-3333-4444-555555555555", kind="article", status="live",
        title="Shani sade sati, plainly", body="Saturn's seven and a half years.\n\nWhat changes and what does not.",
        media_url="https://cdn.example/cover.png",
    )


@pytest.mark.django_db
class TestBlog:
    def test_the_page_is_the_app_with_this_blogs_card(self, client, network, blog):
        response = client.get(f"/read/{blog.id}")
        assert response.status_code == 200
        page = response.content.decode()
        assert '<div id="root"></div>' in page and "/assets/index-abc.js" in page   # the app, intact
        assert 'og:title" content="Shani sade sati, plainly"' in page
        assert f'og:image" content="https://1namo.com/og/blog/{blog.id}.jpg"' in page
        assert "Saturn&#x27;s seven and a half years." in page
        # The generic tags are gone, not duplicated.
        assert page.count('property="og:title"') == 1 and "generic" not in page
        assert page.count("<title>") == 1
        assert response["Cache-Control"] == "no-cache"

    def test_the_thumbnail_is_a_light_1200_by_630_jpeg(self, client, network, blog):
        response = client.get(f"/og/blog/{blog.id}.jpg")
        assert response.status_code == 200 and response["Content-Type"] == "image/jpeg"
        image = Image.open(io.BytesIO(response.content))
        assert image.size == (1200, 630)
        assert len(response.content) < 300 * 1024

    def test_no_index_still_answers_with_the_card(self, client, monkeypatch, blog):
        cache.clear()
        monkeypatch.setattr(share.requests, "get", lambda *a, **k: (_ for _ in ()).throw(requests.ConnectionError()))
        page = client.get(f"/read/{blog.id}").content.decode()
        assert 'og:title" content="Shani sade sati, plainly"' in page and "Open in NAMO" in page

    def test_a_removed_blog_previews_as_namo(self, client, network, blog):
        Content.objects.filter(pk=blog.id).update(status="removed")
        page = client.get(f"/read/{blog.id}").content.decode()
        assert "Shani" not in page and 'og:title" content="NAMO"' in page

    def test_a_blog_with_no_cover_uses_the_site_image(self, client, network, blog):
        Content.objects.filter(pk=blog.id).update(media_url=None)
        page = client.get(f"/read/{blog.id}").content.decode()
        assert 'og:image" content="https://1namo.com/og.png"' in page

    def test_a_broken_image_falls_back(self, client, monkeypatch, blog):
        cache.clear()
        monkeypatch.setattr(share.requests, "get", lambda *a, **k: _Resp(content=b"not an image"))
        response = client.get(f"/og/blog/{blog.id}.jpg")
        assert response.status_code == 302 and response["Location"].endswith("/og.png")


@pytest.mark.django_db
class TestProduct:
    def test_by_slug_with_price(self, client, network):
        cat = ShopCategory.objects.create(name="Gemstones")
        p = Product.objects.create(name="Blue Sapphire", category=cat, price_paise=1_850_000,
                                   stock=2, weight_grams=12, image_url="https://cdn.example/s.png",
                                   description="Unheated Ceylon sapphire.")
        page = client.get(f"/shop/p/{p.slug}").content.decode()
        assert 'og:title" content="Blue Sapphire · ₹18,500"' in page
        assert f'og:image" content="https://1namo.com/og/product/{p.id}.jpg"' in page
        assert client.get(f"/og/product/{p.id}.jpg").status_code == 200


@pytest.mark.django_db
class TestBhakti:
    """A shared Bhakti item carries its picture (8 Oct 2026)."""

    def _asset(self, **kw):
        from apps.bhakti.models import BhaktiAsset

        row = dict(kind="status", title="Ganesh Chaturthi", media_url="https://cdn.example/g.png",
                   artist="x", licence="x", source="x")
        row.update(kw)
        return BhaktiAsset.objects.create(**row)

    def test_a_status_previews_with_its_picture(self, client, network):
        a = self._asset()
        page = client.get(f"/bhakti/s/{a.id}").content.decode()
        assert 'og:title" content="Ganesh Chaturthi"' in page and '<div id="root"></div>' in page
        assert f'og:image" content="https://1namo.com/og/bhakti/{a.id}.jpg"' in page
        response = client.get(f"/og/bhakti/{a.id}.jpg")
        assert response.status_code == 200 and response["Content-Type"] == "image/jpeg"

    def test_a_priced_picture_shows_only_its_preview(self, client, network):
        a = self._asset(price_paise=4_900, media_url="private/key.png", preview_url=None)
        page = client.get(f"/bhakti/s/{a.id}").content.decode()
        assert 'og:image" content="https://1namo.com/og.png"' in page
        assert client.get(f"/og/bhakti/{a.id}.jpg").status_code == 302

    def test_a_bhajan_with_no_cover_uses_the_site_image(self, client, network):
        a = self._asset(kind="bhajan", media_url="https://cdn.example/song.mp3")
        page = client.get(f"/bhakti/s/{a.id}").content.decode()
        assert 'og:title" content="Ganesh Chaturthi"' in page
        assert 'og:image" content="https://1namo.com/og.png"' in page

    def test_a_bhajan_previews_with_its_cover(self, client, network):
        # 12 Oct 2026, Rahul: the card is the bhajan's, not the site's.
        a = self._asset(kind="bhajan", media_url="https://cdn.example/song.mp3",
                        preview_url="https://cdn.example/cover.png")
        page = client.get(f"/bhakti/s/{a.id}").content.decode()
        assert f'og:image" content="https://1namo.com/og/bhakti/{a.id}.jpg"' in page
        assert 'og:description" content="Listen to this bhajan on NAMO."' in page
        assert client.get(f"/og/bhakti/{a.id}.jpg")["Content-Type"] == "image/jpeg"


@pytest.mark.django_db
class TestProfile:
    """1namo.com/<username> (12 Oct 2026, Rahul): the person's own card."""

    PID = "22222222-3333-4444-5555-666666666666"

    def _person(self, **fields):
        from apps.profiles.models import Profile

        return Profile.objects.create(id=self.PID, phone="+910000000009", name="Rahul Jain",
                                      username="rahulvjain", **fields)

    def _pro(self):
        from apps.consultants.models import Consultant

        Consultant.objects.create(profile_id=self.PID, category="Astrologer", status="approved",
                                  specialization="Vedic Astrology, Numerology")

    def test_a_consultant_previews_with_photo_name_and_practice(self, client, network):
        self._person(avatar_url="https://cdn.example/face.png?v=1")
        self._pro()
        page = client.get("/rahulvjain").content.decode()
        assert '<div id="root"></div>' in page
        assert 'og:title" content="Rahul Jain · Astrologer on NAMO"' in page
        assert 'og:description" content="Vedic Astrology, Numerology"' in page
        assert f'og:image" content="https://1namo.com/og/profile/{self.PID}.jpg?v=' in page
        assert 'og:image:width" content="600"' in page
        assert page.count('property="og:title"') == 1

    def test_the_photo_is_a_square_jpeg(self, client, network):
        self._person(avatar_url="https://cdn.example/face.png")
        self._pro()
        response = client.get(f"/og/profile/{self.PID}.jpg")
        assert response["Content-Type"] == "image/jpeg"
        assert Image.open(io.BytesIO(response.content)).size == (600, 600)

    def test_a_seeker_with_no_posts_previews_with_their_name(self, client, network):
        # 17 Oct 2026: everybody's page is public, so is its preview.
        self._person(avatar_url="https://cdn.example/face.png")
        page = client.get("/rahulvjain").content.decode()
        assert 'og:title" content="Rahul Jain on NAMO"' in page

    def test_a_seeker_who_posted_previews_with_their_bio(self, client, network):
        self._person(bio="Seeker of the stars.")
        Content.objects.create(author_id=self.PID, kind="post", status="live", caption="hi")
        page = client.get("/RahulVJain").content.decode()
        assert 'og:title" content="Rahul Jain on NAMO"' in page
        assert 'og:description" content="Seeker of the stars."' in page
        assert 'og:image" content="https://1namo.com/og.png"' in page  # no photo

    def test_a_name_nobody_has_previews_as_namo(self, client, network):
        assert 'og:title" content="NAMO"' in client.get("/nobody-here-1").content.decode()

    def test_a_pro_with_no_category_is_pro_on_namo(self, client, network):
        from apps.consultants.models import Consultant

        self._person()
        Consultant.objects.create(profile_id=self.PID, category="", status="approved")
        assert 'og:title" content="Rahul Jain · Pro on NAMO"' in client.get("/rahulvjain").content.decode()


@pytest.mark.django_db
class TestHome:
    """1namo.com itself (12 Oct 2026, Rahul): the console's Link card."""

    def test_with_no_card_the_app_index_is_unchanged(self, client, network):
        page = client.get("/").content.decode()
        assert page == INDEX

    def test_the_card_sets_heading_description_and_picture(self, client, network):
        from apps.appearance.models import LinkCard

        card = LinkCard.objects.create(title="NAMO — your astrologer", description="Talk now.",
                                       image_url="https://cdn.example/card.png")
        page = client.get("/").content.decode()
        assert '<div id="root"></div>' in page
        assert 'og:title" content="NAMO — your astrologer"' in page
        assert 'og:description" content="Talk now."' in page
        assert f'og:image" content="https://1namo.com/og/site/{card.id}.jpg?v=' in page
        assert page.count('property="og:title"') == 1
        image = client.get(f"/og/site/{card.id}.jpg")
        assert Image.open(io.BytesIO(image.content)).size == (1200, 630)

    def test_a_card_with_no_picture_uses_the_built_in_one(self, client, network):
        from apps.appearance.models import LinkCard

        LinkCard.objects.create(title="NAMO", description="d")
        assert 'og:image" content="https://1namo.com/og.png"' in client.get("/").content.decode()


@pytest.fixture
def reel(db, tmp_path):
    """A real 3-second portrait video on disk; FFmpeg reads a path as it
    reads a URL."""
    import subprocess

    import imageio_ffmpeg

    from apps.profiles.models import Profile

    path = tmp_path / "reel.mp4"
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-loglevel", "error", "-y", "-f", "lavfi",
                    "-i", "testsrc2=size=360x640:rate=30:duration=3", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    str(path)], check=True)
    Profile.objects.create(id="11111111-2222-3333-4444-555555555555", phone="9000000001", name="Meera Joshi")
    return Content.objects.create(
        author_id="11111111-2222-3333-4444-555555555555", kind="clip", status="live",
        caption="Ganga aarti at Har ki Pauri", media_url=str(path),
    )


@pytest.mark.django_db
class TestReel:
    """18 Oct 2026, Rahul: a reel shared on WhatsApp shows its thumbnail."""

    def test_the_page_carries_the_reels_card(self, client, network, reel):
        page = client.get(f"/reels/{reel.id}").content.decode()
        assert '<div id="root"></div>' in page
        assert 'og:title" content="Meera Joshi&#x27;s reel on NAMO"' in page
        assert f'og:image" content="https://1namo.com/og/reel/{reel.id}.jpg?v=3"' in page
        assert 'og:image:width" content="720"' in page and 'og:image:height" content="1280"' in page
        assert "Ganga aarti at Har ki Pauri" in page and 'og:type" content="video.other"' in page

    def test_the_thumbnail_is_a_frame_of_the_video(self, client, network, reel):
        response = client.get(f"/og/reel/{reel.id}.jpg")
        assert response.status_code == 200 and response["Content-Type"] == "image/jpeg"
        image = Image.open(io.BytesIO(response.content))
        # Standing, as Instagram's (Rahul, 18 Oct 2026).
        assert image.size == (720, 1280) and len(response.content) < 300_000
        # The frame sits whole across the middle: the test pattern's
        # colours, not the dark blur, beside the play mark.
        assert max(image.getpixel((100, 640))) > 60

    def test_a_removed_reel_previews_as_namo(self, client, network, reel):
        Content.objects.filter(pk=reel.id).update(status="removed")
        page = client.get(f"/reels/{reel.id}").content.decode()
        assert 'og:title" content="NAMO"' in page

    def test_a_video_that_will_not_open_falls_back(self, client, network, reel):
        Content.objects.filter(pk=reel.id).update(media_url="https://cdn.example/missing.mp4")
        response = client.get(f"/og/reel/{reel.id}.jpg")
        assert response.status_code == 302 and response["Location"].endswith("/og.png")
