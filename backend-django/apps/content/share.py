"""Link previews for shared pages (6 Oct 2026, Rahul: "sharing of blog on
WhatsApp should go with the banner as thumbnail").

WhatsApp, Telegram, Facebook and Google read a link's HTML and never run
its JavaScript, so every 1namo.com link previewed as the front page. Firebase
Hosting sends the shareable addresses — `/read/<id>` (a blog),
`/reels/<id>` (a reel, 18 Oct 2026, Rahul: "it should show thumbnail") and
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
import os
import re
import uuid
import zlib

import requests
from django.conf import settings
from django.core.cache import cache
from django.http import HttpResponse, HttpResponseRedirect

from apps.shop.models import Product

from .models import Content

logger = logging.getLogger("apps.content.share")

INDEX_CACHE_SECONDS = 60
OG_SIZE = (1200, 630)
# A reel's card stands up, as Instagram's does on WhatsApp (Rahul, 18 Oct
# 2026: "insta ki tarah verticle"); it was 1200 × 630 with a blurred side.
REEL_SIZE = (720, 1280)
# A profile's card is the person's photo, square: WhatsApp then draws the
# small thumbnail beside the name rather than a cropped banner of a face.
PROFILE_SIZE = (600, 600)
# A shared photo post is its photo, square (18 Oct 2026, Rahul: every share
# with its thumbnail); it was the author's profile card.
POST_SIZE = (1080, 1080)
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


def _tags(*, title, description, image, url, kind="article", size=OG_SIZE):
    e = lambda s: html.escape(s or "", quote=True)  # noqa: E731
    return "\n".join([
        f"<title>{e(title)} · NAMO</title>",
        f'<meta name="description" content="{e(description)}" />',
        f'<link rel="canonical" href="{e(url)}" />',
        f'<meta property="og:type" content="{e(kind)}" />',
        '<meta property="og:site_name" content="NAMO" />',
        f'<meta property="og:title" content="{e(title)}" />',
        f'<meta property="og:description" content="{e(description)}" />',
        f'<meta property="og:url" content="{e(url)}" />',
        f'<meta property="og:image" content="{e(image)}" />',
        f'<meta property="og:image:secure_url" content="{e(image)}" />',
        '<meta property="og:image:type" content="image/jpeg" />',
        f'<meta property="og:image:width" content="{size[0]}" />',
        f'<meta property="og:image:height" content="{size[1]}" />',
        '<meta name="twitter:card" content="{}" />'.format(
            "summary" if size == PROFILE_SIZE else "summary_large_image"),
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
            f'<body><a href="{html.escape(url)}">Open in NAMO</a></body></html>'
        )
    response = HttpResponse(body, content_type="text/html; charset=utf-8")
    # Pages are never cached (the app's own rule): a new deploy and an edited
    # title must both show on the next load.
    response["Cache-Control"] = "no-cache"
    return response


def _summary(text, limit=180):
    text = re.sub(r"\s+", " ", (text or "")).strip()
    return text if len(text) <= limit else text[: limit - 1].rsplit(" ", 1)[0] + "…"


# What a link that matches nothing previews as (13 Oct 2026, Phase 15a:
# the Hindu social network, not "astrology, darshan and the shop"); the
# line itself is "Connecting Bharat" since 15 Oct 2026 (Rahul).
SITE_LINE = "Connecting Bharat. Bhakti, darshan, gurus and your kundli."


def blog_page(request, content_id):
    url = f"{_site()}/read/{content_id}"
    row = Content.objects.filter(pk=content_id, kind=Content.Kind.ARTICLE,
                                 status=Content.Status.LIVE).first()
    if row is None:
        return _page(_tags(title="NAMO", description=SITE_LINE,
                           image=f"{_site()}{FALLBACK_IMAGE}", url=url, kind="website"), url)
    image = f"{_site()}/og/blog/{row.id}.jpg" if row.media_url else f"{_site()}{FALLBACK_IMAGE}"
    return _page(_tags(title=row.title or "A blog on NAMO", description=_summary(row.body),
                       image=image, url=url), url)


def reel_page(request, content_id):
    """A reel's card: a frame of the video, whose name, and the caption."""
    from apps.profiles.models import Profile

    url = f"{_site()}/reels/{content_id}"
    row = Content.objects.filter(pk=content_id, kind="clip", status=Content.Status.LIVE).first()
    if row is None:
        return _page(_tags(title="NAMO", description=SITE_LINE,
                           image=f"{_site()}{FALLBACK_IMAGE}", url=url, kind="website"), url)
    name = Profile.objects.filter(pk=row.author_id).values_list("name", flat=True).first() or ""
    # `v=3`: the standing card with the logo, so a day-cached older one is
    # not reused.
    image = f"{_site()}/og/reel/{row.id}.jpg?v=3" if row.media_url else None
    title = f"{name}'s reel on NAMO" if name else "A reel on NAMO"
    return _page(_tags(title=title, description=_summary(row.caption) or "Watch it on NAMO.",
                       image=image or f"{_site()}{FALLBACK_IMAGE}", url=url, kind="video.other",
                       size=REEL_SIZE if image else OG_SIZE), url)


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
        return _page(_tags(title="NAMO shop", description="Gemstones, rudraksha, maalas and remedies.",
                           image=f"{_site()}{FALLBACK_IMAGE}", url=url, kind="website"), url)
    price = f"₹{p.price_paise / 100:,.0f}"
    from apps.shop.services import plain_text

    description = p.seo_description or _summary(plain_text(p.description)) or p.subtitle or ""
    image = f"{_site()}/og/product/{p.id}.jpg" if p.image_url else f"{_site()}{FALLBACK_IMAGE}"
    return _page(_tags(title=f"{p.seo_title or p.name} · {price}", description=description,
                       image=image, url=url, kind="product"), url)


