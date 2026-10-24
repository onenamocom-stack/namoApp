"""The NAMO icon drawn from geometry: an orange rounded square, a white
infinity of two rings joined by crossing straps, the rising strap broken
where the falling one passes over it. Measured from public/icon-512.png."""
import math, sys
from PIL import Image, ImageDraw

def icon(N=2400, ss=2, square=True):
    M = N * ss
    k = M / 1200  # the drawing's units are a 1200 px icon
    cy = 590 * k
    cl, cr = 355 * k, 845 * k
    rho, w, gap = 182 * k, 120 * k, 22 * k
    d = (cr - cl) / 2
    th = math.asin(rho / d)  # internal tangent angle
    mid = ((cl + cr) / 2, cy)
    m = Image.new('L', (M, M), 0)
    g = ImageDraw.Draw(m)
    keep = math.degrees(math.pi / 2 - th)  # half the arc each ring gives up to the straps
    def ring(cx, start, end):
        box = [cx - rho - w / 2, cy - rho - w / 2, cx + rho + w / 2, cy + rho + w / 2]
        g.arc(box, start, end, fill=255, width=int(w))
    def strap(sign, val, width, half=None):
        dx, dy = math.cos(th), sign * math.sin(th)
        L = half if half else d * math.cos(th)
        nx, ny = -dy, dx
        p1 = (mid[0] - dx * L, mid[1] - dy * L); p2 = (mid[0] + dx * L, mid[1] + dy * L)
        h = width / 2
        g.polygon([(p1[0] + nx * h, p1[1] + ny * h), (p2[0] + nx * h, p2[1] + ny * h),
                   (p2[0] - nx * h, p2[1] - ny * h), (p1[0] - nx * h, p1[1] - ny * h)], fill=val)
    ring(cl, keep - 1, 361 - keep)  # a degree over, so the joins close
    ring(cr, 179 + keep - 360, 181 - keep)
    strap(-1, 255, w)                         # rising strap ( / )
    strap(1, 0, w + 2 * gap, half=w * 0.8)    # broken where the other passes
    strap(1, 255, w)                          # falling strap ( \ ), on top
    m = m.resize((N, N), Image.LANCZOS)
    out = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    if square:
        bg = Image.new('L', (M, M), 0)
        ImageDraw.Draw(bg).rounded_rectangle([0, 0, M - 1, M - 1], radius=int(103 * k), fill=255)
        out.paste((255, 116, 31, 255), (0, 0), bg.resize((N, N), Image.LANCZOS))
    out.paste((255, 255, 255, 255), (0, 0), m)
    return out

if __name__ == '__main__':
    im = icon()
    im.save('icon-2400.png')
    v = Image.new('RGB', (1200, 1200), 'white'); s = im.resize((1200, 1200), Image.LANCZOS); v.paste(s, (0, 0), s); v.save('new-full.png')
