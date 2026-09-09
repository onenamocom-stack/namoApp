// Seed the feed with content attributed to the seeded consultants.
//
//   node backend/seed/content.mjs --ref=mrjsatelbuiypodeulcx
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Same --ref guard as
// seed.mjs and for the same reason: this file holds the service-role key, which
// bypasses RLS entirely, and pointing it at the wrong project is unrecoverable.
//
// ── WHAT THIS REVERSES, AND WHAT IT REFUSES TO ─────────────────────────────
// `01-PRD.md` §7 said the marketplace launches empty rather than furnished with
// invented people, which is why the six seeded consultants land `pending` on
// production. That was reversed on 9 Sep 2026: content is seeded from those
// accounts until real consultants are publishing. §7 records the reversal.
//
// Approving them is unavoidable — `content_public` joins `consultants` and
// requires `status = 'approved'`, so an unapproved author's posts are invisible
// to everybody.
//
// What is NOT unavoidable is making them BOOKABLE, and this script refuses to.
// `seed.mjs` gives every seeded consultant prices AND a week of open
// availability, so approving them without more would put six invented people on
// the marketplace, bookable with real money, with nobody behind them to turn
// up. `book_session` debits the wallet in the same transaction that claims the
// slot, so that is a real debit and a real refund, not a cosmetic problem.
//
// So for every consultant it publishes as, this script does four things, and
// the ORDER is the protection, not just the list:
//
//   1. CLEARS their credentials          (no fabricated certifications published)
//   2. DELETES their availability rows   (no open slots, so nothing is bookable)
//   3. deactivates per_minute services   (no instant chat request left unanswered)
//   4. sets status = 'approved'          (required for the feed) — LAST
//
// Approving last is the whole safety property. `book_session` requires
// `approved` AND an open slot, so approving first would make them bookable with
// real money until the delete landed — and any failure in between would have
// left them that way for good. Failing this way leaves them `pending`, which is
// invisible.
//
// Fixed-duration services stay, so the profile still shows a rate. With no
// availability, `consultant_open_slots` returns nothing and the booking sheet
// has no slot to claim. `verified` is never set — that badge means somebody
// checked real credentials, and nobody has.
//
// ── THE MANIFEST ───────────────────────────────────────────────────────────
// `backend/seed/content/content.json` is the list. Media files sit beside it in
// `backend/seed/content/media/`.
//
//   id          your own stable string. Becomes `legacy_id`, so re-running
//               UPDATES the row rather than adding a second copy.
//   consultant  EITHER a seeded consultant's mock id -- a1 Ritu Kashyap, a2 Dev
//               Malhotra, a3 Meher Bano, a4 Dr. Nandita Rao, a5 Yogesh Pandit,
//               a6 Simran Kaur, resolved through `legacy_id` -- OR a REAL
//               consultant's profile UUID, for bulk-loading a partner's work
//               without posting it by hand from their account.
//
//               The difference is not cosmetic. The strip below runs ONLY on
//               a1..a6. A real consultant is published as and otherwise left
//               alone: their availability, credentials and approval are theirs.
//               They must already be approved, and this script will not do it.
//   kind        clip (reel, wants a video) · post (photo, wants an image) ·
//               article (wants title + body)
//   agoHours    how long ago it was published. The feed shows relative time, so
//               a stored date goes stale and an offset does not.
//
// Idempotent on `legacy_id`, like every other seed here. Media is re-uploaded
// with `upsert` to the same path, so re-running does not accumulate files.

import { createClient } from '@supabase/supabase-js'
import { readFile, readdir } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const DIR = join(HERE, 'content')
const MEDIA = join(DIR, 'media')
const BUCKET = 'content-media'

const MIME = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

const KINDS = { clip: 'media', post: 'media', article: 'text' }

const ref = (process.argv.find((a) => a.startsWith('--ref=')) || '').slice(6)
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const dryRun = process.argv.includes('--dry-run')

if (!ref || !url || !key) {
  die('Usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node backend/seed/content.mjs --ref=<project ref> [--dry-run]')
}
if (!url.includes(ref)) {
  die(`--ref says ${ref}, SUPABASE_URL says ${url}. One of them is wrong, and guessing which is not this script's job.`)
}

const db = createClient(url, key, { auth: { persistSession: false } })

/* ── Read and validate the manifest before touching anything ───────────────
   Every refusal names the entry, because a manifest is hand-written and
   "invalid input" without a row number is a scavenger hunt. */
const items = JSON.parse(await readFile(join(DIR, 'content.json'), 'utf8'))
const onDisk = new Set(await readdir(MEDIA).catch(() => []))
const problems = []
const seenIds = new Set()

