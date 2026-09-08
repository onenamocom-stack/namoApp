#!/usr/bin/env node
/**
 * How many freeastroapi requests have we actually spent, and on what.
 *
 * WHY THIS EXISTS. The tier is 50,000 requests a month and nothing in the app
 * counts them. The one place the answer is recorded is `astro_cache`: the
 * function writes a row the first time it computes any derivation and reads the
 * row every time after, so **one row is one upstream request**, for ever. That
 * makes the table an exact ledger of what we have spent, and this prints it.
 *
 * It matters most for the failure that looks like health. If the cache ever
 * stops being written — a dropped table, a revoked grant, a bad key — every
 * call misses, the app keeps serving correct answers, and the month's quota
 * drains at 5 requests a second with nothing on any screen looking wrong. The
 * shape of that failure in this output is unmistakable: rows per day climbing
 * with traffic instead of sitting flat.
 *
 * THE ONE TRAP, encoded here so nobody meets it twice: `fetched_at` is UTC and
 * the cache keys are IST. Grouping by the raw date makes a day's rows appear to
 * vanish — a query for "today" came back empty on 9 Sep while the rows were
 * plainly there, because IST midnight is 18:30 the previous day in UTC. Every
 * grouping below converts first.
 *
 * It is READ ONLY.
 *
 * Usage — dev:
 *
 *   SUPABASE_URL=https://mrjsatelbuiypodeulcx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service role key> \
 *   node backend/tools/astro-usage.mjs
 *
 * The service role key is needed because `astro_cache` has RLS on and no policy
 * for anybody (`backend/schema/019_astro_cache.sql`) — service role only, by
 * design, because the payloads are birth-derived.
 */

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env

for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY })) {
  if (!v) {
    console.error(`${k} is not set.`)
    process.exit(2)
  }
}

/** Entry tier, docs/02-TRD.md §8. */
const MONTHLY_LIMIT = 50_000

/** `fetched_at` is UTC, the keys are IST. Everything is bucketed by IST day. */
const istDay = (iso) => new Date(new Date(iso).getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10)

/** What a key's prefix says about how that row's count is expected to grow.
 *  The `grows` column is the point of the whole report: anything that scales
 *  with the user base is the thing that eventually costs money. */
const KINDS = [
  ['panchang:',    'panchang',        'once a day, all users'],
  ['rashifal:',    'daily reading',   'once per sign per day'],
  ['canon-chart:', 'canonical chart', 'twelve, ever'],
  ['chart:',       'natal chart',     'once per account, ever'],
  ['horoscope:',   'reading (legacy)', 'ONCE PER PERSON PER DAY — pre-7 Sep'],
]
const kindOf = (key) => KINDS.find(([prefix]) => key.startsWith(prefix))?.[1] ?? 'other'

const rows = []
const PAGE = 1000
for (let from = 0; ; from += PAGE) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/astro_cache?select=key,fetched_at&order=fetched_at.asc`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Range: `${from}-${from + PAGE - 1}`,
      },
    },
  )
  if (!res.ok) {
    console.error(`Could not read astro_cache: HTTP ${res.status}`)
    console.error(await res.text())
    process.exit(1)
  }
  const page = await res.json()
  rows.push(...page)
  if (page.length < PAGE) break
}

if (rows.length === 0) {
  console.log('astro_cache is empty. Nothing has been computed yet.')
  process.exit(0)
}

console.log(`${SUPABASE_URL}`)
console.log(`${rows.length} rows = ${rows.length} upstream requests, ever\n`)

/* ── By kind ─────────────────────────────────────────────────────────────── */
const byKind = new Map()
for (const r of rows) byKind.set(kindOf(r.key), (byKind.get(kindOf(r.key)) ?? 0) + 1)

console.log('By kind')
for (const [, label, growth] of KINDS) {
  if (!byKind.has(label)) continue
  console.log(`  ${label.padEnd(18)} ${String(byKind.get(label)).padStart(5)}   ${growth}`)
}
if (byKind.has('other')) console.log(`  ${'other'.padEnd(18)} ${String(byKind.get('other')).padStart(5)}   legacy keys`)

/* ── This IST month ──────────────────────────────────────────────────────── */
const thisMonth = istDay(new Date().toISOString()).slice(0, 7)
const monthRows = rows.filter((r) => istDay(r.fetched_at).startsWith(thisMonth))
const pct = ((monthRows.length / MONTHLY_LIMIT) * 100).toFixed(2)

console.log(`\nThis month (${thisMonth}, IST)`)
console.log(`  ${monthRows.length} of ${MONTHLY_LIMIT.toLocaleString()}  (${pct}%)`)

/* ── Last fourteen IST days ──────────────────────────────────────────────── */
const byDay = new Map()
for (const r of rows) {
  const d = istDay(r.fetched_at)
  byDay.set(d, (byDay.get(d) ?? 0) + 1)
}
const days = [...byDay.keys()].sort().slice(-14)

console.log('\nRequests per IST day, last 14 with any')
for (const d of days) {
  const n = byDay.get(d)
  console.log(`  ${d}  ${String(n).padStart(4)}  ${'█'.repeat(Math.min(n, 50))}`)
}

/* ── The two things worth saying out loud ────────────────────────────────── */
const legacy = byKind.get('reading (legacy)') ?? 0
const canon = byKind.get('canonical chart') ?? 0

console.log()
if (canon > 0 && canon < 12) {
  console.log(`${12 - canon} of the twelve canonical charts have never been fetched, so those`)
  console.log('signs have never been checked against the vendor in this project.')
  console.log('Run backend/tools/verify-canonical-births.mjs to check all twelve.')
}
if (legacy > 0) {
  console.log(`${legacy} pre-7-Sep per-person reading rows are still here. They are orphans —`)
  console.log('nothing reads them and nothing sweeps them. Harmless, and not a leak.')
}

const worstDay = Math.max(...byDay.values())
if (worstDay > 200) {
  console.log(`\nWARNING: a day peaked at ${worstDay} requests. The design ceiling is about`)
  console.log('39 a day (12 signs x 3 date tabs, plus 3 panchang). A number that climbs with')
  console.log('traffic means the cache is not being written — check the function logs for')
  console.log('"CACHE WRITE FAILED", which is the only symptom until the quota is gone.')
}
