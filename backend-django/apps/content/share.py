"""Link previews for shared pages (6 Oct 2026, Rahul: "sharing of blog on
WhatsApp should go with the banner as thumbnail").

WhatsApp, Telegram, Facebook and Google read a link's HTML and never run
its JavaScript, so every 1namo.com link previewed as the front page. Firebase
Hosting sends the shareable addresses — `/read/<id>` (a blog) and
`/shop/p/<slug or id>` (a product) — here instead of to its static file.
This answers with the app's own index.html, unchanged except for the head:
that page's title, description, image and address in the Open Graph and
Twitter tags. A person gets the app exactly as before; a crawler gets the
right card.

The image is not the upload itself. WhatsApp skips a thumbnail it finds too
heavy, and a blog cover is often a multi-megabyte PNG. `/og/<kind>/<id>.jpg`
serves a 1200 × 630 JPEG cut from it (about 100 KB), cached by the CDN.

Fails open everywhere: if the app's index cannot be fetched, a minimal page
with the tags and a link to the app is returned; if the image cannot be
made, the site's own og.png.
"""

import html
import io
import logging
import re
import uuid

import requests
from django.conf import settings
from django.core.cache import cache
from django.http import HttpResponse, HttpResponseRedirect

from apps.shop.models import Product

from .models import Content

logger = logging.getLogger("apps.content.share")

INDEX_CACHE_SECONDS = 60
OG_SIZE = (1200, 630)
FALLBACK_IMAGE = "/og.png"


def _site():
    return settings.APP_PUBLIC_URL.rstrip("/")


def _index_html():
    """The seeker app's index.html, as deployed. Cached a minute so a deploy
    shows within one; fetched from the hosting site's own address so this
    request does not loop back through the rewrite."""
    page = cache.get("share:index")
    if page:
        return page
    try:
        response = requests.get(settings.APP_INDEX_URL, timeout=4)
        response.raise_for_status()
        page = response.text
    except requests.RequestException as exc:
        logger.warning("share: index fetch failed: %s", exc)
        return None
    cache.set("share:index", page, INDEX_CACHE_SECONDS)
    return page


def _tags(*, title, description, image, url, kind="article"):
    e = lambda s: html.escape(s or "", quote=True)  # noqa: E731
    return "\n".join([
        f"<title>{e(title)} · Namo</title>",
        f'<meta name="description" content="{e(description)}" />',
        f'<link rel="canonical" href="{e(url)}" />',
        f'<meta property="og:type" content="{e(kind)}" />',
        '<meta property="og:site_name" content="Namo" />',
        f'<meta property="og:title" content="{e(title)}" />',
        f'<meta property="og:description" content="{e(description)}" />',
        f'<meta property="og:url" content="{e(url)}" />',
        f'<meta property="og:image" content="{e(image)}" />',
        f'<meta property="og:image:secure_url" content="{e(image)}" />',
        '<meta property="og:image:type" content="image/jpeg" />',
        f'<meta property="og:image:width" content="{OG_SIZE[0]}" />',
        f'<meta property="og:image:height" content="{OG_SIZE[1]}" />',
        '<meta name="twitter:card" content="summary_large_image" />',
        f'<meta name="twitter:title" content="{e(title)}" />',
        f'<meta name="twitter:description" content="{e(description)}" />',
        f'<meta name="twitter:image" content="{e(image)}" />',
    ])


# The index's own copies of these are dropped so each appears once.
_STRIP = re.compile(
    r'\s*<(?:title>[^<]*</title>|meta\s+(?:name|property)="(?:description|og:[^"]*|twitter:[^"]*)"[^>]*>|link\s+rel="canonical"[^>]*>)',
    re.IGNORECASE,
)


def _page(tags, url):
    index = _index_html()
    if index and "</head>" in index:
        index = _STRIP.sub("", index)
        body = index.replace("</head>", f"{tags}\n</head>", 1)
    else:
        body = (
            f"<!doctype html><html><head><meta charset=\"utf-8\" />{tags}</head>"
            f'<body><a href="{html.escape(url)}">Open in Namo</a></body></html>'
        )
    response = HttpResponse(body, content_type="text/html; charset=utf-8")
    # Pages are never cached (the app's own rule): a new deploy and an edited
    # title must both show on the next load.
    response["Cache-Control"] = "no-cache"
    return response


