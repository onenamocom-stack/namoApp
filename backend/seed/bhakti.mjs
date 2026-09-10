// Seed Bhakti's media library.
//
//   node backend/seed/bhakti.mjs --ref=mrjsatelbuiypodeulcx
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Same --ref guard as
// content.mjs and for the same reason: this file holds the service-role key,
// which bypasses RLS entirely, and pointing it at the wrong project is
// unrecoverable.
//
// ── WHY THIS EXISTS AT ALL ─────────────────────────────────────────────────
// `bhakti_assets` (024) has a select policy and no other. RLS denies every
// browser write by default and that absence IS the rule — `02-TRD.md` §7
// refuses an admin role in the client, so there is no in-app way to add a row
// and there should not be. The phase 13 admin console replaces this script;
// until it exists, this is the only writer.
//
// The first 22 rows on dev were inserted out-of-band and existed nowhere in
// the repo, which meant production could not be given the same library without
// re-deriving it by hand. That is what this file fixes: the manifest below is
// now the source of truth and the database is a copy of it.
//
// ── ATTRIBUTION IS NOT OPTIONAL ────────────────────────────────────────────
// artist / licence / source are NOT NULL in 024 and this script refuses an
// entry missing any of them before it opens a connection. These files get
// downloaded and some will later be sold; several of the deity images are
// CC BY-SA, and share-alike behind a price is not a thing to discover after
// taking money. `licence` is what a future paywall filters on.

import { createClient } from '@supabase/supabase-js'

const die = (m) => {
  console.error(m)
  process.exit(1)
}

/* Every row points at art already shipped in `public/deities/`, so a
   site-relative `media_url` is correct and `toAsset()` in lib/bhakti.js
   prefixes BASE_URL exactly once. A row uploaded to the `bhakti-media` bucket
   carries an absolute URL instead and passes through untouched. */
const V = { artist: 'Raja Ravi Varma', licence: 'Public domain', source: 'Wikimedia Commons' }
const PRESS = { ...V, artist: 'Ravi Varma Press' }
const ROD = { ...V, artist: 'E. A. Rodrigues' }

const ITEMS = [
  // ── Status artwork ───────────────────────────────────────────────────────
  { legacy_id: 'st-ganesh-1', kind: 'status', title: 'Ganesh — good beginnings', deity: 'Ganesh', f: 'ganesh-1.webp', ...V },
  { legacy_id: 'st-shiva-2', kind: 'status', title: 'Shiva — stillness', deity: 'Shiva', f: 'shiva-2.webp', ...V },
  { legacy_id: 'st-lakshmi-1', kind: 'status', title: 'Lakshmi — abundance', deity: 'Lakshmi', f: 'lakshmi-1.webp', ...V },
  { legacy_id: 'st-durga-2', kind: 'status', title: 'Durga — courage', deity: 'Durga', f: 'durga-2.webp', ...V },
  { legacy_id: 'st-shani-1', kind: 'status', title: 'Shani — patience', deity: 'Shani', f: 'shani-1.webp', ...PRESS },
  { legacy_id: 'st-lakshmi-3', kind: 'status', title: 'Lakshmi & Saraswati', deity: 'Lakshmi', f: 'lakshmi-3.webp', ...V },

  // ── Wallpapers. Public domain only: these are downloads. ─────────────────
  { legacy_id: 'wp-ganesh-1', kind: 'wallpaper', title: 'Seated with attendants', deity: 'Ganesh', f: 'ganesh-1.webp', ...V },
  { legacy_id: 'wp-ganesh-2', kind: 'wallpaper', title: 'Basohli miniature, c.1730', deity: 'Ganesh', f: 'ganesh-2.webp', ...V, artist: 'Anonymous' },
  { legacy_id: 'wp-ganesh-3', kind: 'wallpaper', title: 'Rodrigues lithograph', deity: 'Ganesh', f: 'ganesh-3.webp', ...ROD },
  { legacy_id: 'wp-ganesh-4', kind: 'wallpaper', title: 'Temple bronze', deity: 'Ganesh', f: 'ganesh-4.webp', ...V, artist: 'Unknown artist' },
  { legacy_id: 'wp-shiva-1', kind: 'wallpaper', title: 'Press oleograph', deity: 'Shiva', f: 'shiva-1.webp', ...PRESS },
  { legacy_id: 'wp-shiva-2', kind: 'wallpaper', title: 'With Parvati', deity: 'Shiva', f: 'shiva-2.webp', ...V },
  { legacy_id: 'wp-shiva-3', kind: 'wallpaper', title: 'Myths of the Hindus', deity: 'Shiva', f: 'shiva-3.webp', ...V, artist: 'Nivedita & Coomaraswamy' },
  { legacy_id: 'wp-shiva-4', kind: 'wallpaper', title: 'Rodrigues lithograph', deity: 'Shiva', f: 'shiva-4.webp', ...ROD },
  { legacy_id: 'wp-lakshmi-1', kind: 'wallpaper', title: 'On the lotus', deity: 'Lakshmi', f: 'lakshmi-1.webp', ...V },
  { legacy_id: 'wp-lakshmi-2', kind: 'wallpaper', title: 'Press oleograph, 1930s', deity: 'Lakshmi', f: 'lakshmi-2.webp', ...V },
  { legacy_id: 'wp-lakshmi-3', kind: 'wallpaper', title: 'With Saraswati', deity: 'Lakshmi', f: 'lakshmi-3.webp', ...V },
  { legacy_id: 'wp-lakshmi-4', kind: 'wallpaper', title: 'Painted 1896', deity: 'Lakshmi', f: 'lakshmi-4.webp', ...V },
  { legacy_id: 'wp-durga-1', kind: 'wallpaper', title: 'With the lions', deity: 'Durga', f: 'durga-1.webp', ...V },
  { legacy_id: 'wp-durga-2', kind: 'wallpaper', title: 'Mahishasuramardini', deity: 'Durga', f: 'durga-2.webp', ...V },
  { legacy_id: 'wp-shani-1', kind: 'wallpaper', title: 'On the crow chariot', deity: 'Shani', f: 'shani-1.webp', ...PRESS },
  { legacy_id: 'wp-shani-3', kind: 'wallpaper', title: 'Rodrigues lithograph', deity: 'Shani', f: 'shani-3.webp', ...ROD },

  // ── Tunes and bhajans ────────────────────────────────────────────────────
  // Empty on purpose. The repo contains zero audio files, and inventing
  // `media_url`s that 404 would put four broken play buttons on the screen.
  // The screen already shows an honest empty state for these two kinds.
]