_PICTURES = ("status", "wallpaper")
# A bhajan or mantra is a sound; its cover picture is its card (12 Oct 2026,
# Rahul: a shared bhajan previewed as the site's own card).
_SOUNDS = ("bhajan", "mantra", "ebook")  # a book's cover is public, priced or not


def _bhakti_picture(asset):
    """The picture a Bhakti item's preview may show: the image itself when it
    is free, its public preview when it is priced (the full file is in the
    private bucket and is not given away by a link), the cover for a bhajan
    or mantra, nothing for any other sound."""
    if asset.kind in _SOUNDS:
        source = asset.preview_url
        return source if source and source.startswith("http") else None
    if asset.kind not in _PICTURES:
        return None
    source = asset.preview_url if asset.price_paise else asset.media_url
    if source and source.startswith("/") and not asset.price_paise:
        return f"{_site()}{source}"   # art shipped with the site itself
    return source if source and source.startswith("http") else None


def bhakti_page(request, asset_id):
    """A shared Bhakti item (8 Oct 2026): its own address, so WhatsApp's
    preview shows the picture with the title, not the site's card."""
    from apps.bhakti.models import BhaktiAsset

    url = f"{_site()}/bhakti/s/{asset_id}"
    asset = BhaktiAsset.objects.filter(pk=asset_id, active=True).first()
    if asset is None:
        return _page(_tags(title="NAMO", description="Bhajans, mantras and daily darshan in one app.",
                           image=f"{_site()}{FALLBACK_IMAGE}", url=url, kind="website"), url)
    image = (f"{_site()}/og/bhakti/{asset.id}.jpg" if _bhakti_picture(asset)
             else f"{_site()}{FALLBACK_IMAGE}")
    description = {
        "bhajan": "Listen to this bhajan on NAMO.",
        "mantra": "Listen to this mantra on NAMO.",
        "wallpaper": "A wallpaper from NAMO.",
        "status": "A WhatsApp status from NAMO.",
        "ebook": "Read this e-book on NAMO.",
    }.get(asset.kind, "Bhajans, mantras and daily darshan in one app.")
    return _page(_tags(title=asset.title, description=description,
                       image=image, url=url, kind="website"), url)


_LISTING_WORDS = {"download": "A download", "course": "A course", "event": "An event"}


