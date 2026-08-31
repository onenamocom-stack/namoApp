"""Search Wikimedia Commons for public-domain deity art, build contact sheets."""
import json, os, re, sys, urllib.parse, urllib.request
from PIL import Image, ImageDraw

UA = 'aether-mono-dev/1.0 (prototype; contact administrator@sleepycat.in)'
OUT = os.path.dirname(os.path.abspath(__file__))
CAND = os.path.join(OUT, 'cand')
os.makedirs(CAND, exist_ok=True)

DEITIES = {
    'ganesh': (['Ganesha', 'Ganesh', 'Ganapati', 'Vinayaka'],
               ['Raja Ravi Varma Ganesha', 'Ganesha painting', 'Ganesha lithograph',
                'Ganesha miniature painting', 'Ganesha 19th century']),
    'shiva': (['Shiva', 'Mahadeva', 'Nataraja', 'Shankar'],
              ['Raja Ravi Varma Shiva', 'Shiva painting', 'Shiva lithograph',
               'Shiva miniature painting', 'Nataraja bronze']),
    'lakshmi': (['Lakshmi', 'Laxmi'],
                ['Raja Ravi Varma Lakshmi', 'Gaja Lakshmi painting',
                 'Lakshmi lithograph', 'Lakshmi painting 19th century']),
    'hanuman': (['Hanuman', 'Maruti', 'Anjaneya'],
                ['Hanuman painting', 'Hanuman lithograph',
                 'Hanuman miniature painting', 'Raja Ravi Varma Hanuman']),
    'durga': (['Durga', 'Mahishasuramardini', 'Ambika', 'Kali', 'Parvati'],
              ['Raja Ravi Varma Durga', 'Durga painting', 'Mahishasuramardini painting',
               'Durga lithograph', 'Durga miniature painting']),
    'shani': (['Shani', 'Saturn', 'Shanaishchara', 'Navagraha'],
              ['Shani deity painting', 'Shani Navagraha', 'Navagraha painting Shani',
               'Shani Dev', 'Navagraha sculpture']),
}


def api(params):
    url = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.load(r)


def search(term, limit=14):
    try:
        d = api({'action': 'query', 'format': 'json', 'generator': 'search',
                 'gsrsearch': term, 'gsrnamespace': 6, 'gsrlimit': limit,
                 'prop': 'imageinfo', 'iiprop': 'url|size|mime|extmetadata',
                 'iiurlwidth': 600})
    except Exception as e:
        print('  search failed', term, e)
        return []
    return list(d.get('query', {}).get('pages', {}).values())


def fetch(url, path):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=90) as r, open(path, 'wb') as f:
        f.write(r.read())


def free(em):
    lic = (em.get('LicenseShortName', {}).get('value') or '').lower()
    return 'public domain' in lic or lic.startswith('cc0') or lic.startswith('cc by')


def build(key, names, queries):
    seen, picks = set(), []
    for q in queries:
        for p in search(q):
            title = p['title']
            if title in seen:
                continue
            ii = p['imageinfo'][0]
            if ii.get('mime') not in ('image/jpeg', 'image/png'):
                continue
            if not free(ii.get('extmetadata', {})):
                continue
            # Title must actually name the deity, or we get temples and portraits.
            if not any(re.search(n, title, re.I) for n in names):
                continue
            if ii['height'] < 500 or ii['width'] < 380:
                continue
            seen.add(title)
            picks.append({'title': title, 'thumb': ii['thumburl'],
                          'full': ii['url'], 'w': ii['width'], 'h': ii['height'],
                          'lic': ii['extmetadata'].get('LicenseShortName', {}).get('value'),
                          'artist': re.sub('<[^>]+>', '', ii['extmetadata']
                                           .get('Artist', {}).get('value', ''))[:60]})
        if len(picks) >= 12:
            break

    picks = picks[:12]
    json.dump(picks, open(os.path.join(CAND, f'{key}.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print(key, len(picks))

    # Contact sheet: 4 across, numbered, so one Read picks the winners.
    CW, CH, COLS = 300, 380, 4
    rows = (len(picks) + COLS - 1) // COLS or 1
    sheet = Image.new('RGB', (CW * COLS, CH * rows), (240, 238, 235))
    dr = ImageDraw.Draw(sheet)
    for i, p in enumerate(picks):
        f = os.path.join(CAND, f'{key}-{i}.jpg')
        try:
            if not os.path.exists(f):
                fetch(p['thumb'], f)
            im = Image.open(f).convert('RGB')
            im.thumbnail((CW - 16, CH - 40), Image.LANCZOS)
        except Exception as e:
            print('  dl fail', i, e)
            continue
        x, y = (i % COLS) * CW, (i // COLS) * CH
        sheet.paste(im, (x + (CW - im.width) // 2, y + 30))
        dr.rectangle([x + 4, y + 4, x + 30, y + 26], fill=(20, 20, 20))
        dr.text((x + 12, y + 10), str(i), fill=(255, 255, 255))
    sheet.save(os.path.join(OUT, f'sheet-{key}.jpg'), quality=82)


if __name__ == '__main__':
    for k, (n, q) in DEITIES.items():
        build(k, n, q)
    print('done')