const ref = (process.argv.find((a) => a.startsWith('--ref=')) || '').slice(6)
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const dryRun = process.argv.includes('--dry-run')

if (!ref || !url || !key) {
  die('Usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node backend/seed/bhakti.mjs --ref=<project ref> [--dry-run]')
}
if (!url.includes(ref)) {
  die(`--ref says ${ref}, SUPABASE_URL says ${url}. One of them is wrong, and guessing which is not this script's job.`)
}

/* Validate the whole manifest before opening a connection. A refusal names the
   entry, because "invalid input" without an id is a scavenger hunt. */
const KINDS = new Set(['status', 'wallpaper', 'tune', 'bhajan'])
const problems = []
const seen = new Set()

for (const it of ITEMS) {
  const at = it.legacy_id || '(no legacy_id)'
  if (!it.legacy_id) problems.push(`${at}: legacy_id is the idempotency key and is required`)
  if (seen.has(it.legacy_id)) problems.push(`${at}: duplicate legacy_id`)
  seen.add(it.legacy_id)
  if (!KINDS.has(it.kind)) problems.push(`${at}: kind '${it.kind}' is not one of ${[...KINDS].join(', ')}`)
  if (!it.title?.trim()) problems.push(`${at}: title is required`)
  if (!it.f && !it.media_url) problems.push(`${at}: needs a file or a media_url`)
  for (const field of ['artist', 'licence', 'source']) {
    if (!it[field]?.trim()) problems.push(`${at}: ${field} is required — see the header`)
  }
}

if (problems.length) {
  console.error('Manifest is not seedable:')
  for (const p of problems) console.error(`  · ${p}`)
  process.exit(1)
}

const rows = ITEMS.map((it, i) => ({
  legacy_id: it.legacy_id,
  kind: it.kind,
  title: it.title,
  deity: it.deity ?? null,
  media_url: it.media_url ?? `/deities/${it.f}`,
  artist: it.artist,
  licence: it.licence,
  source: it.source,
  sort: i,
}))

console.log(`${rows.length} rows ready for ${ref}.`)
for (const [kind] of Object.entries(
  rows.reduce((acc, r) => ({ ...acc, [r.kind]: (acc[r.kind] ?? 0) + 1 }), {}),
)) {
  console.log(`  ${kind}: ${rows.filter((r) => r.kind === kind).length}`)
}

if (dryRun) {
  console.log('--dry-run, nothing written.')
  process.exit(0)
}

const db = createClient(url, key, { auth: { persistSession: false } })

/* Idempotent on legacy_id, like content.mjs. Running this twice updates rather
   than duplicating, which is what makes it safe to re-run after editing a
   title or a licence. */
const { error } = await db.from('bhakti_assets').upsert(rows, { onConflict: 'legacy_id' })
if (error) die(`Seed failed: ${error.message}`)

console.log(`Seeded ${rows.length} rows into ${ref}.`)
