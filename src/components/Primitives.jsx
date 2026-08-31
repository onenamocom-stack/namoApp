import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'

/* ═══════════════════════════════════════════════════════════════════════════
   The whole vocabulary of the layout lives in this file.

   Screens compose these and are not allowed to invent new tappable shapes —
   that rule is what fixes the "which of these is a link" problem the original
   is criticised for. Three affordances, defined once:

     <Button>   bordered block          commits to something
     <Row>      full-width row with →   navigates somewhere
     <TextLink> underlined inline text  navigates from inside a sentence
   ═══════════════════════════════════════════════════════════════════════════ */

/** Tiny tracked caps. Centered by default — the printed-page tell. */
export function Label({ children, align = 'center', className = '', as: As = 'p' }) {
  return (
    <As className={`label ${align === 'center' ? 'text-center' : 'text-left'} ${className}`}>
      {children}
    </As>
  )
}

/**
 * A section: label, air, content, hairline. Every screen is a stack of these
 * and nothing else. `grid` switches the body to the 4-column grid used for
 * dense data, which is what keeps the centered passages from turning into
 * the "everything is centered and nothing has hierarchy" failure.
 */
export function Section({ label, children, className = '', tight = false, last = false }) {
  return (
    <section
      className={`${tight ? 'section-tight' : 'section'} ${last ? 'border-b-0' : ''} ${className}`}
    >
      {label && <Label className="mb-6">{label}</Label>}
      {children}
    </section>
  )
}

/** Short centered hairline. A full stop between two thoughts. */
export function Stub({ className = '' }) {
  return <div className={`rule-stub ${className}`} />
}

/**
 * Affordance 1 — commits. Renders as <button>, <Link> or <a> as needed.
 *
 * This is the full-width block form of the same object as PopButton, so it
 * borrows those classes rather than keeping a parallel `.act-btn` set alive.
 * One button look in the app, two layouts of it.
 */