for (const [i, it] of items.entries()) {
  const at = `entry ${i} (${it.id ?? 'no id'})`
  if (!it.id) problems.push(`${at}: needs an id — it becomes legacy_id`)
  if (seenIds.has(it.id)) problems.push(`${at}: duplicate id, legacy_id is unique`)
  seenIds.add(it.id)
  if (!it.consultant) problems.push(`${at}: needs a consultant, e.g. "a1"`)
  if (!KINDS[it.kind]) problems.push(`${at}: kind must be clip, post or article`)

  const ext = it.media ? extname(it.media).toLowerCase() : null
  const mime = ext ? MIME[ext] : null

  if (KINDS[it.kind] === 'media') {
    if (!it.media) problems.push(`${at}: a ${it.kind} needs a media file`)
    else if (!onDisk.has(it.media)) problems.push(`${at}: ${it.media} is not in seed/content/media/`)
    else if (!mime) problems.push(`${at}: ${it.media} is not a type the bucket accepts`)
    if (!it.caption?.trim()) problems.push(`${at}: a ${it.kind} needs a caption`)
    if (it.kind === 'clip' && mime && !mime.startsWith('video/')) {
      problems.push(`${at}: a clip wants a video, ${it.media} is not one`)
    }
    if (it.kind === 'post' && mime && !mime.startsWith('image/')) {
      problems.push(`${at}: a photo post wants an image, ${it.media} is not one`)
    }
  } else {
    if (!it.title?.trim()) problems.push(`${at}: an article needs a title`)
    if (!it.body?.trim()) problems.push(`${at}: an article needs a body`)
  }

  if (it.agoHours != null && !(Number.isFinite(it.agoHours) && it.agoHours >= 0)) {
    problems.push(`${at}: agoHours must be a number of hours, not ${it.agoHours}`)
  }
}
if (problems.length) die(`manifest has ${problems.length} problem(s):\n  ` + problems.join('\n  '))

/* -- Resolve consultants, and decide which ones get the strip --------------
   Never by display name: matching a real row to a mock one that way is the
   join 05-BACKEND-SCHEMA.md 9 warns about, and phase 9 deleted the last one.

   TWO KINDS OF AUTHOR, and telling them apart is the whole safety property of
   this script now that it publishes for real people too:

     a1..a6   the six INVENTED consultants from mock.js. Approved, then
              stripped of availability, per-minute chat and credentials,
              because nobody is behind them to answer a booking.

     a UUID   a REAL consultant - a partner with a lot of content to load.
              Published as, and NOTHING ELSE about them is touched.

   Running the strip on a real consultant would delete the availability they
   tapped in by hand and clear the credentials they earned, silently, from a
   script whose name says "seed". Real rows carry both: on dev, `dev:1` has 35
   availability rows and a credential. So the strip is gated on the author being
   one of the invented six - and a real author is never approved here either,
   because approving a person is a human decision, not a side effect of
   uploading their video. */
const SEEDED = /^a[1-6]$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const wanted = [...new Set(items.map((i) => i.consultant))]
const seededIds = wanted.filter((w) => SEEDED.test(w))
const realIds = wanted.filter((w) => !SEEDED.test(w))

const badRefs = realIds.filter((r) => !UUID.test(r))
if (badRefs.length) {
  die(
    `not a consultant reference: ${badRefs.join(', ')}
` +
      `  Use a1..a6 for the seeded consultants, or a real consultant's profile UUID.`,
  )
}

const byRef = new Map()

if (seededIds.length) {
  const { data, error } = await db
    .from('consultants')
    .select('profile_id, legacy_id, status')
    .in('legacy_id', seededIds)
  if (error) die(`could not read seeded consultants: ${error.message}`)
  for (const r of data ?? []) byRef.set(r.legacy_id, { ...r, seeded: true })

  const gone = seededIds.filter((w) => !byRef.has(w))
  if (gone.length) {
    die(`no seeded consultant for ${gone.join(', ')} on ${ref}. Run backend/seed/seed.mjs first.`)
  }
}

if (realIds.length) {
  const { data, error } = await db
    .from('consultants')
    .select('profile_id, legacy_id, status')
    .in('profile_id', realIds)
  if (error) die(`could not read consultants: ${error.message}`)
  for (const r of data ?? []) byRef.set(r.profile_id, { ...r, seeded: false })

  const gone = realIds.filter((w) => !byRef.has(w))
  if (gone.length) {
    die(`no consultant row for ${gone.join(', ')} on ${ref}. They apply through /pro/apply first.`)
  }

  // Deliberately NOT approved here. `content_public` requires approval for a
  // post to be visible, so this fails loudly rather than uploading into a black
  // hole - and approving a real person stays a human decision.
  const unapproved = realIds.filter((w) => byRef.get(w).status !== 'approved')
  if (unapproved.length) {
    die(
      `not approved: ${unapproved.join(', ')}
` +
        `  This script will not approve a real consultant - that is a human decision.
` +
        `  Approve them first, then re-run.`,
    )
  }
}

console.log(
  `${ref} · ${items.length} item(s) · ${seededIds.length} seeded author(s), ` +
    `${realIds.length} real${dryRun ? ' · DRY RUN' : ''}
`,
)

