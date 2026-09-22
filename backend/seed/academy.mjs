// Phase 10b. Loads the Academy — courses with their lessons and PDFs, and
// events with their join links — from a JSON manifest.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
//     node backend/seed/academy.mjs --ref=<project ref> path/to/academy.json [--files=dir] [--dry-run]
//
// The shape is `academy.template.json`. JSON rather than CSV because a course
// has a list of lessons, and a sheet with one row per lesson repeating the
// course is where prices start disagreeing with themselves. `--files` defaults
// to a `materials/` folder beside the manifest; each material's `file` names a
// PDF in it.
//
// Same `--ref` guard as catalogue.mjs. ALWAYS `--dry-run` first.
//
// Idempotent on `slug` (stored as `legacy_id`).
//   · A course's LESSONS are replaced by the manifest's list on every run —
//     nothing references a lesson, so there is nothing to preserve.
//   · Materials are upserted by file; one dropped from the manifest stays until
//     deleted by hand.
//   · An event's seats: changing `seats` moves `seats_left` by the same amount,
//     so people already enrolled keep their places. Shrinking below the number
//     enrolled is refused.
//   · Nothing here cancels an event. That refunds people, so it is the admin
//     console's job, with a reason and an audit row.
//
// Items missing from the manifest are left alone. To take one down, keep it and
// set `active` to false.

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const ref = flag('ref')
const dryRun = args.includes('--dry-run')
const manifestPath = args.find((a) => !a.startsWith('--'))
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

function die(msg) {
  console.error(`\n✖ ${msg}\n`)
  process.exit(1)
}

if (!ref || !manifestPath) die('Usage: node backend/seed/academy.mjs --ref=<project ref> academy.json [--files=dir] [--dry-run]')
if (!dryRun && (!url || !key)) die('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or pass --dry-run).')
if (url && !url.includes(ref)) die(`--ref says ${ref}, SUPABASE_URL says ${url}. One of them is wrong.`)

const filesDir = flag('files') ?? path.join(path.dirname(manifestPath), 'materials')

