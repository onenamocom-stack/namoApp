// Phase 4 seed. The largest single task in the phase
// (docs/06-IMPLEMENTATION.md §Seed).
//
//   node backend/seed/seed.mjs --ref=mrjsatelbuiypodeulcx
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment. The
// --ref argument is not redundant with the URL: it makes the operator name the
// project they think they are on, and the script refuses when the two
// disagree. This file holds the service-role key, which bypasses RLS entirely
// (backend/INSTRUCTIONS.md §3, rule 7) — the one place in the repo where
// pointing at the wrong project is unrecoverable.
//
// It reads src/data/mock.js rather than re-typing it. Re-typing is how the
// report multiplier reached a ledger figure once already.
//
// Idempotent on `legacy_id`: re-running updates rather than duplicating, which
// is also why legacy_id stays in the schema after the seed.
//
// NO MOCK ID IS EVER MIGRATED. They collide across six entity families — the
// same string is a wallet transaction and a warning, an article and a tarot
// card. Every row gets a fresh UUID and carries its original string in
// `legacy_id`, which is the only thing that can resolve them afterwards.

import { createClient } from '@supabase/supabase-js'
import { bookings, consultants, timeSlots } from '../../src/data/mock.js'

const PRODUCTION_REF = 'talqzgolttfgdzcoaqno'

const ref = (process.argv.find((a) => a.startsWith('--ref=')) || '').slice(6)
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const forceApprove = process.argv.includes('--approve')

if (!ref || !url || !key) {
  die('Usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node backend/seed/seed.mjs --ref=<project ref>')
}
if (!url.includes(ref)) {
  die(`--ref says ${ref}, SUPABASE_URL says ${url}. One of them is wrong, and guessing which is not this script's job.`)
}

// Seeded consultants land unapproved on production. They are invented people
// with invented credentials, and an approved consultant is bookable with real
// money by anyone who finds the URL. Approving is the deliberate one-line edit
// this phase builds the gate for:
//   update consultants set status='approved' where legacy_id like 'a_';
const status = forceApprove || ref !== PRODUCTION_REF ? 'approved' : 'pending'

const db = createClient(url, key, { auth: { persistSession: false } })
const unmatched = []

/* ── People ─────────────────────────────────────────────────────────────────
   A `profiles` row cannot be inserted directly: handle_new_user() creates it
   from auth.users (001_profiles.sql), and profiles.phone is NOT NULL. So every
   seeded person is a real auth user first.

   The phone numbers start with 1, which no Indian mobile number does — nobody
   can ever sign in as a seeded person by owning their number. That is not
   fussiness: these rows exist on production. */

let phoneCounter = 0
const phoneFor = (kind) =>
  `+91${kind === 'consultant' ? '10000001' : '10000002'}${String(++phoneCounter).padStart(2, '0')}`

async function person(legacyId, name, kind) {
  const { data: found } = await db.from('profiles').select('id').eq('legacy_id', legacyId).maybeSingle()
  if (found) {
    await db.from('profiles').update({ name }).eq('id', found.id)
    return found.id
  }

  const phone = phoneFor(kind)
  const { data, error } = await db.auth.admin.createUser({
    phone,
    phone_confirm: true,
    user_metadata: { name },
  })
  if (error) die(`could not create ${name} (${phone}): ${error.message}`)

  const { error: pErr } = await db
    .from('profiles')
    .update({ name, legacy_id: legacyId })
    .eq('id', data.user.id)
  if (pErr) die(`created ${name} but could not tag the profile: ${pErr.message}`)

  return data.user.id
}

/* ── Consultants ──────────────────────────────────────────────────────────── */

// The six mock prices are the six bands, exactly (01-PRD.md §4.1).
const TIER_BY_PRICE = { 749: 1, 899: 2, 999: 3, 1299: 4, 1499: 5, 2200: 6 }

const { data: bands, error: bandErr } = await db.from('price_bands').select('*').eq('active', true)
if (bandErr || !bands?.length) die(`no price bands — apply 007_consultants.sql first (${bandErr?.message})`)

const idByLegacy = new Map()

