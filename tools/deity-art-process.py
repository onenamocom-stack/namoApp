"""Download the picked deity art at full size, fit it to the app's palette.

Run from anywhere; writes straight into public/deities/. Needs the candidate
JSON that deity-art-search.py leaves in ./cand — run that first if the folder
is missing, and re-pick the indices in PICKS from its contact sheets, because
Commons search results are not stable over time.
"""
import json, os, re, urllib.request
from PIL import Image, ImageEnhance

UA = 'aether-mono-dev/1.0 (prototype; contact administrator@sleepycat.in)'
HERE = os.path.dirname(os.path.abspath(__file__))
CAND = os.path.join(HERE, 'cand')
RAW = os.path.join(HERE, 'raw')
DEST = os.path.join(HERE, '..', 'public', 'deities')
os.makedirs(RAW, exist_ok=True)
os.makedirs(DEST, exist_ok=True)

# (deity key, source sheet, index in that sheet's json, vertical crop bias 0=top
#  1=bottom, zoom). zoom > 1 tightens onto the centre before the 4:5 crop; zoom
#  None means the source is a cut-out on white, so contain it on cream instead
#  of cropping the pedestal off.
PICKS = [
    ('ganesh',  'ganesh',   0, 0.30, 1.0),
    ('ganesh',  'ganesh',   5, 0.45, 1.0),
    ('ganesh',  'ganesh',   9, 0.40, 1.0),
    ('ganesh',  'ganesh',  11, 0.45, 1.18),
    ('shiva',   'shiva',    0, 0.35, 1.0),
    ('shiva',   'shiva',    1, 0.00, 1.0),
    ('shiva',   'shiva',    5, 0.40, 1.0),
    ('shiva',   'shiva',    9, 0.45, 1.0),
    ('lakshmi', 'lakshmi',  0, 0.35, 1.0),
    ('lakshmi', 'lakshmi',  4, 0.35, 1.0),
    ('lakshmi', 'lakshmi',  7, 0.40, 1.0),
    ('lakshmi', 'lakshmi',  8, 0.35, 1.0),
    ('hanuman', 'hanuman2',10, 0.40, 1.0),
    ('hanuman', 'hanuman2', 2, 0.42, 1.45),
    ('hanuman', 'hanuman2', 5, 0.40, 1.0),
    ('hanuman', 'hanuman2', 9, 0.40, 1.0),
    ('durga',   'durga',    1, 0.35, 1.0),
    ('durga',   'durga',    0, 0.00, 1.0),
    ('durga',   'durga',   10, 0.40, 1.0),
    ('durga',   'durga',    8, 0.35, 1.0),
    ('shani',   'shani3',   7, 0.40, 1.0),
    ('shani',   'shani3',   3, 0.35, 1.0),
    ('shani',   'shani3',   9, 0.40, None),
]

# The shrine fits the whole picture in — `object-contain` — so nothing here
# crops or pads. This is the cap, roughly 2x the 420px-wide shrine box, and
# `thumbnail` never enlarges, which matters because seven of these sources are
# under 900px on the short edge and blowing them up only makes bigger blur.
MAX_W, MAX_H = 840, 1260


def fetch(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 4000:
        return
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=180) as r, open(path, 'wb') as f:
        f.write(r.read())


def treat(im):
    """Mute and warm a saturated devotional print until it sits on a cream canvas.

    A flat cream blend at 10% is what an old print already does to itself — it
    lifts the blacks and pulls everything half a step toward the paper. That
    plus a light desaturation is the whole treatment; anything stronger turns
    the gold leaf grey, which is the one colour the app cannot lose.
    """
    im = ImageEnhance.Color(im).enhance(0.80)
    im = ImageEnhance.Contrast(im).enhance(1.05)
    im = Image.blend(im, Image.new('RGB', im.size, (241, 239, 236)), 0.10)
    r, g, b = im.split()
    r = r.point(lambda v: min(255, int(v * 1.035)))
    b = b.point(lambda v: int(v * 0.965))
    return Image.merge('RGB', (r, g, b))


def fit(im, bias, zoom):
    """Cap the size, optionally tightening onto the centre first.

    There used to be a `mount` here that contained the painting on a wall
    blurred out of itself, because the shrine cover-cropped to a fixed aspect
    and every source is a different shape. The shrine contains now, so the
    wall has nothing to fill and the painting keeps its own proportions.

    `zoom` survives for the few sources that carry a wide mount or margin of
    their own; it is a crop of the artwork, not a reframe of the shrine.
    """
    if zoom and zoom > 1:
        w, h = int(im.width / zoom), int(im.height / zoom)
        y = int((im.height - h) * bias)
        im = im.crop(((im.width - w) // 2, y, (im.width - w) // 2 + w, y + h))
    im = im.copy()
    im.thumbnail((MAX_W, MAX_H), Image.LANCZOS)
    return im


meta, by_key = {}, {}
for key, sheet, idx, bias, zoom in PICKS:
    rec = json.load(open(os.path.join(CAND, f'{sheet}.json'), encoding='utf-8'))[idx]
    n = by_key.get(key, 0) + 1
    by_key[key] = n
    src = os.path.join(RAW, f'{key}-{n}.jpg')
    # Ask for a generously sized render rather than the original — some of these
    # scans are 8000px wide and we only ever show 600.
    url = re.sub(r'/\d+px-', '/1400px-', rec['thumb']).split('?')[0]
    try:
        fetch(url, src)
    except Exception:
        fetch(rec['full'], src)

    im = treat(fit(Image.open(src).convert('RGB'), bias, zoom))
    out = f'{key}-{n}.webp'
    im.save(os.path.join(DEST, out), 'WEBP', quality=80, method=6)

    title = re.sub(r'^File:|\.\w+$', '', rec['title'])
    artist = re.sub(r'\s+', ' ', rec['artist'] or '').strip(' ,')
    meta.setdefault(key, []).append({
        'file': out,
        'label': title,
        'credit': f"{artist + ' · ' if artist else ''}{rec['lic']} · Wikimedia Commons",
    })
    print(f'{out:20} {os.path.getsize(os.path.join(DEST, out))//1024:>4} KB  {title[:52]}')

json.dump(meta, open(os.path.join(HERE, 'deity-meta.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)

# Preview: every processed image in deity order, so one look catches a bad crop.
COLS = 6
rows = (len(PICKS) + COLS - 1) // COLS
sheet = Image.new('RGB', (COLS * 200, rows * 302), (241, 239, 236))
for i, (key, *_) in enumerate(PICKS):
    n = sum(1 for k, *_ in PICKS[:i + 1] if k == key)
    im = Image.open(os.path.join(DEST, f'{key}-{n}.webp'))
    im.thumbnail((186, 279), Image.LANCZOS)
    sheet.paste(im, ((i % COLS) * 200 + 7 + (186 - im.width) // 2,
                     (i // COLS) * 302 + 12 + (279 - im.height) // 2))
sheet.save(os.path.join(HERE, 'preview-deities.jpg'), quality=88)
print('preview written')
