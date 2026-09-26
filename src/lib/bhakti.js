/**
 * CUTOVER — module 4 (bhakti): replace src/lib/bhakti.js with this file, set
 * VITE_DJANGO_API_URL, deploy the API then the client.
 *
 * A drop-in rewrite of src/lib/bhakti.js with the identical exported surface
 * and semantics — fetchAssets, download, shareFile, composeStatus, saveBlob —
 * against the Django API instead of Supabase PostgREST:
 *
 *   GET {API}/bhakti/assets/   -> every active row, ordered kind then sort
 *
 * Auth is unchanged and, exactly as under RLS, unneeded: the
 * `bhakti_assets_public_read` policy answered anon, and so does the endpoint.
 * No token is sent for the library — the files themselves are public in the
 * bucket, and a session requirement would only stop the marketing screenshot
 * (024's own reasoning).
 *
 * Behaviour parity notes:
 *   - toAsset is byte-identical, including the BASE_URL prefixing for
 *     site-relative media paths — the server returns media_url untouched, so
 *     rows seeded from art in `public/` keep working under a sub-path deploy
 *     and absolute bucket URLs pass through as before.
 *   - fetchAssets still throws on failure (now after a console.error line in
 *     the same shape), so screens/Bhakti.jsx's catch keeps rendering its
 *     "Could not reach the library" state.
 *   - There are still no client writes, by design: 024 grants no write policy
 *     and the Django API exposes no write endpoint. Rows arrive from the
 *     service-layer seed (the backend/seed/bhakti.mjs replacement), later the
 *     phase 13 admin console.
 *   - download / shareFile / composeStatus / saveBlob are untouched: they are
 *     browser APIs, not backend calls.
 */

/** The Django API's base, e.g. https://api.example.com/v1 */
const API_BASE = import.meta.env.VITE_DJANGO_API_URL

/** A row as the screen wants it. Prices stay paise until `rupees()`. */
function toAsset(row) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    deity: row.deity,
    /* Rows seeded from art already shipped in `public/` carry a site-relative
       path; anything uploaded to the `bhakti-media` bucket carries an absolute
       URL. Leaving both to `<img src>` works for the first and breaks under a
       sub-path deploy, so the relative case gets BASE_URL exactly once, here,
       and no screen has to know which kind of row it is holding. */
    url: row.media_url?.startsWith('/')
      ? `${import.meta.env.BASE_URL}${row.media_url.slice(1)}`
      : row.media_url,
    previewUrl: row.preview_url,
    /* null is "not priced yet", which is not the same as free, and the screen
       says so differently. 0 never appears — the column refuses it. */
    pricePaise: row.price_paise,
    artist: row.artist,
    licence: row.licence,
    source: row.source,
  }
}

/**
 * Everything active, newest curation order first.
 *
 * One request for the whole library rather than one per kind: it is a curated
 * catalogue in the tens, the filter chips need every deity present to build
 * the list, and four round trips to render one screen is the thing the
 * panchang cache exists to avoid elsewhere.
 */
export async function fetchAssets() {
  let response
  try {
    response = await fetch(`${API_BASE}/bhakti/assets/`)
  } catch (err) {
    console.error('[bhakti] load failed:', err?.message)
    throw err
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    console.error('[bhakti] load failed:', body?.message ?? response.status)
    throw new Error(body?.message ?? 'Could not reach the library')
  }

  return (await response.json()).map(toAsset)
}

/**
 * Save a file to the device.
 *
 * This is as far as a web page goes, and the UI must not promise more. There
 * is no native shell here — no Capacitor, no PWA manifest, a plain site on
 * GitHub Pages — and no browser API can set a wallpaper or a ringtone. The
 * honest verb is "download", and the screen says what to do next.
 *
 * Fetched as a blob rather than linked with `<a download>` because a
 * cross-origin `download` attribute is ignored: Storage would navigate to the
 * file instead of saving it, which on an image means the app disappears.
 */
