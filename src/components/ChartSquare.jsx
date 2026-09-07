/**
 * The North Indian chart. A square, not a wheel.
 *
 * The twelve **houses** are fixed to the page: house 1 is always the top
 * diamond and the rest run anticlockwise. What moves is the sign, so each
 * compartment is labelled with a sign *number*.
 *
 * IT IS THE ONLY CHART FORM IN THE APP - decided 7 Sep 2026. A South Indian
 * square and a Western wheel used to sit beside it behind a switcher. Both are
 * gone: the wheel because this product is sidereal and Vedic-first
 * (`01-PRD.md` section 10) and a tropical diagram invites reading a tropical
 * sign off a Lahiri chart, and the South Indian square because a second Indian
 * form was a preference to maintain rather than a thing anybody asked for.
 * Reinstating either is a product decision, not a revert.
 *
 * `houses` is **null while the chart is loading, and null when the birth time
 * is unknown** - whole-sign houses are twelve cusps and there are none without
 * a minute of birth. Null draws the empty diagram: the frame is the frame
 * either way, and an unlabelled one is honest about having nothing in it.
 *
 * Hairlines, no fills, no gradients, house numbers in the non-text grey and
 * planets in a grey that actually passes contrast.
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

export function ChartNorth({ size = 260, houses = null, active = null, onSelect }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className="mx-auto block overflow-visible">
      <rect x="0.5" y="0.5" width="199" height="199" fill="none" stroke={RULE} strokeWidth="1" />
      <path d="M0 0L200 200M200 0L0 200" stroke={FAINT} strokeWidth="0.7" fill="none" />
      <path d="M100 0L200 100L100 200L0 100Z" stroke={FAINT} strokeWidth="0.7" fill="none" />

      {houses &&
        NORTH.map(({ h, x, y }) => {
          const house = houses.find((c) => c.house === h)
          if (!house) return null
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
