/**
 * Does a swipe on the shrine do what the axis says?
 *
 *   node tools/verify-pooja-swipe.mjs
 *
 * Right/left changes the deity, down/up changes the murti of the deity you are
 * on. Both wrap. A short drag and an ambiguous diagonal do nothing.
 *
 * This exists because inverting the two axes once left `setDeity(next)` deleted
 * — the next deity was computed, never applied, and only the murti reset. The
 * build was green and the screen looked fine until you actually swiped. There
 * is no linter here to catch an unused binding.
 *
 * Rather than reimplement the rule, it lifts the real `endSwipe` out of
 * Pooja.jsx and runs it against stubs. If the source changes shape enough that
 * the lift fails, that is a loud failure rather than a check quietly passing on
 * code nobody ships.
 */
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../src/screens/Pooja.jsx', import.meta.url), 'utf8')

const start = src.indexOf('const endSwipe = (e) => {')
assert.notEqual(start, -1, 'could not find endSwipe in Pooja.jsx — has it been renamed?')

// Tolerate CRLF. Git converts line endings on Windows checkouts, and a matcher
// anchored on a bare newline finds nothing in a CRLF file — which looks exactly
// like the function having been renamed.
const closer = /\r?\n {2}\}\r?\n/g
closer.lastIndex = start
const found = closer.exec(src)
assert.ok(found, 'could not find the end of endSwipe')
const body = src.slice(start, found.index)

for (const needed of ['setDeity', 'setPic', 'SWIPE_MIN', 'DOMINANCE']) {
  assert.ok(body.includes(needed), `endSwipe no longer references ${needed}`)
}

const SWIPE_MIN = Number(src.match(/const SWIPE_MIN = ([\d.]+)/)[1])
const DOMINANCE = Number(src.match(/const DOMINANCE = ([\d.]+)/)[1])

// Six deities, three murtis each, so wrapping is visible in both directions.
const deities = Array.from({ length: 6 }, (_, i) => ({ id: `d${i + 1}`, images: [{}, {}, {}] }))

// The lifted body minus its own arrow-function header, so it compiles as a
// plain function over injected stubs.
const inner = body.replace('const endSwipe = (e) => {', '')

function swipe(state, dx, dy) {
  let deityId = state.deityId
  let pic = state.pic
  const deity = deities.find((d) => d.id === deityId)
  const run = new Function(
    'e',
    'swipe',
    'deities',
    'deity',
    'setDeity',
    'setPic',
    'SWIPE_MIN',
    'DOMINANCE',
    inner,
  )
  run(
    { clientX: dx, clientY: dy },
    { current: { x: 0, y: 0 } },
    deities,
    deity,
    (d) => {
      deityId = d.id
    },
    (v) => {
      pic = typeof v === 'function' ? v(pic) : v
    },
    SWIPE_MIN,
    DOMINANCE,
  )
  return { deityId, pic }
}

const at = (deityId, pic) => ({ deityId, pic })
const eq = (got, want, what) =>
  assert.deepEqual(got, want, `${what}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`)

const FAR = SWIPE_MIN + 40

// Horizontal moves the deity and resets the murti to the first.
eq(swipe(at('d1', 2), FAR, 0), at('d2', 0), 'swipe right, next deity, murti reset')
eq(swipe(at('d2', 0), -FAR, 0), at('d1', 0), 'swipe left, previous deity')
eq(swipe(at('d1', 0), -FAR, 0), at('d6', 0), 'swipe left from the first wraps to the last')
eq(swipe(at('d6', 0), FAR, 0), at('d1', 0), 'swipe right from the last wraps to the first')

// Vertical moves the murti and leaves the deity alone.
eq(swipe(at('d3', 0), 0, FAR), at('d3', 1), 'swipe down, next murti, same deity')
eq(swipe(at('d3', 1), 0, -FAR), at('d3', 0), 'swipe up, previous murti')
eq(swipe(at('d3', 0), 0, -FAR), at('d3', 2), 'swipe up from the first murti wraps to the last')
eq(swipe(at('d3', 2), 0, FAR), at('d3', 0), 'swipe down from the last murti wraps to the first')

// Too short, and ambiguous diagonals, do nothing.
eq(swipe(at('d3', 1), SWIPE_MIN - 4, 0), at('d3', 1), 'a drag under the threshold is ignored')
eq(swipe(at('d3', 1), FAR, FAR), at('d3', 1), 'a 45 degree diagonal is ignored rather than guessed')

console.log(
  'pooja swipe OK - right/left = deity, down/up = murti, both wrap; ' +
    `under ${SWIPE_MIN}px and diagonals ignored`,
)