export function Button({ to, href, onClick, variant = 'default', className = '', children, ...rest }) {
  const cls = [
    'pop-btn caps w-full',
    variant !== 'solid' && 'pop-btn-ghost',
    variant === 'quiet' && 't-faint',
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
      <a href={href} className={cls} {...rest}>
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
 * Affordance 2 — navigates. The trailing arrow is drawn by CSS so no row can
 * ship without it, and every row in the app therefore looks identical.
 */
export function Row({ to, onClick, title, meta, note, className = '' }) {
  const inner = (
    <>
      <span className="min-w-0">
        <span className="block text-body text-t1">{title}</span>
        {note && <span className="mt-1 block text-meta text-t3">{note}</span>}
      </span>
      {meta && <span className="text-label uppercase tracking-label text-t3 tnum">{meta}</span>}
    </>
  )

  if (to) {
    return (
      <Link to={to} className={`act-row ${className}`}>
        {inner}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={`act-row ${className}`}>
      {inner}
    </button>
  )
}

/** Affordance 3 — navigates from inside prose. Always underlined. */
export function TextLink({ to, onClick, children }) {
  if (to) {
    return (
      <Link to={to} className="act-link">
        {children}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className="act-link">
      {children}
    </button>
  )
}

/**
 * Segmented control. Text only — no pill, no sliding lens. The selected item
 * is white over a 1px white underline; everything else is grey.
 */
export function Segmented({ items, value, onChange, className = '' }) {
  return (
    <div role="tablist" className={`seg ${className}`}>
      {items.map((item) => {
        const key = typeof item === 'string' ? item : item.key
        const text = typeof item === 'string' ? item : item.label
        return (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={value === key}
            className="seg-item"
            onClick={() => onChange(key)}
          >
            {text}
          </button>
        )
      })}
    </div>
  )
}

/**
 * A rating drawn as ticks rather than a bar. Filled ticks are white and 2px;
 * empty ones are a hairline. No colour, no percentage badge.
 */
export function Ticks({ value, total = 5, className = '' }) {
  return (
    <span className={`flex items-center gap-1 ${className}`} aria-label={`${value} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`tick ${i < value ? 'tick-on' : ''}`} />
      ))}
    </span>
  )
}

/**
 * A 0–100 reading rendered as a 40-tick ruler. Used for day intensity. The
 * filled ticks rise left to right, 12ms apart, so the reading draws itself
 * rather than arriving already finished.
 */
export function Ruler({ value, className = '' }) {
  const filled = Math.round((value / 100) * 40)
  return (
    <div className={className}>
      <div className="flex h-3 items-end gap-[2px]" aria-hidden="true">
        {Array.from({ length: 40 }, (_, i) => (
          <span
            key={i}
            className={`flex-1 origin-bottom rounded-full ${i < filled ? 'animate-grow-y' : ''}`}
            style={{
              height: i % 5 === 0 ? '12px' : '7px',
              background: i < filled ? 'var(--gold-fill)' : 'rgba(28,26,25,0.12)',
              animationDelay: i < filled ? `${i * 12}ms` : undefined,
            }}
          />
        ))}
      </div>
    </div>
  )
}

/** Round avatar. Initials only — no photographs anywhere in this layout. */
export function Avatar({ initials, size = 36, className = '' }) {
  return (
    <span
      className={`avatar-face inline-flex flex-none items-center justify-center rounded-full border border-stroke bg-surface shadow-sm t-sub ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
    >
      {initials}
    </span>
  )
}

/** Key/value line for dense data. Left-aligned on purpose. */
export function Field({ k, v, className = '' }) {
  return (
    <div className={`flex items-baseline justify-between gap-6 py-3 rule-b ${className}`}>
      <span className="label text-left flex-none">{k}</span>
      <span className="text-body text-t1 text-right tnum">{v}</span>
    </div>
  )
}

/**
 * A row of small text toggles — like / save / share on a post, follow on a
 * profile. Deliberately not a fourth *navigation* affordance: nothing here
 * moves you to another screen, so it cannot be confused with <Row> or
 * <TextLink>. An engaged toggle is inked and underlined; the rest are grey.
 */
/* Label → glyph. Resolving the icon from the label keeps all eight call sites
   untouched; anything unrecognised (LiveRoom's "Send a gift") falls through to
   the original text rendering rather than vanishing. */
function iconFor(label) {
  const l = label.toLowerCase()
  if (l.includes('like') || l.includes('heart')) return 'heart'
  if (l.includes('repl') || l.includes('comment')) return 'chat'
  if (l.includes('share')) return 'share'
  if (l.includes('save') || l.includes('bookmark')) return 'bookmark'
  return null
}

export function Acts({ items, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-5 gap-y-3 ${className}`}>
      {items.map((a, i) => {
        const icon = iconFor(a.label)
        const solid = a.on && (icon === 'heart' || icon === 'bookmark')
        // The bookmark sits apart on the right, as it does on Instagram — but
        // only on a full action row. On the two-item rows (Article, Horoscope)
        // save comes first and pushing it would break their centring.
        const apart = icon === 'bookmark' && i === items.length - 1 && items.length > 2

        if (!icon) {
          return (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              className="text-micro uppercase tracking-caps text-t3 transition-colors hover:text-t1"
            >
              {a.on && a.onLabel ? a.onLabel : a.label}
            </button>
          )
        }

        return (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            aria-pressed={a.on === undefined ? undefined : a.on}
            aria-label={a.on && a.onLabel ? a.onLabel : a.label}
            /* Only `transform` transitions. Fading the colour meant the
               liked-heart red arrived over 150ms, and the press scale is the
               feedback that actually matters — the colour should just be
               there the instant you tap. */
            className={`flex items-center gap-1.5 transition-transform duration-150 active:scale-90 ${
              apart ? 'ml-auto' : ''
            } ${
              a.on
                ? icon === 'heart'
                  ? 'text-live'
                  : 'text-t1'
                : 'text-t2 hover:text-t1'
            }`}
          >
            <Icon name={icon} size={22} weight={1.8} filled={solid} />
            {a.count != null && <span className="text-meta tnum t-body">{a.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Search field. A white rounded box floating on the canvas — the same object
 * as a card, just short. It gains a gold ring on focus rather than an outline,
 * so the field itself reports focus instead of the browser drawing over it.
 */
export function Search({ value, onChange, placeholder, label = 'Search' }) {
  return (
    <div className="px-4 pt-4">
      <div className="pop-inset flex items-center gap-3 border border-stroke px-4 py-3 transition-colors focus-within:border-gold">
        <span aria-hidden="true" className="flex-none text-body t-faint">
          ⌕
        </span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          className="min-w-0 flex-1 bg-transparent text-body text-t1 outline-none placeholder:text-t4"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="flex-none caps-sm t-faint transition-colors hover:text-t1"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * First name for a rail label. Skips an honorific, so "Dr. Nandita Rao"
 * reads as "Nandita" rather than "Dr.".
 */
export function firstName(full = '') {
  const parts = full.split(' ').filter(Boolean)
  if (parts.length > 1 && /^(dr|mr|mrs|ms|prof)\.?$/i.test(parts[0])) return parts[1]
  return parts[0] || full
}

/** Non-interactive tag. Deliberately not a chip — chips read as tappable. */
export function Tag({ children }) {
  return (
    <span className="rounded-full bg-black/[0.06] px-2.5 py-1 text-micro uppercase tracking-caps text-t3">
      {children}
    </span>
  )
}