export async function download(asset) {
  const res = await fetch(asset.url)
  if (!res.ok) throw new Error(`Could not fetch ${asset.title}`)
  const blob = await res.blob()

  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  const ext = asset.url.split('.').pop()?.split('?')[0] || 'jpg'
  a.download = `${asset.title.replace(/[^\w\s-]/g, '').trim() || 'namo'}.${ext}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  /* Revoked on the next tick, not immediately — Safari has not started
     reading the blob when click() returns. */
  setTimeout(() => URL.revokeObjectURL(href), 10_000)
}

/**
 * Hand a file to the OS share sheet, which is how an image reaches WhatsApp
 * status. We cannot post a status ourselves and should not imply it: the user
 * picks WhatsApp, then Status, in their own share sheet.
 *
 * Returns false when the platform cannot share files — desktop, mostly — so
 * the caller can fall back to a download rather than showing a dead button.
 */
export async function shareFile(blob, filename, text) {
  const file = new File([blob], filename, { type: blob.type })
  if (!navigator.canShare?.({ files: [file] })) return false
  try {
    await navigator.share({ files: [file], text })
    return true
  } catch (err) {
    /* The user dismissing the sheet is an AbortError and is not a failure —
       reporting it would put an error toast on a deliberate cancel. */
    if (err?.name === 'AbortError') return true
    console.error('[bhakti] share failed:', err?.message)
    return false
  }
}

/**
 * Compose a 1080×1920 status image and burn the date onto it.
 *
 * The date is the point of the burn-in: a status is a daily object, and the
 * one drawn onto the picture travels with it into WhatsApp where our UI cannot
 * follow. A label in our own grid would be invisible the moment it is shared.
 *
 * Cover, not contain — a status with letterbox bars reads as a screenshot of
 * something else. Overflow is cropped evenly from both sides.
 *
 * `crossOrigin` is set before `src` because it has no effect afterwards, and a
 * tainted canvas throws on `toBlob` rather than returning a broken image, so
 * getting this wrong fails loudly. Bucket and site assets are both same-origin
 * or CORS-enabled, which is what makes this legal at all.
 */
/** Load an image for the canvas, or null if it will not load. A photo the
 *  person picked from their own gallery cannot taint the canvas; remote
 *  artwork needs CORS, which the media bucket sends. A failure here must
 *  never take the whole status down — it costs a corner, not the picture. */
async function loadImage(src) {
  if (!src) return null
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = src
    await img.decode()
    return img
  } catch {
    console.error('[bhakti] could not load an image for the status')
    return null
  }
}

/** Draw `img` to cover the whole canvas, centred, without stretching it. */
function drawCover(ctx, img, width, height) {
  const scale = Math.max(width / img.width, height / img.height)
  const w = img.width * scale
  const h = img.height * scale
  ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h)
}

/**
 * A status image: the artwork, and the person on it.
 *
 * One 1080×1920 canvas, in the order it is read:
 *
 *   the artwork, covering the frame
 *   a scrim along the bottom, because the artwork under it is sometimes a
 *     pale sky and sometimes a dark temple interior and only one of those
 *     survives a text shadow
 *   the person's photo, bottom LEFT, in a circle with a gold ring
 *   their name and the date beside it
 *   the Namo logo, bottom RIGHT, as a watermark
 *
 * Everything except the artwork is optional and drawn only if it loaded, so
 * a missing photo costs a corner rather than the picture.
 */
export async function composeStatus(artworkSrc, { photoSrc, name, dateLabel, logoSrc } = {}) {
  const art = await loadImage(artworkSrc)
  if (!art) return null

  const c = document.createElement('canvas')
  c.width = 1080
  c.height = 1920
  const ctx = c.getContext('2d')

  ctx.fillStyle = '#0e0e10'
  ctx.fillRect(0, 0, c.width, c.height)
  drawCover(ctx, art, c.width, c.height)

  const [photo, logo] = await Promise.all([loadImage(photoSrc), loadImage(logoSrc)])
  const pad = 56
  const strip = 260                       // the band the stamp lives in
  const stripTop = c.height - strip

  if (photo || name || dateLabel || logo) {
    const fade = ctx.createLinearGradient(0, stripTop - 120, 0, c.height)
    fade.addColorStop(0, 'rgba(14, 14, 16, 0)')
    fade.addColorStop(1, 'rgba(14, 14, 16, 0.82)')
    ctx.fillStyle = fade
    ctx.fillRect(0, stripTop - 120, c.width, strip + 120)
  }

  let textLeft = pad
  if (photo) {
    const size = 168
    const cx = pad + size / 2
    const cy = stripTop + strip / 2
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()
    // Cover the circle, not the frame: a portrait squeezed into a circle is
    // the thing that makes these images look homemade.
    const scale = Math.max(size / photo.width, size / photo.height)
    const w = photo.width * scale
    const h = photo.height * scale
    ctx.drawImage(photo, cx - w / 2, cy - h / 2, w, h)
    ctx.restore()

    ctx.beginPath()
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2)
    ctx.lineWidth = 6
    ctx.strokeStyle = '#d4a24c'
    ctx.stroke()
    textLeft = pad + size + 28
  }

  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#ffffff'
  const middle = stripTop + strip / 2
  if (name && dateLabel) {
    ctx.font = '700 46px "Plus Jakarta Sans", system-ui, sans-serif'
    ctx.fillText(name, textLeft, middle - 6)
    ctx.font = '500 34px "Plus Jakarta Sans", system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)'
    ctx.fillText(dateLabel, textLeft, middle + 44)
  } else if (name || dateLabel) {
    ctx.font = '600 42px "Plus Jakarta Sans", system-ui, sans-serif'
    ctx.fillText(name || dateLabel, textLeft, middle + 14)
  }

  if (logo) {
    const w = 190
    const h = (logo.height / logo.width) * w
    ctx.globalAlpha = 0.9
    ctx.drawImage(logo, c.width - pad - w, middle - h / 2, w, h)
    ctx.globalAlpha = 1
  }

  return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.92))
}

/** Save a blob the browser already holds. Shared by the share fallback. */
export function saveBlob(blob, filename) {
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 10_000)
}

/* ══════════════════════════════════════════════════════════════════════════
   THE PHOTO A PERSON PUTS ON THEIR STATUS, REMEMBERED.

   Asked for on 26 Sep 2026: the picture stays until they change it. Somebody
   posting a status every morning should not hunt through their gallery every
   morning for the same face.

   Kept as a small data URL in `localStorage`, and three decisions inside
   that:

   - **Downscaled to 320px before it is stored.** The original is whatever
     the phone camera produced — several megabytes — and localStorage is a
     few megabytes in total for the whole origin. The circle it lands in is
     168px on a 1080px canvas, so 320 is already twice what it can show.
   - **The user id is in the key**, as with the astro cache: a shared phone
     must not put the last person's face on this person's status.
   - **It is a convenience, never a requirement.** Storage can be full or
     denied (a private window), and every path here answers null rather than
     throwing — the sheet then simply opens with no picture attached, which
     is the same state as a first visit.
   ══════════════════════════════════════════════════════════════════════════ */

const PHOTO_KEY = (who) => `bhakti:status-photo:${who ?? 'anon'}`
const PHOTO_SIZE = 320

/** Shrink an image to a square data URL, or null if it cannot be read. */
export async function shrinkForStatus(src, size = PHOTO_SIZE) {
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = src
    await img.decode()

    const c = document.createElement('canvas')
    c.width = size
    c.height = size
    const ctx = c.getContext('2d')
    // Cover, not stretch: this ends up inside a circle, and a squeezed face
    // is the thing that makes these images look homemade.
    const scale = Math.max(size / img.width, size / img.height)
    const w = img.width * scale
    const h = img.height * scale
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
    return c.toDataURL('image/jpeg', 0.85)
  } catch {
    console.error('[bhakti] could not read that picture')
    return null
  }
}

export function recallStatusPhoto(who) {
  try {
    return localStorage.getItem(PHOTO_KEY(who)) || null
  } catch {
    return null
  }
}

export function rememberStatusPhoto(who, dataUrl) {
  try {
    if (dataUrl) localStorage.setItem(PHOTO_KEY(who), dataUrl)
    else localStorage.removeItem(PHOTO_KEY(who))
  } catch {
    /* Quota full, or storage denied. The picture is still on the status
       being composed right now; it just will not be there next time. */
  }
}