/* ── Approve, then take away everything that makes them bookable ─────────── */
for (const legacy of seededIds) {
  const c = byRef.get(legacy)

  // The loop already iterates the seeded six, so this can only fire if someone
  // widens it later. It stays because the cost of being wrong here is deleting
  // a real consultant's availability and credentials from a script called seed.
  if (!c.seeded) die(`refusing to strip ${legacy}: not one of the seeded six`)

  if (dryRun) {
    console.log(`  ${legacy}  would drop availability, deactivate per-minute, clear credentials, then approve`)
    continue
  }

  // ORDER MATTERS, AND IT IS THE OPPOSITE OF THE OBVIOUS ONE. Approving comes
  // LAST. `book_session` requires `status = 'approved'` AND an open slot
  // (012_bookings_transaction.sql:174, :190), so a consultant who is approved
  // while still holding a week of availability is bookable with real money for
  // as long as that state lasts. Approving first made that window every
  // remaining round trip of this loop — and `die()` on any step below would
  // have left it open permanently, with six invented people takeable on the
  // marketplace and nobody behind them to turn up.
  //
  // Stripping first inverts the failure: a crash anywhere leaves them
  // `pending`, which is invisible and unbookable. The safe direction to fail is
  // the one where nothing is published, not the one where everything is.

  // Credentials are cleared, and this is the one protection that is not about
  // money. The seeded arrays are specific claims — "ICAS Certified", "Jyotish
  // Visharad", "10k+ sessions" — and `consultants_public` exposes them. Under
  // 01-PRD.md §7 fabricated certifications on fabricated people is an unfair
  // trade practice, and that section says get it checked by someone qualified
  // BEFORE any of it is published. Nobody has. So they go out with no claims
  // rather than with invented ones; a bio is opinion, a certification is not.
  //
  // `verified` is already false and the rating caches are already null/0 — the
  // trigger computes them from `reviews`, of which there are none. Nothing here
  // needs to undo those.
  const { error: credErr } = await db
    .from('consultants')
    .update({ credentials: [] })
    .eq('profile_id', c.profile_id)
  if (credErr) die(`could not clear credentials for ${legacy}: ${credErr.message}`)

  const { error: aErr, count: dropped } = await db
    .from('consultant_availability')
    .delete({ count: 'exact' })
    .eq('consultant_id', c.profile_id)
  if (aErr) die(`could not clear availability for ${legacy}: ${aErr.message}`)

  const { error: sErr, count: off } = await db
    .from('consultant_services')
    .update({ active: false }, { count: 'exact' })
    .eq('consultant_id', c.profile_id)
    .eq('billing', 'per_minute')
  if (sErr) die(`could not deactivate instant chat for ${legacy}: ${sErr.message}`)

  // Last, now that there is nothing left to book.
  if (c.status !== 'approved') {
    const { error } = await db
      .from('consultants')
      .update({ status: 'approved' })
      .eq('profile_id', c.profile_id)
    if (error) die(`could not approve ${legacy}: ${error.message}`)
  }

  console.log(
    `  ${legacy}  ${dropped ?? 0} availability dropped · ${off ?? 0} per-minute off · credentials cleared · approved`,
  )
}

/* ── Upload media, then write the rows ───────────────────────────────────── */
let written = 0
for (const it of items) {
  const c = byRef.get(it.consultant)
  let mediaUrl = null

  if (KINDS[it.kind] === 'media') {
    // The same <uid>/<file> shape the studio uses, so a seeded file is
    // indistinguishable from an uploaded one and the storage policy would
    // accept it even without the service role.
    const path = `${c.profile_id}/seed-${basename(it.media)}`
    if (!dryRun) {
      const body = await readFile(join(MEDIA, it.media))
      const { error } = await db.storage.from(BUCKET).upload(path, body, {
        contentType: MIME[extname(it.media).toLowerCase()],
        upsert: true,
      })
      if (error) die(`upload failed for ${it.media}: ${error.message}`)
    }
    mediaUrl = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  }

  const publishedAt = new Date(Date.now() - (it.agoHours ?? 0) * 3600_000).toISOString()

  if (dryRun) {
    console.log(`  ${it.id}  ${it.kind} as ${it.consultant} · ${it.agoHours ?? 0}h ago`)
    continue
  }

  const { error } = await db.from('content').upsert(
    {
      consultant_id: c.profile_id,
      kind: it.kind,
      title: it.title ?? null,
      body: it.body ?? null,
      caption: it.caption ?? null,
      media_url: mediaUrl,
      status: 'live',
      published_at: publishedAt,
      legacy_id: it.id,
    },
    { onConflict: 'legacy_id' },
  )
  if (error) die(`could not write ${it.id}: ${error.message}`)
  written++
  console.log(`  ${it.id}  ${it.kind} as ${it.consultant} · ${it.agoHours ?? 0}h ago`)
}

/* ── Say what is true afterwards, not what was attempted ─────────────────── */
if (dryRun) {
  console.log('\nDry run. Nothing was written.')
} else {
  const { count } = await db
    .from('content')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'live')
  console.log(`\n${written} row(s) written. ${count} live content row(s) on ${ref}.`)
  console.log('Counts stay honest: nothing here fakes a like, a view or a follower.')
}

function die(msg) {
  console.error(msg)
  process.exit(1)
}
