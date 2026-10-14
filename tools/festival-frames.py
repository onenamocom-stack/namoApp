"""The built-in festival frames (14 Oct 2026, docs/06 Phase 15c).

Two steps, because this Pillow has no Devanagari shaping (no libraqm) and
set Hindi with its vowel signs in the wrong place:

    backend-django/.venv/Scripts/python.exe tools/festival-frames.py
    node tools/festival-frames-text.mjs

The first draws the decoration into tools/frames-art/<name>.png and the
words to set into tools/frames-art/text.json; the second has Chrome set the
words (it shapes Hindi correctly) and writes public/frames/<name>.png:
1080 x 1350 (4:5, a feed photo), opaque border and a transparent middle the
person's photo shows through.

Drawn, not traced from anybody's artwork: marigold garlands, diyas, a bow
and arrow, and the greeting in English and Hindi. Console-uploaded frames
(appearance `Frame`) need no script.
"""

import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1350
OUT = os.path.join(os.path.dirname(__file__), "frames-art")
TEXT = {}
NIRMALA = "C:/Windows/Fonts/Nirmala.ttc"
GEORGIA_B = "C:/Windows/Fonts/georgiab.ttf"


def font(path, size, index=0):
    try:
        return ImageFont.truetype(path, size, index=index)
    except OSError:
        return ImageFont.load_default()


def hole(img, inset_side, inset_top, inset_bottom, radius):
    """Cut the transparent window the photo shows through."""
    mask = Image.new("L", img.size, 255)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle((inset_side, inset_top, W - inset_side, H - inset_bottom), radius, fill=0)
    img.putalpha(Image.composite(img.getchannel("A"), Image.new("L", img.size, 0), mask))


def band(img, top, bottom, c1, c2):
    """A vertical gradient filling the whole frame (the window is cut later)."""
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        c = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3)) + (255,)
        d.line((0, y, W, y), fill=c)


def marigold(d, x, y, r, hue):
    for k in range(10):
        a = k * math.pi / 5
        px, py = x + math.cos(a) * r * 0.55, y + math.sin(a) * r * 0.55
        d.ellipse((px - r * 0.55, py - r * 0.55, px + r * 0.55, py + r * 0.55), fill=hue)
    d.ellipse((x - r * 0.45, y - r * 0.45, x + r * 0.45, y + r * 0.45), fill=(255, 196, 40))
    d.ellipse((x - r * 0.18, y - r * 0.18, x + r * 0.18, y + r * 0.18), fill=(214, 110, 10))


def garland(d, x0, y0, x1, y1, n, r, rng):
    for i in range(n + 1):
        t = i / n
        x = x0 + (x1 - x0) * t
        y = y0 + (y1 - y0) * t
        hue = rng.choice([(255, 140, 0), (255, 165, 20), (240, 110, 10), (255, 190, 40)])
        marigold(d, x, y, r, hue)


def swag(d, x0, x1, y, sag, n, r, rng):
    """A garland hanging in a curve across the top."""
    for i in range(n + 1):
        t = i / n
        x = x0 + (x1 - x0) * t
        yy = y + math.sin(t * math.pi) * sag
        hue = rng.choice([(255, 140, 0), (255, 165, 20), (240, 110, 10), (255, 190, 40)])
        marigold(d, x, yy, r, hue)


def diya(img, cx, cy, s):
    d = ImageDraw.Draw(img)
    d.chord((cx - s, cy - s * 0.55, cx + s, cy + s * 0.75), 0, 180, fill=(176, 72, 24))
    d.chord((cx - s * 0.9, cy - s * 0.45, cx + s * 0.9, cy + s * 0.55), 0, 180, fill=(214, 104, 40))
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    g.ellipse((cx - s * 0.9, cy - s * 2.2, cx + s * 0.9, cy - s * 0.2), fill=(255, 200, 80, 120))
    glow = glow.filter(ImageFilter.GaussianBlur(s * 0.4))
    img.alpha_composite(glow)
    d = ImageDraw.Draw(img)
    d.polygon([(cx, cy - s * 1.6), (cx - s * 0.32, cy - s * 0.25), (cx + s * 0.32, cy - s * 0.25)], fill=(255, 176, 30))
    d.polygon([(cx, cy - s * 1.15), (cx - s * 0.16, cy - s * 0.3), (cx + s * 0.16, cy - s * 0.3)], fill=(255, 240, 170))


