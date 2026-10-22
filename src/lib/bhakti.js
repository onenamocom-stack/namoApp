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

import { supabase } from './supabase.js'
import { myCodes } from './referrals.js'
import { openShare } from './share.js'
import { SEEKER_APP_URL } from './urls.js'

/** The Django API's base, e.g. https://api.example.com/v1 */
const API_BASE = import.meta.env.VITE_DJANGO_API_URL

/** A row as the screen wants it. Prices stay paise until `rupees()`. */
export function toAsset(row) {
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
    previewUrl: row.preview_url?.startsWith('/')
      ? `${import.meta.env.BASE_URL}${row.preview_url.slice(1)}`
      : row.preview_url,
    /* null is "not priced yet", which is not the same as free, and the screen
       says so differently. 0 never appears — the column refuses it. */
    pricePaise: row.price_paise,
    // Struck through beside the price (15 Oct 2026); null shows none.
    mrpPaise: row.mrp_paise ?? null,
    // A download's own page (15 Oct 2026).
    description: row.description ?? '',
    artist: row.artist,
    licence: row.licence,
    source: row.source,
    // The Status shelf's heart and comment counts (12 Oct 2026).
    likes: row.likes ?? 0,
    comments: row.comments ?? 0,
    reposts: row.reposts ?? 0,
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
/**
 * The darshan page's deities and murtis, as the console has them (8 Oct
 * 2026): [{id, name, nameHi, images:[{id, kind, src, video, embedUrl,
 * temple, templeHi, location, locationHi, title, credit}]}]. `kind` is what
 * the frame shows: 'image', 'video' or 'youtube' (20 Oct 2026); `src` is the
 * photo, the cover of the other two. Throws on failure; the screen keeps the
 * deities it shipped with.
 */
export async function fetchDarshan() {
  const response = await fetch(`${API_BASE}/bhakti/darshan/`)
  if (!response.ok) throw new Error(`darshan ${response.status}`)
  return (await response.json()).map((d) => ({
    id: d.id,
    name: d.name,
    nameHi: d.name_hi || d.name,
    images: d.images.map((i) => ({
      id: i.id,
      // The seeded murtis are files in `public/`, site-relative; uploads are
      // absolute bucket URLs. Same rule as toAsset.
      src: i.image_url?.startsWith('/') ? `${import.meta.env.BASE_URL}${i.image_url.slice(1)}` : i.image_url,
      kind: i.kind || 'image',
      video: i.video_url || '',
      embedUrl: i.embed_url || '',
      // A temple's channel may be off air; the frame asks first (20 Oct 2026).
      checksLive: Boolean(i.checks_live),
      liveHours: i.live_hours || '',
      liveHoursHi: i.live_hours_hi || '',
      temple: i.temple,
      templeHi: i.temple_hi,
      location: i.location,
      locationHi: i.location_hi,
      title: i.title,
      credit: i.credit,
    })),
  }))
}

/**
 * Whether a temple channel's murti is live now: `{ live, startsAt }`, where
 * `startsAt` is the next stream the temple scheduled on YouTube (a Date) or
 * null (20 Oct 2026, Rahul); `last` its latest finished stream `{ embedUrl,
 * at }`, or null. Throws on failure.
 */
export async function fetchDarshanLive(imageId) {
  const response = await fetch(`${API_BASE}/bhakti/darshan/${imageId}/live/`)
  if (!response.ok) throw new Error(`darshan live ${response.status}`)
  const body = await response.json()
  return {
    live: Boolean(body.live),
    // Live: the stream itself, when the server knows it. The channel's own
    // live player can say "This video is unavailable" while the stream plays
    // (Siddhivinayak, 20 Oct 2026).
    embedUrl: body.live && body.embed_url ? body.embed_url : null,
    startsAt: body.starts_at ? new Date(body.starts_at * 1000) : null,
    // Off air: the temple's latest finished stream, played as a recording.
    last: body.last ? { embedUrl: body.last.embed_url, at: new Date(body.last.started_at) } : null,
  }
}

/**
 * Reshared pictures, newest first: `{ id, byId, byName, at, asset }` (12 Oct
 * 2026). `by` narrows to one person. An API from before reshares reads as
 * none.
 */
export async function fetchBhaktiReposts({ by = null, limit = 50 } = {}) {
  try {
    const response = await fetch(`${API_BASE}/bhakti/reposts/?limit=${limit}${by ? `&by=${by}` : ''}`)
    if (!response.ok) return []
    return (await response.json()).map((r) => ({
      id: `${r.reposted_by}:${r.asset.id}`,
      byId: r.reposted_by,
      byName: r.reposted_by_name || 'Someone',
      byAvatar: r.reposted_by_avatar || null,
      at: r.reposted_at,
      note: r.note || '',
      asset: toAsset(r.asset),
    }))
  } catch {
    return []
  }
}

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
  const attempt = async (url) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    await img.decode()
    return img
  }
  try {
    return await attempt(src)
  } catch {
    /* The card's own <img> fetched this URL first without CORS, and the
       browser can answer the CORS request from that cached copy, which has
       no Access-Control header — the load fails although the bucket allows
       us (16 Oct 2026, Rahul: a new status showed no name, date or Share).
       A second address skips that cache entry. */
    if (/^https?:/.test(src)) {
      try {
        return await attempt(`${src}${src.includes('?') ? '&' : '?'}cors=1`)
      } catch {
        /* falls through */
      }
    }
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
 * A status image (9 Oct 2026, Rahul's design): the artwork full-bleed, the
 * NAMO mark top right, and near the foot one frosted card —
 *
 *   the person's photo in a white ring, left
 *   their name, large
 *   the date ("09 OCT 2026 | FRIDAY") and the Hindu date
 *     ("आश्विन कृष्ण पक्ष • तृतीया"), each behind a small gold icon
 *   a gold rule with a diamond under them
 *   the NAMO badge, right
 *
 * One 1080×1920 canvas. Everything but the artwork is optional and drawn
 * only if it loaded, so a missing photo costs a circle, not the picture.
 *
 * Returns `{ blob, marks }`: `marks` are where the photo and the name ended
 * up, as fractions of the frame, so the preview can put its edit pencils on
 * them. The pencils are the screen's, never drawn into the image.
 *
 * With `overlay` (a video status, 19 Oct 2026) there is no artwork: the
 * canvas is transparent but for the mark and the card, whose wash is a
 * little darker since nothing is blurred under it, and it returns
 * `{ canvas, marks }` for drawing over every frame.
 */
export const STATUS_W = 1080
export const STATUS_H = 1920

export async function composeStatus(
  artworkSrc,
  { photoSrc, name, dateLine, hinduLine, logoSrc, logoDarkSrc, iconSrc } = {},
  { overlay = false } = {},
) {
  const art = overlay ? null : await loadImage(artworkSrc)
  if (!art && !overlay) return null
  const W = STATUS_W
  const H = STATUS_H
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  if (art) {
    ctx.fillStyle = '#0e0e10'
    ctx.fillRect(0, 0, W, H)
    drawCover(ctx, art, W, H)
  }

  // The white mark disappears on a light card (22 Oct 2026, Rahul's beige
  // status cards): where the artwork is light under the mark, the dark one.
  let markSrc = logoSrc
  if (art && logoDarkSrc) {
    try {
      const px = ctx.getImageData(W - 52 - 250, 56, 250, 90).data
      let sum = 0
      for (let i = 0; i < px.length; i += 16) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
      if (sum / (px.length / 16) > 165) markSrc = logoDarkSrc
    } catch {
      /* a tainted canvas cannot be read; the white mark stays */
    }
  }
  const [photo, logo, icon] = await Promise.all([loadImage(photoSrc), loadImage(markSrc), loadImage(iconSrc)])
  // The fonts the page already loads; a canvas draws only what has arrived.
  try {
    await document.fonts?.ready
  } catch {
    /* draws in the fallback face */
  }

  // ── the mark, top right ────────────────────────────────────────────────
  if (logo) {
    const w = 250
    const h = (logo.height / logo.width) * w
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.35)'
    ctx.shadowBlur = 18
    ctx.drawImage(logo, W - 52 - w, 56, w, h)
    ctx.restore()
  }

  // ── the card ───────────────────────────────────────────────────────────
  // Low on the frame (Rahul: "card thoda neeche"), clear of the deity.
  const card = { x: 52, y: H - 52 - 350, w: W - 104, h: 350, r: 54 }
  const pad = 40
  // Frosted: the artwork under the card, blurred, then a warm dark wash.
  ctx.save()
  roundRect(ctx, card.x, card.y, card.w, card.h, card.r)
  ctx.clip()
  if (art && 'filter' in ctx) {
    ctx.filter = 'blur(26px)'
    drawCover(ctx, art, W, H)
    ctx.filter = 'none'
  }
  ctx.fillStyle = art ? 'rgba(28, 16, 10, 0.52)' : 'rgba(28, 16, 10, 0.66)'
  ctx.fillRect(card.x, card.y, card.w, card.h)
  ctx.restore()
  roundRect(ctx, card.x, card.y, card.w, card.h, card.r)
  ctx.lineWidth = 2.5
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)'
  ctx.stroke()

  // Photo, left, in a white ring. No photo: their initial on saffron.
  const d = 250
  const pcx = card.x + pad + d / 2
  const pcy = card.y + card.h / 2
  ctx.save()
  ctx.beginPath()
  ctx.arc(pcx, pcy, d / 2, 0, Math.PI * 2)
  ctx.clip()
  if (photo) {
    const scale = Math.max(d / photo.width, d / photo.height)
    ctx.drawImage(photo, pcx - (photo.width * scale) / 2, pcy - (photo.height * scale) / 2,
      photo.width * scale, photo.height * scale)
  } else {
    const g = ctx.createLinearGradient(pcx, pcy - d / 2, pcx, pcy + d / 2)
    g.addColorStop(0, '#ff9a3c')
    g.addColorStop(1, '#e8590c')
    ctx.fillStyle = g
    ctx.fillRect(pcx - d / 2, pcy - d / 2, d, d)
    ctx.fillStyle = '#fff'
    ctx.font = '700 110px Poppins, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(((name || '').trim()[0] || 'ॐ').toUpperCase(), pcx, pcy + 6)
    ctx.textAlign = 'left'
  }
  ctx.restore()
  ctx.beginPath()
  ctx.arc(pcx, pcy, d / 2, 0, Math.PI * 2)
  ctx.lineWidth = 9
  ctx.strokeStyle = '#ffffff'
  ctx.stroke()

  // The badge, right.
  const badge = { w: 132, h: 160 }
  badge.x = card.x + card.w - pad - badge.w
  badge.y = card.y + (card.h - badge.h) / 2
  roundRect(ctx, badge.x, badge.y, badge.w, badge.h, 26)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.10)'
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
  ctx.stroke()
  if (icon) ctx.drawImage(icon, badge.x + (badge.w - 76) / 2, badge.y + 22, 76, 76)
  ctx.fillStyle = '#fff'
  ctx.font = '700 28px Poppins, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('NAMO', badge.x + badge.w / 2, badge.y + badge.h - 24)
  ctx.textAlign = 'left'

  // Text, between them.
  const left = pcx + d / 2 + 44
  const right = badge.x - 28
  const room = right - left
  let nameEnd = left
  if (name) {
    let size = 60
    const face = (s) => `700 ${s}px Poppins, "Noto Sans Devanagari", system-ui, sans-serif`
    ctx.font = face(size)
    while (size > 40 && ctx.measureText(name).width > room - 110) {
      size -= 2
      ctx.font = face(size)
    }
    const shown = fitText(ctx, name, room - 110)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(shown, left, card.y + 112)
    nameEnd = left + ctx.measureText(shown).width
  }
  const rows = [
    dateLine && { y: card.y + 190, text: dateLine, draw: drawCalendar },
    hinduLine && { y: card.y + 254, text: hinduLine, draw: drawTemple },
  ].filter(Boolean)
  for (const row of rows) {
    row.draw(ctx, left, row.y - 30, 34)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
    ctx.font = '500 34px Poppins, "Noto Sans Devanagari", system-ui, sans-serif'
    ctx.fillText(fitText(ctx, row.text, room - 52), left + 52, row.y)
  }
  // The gold rule and its diamond.
  const ry = card.y + card.h - 44
  const mid = left + room / 2
  ctx.strokeStyle = 'rgba(232, 184, 92, 0.85)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(left + 30, ry)
  ctx.lineTo(mid - 16, ry)
  ctx.moveTo(mid + 16, ry)
  ctx.lineTo(right - 30, ry)
  ctx.stroke()
  ctx.fillStyle = '#e8b85c'
  ctx.beginPath()
  ctx.moveTo(mid, ry - 9)
  ctx.lineTo(mid + 9, ry)
  ctx.lineTo(mid, ry + 9)
  ctx.lineTo(mid - 9, ry)
  ctx.closePath()
  ctx.fill()

  const marks = {
    photo: { x: (pcx + d * 0.36) / W, y: (pcy - d * 0.36) / H },
    // Clear of the name at preview size (about a third of the image).
    name: { x: Math.min(nameEnd + 76, right - 10) / W, y: (card.y + 92) / H },
  }
  if (overlay) return { canvas: c, marks }
  const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.92))
  return { blob, marks }
}

