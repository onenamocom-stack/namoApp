/**
 * Does each chart label sit in the compartment it claims?
 *
 *   node tools/verify-chart-geometry.mjs
 *
 * A North Indian chart whose house numbers drift one compartment over still
 * looks like a chart. Nothing throws, nothing renders oddly, and the reading is
 * wrong — which is the worst failure available in an astrology app. The label
 * positions in ChartSquare.jsx are centroids derived from the geometry rather
 * than nudged by eye, so they can be checked against the geometry.
 *
 * This re-derives which region a point falls in from first principles and
 * compares it to the house the component assigns.
 */
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../src/components/ChartSquare.jsx', import.meta.url), 'utf8')

/* ── North Indian ─────────────────────────────────────────────────────────
   Square 200x200, both diagonals, and the rhombus through the side midpoints.
   The diagonals cut the square into four quadrants; the rhombus separates the
   four central kites from the eight corner triangles. */
const quadrant = (x, y) => {
  const belowDiag1 = y > x //        the (0,0)-(200,200) diagonal
  const belowDiag2 = y > 200 - x //  the (200,0)-(0,200) diagonal
  if (!belowDiag1 && !belowDiag2) return 'top'
  if (!belowDiag1 && belowDiag2) return 'right'
  if (belowDiag1 && belowDiag2) return 'bottom'
  return 'left'
}
const insideRhombus = (x, y) => Math.abs(x - 100) + Math.abs(y - 100) <= 100

function houseAt(x, y) {
  const q = quadrant(x, y)
  if (insideRhombus(x, y)) return { top: 1, left: 4, bottom: 7, right: 10 }[q]
  // Outside the rhombus each quadrant is two corner triangles.
  if (q === 'top') return x < 100 ? 2 : 12
  if (q === 'left') return y < 100 ? 3 : 5
  if (q === 'bottom') return x < 100 ? 6 : 8
  return y < 100 ? 11 : 9
}

const north = [...src.matchAll(/\{ h: (\d+), x: (\d+), y: (\d+) \}/g)].map((m) => ({
  h: +m[1],
  x: +m[2],
  y: +m[3],
}))
assert.equal(north.length, 12, 'North chart must define exactly 12 compartments')
assert.deepEqual(
  north.map((c) => c.h),
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  'houses must be declared 1..12 in order',
)
for (const { h, x, y } of north) {
  const actual = houseAt(x, y)
  assert.equal(actual, h, `house ${h} label at (${x},${y}) falls in compartment ${actual}`)
}

/* ── South Indian ─────────────────────────────────────────────────────────
   Signs fixed, running CLOCKWISE from Pisces at the top left. Walking the
   declared cells must trace the ring one step at a time with no jumps, and
   must never enter the empty middle. */
const south = [...src.matchAll(/\{ sign: '(\w+)', r: (\d), c: (\d) \}/g)].map((m) => ({
  sign: m[1],
  r: +m[2],
  c: +m[3],
}))
assert.equal(south.length, 12, 'South chart must define exactly 12 cells')
assert.equal(south[0].sign, 'Pisces', 'the ring starts at Pisces')
assert.deepEqual(
  [south[0].r, south[0].c],
  [0, 0],
  'Pisces sits at the top left',
)
for (const { r, c } of south) {
  assert.ok(r === 0 || r === 3 || c === 0 || c === 3, `cell (${r},${c}) is in the empty middle`)
}
for (let i = 1; i < south.length; i++) {
  const a = south[i - 1]
  const b = south[i]
  const step = Math.abs(a.r - b.r) + Math.abs(a.c - b.c)
  assert.equal(step, 1, `${a.sign} -> ${b.sign} is not one step around the ring`)
}
// Clockwise: from the top-left the first move is to the right.
assert.ok(south[1].c > south[0].c, 'the ring must run clockwise, not anticlockwise')
// And it must close the loop back to Pisces.
const last = south[south.length - 1]
assert.equal(
  Math.abs(last.r - south[0].r) + Math.abs(last.c - south[0].c),
  1,
  'the ring must close back to Pisces',
)

/* The zodiac order the sign numbers are read from. */
const SIGNS = src.match(/const SIGNS = \[([\s\S]*?)\]/)[1].match(/'(\w+)'/g).map((s) => s.slice(1, -1))
assert.equal(SIGNS.length, 12)
assert.equal(SIGNS[0], 'Aries', 'sign numbering starts at Aries')
for (const { sign } of south) assert.ok(SIGNS.includes(sign), `${sign} is not a zodiac sign`)

console.log('chart geometry OK — 12 North compartments, 12 South cells, ring closed clockwise')
