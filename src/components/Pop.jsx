import { Link } from 'react-router-dom'

/* ═══════════════════════════════════════════════════════════════════════════
   Surface primitives.

   Everything here obeys the four rules that carry the look: a generous radius,
   soft elevation tuned to the ink, one voltage accent per screen, and
   hierarchy from the opacity ladder rather than extra colours.

   These sit alongside the editorial primitives in Primitives.jsx — Section,
   Row, Ticks and friends are untouched. Use PopCard where a surface should
   read as a physical tile, and the plain Section stack where the screen is
   meant to read as a printed page.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * A surface. `raised` lifts it further — one tile per screen, the object the
 * screen is actually about. `tap` adds the hover-lift/press-settle, and belongs
 * only on a card that genuinely navigates somewhere.
 */
export function PopCard({ raised = false, tap = false, className = '', as: As = 'div', ...rest }) {
  return (
    <As
      className={`${raised ? 'pop-raised' : 'pop-card'} ${tap ? 'pop-tap' : ''} ${className}`}
      {...rest}
    />
  )
}

/**
 * The elevated button. Renders as <button>, <Link> or <a>.
 *
 * Default is the ink one — a grey-black fill with white caps, which is where
 * "black primary" lives on a light canvas. `gold` is the voltage CTA, one per
 * screen. `ghost` is a white pill for the quiet third, because three loud
 * buttons on one screen reads as noise rather than hierarchy.
 */
export function PopButton({
  to,
  href,
  onClick,
  variant = 'default',
  size = 'md',
  full = true,
  className = '',
  children,
  ...rest
}) {
  const cls = [
    'pop-btn caps',
    // `sm` is the house default for anything inline or paired — full-width
    // blocky CTAs eat the screen, and the gold ones especially.
    size === 'sm' && 'pop-btn-sm',
    variant === 'gold' && 'pop-btn-gold',
    variant === 'ghost' && 'pop-btn-ghost',
    full && 'w-full',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  if (to) {
    return (
      <Link to={to} className={cls} {...rest}>
        {children}
      </Link>
    )
  }
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls} {...rest}>
        {children}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cls} {...rest}>
      {children}
    </button>
  )
}

/**
 * Section kicker. CAPS 11px at 50% white, optional right-hand action.
 * The single biggest visual win in the system — every section gets one.
 */
export function Kicker({ children, action, onAction, to, className = '' }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${className}`}>
      <p className="caps t-body">{children}</p>
      {action &&
        (to ? (
          <Link to={to} className="caps-sm gold">
            {action}
          </Link>
        ) : (
          <button type="button" onClick={onAction} className="caps-sm gold">
            {action}
          </button>
        ))}
    </div>
  )
}

/** Small rounded tag. CAPS on a tinted fill — legible over artwork. */
export function PopTag({ children, tone = 'default', className = '' }) {
  const tones = {
    default: 'bg-surface/90 t-sub',
    gold: 'bg-gold-fill text-ink',
    live: 'bg-live text-white',
  }
  return (
    <span
      className={`caps-sm inline-block rounded-full px-2.5 py-1 shadow-sm ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

/** A labelled figure. Numerals run mono — the spec's instrumentation read. */
export function Stat({ label, value, sub, className = '' }) {
  return (
    <div className={className}>
      <p className="caps-sm t-faint">{label}</p>
      <p className="mt-1.5 text-lead font-light tnum t-heading">{value}</p>
      {sub && <p className="mt-0.5 caps-sm t-faint">{sub}</p>}
    </div>
  )
}

/** Progress rail. Rounded, filled in the voltage accent, and it draws itself in. */
export function PopBar({ value, className = '' }) {
  return (
    <span className={`block h-1.5 w-full overflow-hidden rounded-full bg-black/10 ${className}`}>
      <span
        className="block h-full origin-left animate-grow rounded-full bg-gold-fill"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </span>
  )
}

/** Round avatar. Initials only — no photographs anywhere in this layout. */
export function PopAvatar({ initials, size = 36, online = false, className = '' }) {
  return (
    <span className={`relative inline-block flex-none ${className}`}>
      <span
        className="avatar-face inline-flex items-center justify-center rounded-full border border-stroke bg-surface shadow-sm t-sub"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
      >
        {initials}
      </span>
      {online && (
        <span
          className="absolute -bottom-0.5 -right-0.5 block rounded-full bg-ok ring-2 ring-bg"
          style={{ width: 9, height: 9 }}
          aria-label="Online"
        />
      )}
    </span>
  )
}
