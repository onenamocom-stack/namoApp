"""Every NAMO icon file from draw.py's geometry (24 Oct 2026, Rahul: the
splash icon is blurry). Writes into the repo's public/ and the Android
project's res/; the old files are backed up beside this script first."""
import os, shutil, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from draw import icon

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = sys.argv[1]
RES = os.path.expanduser('~/android-build/namo-twa/app/src/main/res')
ORANGE = (255, 116, 31, 255)

full = icon(2400)                      # rounded square
glyph = icon(2400, square=False)       # the white infinity alone

def maskable(n):
    # Full-bleed orange; the infinity at the old file's 57 % width, inside the safe zone.
    out = Image.new('RGBA', (2400, 2400), ORANGE)
    s = 0.57 / 0.813                   # draw.py's infinity spans 81.3 % of its canvas
    g = glyph.resize((int(2400 * s), int(2400 * s)), Image.LANCZOS)
    out.alpha_composite(g, ((2400 - g.width) // 2, (2400 - g.height) // 2))
    return out.resize((n, n), Image.LANCZOS)

def rounded(n):
    return full.resize((n, n), Image.LANCZOS)

backup = os.path.join(HERE, 'backup')
targets = []
for name, n in [('favicon.png', 64), ('apple-touch-icon.png', 180), ('icon-192.png', 192),
                ('icon-512.png', 512), ('namo-icon.png', 512)]:
    targets.append((os.path.join(REPO, 'public', name), rounded(n)))
targets.append((os.path.join(REPO, 'public', 'icon-maskable-512.png'), maskable(512)))
for d, n in [('mdpi', 1), ('hdpi', 1.5), ('xhdpi', 2), ('xxhdpi', 3), ('xxxhdpi', 4)]:
    targets.append((os.path.join(RES, f'drawable-{d}', 'splash.png'), rounded(int(300 * n))))
    targets.append((os.path.join(RES, f'mipmap-{d}', 'ic_launcher.png'), rounded(int(48 * n))))
    targets.append((os.path.join(RES, f'mipmap-{d}', 'ic_maskable.png'), maskable(int(82 * n))))
for path, img in targets:
    keep = os.path.join(backup, os.path.basename(os.path.dirname(path)), os.path.basename(path))
    os.makedirs(os.path.dirname(keep), exist_ok=True)
    if not os.path.exists(keep):
        shutil.copy2(path, keep)
    img.save(path, optimize=True)
    print(img.size[0], path)
