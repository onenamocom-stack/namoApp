#!/usr/bin/env node
/**
 * Ask freeastroapi where the Moon actually stood for each of the twelve
 * canonical births, and refuse to agree with the table unless it says so.
 *
 * WHY THIS EXISTS. Since 7 Sep the daily reading is chosen by the reader's
 * janma rashi and served from one of twelve fixed births, one whose Moon stands
 * in each sign (`backend/functions/astro/canonical.json`). If any of those
 * births has the wrong Moon, every reader of that sign gets the neighbouring
 * sign's reading — and nothing on any screen looks different.
 *
 * The Edge Function does guard it: it fetches each canonical chart once, checks
 * the Moon, and refuses rather than serving a mismatch. But that guard only
 * fires when a real person with that rashi signs in, so a wrong row can sit
 * undiscovered for as long as nobody of that sign arrives. Ten of the twelve
 * had never been checked against the vendor when this was written. This is the
 * thing that checks all twelve in one command instead of waiting for users.
 *
 * IT READS THE SAME FILE THE FUNCTION READS. That is the whole point of
 * `canonical.json` existing as a file rather than as a constant in `index.ts`:
 * a verifier holding its own copy of the table verifies the copy.
 *
 * It is READ ONLY. It calls the vendor and prints; it writes no cache rows and
 * touches no database, so it is safe to run against anything at any time.
 *
 * Usage — the key lives in the Edge Function secrets, not in the repo:
 *
 *   FREE_ASTRO_API_KEY=... node backend/tools/verify-canonical-births.mjs
 *
 * Run it when the table changes, and if the vendor ever changes their ephemeris
 * or renames a sign. Exits non-zero and names every birth that failed.
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const API = 'https://api.freeastroapi.com'

/** Same three settings the function merges into every outbound body. A chart
 *  fetched on a different ayanamsa would put the Moon somewhere else and this
 *  check would be testing the wrong thing. */
const RECKONING = { ayanamsha: 'lahiri', house_system: 'whole_sign', node_type: 'mean' }

const apiKey = process.env.FREE_ASTRO_API_KEY
if (!apiKey) {
  console.error('FREE_ASTRO_API_KEY is not set. It lives in the Edge Function secrets.')
  console.error('Supabase dashboard → Project settings → Edge Functions → Secrets.')
  process.exit(2)
}

const here = dirname(fileURLToPath(import.meta.url))
const tablePath = join(here, '..', 'functions', 'astro', 'canonical.json')
const table = JSON.parse(await readFile(tablePath, 'utf8'))
const { place, births } = table

const signs = Object.keys(births)
if (signs.length !== 12) {
  console.error(`canonical.json holds ${signs.length} births, not 12.`)
  process.exit(2)
}

console.log(`Checking ${signs.length} canonical births against ${API}`)
console.log(`Table: ${tablePath}`)
console.log(`Reckoning: ${RECKONING.ayanamsha} / ${RECKONING.house_system} / ${RECKONING.node_type}\n`)

const failed = []

for (const sign of signs) {
  const body = { ...births[sign], ...place, ...RECKONING }

  let res
  try {
    res = await fetch(`${API}/api/v2/vedic/chart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(body),
    })
  } catch (err) {
    failed.push({ sign, reason: `could not reach the API: ${err.message}` })
    console.log(`  ${sign.padEnd(12)} UNREACHABLE`)
    continue
  }

  if (!res.ok) {
    failed.push({ sign, reason: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` })
    console.log(`  ${sign.padEnd(12)} HTTP ${res.status}`)
    continue
  }

  const chart = await res.json()
  const moon = chart?.planets?.find((p) => p.name === 'Moon')

  if (!moon) {
    failed.push({ sign, reason: 'the chart came back with no Moon in it' })
    console.log(`  ${sign.padEnd(12)} NO MOON IN PAYLOAD`)
    continue
  }

  /* Degrees into the sign, printed whether or not it passed. The table's claim
     is not merely "the right sign" but "near the middle of it" — that margin is
     what stops a small ephemeris difference from flipping the answer — so a
     birth that passes at 0.4° into its sign is a warning even though it passes. */
  const into = Number(moon.degree_in_sign)
  const margin = Number.isFinite(into) ? Math.min(into, 30 - into) : null
  const marginNote = margin === null ? '' : `  ${into.toFixed(2)}° in, ${margin.toFixed(2)}° from an edge`

  if (moon.sign !== sign) {
    failed.push({ sign, reason: `the Moon is in ${moon.sign}, not ${sign}` })
    console.log(`  ${sign.padEnd(12)} WRONG — Moon in ${moon.sign}${marginNote}`)
  } else if (margin !== null && margin < 5) {
    failed.push({ sign, reason: `the Moon is only ${margin.toFixed(2)}° from a sign boundary` })
    console.log(`  ${sign.padEnd(12)} TOO CLOSE TO AN EDGE${marginNote}`)
  } else {
    console.log(`  ${sign.padEnd(12)} ok${marginNote}`)
  }

  /* Their tier allows 5 requests a second. Twelve sequential calls with a beat
     between them stays well under it and makes the script safe to run twice in
     a row without thinking about it. */
  await new Promise((r) => setTimeout(r, 250))
}

console.log()

if (failed.length === 0) {
  console.log(`All ${signs.length} canonical births check out.`)
  process.exit(0)
}

console.error(`${failed.length} of ${signs.length} FAILED:`)
for (const f of failed) console.error(`  ${f.sign}: ${f.reason}`)
console.error('')
console.error('A wrong birth means every reader of that sign gets the wrong')
console.error('reading. Fix canonical.json and redeploy the astro function.')
process.exit(1)