def text_center(d, y, s, f, fill, stroke=None):
    """Recorded, not drawn: Chrome sets it (see the docstring). `f` is
    (family, px)."""
    family, px = f
    TEXT.setdefault(CURRENT[0], []).append(
        {"text": s, "top": y, "family": family, "px": px, "colour": "#%02x%02x%02x" % fill[:3]})


CURRENT = [None]


def navratri():
    rng = random.Random(9)
    img = Image.new("RGBA", (W, H))
    band(img, 0, H, (160, 20, 60), (110, 10, 70))
    d = ImageDraw.Draw(img)
    for x in range(30, W, 90):  # small mirror-work dots along the edges
        for y in (24, H - 28):
            d.ellipse((x - 7, y - 7, x + 7, y + 7), fill=(255, 215, 120))
    garland(d, 34, 150, 34, H - 230, 22, 22, rng)
    garland(d, W - 34, 150, W - 34, H - 230, 22, 22, rng)
    swag(d, 34, W - 34, 120, 70, 26, 24, rng)
    text_center(d, 18, "Shubh Navratri", ("Georgia", 70), (255, 226, 150))
    text_center(d, H - 200, "शुभ नवरात्रि", ("Nirmala UI", 86), (255, 226, 150))
    text_center(d, H - 90, "Jai Mata Di", ("Georgia", 46), (255, 255, 255))
    hole(img, 70, 210, 230, 36)
    return img


def dussehra():
    img = Image.new("RGBA", (W, H))
    band(img, 0, H, (200, 70, 10), (120, 30, 10))
    d = ImageDraw.Draw(img)
    # A bow drawn with its arrow, top centre.
    d.arc((W / 2 - 170, 40, W / 2 + 170, 300), 200, 340, fill=(255, 220, 140), width=12)
    d.line((W / 2 - 160, 118, W / 2 + 160, 118), fill=(255, 245, 210), width=4)
    d.line((W / 2 - 230, 118, W / 2 + 230, 118), fill=(255, 220, 140), width=8)
    d.polygon([(W / 2 + 230, 104), (W / 2 + 270, 118), (W / 2 + 230, 132)], fill=(255, 220, 140))
    for x in range(40, W, 60):
        d.ellipse((x - 9, H - 30, x + 9, H - 12), fill=(255, 200, 90))
    text_center(d, 150, "Happy Dussehra", ("Georgia", 62), (255, 236, 190))
    text_center(d, H - 210, "विजयादशमी की शुभकामनाएँ", ("Nirmala UI", 72), (255, 236, 190))
    text_center(d, H - 110, "Truth wins", ("Georgia", 44), (255, 255, 255))
    hole(img, 60, 250, 230, 36)
    return img


def diwali():
    rng = random.Random(3)
    img = Image.new("RGBA", (W, H))
    band(img, 0, H, (40, 14, 70), (20, 8, 40))
    d = ImageDraw.Draw(img)
    for _ in range(140):  # stars and sparks
        x, y = rng.randrange(W), rng.randrange(H)
        r = rng.choice([1, 2, 2, 3])
        d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 220, 140, 255))
    swag(d, 30, W - 30, 40, 60, 28, 20, rng)
    text_center(d, 110, "Shubh Deepawali", ("Georgia", 68), (255, 214, 110))
    for i in range(7):
        diya(img, 100 + i * (W - 200) / 6, H - 120, 40)
    d = ImageDraw.Draw(img)
    text_center(d, H - 270, "शुभ दीपावली", ("Nirmala UI", 84), (255, 214, 110))
    hole(img, 60, 210, 300, 36)
    return img


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    import json

    for name, make in (("navratri", navratri), ("dussehra", dussehra), ("diwali", diwali)):
        CURRENT[0] = name
        path = os.path.join(OUT, f"{name}.png")
        make().save(path, optimize=True)
        print(path)
    with open(os.path.join(OUT, "text.json"), "w", encoding="utf-8") as fh:
        json.dump(TEXT, fh, ensure_ascii=False, indent=1)
