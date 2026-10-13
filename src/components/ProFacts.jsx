import Icon from './Icon.jsx'

/**
 * The line of facts under a consultant's name (13 Oct 2026, Rahul): years
 * of practice, the rating and the badge, as three small pills with no
 * headings. Replaced the paid-session milestone badge and its ring.
 *
 * The badge is Pro, Expert or Master, set in the console only; every
 * consultant starts at Pro. With no reviews the rating reads "5.0 · New"
 * (Rahul's call): the "New" says no client has rated them yet. Once there
 * are reviews it is their real average and the count.
 */
const BADGES = {
  pro: { label: 'Pro', ink: 'var(--badge-pro)', wash: 'var(--badge-pro-wash)' },
  expert: { label: 'Expert', ink: 'var(--badge-expert)', wash: 'var(--badge-expert-wash)' },
  master: { label: 'Master', ink: 'var(--badge-master)', wash: 'var(--badge-master-wash)' },
}

const pill = 'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold tnum'

export function ProBadge({ badge, className = '' }) {
  const b = BADGES[badge] ?? BADGES.pro
  return (
    <span className={`${pill} ${className}`} style={{ color: b.ink, background: b.wash }}>
      <Icon name="award" size={14} weight={2.2} />
      {b.label}
    </span>
  )
}

export default function ProFacts({ experienceYrs, rating, reviewCount = 0, badge, className = '' }) {
  const rated = reviewCount > 0 && rating != null
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <span className={`${pill} border border-rule bg-white t-heading`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M9 7V5h6v2" />
        </svg>
        {experienceYrs ? `${experienceYrs} yrs Exp` : 'New practice'}
      </span>
      <span className={`${pill} border border-rule bg-white t-heading`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#e9a21b" aria-hidden="true">
          <path d="M12 2l3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21.1l1.4-7L2 9.3l7-.8z" />
        </svg>
        {rated ? Number(rating).toFixed(1) : '5.0'}
        <span className="font-semibold t-faint">{rated ? `(${reviewCount})` : '· New'}</span>
      </span>
      <ProBadge badge={badge} />
    </div>
  )
}

/** Specialization as chips: the free text split on commas, "·", "|" or "/".
 *  Written as one run of words it stays one chip. */
export function SkillChips({ text, className = '' }) {
  const parts = String(text || '')
    .split(/[,·|/\n]+/)
    .map((x) => x.trim())
    .filter(Boolean)
  if (!parts.length) return null
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {parts.map((p) => (
        <span key={p} className="rounded-full bg-gold/10 px-2.5 py-1 text-[12px] font-semibold leading-snug text-gold">
          {p}
        </span>
      ))}
    </div>
  )
}