def _summary(text, limit=180):
    text = re.sub(r"\s+", " ", (text or "")).strip()
    return text if len(text) <= limit else text[: limit - 1].rsplit(" ", 1)[0] + "…"


def blog_page(request, content_id):
    url = f"{_site()}/read/{content_id}"
    row = Content.objects.filter(pk=content_id, kind=Content.Kind.ARTICLE,
                                 status=Content.Status.LIVE).first()
    if row is None:
        return _page(_tags(title="Namo", description="Astrology, darshan and the shop, in one app.",
                           image=f"{_site()}{FALLBACK_IMAGE}", url=url, kind="website"), url)
    image = f"{_site()}/og/blog/{row.id}.jpg" if row.media_url else f"{_site()}{FALLBACK_IMAGE}"
    return _page(_tags(title=row.title or "A blog on Namo", description=_summary(row.body),
                       image=image, url=url), url)


def _product(key):
    rows = Product.objects.filter(active=True)
    try:
        return rows.filter(pk=uuid.UUID(str(key))).first()
    except ValueError:
        return rows.filter(slug=str(key)).first()


def product_page(request, key):
    url = f"{_site()}/shop/p/{key}"
    p = _product(key)
    if p is None:
        return _page(_tags(title="Namo shop", description="Gemstones, rudraksha, maalas and remedies.",
                           image=f"{_site()}{FALLBACK_IMAGE}", url=url, kind="website"), url)
    price = f"₹{p.price_paise / 100:,.0f}"
    from apps.shop.services import plain_text

    description = p.seo_description or _summary(plain_text(p.description)) or p.subtitle or ""
    image = f"{_site()}/og/product/{p.id}.jpg" if p.image_url else f"{_site()}{FALLBACK_IMAGE}"
    return _page(_tags(title=f"{p.seo_title or p.name} · {price}", description=description,
                       image=image, url=url, kind="product"), url)


def og_image(request, kind, item_id):
    """A 1200 × 630 JPEG cut from a blog cover or a product photo — light
    enough for every link preview. Any failure redirects to the site's own
    og.png rather than a broken card."""
    if kind == "blog":
        row = Content.objects.filter(pk=item_id, status=Content.Status.LIVE).first()
        source = row.media_url if row else None
    else:
        row = Product.objects.filter(pk=item_id, active=True).first()
        source = row.image_url if row else None
    if not source:
        return HttpResponseRedirect(f"{_site()}{FALLBACK_IMAGE}")
    key = f"share:og:{kind}:{item_id}:{hash(source)}"
    data = cache.get(key)
    if data is None:
        try:
            data = _thumbnail(source)
        except Exception as exc:  # noqa: BLE001 — any image failure is the fallback
            logger.warning("share: thumbnail failed for %s %s: %s", kind, item_id, exc)
            return HttpResponseRedirect(f"{_site()}{FALLBACK_IMAGE}")
        cache.set(key, data, 3600)
    response = HttpResponse(data, content_type="image/jpeg")
    # The CDN in front keeps it a day; a new cover gets a new address only
    # if the URL changes, so a day is the longest a stale card can live.
    response["Cache-Control"] = "public, max-age=86400"
    return response


def _thumbnail(source):
    from PIL import Image, ImageOps

    response = requests.get(source, timeout=8)
    response.raise_for_status()
    if len(response.content) > 25 * 1024 * 1024:
        raise ValueError("source image too large")
    image = Image.open(io.BytesIO(response.content))
    image = ImageOps.exif_transpose(image).convert("RGB")
    image = ImageOps.fit(image, OG_SIZE, method=Image.Resampling.LANCZOS, centering=(0.5, 0.45))
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=80, optimize=True, progressive=True)
    return out.getvalue()
