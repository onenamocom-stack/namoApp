/**
 * The kundli sky, in small pieces (3 Oct 2026). The sign-up reveal
 * (onboarding/Computing.jsx) drew a turning zodiac ring on a saffron sky;
 * these carry the same ring into the app's waiting and talking moments.
 * The palette and keyframes are in index.css, beside `.cosmic-dawn`.
 */

const TICKS = Array.from({ length: 12 }, (_, i) => i * 30)

/** The turning ring: twelve houses outside, a dotted orbit turning the other
 *  way inside, a lit centre. Saffron on anything light. */
export function Orbit({ size = 32, className = '' }) {
  return (
    <span
      className={`relative inline-block flex-none ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 40 40"
        className="absolute inset-0"
        style={{ animation: 'namo-orbit 9s linear infinite' }}
      >
        <circle cx="20" cy="20" r="18" fill="none" stroke="var(--gold-fill)" strokeWidth="1.4" opacity="0.85" />
        {TICKS.map((a) => (
          <line
            key={a}
            x1="20"
            y1="2"
            x2="20"
            y2="5.5"
            stroke="var(--gold-fill)"
            strokeWidth="1.2"
            transform={`rotate(${a} 20 20)`}
            opacity="0.8"
          />
        ))}
      </svg>
      <svg
        viewBox="0 0 40 40"
        className="absolute inset-0"
        style={{ animation: 'namo-orbit-back 5s linear infinite' }}
      >
        <circle cx="20" cy="20" r="11" fill="none" stroke="#c2410c" strokeWidth="1.2" strokeDasharray="1.5 3" />
        <circle cx="20" cy="9" r="1.8" fill="#c2410c" />
      </svg>
      <span
        className="absolute rounded-full"
        style={{
          inset: '38%',
          background: 'radial-gradient(circle, #fff3c4 0%, #ffa05e 60%, rgba(255,160,94,0) 100%)',
          animation: 'namo-twinkle 2.4s ease-in-out infinite',
        }}
      />
    </span>
  )
}

/** Every "Loading." in the app: the ring and one line under it. */
export function Loader({ label = 'Loading', className = 'py-10' }) {
  return (
    <div role="status" className={`flex flex-col items-center gap-3 text-center ${className}`}>
      <Orbit size={36} />
      <p className="text-meta t-faint">{label}</p>
    </div>
  )
}

/** A few slow-twinkling stars for a dawn-washed background. Fixed positions:
 *  random ones would move on every render. */
const STARS = [
  [8, 6, 2], [22, 14, 1.5], [41, 4, 1.5], [63, 10, 2], [84, 5, 1.5], [93, 18, 1.5],
  [12, 26, 1.5], [55, 22, 1.5], [74, 28, 2], [33, 31, 1.5],
]

export function Stars({ className = '' }) {
  return (
    <div className={`pointer-events-none absolute inset-x-0 top-0 h-64 ${className}`} aria-hidden="true">
      {STARS.map(([x, y, r], i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${x}%`,
            top: `${y * 2}%`,
            width: r * 2,
            height: r * 2,
            background: i % 3 === 0 ? '#f5782c' : '#ffb27a',
            animation: `namo-twinkle ${2.2 + (i % 4) * 0.7}s ease-in-out ${i * 0.3}s infinite`,
          }}
        />
      ))}
    </div>
  )
}
