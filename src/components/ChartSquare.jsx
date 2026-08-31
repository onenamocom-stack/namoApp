import { chartHouses } from '../data/mock.js'

/**
 * The two Indian charts. Squares, not wheels, and not interchangeable.
 *
 * These are genuinely different diagrams rather than skins of each other, and
 * the difference is *what stays still*:
 *
 * - **North Indian** — the twelve **houses** are fixed to the page. House 1 is
 *   always the top diamond and the rest run anticlockwise. What moves is the
 *   sign, so each compartment is labelled with a sign *number*.
 * - **South Indian** — the twelve **signs** are fixed to the page, laid out
 *   clockwise with Pisces at the top left. What moves is the house, so the
 *   ascendant has to be marked or the chart cannot be read.
 *
 * Getting that backwards produces a chart that looks right and is wrong, which
 * is worse than one that looks broken. Both read from the same `chartHouses`,
 * so neither can drift from the table view.
 *
 * Drawn in the same register as `ChartWheel`: hairlines, no fills, no
 * gradients, house numbers in the non-text grey and planets in a grey that
 * actually passes contrast.
 */

const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
]

const signNo = (sign) => SIGNS.indexOf(sign) + 1

const RULE = 'var(--rule)'
const FAINT = 'var(--text-4)'
const LABEL = 'var(--text-3)'
const INK = 'var(--text-2)'

/** Sign number above, planets below — the same stack in both charts. */
function Cell({ x, y, top, planets, active, onSelect }) {
  const isActive = active && planets.includes(active)
  return (
    <g>
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="8"
        fill={LABEL}
        letterSpacing="0.4"
      >
        {top}
      </text>
      {planets.length > 0 && (
        <text
          x={x}
          y={y + 11}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="8.5"
          fill={isActive ? 'var(--text)' : INK}
          onClick={onSelect ? () => onSelect(planets[0]) : undefined}
          style={onSelect ? { cursor: 'pointer' } : undefined}
        >
          {planets.join(' ')}
        </text>
      )}
    </g>
  )
}

/**
 * North Indian. Square, both diagonals, and the rhombus through the four side
 * midpoints — twelve compartments, house 1 the top diamond, anticlockwise.
 *
 * The label points are the compartment centroids, worked out once from that
 * geometry. They are not adjustable by eye: move one and it drifts out of its
 * own compartment at a different size.
 */
const NORTH = [
  { h: 1, x: 100, y: 42 },
  { h: 2, x: 48, y: 20 },
  { h: 3, x: 20, y: 48 },
  { h: 4, x: 42, y: 100 },
  { h: 5, x: 20, y: 152 },
  { h: 6, x: 48, y: 180 },
  { h: 7, x: 100, y: 152 },
  { h: 8, x: 152, y: 180 },
  { h: 9, x: 180, y: 152 },
  { h: 10, x: 158, y: 100 },
  { h: 11, x: 180, y: 48 },
  { h: 12, x: 152, y: 20 },
]

export function ChartNorth({ size = 260, active = null, onSelect }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className="mx-auto block overflow-visible">
      <rect x="0.5" y="0.5" width="199" height="199" fill="none" stroke={RULE} strokeWidth="1" />
      <path d="M0 0L200 200M200 0L0 200" stroke={FAINT} strokeWidth="0.7" fill="none" />
      <path d="M100 0L200 100L100 200L0 100Z" stroke={FAINT} strokeWidth="0.7" fill="none" />

      {NORTH.map(({ h, x, y }) => {
        const house = chartHouses.find((c) => c.house === h)
        return (
          <Cell
            key={h}
            x={x}
            y={y}
            top={signNo(house.sign)}
            planets={house.planets}
            active={active}
            onSelect={onSelect}
          />
        )
      })}
    </svg>
  )
}

/**
 * South Indian. A 4x4 grid with the middle four cells empty, signs fixed and
 * running clockwise from Pisces at the top left.
 *
 * The ascendant is struck through with a diagonal — the traditional mark, and
 * the only thing that says where the houses start. Without it the chart is
 * twelve boxes of planets and no first house.
 */
const SOUTH = [
  { sign: 'Pisces', r: 0, c: 0 },
  { sign: 'Aries', r: 0, c: 1 },
  { sign: 'Taurus', r: 0, c: 2 },
  { sign: 'Gemini', r: 0, c: 3 },
  { sign: 'Cancer', r: 1, c: 3 },
  { sign: 'Leo', r: 2, c: 3 },
  { sign: 'Virgo', r: 3, c: 3 },
  { sign: 'Libra', r: 3, c: 2 },
  { sign: 'Scorpio', r: 3, c: 1 },
  { sign: 'Sagittarius', r: 3, c: 0 },
  { sign: 'Capricorn', r: 2, c: 0 },
  { sign: 'Aquarius', r: 1, c: 0 },
]

export function ChartSouth({ size = 260, active = null, onSelect }) {
  const S = 50 // cell edge, 4 x 50 = the 200 viewBox
  const ascendant = chartHouses.find((c) => c.house === 1)?.sign

  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className="mx-auto block overflow-visible">
      <rect x="0.5" y="0.5" width="199" height="199" fill="none" stroke={RULE} strokeWidth="1" />

      {SOUTH.map(({ sign, r, c }) => {
        const house = chartHouses.find((h) => h.sign === sign)
        const x = c * S
        const y = r * S
        return (
          <g key={sign}>
            <rect x={x} y={y} width={S} height={S} fill="none" stroke={FAINT} strokeWidth="0.7" />
            {sign === ascendant && (
              <line x1={x} y1={y} x2={x + S} y2={y + S} stroke={LABEL} strokeWidth="0.9" />
            )}
            <Cell
              x={x + S / 2}
              y={y + 16}
              top={signNo(sign)}
              planets={house?.planets ?? []}
              active={active}
              onSelect={onSelect}
            />
          </g>
        )
      })}
    </svg>
  )
}