/* A video status with the card on it (19 Oct 2026, Rahul): the overlay above
   drawn over every frame, on the phone, with the same WebCodecs library that
   shrinks uploads (`mediabunny`). 720 × 1280 — what WhatsApp shows — on the
   phone's hardware encoder where it has one. One video at a time across the
   shelf: two at once would halve both. */
export const STATUS_VIDEO_W = 720
export const STATUS_VIDEO_H = 1280
export const CANNOT_MAKE_VIDEO = 'This phone cannot add your card to a video.'
let videoTurn = Promise.resolve()

export function composeVideoStatus(src, details, onProgress = null) {
  const job = videoTurn.then(() => makeVideoStatus(src, details, onProgress))
  videoTurn = job.catch(() => {})
  return job
}

async function makeVideoStatus(src, details, onProgress) {
  if (typeof window === 'undefined' || !('VideoEncoder' in window)) throw new Error(CANNOT_MAKE_VIDEO)
  const mb = await import('mediabunny')
  if (!(await mb.canEncodeVideo('avc')) || !(await mb.canEncodeAudio('aac'))) throw new Error(CANNOT_MAKE_VIDEO)
  const layer = await composeStatus(null, details, { overlay: true })
  const got = await fetch(src)
  if (!got.ok) throw new Error('Could not load that video.')
  const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(await got.blob()) })
  const output = new mb.Output({
    format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new mb.BufferTarget(),
  })
  const W = STATUS_VIDEO_W
  const H = STATUS_VIDEO_H
  const frame = document.createElement('canvas')
  frame.width = W
  frame.height = H
  const ctx = frame.getContext('2d')
  const conversion = await mb.Conversion.init({
    input,
    output,
    video: {
      width: W,
      height: H,
      fit: 'cover',
      frameRate: 30,
      codec: 'avc',
      quality: new mb.Quality({ bitrate: 2_500_000 }),
      hardwareAcceleration: 'prefer-hardware',
      forceTranscode: true,
      process: (sample) => {
        sample.draw(ctx, 0, 0, W, H)
        ctx.drawImage(layer.canvas, 0, 0, W, H)
        return frame
      },
    },
    audio: { codec: 'aac', quality: new mb.Quality({ bitrate: 128_000 }) },
    tags: {},
  })
  if (!conversion.isValid) throw new Error(CANNOT_MAKE_VIDEO)
  if (onProgress) conversion.onProgress = (p) => onProgress(Math.max(0, Math.min(1, p)))
  await conversion.execute()
  const buffer = output.target.buffer
  if (!buffer) throw new Error(CANNOT_MAKE_VIDEO)
  return new Blob([buffer], { type: 'video/mp4' })
}

