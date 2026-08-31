import { chartHouses } from '../data/mock.js'

/**
 * Birth-chart wheel, drawn as an engraving: hairlines, no fills, no gradients,
 * no rotation. The spokes and ticks use --text-4 (the non-text grey) and every
 * glyph or number uses a grey that actually passes contrast.
 *
 * The wheel is the *alternate* view of the chart. The table is primary, because
 * a wheel is unreadable to anyone who has not been taught to read one.
 */
export default function ChartWheel({ size = 260, active = null, onSelect }) {
  const c = 110
  const R = { outer: 96, inner: 68, core: 34 }

  const polar = (r, deg) => {
    const rad = ((deg - 90) * Math.PI) / 180
    return [c + r * Math.cos(rad), c + r * Math.sin(rad)]
  }

  return (
    <svg viewBox="0 0 220 220" width={size} height={size} className="mx-auto block overflow-visible">
      {/* zodiac tick ring */}
      <circle cx={c} cy={c} r={R.outer} fill="none" stroke="var(--rule)" strokeWidth="1" />
      {Array.from({ length: 72 }, (_, i) => {
        const major = i % 6 === 0
        const [x1, y1] = polar(R.outer, i * 5)
        const [x2, y2] = polar(R.outer - (major ? 8 : 3.5), i * 5)
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={major ? 'var(--text-3)' : 'var(--text-4)'}
            strokeWidth={major ? 0.9 : 0.5}
          />
        )
      })}

      <circle cx={c} cy={c} r={R.inner} fill="none" stroke="var(--rule)" strokeWidth="1" />
      <circle cx={c} cy={c} r={R.core} fill="none" stroke="var(--rule)" strokeWidth="1" />

      {/* house spokes */}
      {chartHouses.map((h, i) => {
        const [x1, y1] = polar(R.core, i * 30)
        const [x2, y2] = polar(R.outer, i * 30)
        return (
          <line
            key={h.house}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="var(--text-4)"
            strokeWidth="0.5"
          />
        )
      })}

      {/* aspect figures across the core — the "computed" texture */}
      <g stroke="var(--text-4)" strokeWidth="0.5" fill="none">
        <polygon points={[0, 4, 8].map((i) => polar(R.core - 3, i * 30 + 15).join(',')).join(' ')} />
        <polygon points={[1, 5, 9].map((i) => polar(R.core - 11, i * 30 + 15).join(',')).join(' ')} />
      </g>

      {/* houses + planet glyphs */}
      {chartHouses.map((h, i) => {
        const mid = i * 30 + 15
        const [hx, hy] = polar(R.outer - 13, mid)
        const [px, py] = polar(R.inner - 16, mid)
        const isActive = active && h.planets.includes(active)
        return (
          <g key={h.house}>
            <text
              x={hx}
              y={hy}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="7"
              fill="var(--text-3)"
              fontFamily="Inter, sans-serif"
              letterSpacing="0.5"
            >
              {h.house}
            </text>
            {h.planets.length > 0 && (
              <text
                x={px}
                y={py}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="8"
                fill={isActive ? 'var(--text)' : 'var(--text-2)'}
                fontFamily="Inter, sans-serif"
                onClick={onSelect ? () => onSelect(h.planets[0]) : undefined}
                style={onSelect ? { cursor: 'pointer' } : undefined}
              >
                {h.planets.join(' ')}
              </text>
            )}
          </g>
        )
      })}

      <line x1={c - 4} y1={c} x2={c + 4} y2={c} stroke="var(--text-3)" strokeWidth="0.8" />
      <line x1={c} y1={c - 4} x2={c} y2={c + 4} stroke="var(--text-3)" strokeWidth="0.8" />
    </svg>
  )
}
