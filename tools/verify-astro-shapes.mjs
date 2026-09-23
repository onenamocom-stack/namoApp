/**
 * Do the shaping functions read what the vendor actually sends?
 *
 *   node tools/verify-astro-shapes.mjs
 *
 * `src/lib/astro.js` turns freeastroapi.com's payloads into the shapes the
 * screens render. Every one of those reads is a guess about somebody else's
 * JSON, and a wrong guess is silent: the field comes back undefined, the
 * screen renders an empty section, and the build is green. That is how the
 * reading lost its rashi label for a day in September without anybody
 * noticing.
 *
 * So this runs the REAL payloads — `tools/fixtures/astro/`, captured from the
 * live API on 22 Sep 2026 — through the real functions. The mock provider in
 * the Django API is checked by its own tests; this checks the other side,
 * where the vendor's spelling is the thing that can change under us.
 *
 * The fixtures are computed from the reference birth in `docs/02-TRD.md` §8
 * (Indira Gandhi, a published birth certificate), so no private detail is
 * committed here.
 *
 * It builds `src/lib/astro.js` through Vite first, because the module reads
 * `import.meta.env` and Node alone cannot. A build failure is a real failure.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`fixtures/astro/${name}.json`, import.meta.url), 'utf8'))

// Under node_modules, not the OS temp dir: the SSR bundle leaves react and
// @supabase external, and bare imports only resolve from inside the project.
const cache = join(root, 'node_modules', '.cache')
mkdirSync(cache, { recursive: true })
const out = mkdtempSync(join(cache, 'astro-shapes-'))
let astro
try {
  // Vite's own entry, run by this Node: `npx` is a .cmd on Windows and Node
  // refuses to spawn one without a shell.
  execFileSync(
    process.execPath,
    [
      join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
      'build', '--ssr', 'src/lib/astro.js', '--outDir', out, '--logLevel', 'error',
    ],
    { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] },
  )
  astro = await import(pathToFileURL(join(out, 'astro.js')).href)
} finally {
  rmSync(out, { recursive: true, force: true })
}

const { readingFrom, matchFrom, muhuratFrom, clockOf } = astro

/* ── The daily reading ───────────────────────────────────────────────────── */

const day = readingFrom(fixture('horoscope'), 'Today', null)
assert.ok(day.headline, 'no headline — theme.headline moved')
assert.ok(day.body.length > 40, 'no summary — narrative.summary moved')
assert.ok(day.intensity > 0, 'no overall score — scores.overall.score moved')
assert.equal(day.ratings.length, 6, 'the payload scores six domains; the screen must show six')
assert.ok(
  day.glance.find((g) => g.key === 'Period')?.value.includes('/'),
  'no dasha stack — profile.active_dasha_stack moved. It is the READER\'s period now',
)
assert.ok(day.sections.length >= 5, 'no long sections')
assert.ok(day.transits.length >= 1 && day.transits[0].title, 'no transits')
assert.equal(day.windows.length, 4, 'four timing windows: abhijit, rahu, yamaganda, gulika')
assert.ok(day.windows.every((w) => w.label && w.start && w.end), 'a window with no label or clock')

/* ── Matching ────────────────────────────────────────────────────────────── */

const match = matchFrom(fixture('match'))
assert.equal(match.max, 36, 'Ashtakoota is out of 36')
assert.equal(match.threshold, 18, 'the traditional pass mark is 18')
assert.equal(match.kootas.length, 8, 'eight kootas')
assert.equal(match.kootas.reduce((n, k) => n + k.max, 0), 36, 'the eight maxima must sum to 36')
assert.ok(match.kootas.every((k) => k.note), 'a koota with no evidence line explains nothing')
assert.equal(match.manglik.length, 2, 'manglik is per person, and both are shown')
assert.equal(match.pairDoshas.length, 2, 'nadi and bhakoot are about the pair')
assert.equal(match.people.length, 2, 'both Moons come back')
assert.equal(match.passes, match.score >= match.threshold, 'the pass flag disagrees with the score')

/* ── Muhurat ─────────────────────────────────────────────────────────────── */

const beforeTheMonth = new Date('2026-09-22T00:00:00+05:30')

// Griha pravesh in October 2026 genuinely returns nothing: whole months are
// closed to some rites. An empty answer must survive shaping as an empty
// answer, because the screen says so in words.
const empty = muhuratFrom(fixture('muhurat'), { now: beforeTheMonth })
assert.equal(empty.windows.length, 0, 'an empty month must stay empty')
assert.equal(empty.moment, null, 'a public search never promotes a moment')

const personal = muhuratFrom(fixture('muhurat_personal'), { now: beforeTheMonth })
assert.ok(personal.windows.length > 0, 'the personal search returned windows')
assert.ok(
  personal.verdict,
  'no verdict sentence — the personal search often promotes NO moment and that ' +
  'sentence is then the whole answer',
)
assert.ok(
  personal.windows.every((w) => /^\d\d:\d\d$/.test(w.start) && /^\d\d:\d\d$/.test(w.end)),
  'a window clock is not HH:MM — the offset must be read off the string, never through Date',
)
assert.ok(
  personal.windows.some((w) => w.overnight && w.hours >= 23),
  'no sunrise-to-sunrise window flagged — those run 24 hours and their two clock ' +
  'times are identical, which reads as a bug unless the length is shown',
)
assert.ok(
  personal.windows.every((w, i, all) => i === 0 || all[i - 1].date <= w.date),
  'windows are not in time order',
)

// A search read after its month is over shows nothing rather than the past.
const afterwards = muhuratFrom(fixture('muhurat_personal'), { now: new Date('2026-11-30T00:00:00+05:30') })
assert.equal(afterwards.windows.length, 0, 'windows that have passed must be dropped')

assert.equal(clockOf('2026-10-29T22:11:05.251934+05:30'), '22:11')

console.log('astro shapes OK — reading, match and both muhurat searches read the real payloads')