/** The overlay alone, as an image URL for the preview over a playing video. */
export async function statusOverlay(details) {
  const layer = await composeStatus(null, details, { overlay: true })
  const blob = await new Promise((resolve) => layer.canvas.toBlob(resolve, 'image/png'))
  return { url: URL.createObjectURL(blob), marks: layer.marks }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** The text, cut with an ellipsis to fit `width` in the current font. */
function fitText(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > width) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

function drawCalendar(ctx, x, y, s) {
  ctx.save()
  ctx.strokeStyle = '#e8b85c'
  ctx.fillStyle = '#e8b85c'
  ctx.lineWidth = 3.5
  roundRect(ctx, x, y + s * 0.16, s, s * 0.84, 6)
  ctx.stroke()
  ctx.fillRect(x, y + s * 0.16, s, s * 0.22)
  ctx.fillRect(x + s * 0.22, y, 4, s * 0.3)
  ctx.fillRect(x + s * 0.7, y, 4, s * 0.3)
  for (let i = 0; i < 3; i++) ctx.fillRect(x + s * (0.18 + i * 0.26), y + s * 0.58, s * 0.14, s * 0.12)
  ctx.restore()
}

function drawTemple(ctx, x, y, s) {
  ctx.save()
  ctx.fillStyle = '#e8b85c'
  // A shikhara over a hall: a spire, a body, a step.
  ctx.beginPath()
  ctx.moveTo(x + s * 0.5, y)
  ctx.lineTo(x + s * 0.78, y + s * 0.5)
  ctx.lineTo(x + s * 0.22, y + s * 0.5)
  ctx.closePath()
  ctx.fill()
  ctx.fillRect(x + s * 0.1, y + s * 0.5, s * 0.8, s * 0.36)
  ctx.fillRect(x, y + s * 0.86, s, s * 0.14)
  ctx.fillStyle = 'rgba(28, 16, 10, 0.9)'
  ctx.fillRect(x + s * 0.4, y + s * 0.62, s * 0.2, s * 0.24)
  ctx.restore()
}

/* The two date lines on the card. */
const MONTHS_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const DAYS_EN = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

/** "2026-10-09" → "09 OCT 2026 | FRIDAY" (the calendar date, read as written). */
export function statusDateLine(iso) {
  const [y, m, dd] = String(iso).split('-').map(Number)
  if (!y || !m || !dd) return ''
  const day = new Date(Date.UTC(y, m - 1, dd)).getUTCDay()
  return `${String(dd).padStart(2, '0')} ${MONTHS_EN[m - 1]} ${y} | ${DAYS_EN[day]}`
}

const MASA_HI = ['चैत्र', 'वैशाख', 'ज्येष्ठ', 'आषाढ़', 'श्रावण', 'भाद्रपद', 'आश्विन', 'कार्तिक',
  'मार्गशीर्ष', 'पौष', 'माघ', 'फाल्गुन']
const TITHI_HI = ['प्रतिपदा', 'द्वितीया', 'तृतीया', 'चतुर्थी', 'पंचमी', 'षष्ठी', 'सप्तमी', 'अष्टमी',
  'नवमी', 'दशमी', 'एकादशी', 'द्वादशी', 'त्रयोदशी', 'चतुर्दशी']

/**
 * The Hindu date in Hindi from the panchang payload: "आश्विन कृष्ण पक्ष • तृतीया".
 *
 * The API names the month AMANTA (a month ends at the new moon). The card
 * reads it PURNIMANTA, as North India and Rahul's design do: in the dark
 * fortnight that is the NEXT month's name — amanta Bhadrapada Krishna is
 * purnimanta Ashwin Krishna; the bright fortnight is the same in both.
 * Empty when the payload is missing anything, rather than a wrong date.
 */
export function hinduDateLine(p) {
  const n = p?.tithi?.number
  const m = p?.lunar_month?.number
  if (!n || !m || n < 1 || n > 30 || m < 1 || m > 12) return ''
  const krishna = n > 15
  const masa = MASA_HI[(m - 1 + (krishna && p.lunar_month.amanta !== false ? 1 : 0)) % 12]
  const tithi = n === 15 ? 'पूर्णिमा' : n === 30 ? 'अमावस्या' : TITHI_HI[(n - 1) % 15]
  const adhik = String(p.lunar_month.month_type || '').startsWith('adhik') ? 'अधिक ' : ''
  return `${adhik}${masa} ${krishna ? 'कृष्ण' : 'शुक्ल'} पक्ष • ${tithi}`
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

const NAME_KEY = (who) => `bhakti:status-name:${who ?? 'anon'}`

/** The name for the status card, if they set one; null means the account's. */
export function recallStatusName(who) {
  try {
    return localStorage.getItem(NAME_KEY(who))
  } catch {
    return null
  }
}

export function rememberStatusName(who, name) {
  try {
    if (name) localStorage.setItem(NAME_KEY(who), name)
    else localStorage.removeItem(NAME_KEY(who))
  } catch {
    /* as with the photo: this status still has it; the next may not */
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

/**
 * The file behind one catalogue row (30 Sep 2026). A free row answers its
 * public URL; a PRICED one — the first is a ₹99 e-book — answers a link that
 * dies in ten minutes, and only to somebody who bought it. Anybody else gets
 * `{ok: false, code: 'needs_purchase', pricePaise}` and the screen offers it.
 */
export async function assetFile(id) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  try {
    const response = await fetch(`${API_BASE}/bhakti/assets/${id}/file/`, {
      headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
    })
    const body = await response.json()
    if (response.ok && body.ok) return { ok: true, url: body.url }
    return {
      ok: false,
      code: response.status === 401 ? 'signed_out' : body.reason,
      reason: body.message ?? 'Could not open that book. Try again.',
      pricePaise: body.price_paise ?? null,
      // 'online' once e-books are paid at PhonePe (15 Oct 2026); else 'wallet'.
      pay: body.pay ?? 'wallet',
    }
  } catch {
    return { ok: false, code: 'unavailable', reason: 'Could not reach the library. Try again.' }
  }
}

/* ── Sharing with an invitation (5 Oct 2026) ────────────────────────────────
   Everything shared from Bhakti carries one short line, the app's link and the
   sharer's own referral code — the link is the sign-up page with `?ref=`,
   which Welcome already keeps and fills in. Signed out, there is no code and
   the link is the bare app. The code is asked for once per visit. */
let inviteCode = null

function myInviteCode() {
  inviteCode = inviteCode || myCodes().then((row) => row?.codes?.seeker ?? null).catch(() => null)
  return inviteCode
}

const LISTENED = new Set(['bhajan', 'mantra', 'tune'])
const PICTURES = new Set(['status', 'wallpaper'])

export async function inviteMessage(asset) {
  const code = await myInviteCode()
  /* The item's own address (8 Oct 2026): WhatsApp previews it with the
     picture and title, where the sign-up link showed the site's card. The
     code rides along; a signed-out visitor lands on sign-up with it. */
  const link = `${SEEKER_APP_URL}bhakti/s/${asset.id}${code ? `?ref=${code}` : ''}`
  const what = LISTENED.has(asset.kind) ? `Listen to “${asset.title}” on NAMO` : `“${asset.title}”, from NAMO`
  return [
    `${what}: bhajans, mantras and daily darshan in one app.`,
    code ? `Join with my code ${code}: ${link}` : link,
  ].join('\n')
}

/** Share one asset: the app's share sheet (14 Oct 2026), whose people get
 *  it as a card in a chat and whose Share button is `phoneShareAsset`. */
export function shareAsset(asset) {
  return openShare({
    path: `/bhakti/s/${asset.id}`,
    title: asset.title,
    media: PICTURES.has(asset.kind) ? asset.url : null,
    external: () => phoneShareAsset(asset),
  })
}

/** Share one asset's invitation: the phone's share sheet, or the clipboard.
 *  Returns the sentence to toast, or null when there is nothing to say. */
export async function phoneShareAsset(asset) {
  const text = await inviteMessage(asset)
  /* A status or wallpaper goes out as the picture itself, the message as its
     caption (8 Oct 2026: a link alone arrived with no image). Audio, and a
     phone that cannot share files, send the message — whose link previews
     with the picture anyway. */
  if (PICTURES.has(asset.kind) && asset.url) {
    try {
      const res = await fetch(asset.url)
      if (res.ok) {
        const blob = await res.blob()
        const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
        if (await shareFile(blob, `namo-${asset.kind}.${ext}`, text)) return null
      }
    } catch {
      /* fall through to the message */
    }
  }
  if (navigator.share) {
    try {
      await navigator.share({ text })
      return null
    } catch (err) {
      if (err?.name === 'AbortError') return null
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    return 'Message copied'
  } catch {
    return 'Could not copy that.'
  }
}
