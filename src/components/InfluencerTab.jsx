import { useEffect, useState } from 'react'
import { Kicker, PopButton, PopCard } from './Pop.jsx'
import { Loader } from './Cosmos.jsx'
import { influencerStats } from '../lib/referrals.js'
import { shareLink } from '../lib/share.js'
import { useStore } from '../store.jsx'

/**
 * Profile → Influencer (3 Oct 2026). Only for accounts the console has made
 * influencers. Two numbers, by the owner's call: how many people joined with
 * your code, and how many of them have paid. Views come later, if at all.
 *
 * The people themselves are never named: a joiner is a date and whether
 * they bought, nothing more.
 */
const PERIODS = [
  { key: 'this_month', label: 'inf.thisMonth' },
  { key: 'last_month', label: 'inf.lastMonth' },
  { key: 'lifetime', label: 'inf.lifetime' },
]

function day(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

export default function InfluencerTab() {
  const { t, showToast } = useStore()
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)
  const [period, setPeriod] = useState('this_month')

  useEffect(() => {
    let live = true
    influencerStats()
      .then((d) => live && setData(d))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [])

  if (failed) return <p className="px-5 py-8 text-meta t-body">{t('inf.failed')}</p>
  if (!data) return <Loader />

  const p = data.periods[period]
  const rate = p.signups ? Math.round((p.buyers / p.signups) * 100) : null

  async function share() {
    const said = await shareLink(`/onboarding?ref=${data.code}`, { title: 'Namo' })
    if (said) showToast(said)
  }

  return (
    <>
      <section className="px-5 pt-6">
        <PopCard raised className="p-5">
          <p className="caps-sm t-faint">{t('inf.yourCode')}</p>
          <p className="mt-1 font-display text-title tracking-wide tnum t-heading select-all">{data.code}</p>
          <p className="mt-2 break-all text-meta t-faint select-all">{data.link}</p>
          <PopButton variant="gold" className="mt-4" onClick={share}>
            {t('inf.share')}
          </PopButton>
          <p className="mt-3 text-meta t-body">{t('inf.how')}</p>
        </PopCard>
      </section>

      <section className="px-5 pt-6">
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {PERIODS.map((x) => (
            <button
              key={x.key}
              type="button"
              aria-pressed={period === x.key}
              onClick={() => setPeriod(x.key)}
              className="pill flex-none text-meta"
            >
              {t(x.label)}
            </button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <PopCard className="p-4">
            <p className="caps-sm t-faint">{t('inf.signups')}</p>
            <p className="mt-1.5 font-display text-display leading-none tnum t-heading">{p.signups}</p>
          </PopCard>
          <PopCard className="p-4">
            <p className="caps-sm t-faint">{t('inf.buyers')}</p>
            <p className="mt-1.5 font-display text-display leading-none tnum text-ok">{p.buyers}</p>
          </PopCard>
        </div>
        <p className="mt-3 text-meta t-faint">
          {rate === null ? t('inf.noneYet') : t('inf.rate', { n: rate })}
        </p>
      </section>

      <section className="px-5 py-6">
        <Kicker>{t('inf.recent')}</Kicker>
        {data.recent.length === 0 ? (
          <p className="mt-3 text-meta t-faint">{t('inf.recentEmpty')}</p>
        ) : (
          <ul className="mt-3">
            {data.recent.map((r, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-4 border-b border-rule py-3 last:border-b-0"
              >
                <span className="text-meta t-body tnum">{t('inf.joined', { d: day(r.joined_on) })}</span>
                {r.bought_on ? (
                  <span className="text-meta font-semibold text-ok tnum">
                    {t('inf.paidOn', { d: day(r.bought_on) })}
                  </span>
                ) : (
                  <span className="text-meta t-faint">{t('inf.notYet')}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-meta t-faint">{t('inf.terms')}</p>
      </section>
    </>
  )
}