/** Rupees as typed ("1,499", 499, 0) to integer paise, or NaN. */
function paise(v) {
  const s = String(v ?? '').replace(/[₹,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN
  return Math.round(Number(s) * 100)
}

const SLUG = /^[a-z0-9-]{1,64}$/
const HTTPS = /^https:\/\/\S+$/
const LEVELS = ['Beginner', 'Intermediate', 'Advanced']
const KINDS = ['Webinar', 'Seminar', 'Workshop']

let manifest
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
} catch (err) {
  die(`Could not read ${manifestPath}: ${err.message}`)
}

const problems = []
const slugs = new Set()
const courses = (manifest.courses ?? []).map((c, i) => {
  const bad = (m) => problems.push(`courses[${i}] (${c.slug || 'no slug'}): ${m}`)
  if (!SLUG.test(c.slug ?? '')) bad('slug must be lowercase letters, digits and - (max 64)')
  if (slugs.has(`c:${c.slug}`)) bad('duplicate slug')
  slugs.add(`c:${c.slug}`)
  if (!c.title) bad('title is empty')
  if (!c.tutor) bad('tutor is empty')
  if (c.level && !LEVELS.includes(c.level)) bad(`level must be one of ${LEVELS.join(', ')}`)
  const price = paise(c.price_rupees)
  if (Number.isNaN(price)) bad(`price_rupees "${c.price_rupees}" is not an amount`)
  const lessons = c.lessons ?? []
  if (!lessons.length) bad('a course needs at least one lesson')
  lessons.forEach((l, j) => {
    if (!l.title) bad(`lessons[${j}] title is empty`)
    if (!HTTPS.test(l.url ?? '')) bad(`lessons[${j}] url must be an https link`)
    if (l.minutes !== undefined && !(Number.isInteger(l.minutes) && l.minutes > 0)) bad(`lessons[${j}] minutes must be a whole number above 0`)
  })
  const materials = (c.materials ?? []).map((m, j) => {
    const file = path.join(filesDir, m.file ?? '')
    if (!m.title) bad(`materials[${j}] title is empty`)
    if (path.extname(m.file ?? '').toLowerCase() !== '.pdf') bad(`materials[${j}] file must be a .pdf`)
    else if (!fs.existsSync(file)) bad(`materials[${j}] "${m.file}" not found in ${filesDir}`)
    else if (fs.statSync(file).size > 25 * 1024 * 1024) bad(`materials[${j}] "${m.file}" is over 25 MB`)
    return { title: m.title, file, name: `${c.slug}/${path.basename(m.file ?? '')}` }
  })
  return { ...c, price, lessons, materials, active: c.active !== false }
})

const events = (manifest.events ?? []).map((e, i) => {
  const bad = (m) => problems.push(`events[${i}] (${e.slug || 'no slug'}): ${m}`)
  if (!SLUG.test(e.slug ?? '')) bad('slug must be lowercase letters, digits and - (max 64)')
  if (slugs.has(`e:${e.slug}`)) bad('duplicate slug')
  slugs.add(`e:${e.slug}`)
  if (!e.title) bad('title is empty')
  if (!e.host) bad('host is empty')
  if (e.kind && !KINDS.includes(e.kind)) bad(`kind must be one of ${KINDS.join(', ')}`)
  // An offset is required: "19:00" with no zone is a different instant on every laptop.
  if (!/[+-]\d\d:\d\d$|Z$/.test(e.starts_at ?? '') || Number.isNaN(Date.parse(e.starts_at))) {
    bad('starts_at must be ISO with an offset, e.g. 2026-10-04T19:00:00+05:30')
  }
  if (!(Number.isInteger(e.seats) && e.seats > 0)) bad('seats must be a whole number above 0')
  if (e.minutes !== undefined && !(Number.isInteger(e.minutes) && e.minutes > 0)) bad('minutes must be a whole number above 0')
  const price = paise(e.price_rupees)
  if (Number.isNaN(price)) bad(`price_rupees "${e.price_rupees}" is not an amount`)
  if (!HTTPS.test(e.join_url ?? '')) bad('join_url must be an https link')
  return { ...e, price, active: e.active !== false }
})

if (problems.length) die(`${problems.length} problem(s), nothing written:\n  ${problems.join('\n  ')}`)

console.log(`${courses.length} courses (${courses.reduce((n, c) => n + c.lessons.length, 0)} lessons, ` +
  `${courses.reduce((n, c) => n + c.materials.length, 0)} PDFs), ${events.length} events — all valid.`)
if (dryRun) {
  console.log('Dry run: nothing written.')
  process.exit(0)
}

const db = createClient(url, key, { auth: { persistSession: false } })
const must = (what, { data, error }) => {
  if (error) die(`${what}: ${error.message}`)
  return data
}

for (const [i, c] of courses.entries()) {
  const row = {
    legacy_id: c.slug,
    title: c.title,
    tutor: c.tutor,
    level: c.level ?? null,
    summary: c.summary ?? null,
    price_paise: c.price,
    sort: c.sort ?? i + 1,
    active: c.active,
  }
  const { id } = must(`course ${c.slug}`,
    await db.from('courses').upsert(row, { onConflict: 'legacy_id' }).select('id').single())

  must(`lessons of ${c.slug}`, await db.from('course_lessons').delete().eq('course_id', id))
  must(`lessons of ${c.slug}`, await db.from('course_lessons').insert(
    c.lessons.map((l, j) => ({ course_id: id, sort: j + 1, title: l.title, minutes: l.minutes ?? null, video_url: l.url }))))

  for (const [j, m] of c.materials.entries()) {
    const bytes = fs.readFileSync(m.file)
    must(`PDF ${m.name}`, await db.storage.from('course-materials')
      .upload(m.name, bytes, { contentType: 'application/pdf', upsert: true }))
    must(`material ${m.name}`, await db.from('course_materials').upsert(
      { course_id: id, sort: j + 1, title: m.title, storage_path: m.name, size_bytes: bytes.length },
      { onConflict: 'storage_path' }))
  }
  console.log(`  course ${c.slug}: ${c.lessons.length} lessons, ${c.materials.length} PDFs`)
}

for (const e of events) {
  const row = {
    legacy_id: e.slug,
    title: e.title,
    host: e.host,
    kind: e.kind ?? 'Webinar',
    summary: e.summary ?? null,
    starts_at: e.starts_at,
    minutes: e.minutes ?? 60,
    price_paise: e.price,
    active: e.active,
  }
  const existing = must(`event ${e.slug}`,
    await db.from('academy_events').select('id, seats, seats_left').eq('legacy_id', e.slug).maybeSingle())

  let id
  if (existing) {
    // ponytail: read-then-write, so an enrolment landing mid-import can be
    // off by one seat; the CHECK refuses the impossible case. Run imports quietly.
    const seatsLeft = existing.seats_left + (e.seats - existing.seats)
    if (seatsLeft < 0) die(`event ${e.slug}: ${existing.seats - existing.seats_left} are enrolled, cannot shrink to ${e.seats} seats`)
    must(`event ${e.slug}`, await db.from('academy_events')
      .update({ ...row, seats: e.seats, seats_left: seatsLeft }).eq('id', existing.id))
    id = existing.id
  } else {
    ;({ id } = must(`event ${e.slug}`, await db.from('academy_events')
      .insert({ ...row, seats: e.seats, seats_left: e.seats }).select('id').single()))
  }
  must(`join link ${e.slug}`, await db.from('academy_event_links')
    .upsert({ event_id: id, join_url: e.join_url }, { onConflict: 'event_id' }))
  console.log(`  event ${e.slug}: ${existing ? 'updated' : 'created'}`)
}

console.log(`Done on ${ref}.`)