def listing_page(request, listing_id):
    """A Market listing, `/shop/l/<id>` (18 Oct 2026, Rahul): a PDF or
    other download, a course, an event — its cover, title, price and
    seller. Only an approved one; anything else previews as NAMO."""
    from apps.market.models import Listing, ListingStatus
    from apps.profiles.models import Profile

    url = f"{_site()}/shop/l/{listing_id}"
    row = Listing.objects.filter(pk=listing_id, status=ListingStatus.APPROVED).first()
    if row is None:
        return _page(_tags(title="NAMO", description=SITE_LINE,
                           image=f"{_site()}{FALLBACK_IMAGE}", url=url, kind="website"), url)
    seller = Profile.objects.filter(pk=row.seller_id).values_list("name", flat=True).first() or ""
    price = f"₹{row.price_paise / 100:,.0f}" if row.price_paise else "Free"
    what = _LISTING_WORDS.get(row.kind, "On the Market")
    by = f" by {seller}" if seller else ""
    description = _summary(row.description) or f"{what} on NAMO{by}."
    image = f"{_site()}/og/listing/{row.id}.jpg" if row.cover_url else f"{_site()}{FALLBACK_IMAGE}"
    return _page(_tags(title=f"{row.title} · {price}", description=description, image=image,
                       url=url, kind="product"), url)


def download_page(request, asset_id):
    """One of Namo's own downloads, `/shop/d/<id>` (an e-book), previewed
    as its Bhakti page is, at its own address."""
    from apps.bhakti.models import BhaktiAsset

    url = f"{_site()}/shop/d/{asset_id}"
    asset = BhaktiAsset.objects.filter(pk=asset_id, active=True).first()
    if asset is None:
        return _page(_tags(title="NAMO", description=SITE_LINE,
                           image=f"{_site()}{FALLBACK_IMAGE}", url=url, kind="website"), url)
    image = (f"{_site()}/og/bhakti/{asset.id}.jpg" if _bhakti_picture(asset)
             else f"{_site()}{FALLBACK_IMAGE}")
    price = f"₹{asset.price_paise / 100:,.0f}" if asset.price_paise else "Free"
    return _page(_tags(title=f"{asset.title} · {price}", description="Read it on NAMO.",
                       image=image, url=url, kind="product"), url)


def _public_profile(username=None, profile_id=None):
    """(profile, consultant row or None) for somebody a username link may
    show — the resolve_username rule, so a card never names a person the
    app itself would not open."""
    from apps.consultants.models import Consultant, ConsultantStatus
    from apps.profiles import services as profiles
    from apps.profiles.models import Profile

    if username is not None:
        found = profiles.resolve_username(username)
        if found is None:
            return None, None
        profile_id = found["id"]
    elif profiles.public_profile(profile_id) is None:
        return None, None
    profile = Profile.objects.filter(pk=profile_id, blocked_at__isnull=True).first()
    if profile is None:
        return None, None
    pro = Consultant.objects.filter(profile_id=profile.pk, status=ConsultantStatus.APPROVED).first()
    return profile, pro


def _post_tags(request, profile, url):
    """A post shared from its author's page (`?post=<id>`): the post's own
    card — its photo, whose post, its words — when it is that author's
    live post; None otherwise, and the person's card stands."""
    try:
        post_id = uuid.UUID(request.GET.get("post") or "")
    except ValueError:
        return None
    row = Content.objects.filter(pk=post_id, author_id=profile.pk, status=Content.Status.LIVE,
                                 kind=Content.Kind.POST).first()
    if row is None:
        return None
    url = f"{url}?post={row.id}"
    image = f"{_site()}/og/post/{row.id}.jpg" if row.media_url else None
    tags = _tags(title=f"{profile.name}'s post on NAMO",
                 description=_summary(row.caption or row.title or row.body) or "See it on NAMO.",
                 image=image or f"{_site()}{FALLBACK_IMAGE}", url=url,
                 size=POST_SIZE if image else OG_SIZE)
    return tags, url


def person_page(request, profile_id):
    """`/u/<id>` and `/consult/<id>` (18 Oct 2026): the person's card, as
    their username link has, or a post shared from their page."""
    kind = "consult" if request.path.startswith("/consult/") else "u"
    url = f"{_site()}/{kind}/{profile_id}"
    profile, pro = _public_profile(profile_id=profile_id)
    if profile is None:
        return _page(_tags(title="NAMO", description=SITE_LINE,
                           image=f"{_site()}{FALLBACK_IMAGE}", url=url, kind="website"), url)
    return _person(request, profile, pro, url)


def profile_page(request, username):
    """1namo.com/<username> (12 Oct 2026, Rahul): the person's own card —
    photo, name, and what they do or their bio. A name nobody has, or that
    the app would not open, previews as Namo."""
    url = f"{_site()}/{username}"
    profile, pro = _public_profile(username=username)
    if profile is None:
        return _page(_tags(title="NAMO", description=SITE_LINE,
                           image=f"{_site()}{FALLBACK_IMAGE}", url=url, kind="website"), url)
    return _person(request, profile, pro, url)


