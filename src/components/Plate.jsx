/**
 * Generated imagery.
 *
 * The reference aesthetic runs on high-contrast black-and-white collage —
 * marble statuary, hands, celestial engravings, grainy space photography.
 * Those are commissioned assets and are not lifted here. Instead every plate
 * in this app is drawn procedurally in SVG: engraved line art, halftone,
 * orbital diagrams and contour fields, always greyscale, always under a
 * film-grain overlay.
 *
 * If you later want photographic plates, source them from public-domain
 * archives (The Met Open Access, NASA Image and Video Library, Rijksmuseum
 * Open Data), desaturate to pure greyscale and drop them in behind the same
 * `.grain` overlay.
 */

const VARIANTS = ['orbit', 'engraving', 'halftone', 'contour']

/** Deterministic 32-bit hash so the same id always yields the same plate. */
function hash(seed = '') {
  let h = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

export default function Plate({ seed = 'a', variant, className = '', children, label }) {
  const h = hash(seed)
  const kind = variant || VARIANTS[h % VARIANTS.length]

  return (
    <div className={`plate grain ${className}`}>
      <svg
        viewBox="0 0 200 200"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        {kind === 'orbit' && <Orbit h={h} />}
        {kind === 'engraving' && <Engraving h={h} />}
        {kind === 'halftone' && <Halftone h={h} />}
        {kind === 'contour' && <Contour h={h} />}
      </svg>

      {label && (
        <span className="absolute bottom-2 left-2 text-micro uppercase tracking-caps text-t3">
          {label}
        </span>
      )}
      {children}
    </div>
  )
}

/* ── Variants ──────────────────────────────────────────────────────────── */

function Orbit({ h }) {
  const cx = 60 + (h % 80)
  const cy = 60 + ((h >> 3) % 80)
  return (
    <g fill="none" stroke="var(--text)">
      <circle cx={cx} cy={cy} r="70" strokeOpacity="0.13" />
      <circle cx={cx} cy={cy} r="52" strokeOpacity="0.18" />
      <circle cx={cx} cy={cy} r="30" strokeOpacity="0.24" />
      <circle cx={cx} cy={cy} r="4" fill="var(--text)" fillOpacity="0.5" stroke="none" />
      {Array.from({ length: 48 }, (_, i) => {
        const a = ((i * 7.5 - 90) * Math.PI) / 180
        const long = i % 4 === 0
        return (
          <line
            key={i}
            x1={cx + Math.cos(a) * 70}
            y1={cy + Math.sin(a) * 70}
            x2={cx + Math.cos(a) * (70 - (long ? 9 : 4))}
            y2={cy + Math.sin(a) * (70 - (long ? 9 : 4))}
            strokeOpacity={long ? 0.35 : 0.16}
          />
        )
      })}
      <ellipse
        cx={cx}
        cy={cy}
        rx="86"
        ry="26"
        strokeOpacity="0.14"
        transform={`rotate(${h % 60} ${cx} ${cy})`}
      />
    </g>
  )
}

function Engraving({ h }) {
  const tilt = h % 40
  return (
    <g stroke="var(--text)" fill="none">
      {Array.from({ length: 54 }, (_, i) => {
        const y = i * 4 - 8
        const amp = 3 + ((i * (h % 5)) % 7)
        return (
          <path
            key={i}
            d={`M -10 ${y} Q 60 ${y - amp} 110 ${y} T 220 ${y + amp / 2}`}
            strokeOpacity={i % 3 === 0 ? 0.2 : 0.09}
            strokeWidth={i % 3 === 0 ? 0.9 : 0.5}
          />
        )
      })}
      <circle cx={100 + tilt} cy={100 - tilt} r="34" stroke="none" fill="var(--bg)" fillOpacity="0.55" />
      <circle cx={100 + tilt} cy={100 - tilt} r="34" strokeOpacity="0.32" />
    </g>
  )
}

function Halftone({ h }) {
  const dots = []
  for (let row = 0; row < 22; row += 1) {
    for (let col = 0; col < 22; col += 1) {
      const x = col * 9.5 + 3
      const y = row * 9.5 + 3
      const d = Math.hypot(x - (40 + (h % 120)), y - (60 + ((h >> 5) % 90))) / 150
      const r = Math.max(0, 3.6 * (1 - d) * (1 - d))
      if (r > 0.15) dots.push(<circle key={`${row}-${col}`} cx={x} cy={y} r={r} />)
    }
  }
  return (
    <g fill="var(--text)" fillOpacity="0.34">
      {dots}
    </g>
  )
}

function Contour({ h }) {
  return (
    <g stroke="var(--text)" fill="none">
      {Array.from({ length: 16 }, (_, i) => {
        const r = 12 + i * 7
        const wobble = (h >> i) % 9
        return (
          <path
            key={i}
            d={`M 100 ${100 - r}
                C ${140 + wobble} ${100 - r} ${100 + r} ${140 - wobble} ${100} ${100 + r}
                C ${100 - r} ${140 + wobble} ${60 - wobble} ${100 - r} 100 ${100 - r} Z`}
            strokeOpacity={0.08 + (i % 4) * 0.05}
            strokeWidth={i % 4 === 0 ? 0.9 : 0.5}
          />
        )
      })}
    </g>
  )
}
