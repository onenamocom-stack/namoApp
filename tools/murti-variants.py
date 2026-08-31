"""Turn supplied murti photographs into shrine images.

The shrine fits the whole picture in — `object-contain`, nothing cropped, no
generated wall behind it. So all this does is apply the house tone and cap the
size; the shape of the file is the shape of the photograph.

Never upscales. Several of these sources are small and enlarging them only
makes a soft image into a bigger soft image.

Usage:  python murti-variants.py <name> <file> [<name> <file> ...]
Writes: ../public/deities/<name>.webp
"""
import os
import sys
from PIL import Image, ImageEnhance

HERE = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(HERE, '..', 'public', 'deities')

# The shrine is 420 CSS px wide and up to ~710 tall; this is roughly 2x that,
# which is as much as a phone can show.
MAX_W, MAX_H = 840, 1260


def treat(im):
    """The house tone. Same values as deity-art-process.py — keep them in step."""
    im = ImageEnhance.Color(im).enhance(0.80)
    im = ImageEnhance.Contrast(im).enhance(1.05)
    im = Image.blend(im, Image.new('RGB', im.size, (241, 239, 236)), 0.10)
    r, g, b = im.split()
    r = r.point(lambda v: min(255, int(v * 1.035)))
    b = b.point(lambda v: int(v * 0.965))
    return Image.merge('RGB', (r, g, b))


def fit(im):
    im = im.copy()
    im.thumbnail((MAX_W, MAX_H), Image.LANCZOS)   # thumbnail never enlarges
    return treat(im)


if __name__ == '__main__':
    args = sys.argv[1:]
    if len(args) < 2 or len(args) % 2:
        raise SystemExit(__doc__)
    os.makedirs(DEST, exist_ok=True)
    for name, path in zip(args[::2], args[1::2]):
        out = os.path.join(DEST, f'{name}.webp')
        im = fit(Image.open(path).convert('RGB'))
        im.save(out, 'WEBP', quality=82, method=6)
        print(f'{name}.webp  {im.width}x{im.height}  {os.path.getsize(out)//1024} KB')