def _person(request, profile, pro, url):
    post = _post_tags(request, profile, url)
    if post is not None:
        return _page(*post)
    if pro is not None:
        title = f"{profile.name} · {pro.category or 'Pro'} on NAMO"
        description = _summary(pro.specialization or pro.bio or profile.bio) or "Talk to them on NAMO."
    else:
        title = f"{profile.name} on NAMO"
        description = _summary(profile.bio) or "Their posts on NAMO."
    if profile.avatar_url:
        # The photo's own version rides along, so a new picture is a new
        # address and no cache shows the old face.
        version = zlib.crc32(profile.avatar_url.encode()) % 10**8
        image, size = f"{_site()}/og/profile/{profile.id}.jpg?v={version}", PROFILE_SIZE
    else:
        image, size = f"{_site()}{FALLBACK_IMAGE}", OG_SIZE
    return _page(_tags(title=title, description=description, image=image, url=url,
                       kind="profile", size=size), url)


def home_page(request):
    """1namo.com itself (12 Oct 2026). Hosting sends `/` here so the card is
    the console's Link card; with no card set, the app's own tags stand."""
    from apps.appearance.models import LinkCard

    url = f"{_site()}/"
    card = LinkCard.objects.first()
    if not card:
        index = _index_html()
        if index:
            response = HttpResponse(index, content_type="text/html; charset=utf-8")
            response["Cache-Control"] = "no-cache"
            return response
        return HttpResponseRedirect(f"{_site()}/home")
    if card.image_url:
        version = zlib.crc32(card.image_url.encode())
        image = f"{_site()}/og/site/{card.id}.jpg?v={version}"
    else:
        image = f"{_site()}{FALLBACK_IMAGE}"
    return _page(_tags(title=card.title, description=card.description, image=image,
                       url=url, kind="website"), url)


def og_image(request, kind, item_id):
    """A 1200 × 630 JPEG cut from a blog cover or a product photo — light
    enough for every link preview. Any failure redirects to the site's own
    og.png rather than a broken card."""
    if kind in ("blog", "reel", "post"):
        row = Content.objects.filter(pk=item_id, status=Content.Status.LIVE).first()
        source = row.media_url if row else None
    elif kind == "listing":
        from apps.market.models import Listing, ListingStatus

        row = Listing.objects.filter(pk=item_id, status=ListingStatus.APPROVED).first()
        source = row.cover_url if row else None
    elif kind == "bhakti":
        from apps.bhakti.models import BhaktiAsset

        row = BhaktiAsset.objects.filter(pk=item_id, active=True).first()
        source = _bhakti_picture(row) if row else None
    elif kind == "profile":
        row, _ = _public_profile(profile_id=item_id)
        source = row.avatar_url if row else None
    elif kind == "site":
        from apps.appearance.models import LinkCard

        row = LinkCard.objects.filter(pk=item_id).first()
        source = row.image_url if row else None
    else:
        row = Product.objects.filter(pk=item_id, active=True).first()
        source = row.image_url if row else None
    if not source:
        return HttpResponseRedirect(f"{_site()}{FALLBACK_IMAGE}")
    key = f"share:og:{kind}:{item_id}:{zlib.crc32(source.encode())}"
    data = cache.get(key)
    if data is None:
        try:
            if kind == "reel":
                data = _reel_card(source)
            else:
                data = _thumbnail(source, {"profile": PROFILE_SIZE, "post": POST_SIZE}.get(kind, OG_SIZE))
        except Exception as exc:  # noqa: BLE001 — any image failure is the fallback
            logger.warning("share: thumbnail failed for %s %s: %s", kind, item_id, exc)
            return HttpResponseRedirect(f"{_site()}{FALLBACK_IMAGE}")
        cache.set(key, data, 3600)
    response = HttpResponse(data, content_type="image/jpeg")
    # The CDN in front keeps it a day; a new cover gets a new address only
    # if the URL changes, so a day is the longest a stale card can live.
    response["Cache-Control"] = "public, max-age=86400"
    return response


