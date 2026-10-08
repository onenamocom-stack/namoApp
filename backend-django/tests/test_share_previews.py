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
        if url.endswith("index.html"):
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
        assert 'og:title" content="Shani sade sati, plainly"' in page and "Open in Namo" in page

    def test_a_removed_blog_previews_as_namo(self, client, network, blog):
        Content.objects.filter(pk=blog.id).update(status="removed")
        page = client.get(f"/read/{blog.id}").content.decode()
        assert "Shani" not in page and 'og:title" content="Namo"' in page

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

    def test_a_bhajan_uses_the_site_image(self, client, network):
        a = self._asset(kind="bhajan", media_url="https://cdn.example/song.mp3")
        page = client.get(f"/bhakti/s/{a.id}").content.decode()
        assert 'og:title" content="Ganesh Chaturthi"' in page
        assert 'og:image" content="https://1namo.com/og.png"' in page