for (const [i, c] of consultants.entries()) {
  const tier = TIER_BY_PRICE[c.price]
  if (!tier) die(`${c.name} is priced at ₹${c.price}, which is not a band. Add the band or move the consultant.`)

  const id = await person(c.id, c.name, 'consultant')
  idByLegacy.set(c.id, id)

  await db.from('consultants').upsert(
    {
      profile_id: id,
      category: c.category,
      specialization: c.specialization,
      languages: c.languages,
      // '12 yrs' is a display string. Rule 9 of the UI traps: display strings
      // are not numbers, so it is parsed here and never round-tripped.
      experience_yrs: parseInt(c.experience, 10) || null,
      bio: c.bio,
      credentials: c.credentials,
      status,
      legacy_id: c.id,
    },
    { onConflict: 'profile_id' },
  )

  // Four services: the three bookable lengths and the per-minute rate. Both
  // billing models are real as of phase 4; nothing meters until phase 5/11.
  const mine = bands.filter((b) => b.tier === tier)
  await db.from('consultant_services').upsert(
    mine.map((b, n) => ({
      consultant_id: id,
      band_id: b.id,
      mode: 'call',
      billing: b.billing,
      duration_mins: b.duration_mins,
      price_paise: b.price_paise,
      sort: n * 10,
    })),
    { onConflict: 'consultant_id,mode,billing,duration_mins' },
  )

  // A week of availability, one row per OPEN slot. Each consultant drops a
  // different time so the grids are visibly not the same grid — the phase's
  // first done-condition is that each sees only their own.
  const dropped = timeSlots[i % timeSlots.length]
  const rows = []
  for (let weekday = 0; weekday <= 6; weekday++) {
    for (const t of timeSlots) {
      if (t === dropped) continue
      rows.push({ consultant_id: id, weekday, slot_time: t })
    }
  }
  await db.from('consultant_availability').upsert(rows, { onConflict: 'consultant_id,weekday,slot_time' })
}

/* ── Bookings ───────────────────────────────────────────────────────────────
   Seed trap 1: `bookings` has no consultant reference in the mock. Every row
   implicitly belongs to consultants[0], and a verbatim seed attributes all
   seven to one person invisibly — until a second consultant signs in. It is
   assigned here explicitly, in writing. */

const OWNER = 'a1'
const ownerId = idByLegacy.get(OWNER)

const services = await db
  .from('consultant_services')
  .select('*')
  .eq('consultant_id', ownerId)
  .eq('billing', 'fixed')
  .then((r) => r.data ?? [])

// Today, in IST, because slot times are IST.
const istToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
const dayOffset = (label) => (label.startsWith('Tomorrow') ? 1 : label.startsWith('Yesterday') ? -1 : 0)
const shift = (days) => {
  const d = new Date(`${istToday}T00:00:00+05:30`)
  d.setUTCDate(d.getUTCDate() + days)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d)
}

const STATUS = { pending: 'pending', confirmed: 'confirmed', done: 'completed' }

for (const b of bookings) {
  const mins = parseInt(b.duration, 10)
  // The mock's 10-minute session has no band behind it; the shortest one does.
  const service =
    services.find((s) => s.duration_mins === mins) ??
    services.reduce((a, s) => (s.duration_mins < a.duration_mins ? s : a))

  // The amount is the SERVICE's price, not the mock's. The mock charges ₹2,998
  // for 30 minutes — twice the 20-minute rate, where the bands say one and a
  // half times. Seeding the mock figure would put a number in the database
  // that the catalogue cannot reproduce, which is how a wrong price becomes a
  // wrong payout later.
  const seekerId = await person(`seed_placeholder:${b.client}`, b.client, 'placeholder')
  if (!consultants.some((c) => c.name === b.client)) unmatched.push(`bookings.client · ${b.client}`)

  const row = {
    seeker_id: seekerId,
    consultant_id: ownerId,
    service_id: service.id,
    starts_at: `${shift(dayOffset(b.when))}T${b.at}:00+05:30`,
    duration_mins: service.duration_mins,
    amount_paise: service.price_paise,
    mode: b.kind.toLowerCase(),
    status: STATUS[b.status],
    note: b.note ?? null,
    legacy_id: b.id,
  }

  // Not an upsert: `legacy_id` carries no unique index, and adding one to
  // bookings to make a seed convenient is a constraint on live data bought for
  // a script.
  const { data: existing } = await db.from('bookings').select('id').eq('legacy_id', b.id).maybeSingle()
  const { error } = existing
    ? await db.from('bookings').update(row).eq('id', existing.id)
    : await db.from('bookings').insert(row)
  if (error) die(`booking ${b.id}: ${error.message}`)
}

/* ── The list that fails loudly ─────────────────────────────────────────── */

console.log(`\nSeeded ${consultants.length} consultants and ${bookings.length} bookings on ${ref}.`)
console.log(`Consultant status: ${status}.`)
if (status === 'pending') {
  console.log(`Publish them when you mean to:`)
  console.log(`  update consultants set status='approved' where legacy_id like 'a_';`)
}

if (unmatched.length) {
  console.log(`\n${unmatched.length} display-name joins matched no record. Each is now a`)
  console.log(`placeholder profile flagged seed_placeholder:<name>. They are people the`)
  console.log(`mock names but never defines — not a bug in this script:\n`)
  for (const u of unmatched) console.log(`  · ${u}`)
  console.log('')
}

function die(msg) {
  console.error(`\nseed refused: ${msg}\n`)
  process.exit(1)
}