def _thumbnail(source, size=OG_SIZE):
    from PIL import Image, ImageOps

    response = requests.get(source, timeout=8)
    response.raise_for_status()
    if len(response.content) > 25 * 1024 * 1024:
        raise ValueError("source image too large")
    image = Image.open(io.BytesIO(response.content))
    image = ImageOps.exif_transpose(image).convert("RGB")
    image = ImageOps.fit(image, size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.45))
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=80, optimize=True, progressive=True)
    return out.getvalue()


def _frame(source):
    """One frame of a video at its URL, as a PIL image: a second in, or the
    first frame of a shorter one. FFmpeg reads only what it needs over
    HTTP. The system's FFmpeg (Debian's, in the API image); imageio-ffmpeg's
    static one only where there is none (a dev machine), because on Cloud
    Run that one crashed with signal 11 (18 Oct 2026)."""
    import shutil
    import subprocess

    from PIL import Image

    exe = shutil.which("ffmpeg")
    if not exe:
        import imageio_ffmpeg

        exe = imageio_ffmpeg.get_ffmpeg_exe()
    # A reel from the video pipeline is an HLS playlist; its folder holds
    # the worker's thumbnail, one small file (18 Oct 2026).
    if source.endswith("/master.m3u8"):
        source = source[: -len("master.m3u8")] + "thumb.webp"
    for at in ("1", "0"):
        out = subprocess.run(
            [exe, "-hide_banner", "-loglevel", "error", "-ss", at, "-i", source,
             "-frames:v", "1", "-f", "image2pipe", "-vcodec", "mjpeg", "-"],
            capture_output=True, timeout=20,
        )
        if out.returncode == 0 and out.stdout:
            return Image.open(io.BytesIO(out.stdout))
    raise ValueError("no frame")


# NAMO's logo with white letters (public/namo-logo-light.png), for the
# reel card's corner.
LOGO = os.path.join(os.path.dirname(__file__), "assets", "namo-logo-light.png")
LOGO_WIDTH = 130
# WhatsApp shows a standing image cut to about 5:7 around its middle, so
# the corner it shows starts about this far down a 720 × 1280 card.
SHOWN_TOP = 140


def _logo(card):
    """The logo in the top right corner (Rahul, 18 Oct 2026), on a soft
    dark band so it reads over any frame, inside the part WhatsApp shows."""
    from PIL import Image, ImageDraw, ImageFilter

    logo = Image.open(LOGO).convert("RGBA")
    logo = logo.resize((LOGO_WIDTH, round(logo.height * LOGO_WIDTH / logo.width)), Image.Resampling.LANCZOS)
    x, y = card.width - LOGO_WIDTH - 28, SHOWN_TOP + 24
    shade = Image.new("L", card.size, 0)
    ImageDraw.Draw(shade).rounded_rectangle((x - 14, y - 10, x + logo.width + 14, y + logo.height + 10),
                                            radius=16, fill=110)
    shade = shade.filter(ImageFilter.GaussianBlur(10))
    card.paste(Image.new("RGB", card.size, (0, 0, 0)), (0, 0), shade)
    card.paste(logo, (x, y), logo)


def _reel_card(source):
    """720 × 1280, standing: a portrait reel fills it (the edges trimmed to
    9:16); a landscape one sits whole across the middle over a dark blur
    of itself. A play mark in the centre."""
    from PIL import Image, ImageDraw, ImageFilter, ImageOps

    frame = ImageOps.exif_transpose(_frame(source)).convert("RGB")
    w, h = REEL_SIZE
    back = ImageOps.fit(frame, REEL_SIZE, method=Image.Resampling.LANCZOS)
    if frame.height < frame.width * 1.2:
        back = back.filter(ImageFilter.GaussianBlur(28))
        back = Image.blend(back, Image.new("RGB", REEL_SIZE, (0, 0, 0)), 0.45)
        front = frame.resize((w, max(1, round(frame.height * w / frame.width))), Image.Resampling.LANCZOS)
        back.paste(front, (0, (h - front.height) // 2))
    # A play mark in the middle: a reel, not a photo.
    draw = ImageDraw.Draw(back, "RGBA")
    cx, cy, r = w // 2, h // 2, 54
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(0, 0, 0, 120))
    draw.polygon([(cx - 18, cy - 28), (cx - 18, cy + 28), (cx + 30, cy)], fill=(255, 255, 255, 235))
    _logo(back)
    out = io.BytesIO()
    back.save(out, format="JPEG", quality=80, optimize=True, progressive=True)
    return out.getvalue()
