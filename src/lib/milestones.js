/**
 * Milestones (3 Oct 2026, owner's request): a consultant's paid sessions,
 * counted by the API as `sessions_done` — chat, call and video sessions that
 * ended with a charge. Five tiers, each with its own colour. Seekers see the
 * badge and the ring on a consultant's card and page; the consultant sees the
 * same ring on their own profile, the ladder to 1000, and a one-time
 * congratulation when they cross a tier.
 *
 * `seeker` is what a client reads; `pro` is what the consultant reads. The
 * first tier reads differently on each side on purpose: "First customer"
 * means something to the consultant, while a client choosing whom to call
 * learns more from "Rising" than from "1 session".
 */
export const TIERS = [
  {
    at: 1,
    colour: 'green',
    seeker: 'Rising',
    pro: 'First customer',
    congrats: 'You served your first customer.',
    color: 'var(--tier-1)',
    ink: 'var(--tier-1-ink)',
  },
  {
    at: 10,
    colour: 'blue',
    seeker: '10+ sessions',
    pro: '10 sessions',
    congrats: 'You have given 10 paid sessions.',
    color: 'var(--tier-10)',
    ink: 'var(--tier-10-ink)',
  },
  {
    at: 100,
    colour: 'saffron',
    seeker: '100+ sessions',
    pro: '100 sessions',
    congrats: 'You have given 100 paid sessions.',
    color: 'var(--tier-100)',
    ink: 'var(--tier-100-ink)',
  },
  {
    at: 500,
    colour: 'purple',
    seeker: '500+ sessions',
    pro: '500 sessions',
    congrats: 'You have given 500 paid sessions.',
    color: 'var(--tier-500)',
    ink: 'var(--tier-500-ink)',
  },
  {
    at: 1000,
    colour: 'gold',
    seeker: '1000+ sessions',
    pro: '1000 sessions',
    congrats: 'You have given 1000 paid sessions. Few readers on Namo get here.',
    color: 'var(--tier-1000)',
    ink: 'var(--tier-1000-ink)',
    ring: 'conic-gradient(from 210deg, #f6dc7a, #d4a017, #a87a0c, #f6dc7a, #d4a017)',
  },
]

/** The highest tier reached, or null below the first session. */
export function tierFor(count = 0) {
  let reached = null
  for (const t of TIERS) if (count >= t.at) reached = t
  return reached
}

/** The next tier to reach, or null at the top. */
export function nextTier(count = 0) {
  return TIERS.find((t) => count < t.at) ?? null
}

/** Where `count` sits on the ladder, 0 to 1, with the five tiers evenly
 *  spaced — 1 → 1000 on a straight line would leave the first four tiers in
 *  the first half-percent. */
export function ladderPosition(count = 0) {
  const last = TIERS.length - 1
  let i = -1
  TIERS.forEach((t, k) => {
    if (count >= t.at) i = k
  })
  if (i < 0) return 0
  if (i === last) return 1
  const from = TIERS[i].at
  const to = TIERS[i + 1].at
  return (i + (count - from) / (to - from)) / last
}
