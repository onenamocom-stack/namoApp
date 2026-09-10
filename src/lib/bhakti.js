import { supabase } from './supabase.js'

/**
 * Bhakti's read path. One table, `bhakti_assets` (024), read straight rather
 * than through a view — there is nothing to aggregate and nothing to hide, so
 * a view would only be a second name for the same rows.
 *
 * Writes are not here because there are none. The table has a select policy
 * and no other, so RLS denies every insert from the browser by default; rows
 * arrive from a service-role script and, later, the phase 13 admin console.
 * If you find yourself adding `publish()` to this file, the thing you actually
 * need is that console — `02-TRD.md` §7 is why it cannot be a flag on a user.
 */

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
  const { data, error } = await supabase
    .from('bhakti_assets')
    .select('*')
    .order('kind', { ascending: true })
    .order('sort', { ascending: true })

  if (error) {
    console.error('[bhakti] load failed:', error.message)
    throw error
  }
  return (data ?? []).map(toAsset)
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
