import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon.jsx'
import { PopButton } from './Pop.jsx'
import { TIERS, ladderPosition, nextTier, tierFor } from '../lib/milestones.js'
import { useStore } from '../store.jsx'

/**
 * The milestone pieces (3 Oct 2026). The rules and colours are in
 * `lib/milestones.js`; this file only draws them.
 */

/** A ring in the tier's colour around whatever avatar it wraps. Nothing at
 *  all below the first paid session — no grey ring that reads as a tier. */
export function TierRing({ count = 0, size = 56, children, className = '' }) {
  const tier = tierFor(count)
  if (!tier) return <span className={`inline-flex flex-none ${className}`}>{children}</span>
  const pad = size >= 64 ? 3 : 2
  return (
    <span
      className={`inline-flex flex-none rounded-full ${className}`}
      style={{ padding: pad, background: tier.ring ?? tier.color }}
      title={tier.seeker}
    >
      <span className="inline-flex rounded-full bg-bg" style={{ padding: pad }}>
        {children}
      </span>
    </span>
  )
}

/** The badge: a rosette and the tier's name, on a wash of its colour. */
export function MilestoneBadge({ count = 0, side = 'seeker', className = '' }) {
  const tier = tierFor(count)
  if (!tier) return null
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}
      style={{
        color: tier.ink,
        background: `color-mix(in srgb, ${tier.color} 14%, white)`,
      }}
    >
      <Icon name="award" size={12} weight={2} />
      {side === 'pro' ? tier.pro : tier.seeker}
    </span>
  )
}

/**
 * The ladder: five stops from the first customer to 1000 sessions, filled
 * to where you are, each stop in its own colour once reached. The stops are
 * evenly spaced rather than to scale; on a true scale the first four would
 * sit in the first half-percent of the bar.
 */
export function MilestoneLadder({ count = 0 }) {
  const next = nextTier(count)
  const at = ladderPosition(count)
  const fill = `linear-gradient(90deg, ${TIERS.map(
    (t, i) => `${t.color} ${(i / (TIERS.length - 1)) * 100}%`,
  ).join(', ')})`

  return (
    <div>
      <p className="text-meta t-body">
        <span className="font-semibold t-heading tnum">{count.toLocaleString('en-IN')}</span>{' '}
        paid {count === 1 ? 'session' : 'sessions'} given.{' '}
        {next
          ? `${(next.at - count).toLocaleString('en-IN')} more to ${next.pro.toLowerCase()} and a ${next.colour} ring.`
          : 'You have reached the top tier.'}
      </p>
      {next && next.at !== 1000 && (
        <p className="mt-1 text-meta t-faint tnum">
          {(1000 - count).toLocaleString('en-IN')} more to 1000 sessions.
        </p>
      )}

      <div className="relative mx-2 mt-6 h-2 rounded-full bg-surface-2" aria-hidden="true">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${at * 100}%`,
            backgroundImage: fill,
            backgroundSize: `${at > 0 ? 100 / at : 100}% 100%`,
          }}
        />
        {TIERS.map((t, i) => {
          const reached = count >= t.at
          return (
            <span
              key={t.at}
              className="absolute top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-white"
              style={{
                left: `${(i / (TIERS.length - 1)) * 100}%`,
                // Every tier shows its colour from the start, faded until it
                // is reached — the owner's call, so the next ring is
                // something to look forward to rather than a grey circle.
                borderColor: t.color,
                color: t.color,
                opacity: reached ? 1 : 0.4,
              }}
            >
              <Icon name="award" size={13} weight={2.2} />
            </span>
          )
        })}
      </div>
      <div className="relative mx-2 mt-5 h-4">
        {TIERS.map((t, i) => (
          <span
            key={t.at}
            className="absolute -translate-x-1/2 text-[11px] font-semibold tnum"
            style={{
              left: `${(i / (TIERS.length - 1)) * 100}%`,
              color: t.ink,
              opacity: count >= t.at ? 1 : 0.55,
            }}
          >
            {t.at === 1000 ? '1000+' : t.at}
          </span>
        ))}
      </div>
    </div>
  )
}

const SEEN = (id) => `namo:milestone:${id}`

/**
 * The one-time congratulation, in the consultant app. Shown when the
 * consultant's count has crossed a tier this device has not celebrated, and
 * remembered per device, so it is once — not on every open. A consultant
 * who arrives already past several tiers sees the highest one only.
 */
export function MilestoneCelebration() {
  const { consultant } = useStore()
  const id = consultant?.profile_id
  const count = consultant?.sessions_done ?? 0
  const tier = tierFor(count)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!id || !tier) return
    let seen = 0
    try {
      seen = Number(localStorage.getItem(SEEN(id)) || 0)
    } catch {
      return
    }
    if (tier.at > seen) setOpen(true)
  }, [id, tier])

  function close() {
    setOpen(false)
    try {
      localStorage.setItem(SEEN(id), String(tier.at))
    } catch {
      /* a private window: it may show again, which is harmless */
    }
  }

  if (!open || !tier) return null
  const next = nextTier(count)

  return createPortal(
    <div className="fixed inset-0 z-[70] mx-auto flex w-full max-w-[420px] items-center justify-center px-6">
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="absolute inset-0 animate-fade bg-black/55"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="milestone-title"
        className="relative w-full animate-fade-rise rounded-3xl bg-white px-6 pb-6 pt-8 text-center shadow-xl"
      >
        <span
          className="mx-auto flex h-24 w-24 items-center justify-center rounded-full"
          style={{ background: tier.ring ?? tier.color }}
        >
          <span
            className="flex h-[84px] w-[84px] items-center justify-center rounded-full bg-white"
            style={{ color: tier.color }}
          >
            <Icon name="award" size={44} weight={1.8} />
          </span>
        </span>
        <p className="mt-5 caps-sm" style={{ color: tier.ink }}>
          {tier.pro}
        </p>
        <h2 id="milestone-title" className="mt-2 font-display text-title t-heading">
          Congratulations
        </h2>
        <p className="mt-2 text-body t-body">{tier.congrats}</p>
        <p className="mt-1 text-meta t-faint">
          {next
            ? `Next: ${next.pro.toLowerCase()}. Your ring and badge change colour when you get there.`
            : 'Clients see the gold ring on your profile.'}
        </p>
        <PopButton variant="gold" className="mt-6" onClick={close}>
          Keep going
        </PopButton>
      </div>
    </div>,
    document.body,
  )
}
