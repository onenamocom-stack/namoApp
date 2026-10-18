import { useEffect, useState } from 'react'
import { TopBar } from '../components/Chrome.jsx'
import { Loader } from '../components/Cosmos.jsx'
import { Kicker, PopButton, PopCard, Stat } from '../components/Pop.jsx'
import { Field, Segmented } from '../components/Primitives.jsx'
import Plate from '../components/Plate.jsx'
import { Bars, RANGES } from '../pro/ProEarnings.jsx'
import { earningsPeriod, KINDS } from '../lib/market.js'
import { rupees } from '../store.jsx'

/**
 * Market earnings and insights (16 Oct 2026, Rahul: "Build same for market
 * tab"): the Earnings page's shape for what you sell on the Market —
 * `/studio/market/earnings`, a Pro's or a Creator's. Earnings: the
 * period's total after Namo's share, by kind, the last seven days, each
 * sale. Insights: the same period by listing — sales, units, buyers, what
 * each earned. One read, `GET /v1/market/me/earnings/period/`.
 *
 * A sale counts when it was paid for (a download, course or event) or
 * delivered (a product). Commission from sharing somebody else's listing is
 * not here: that is on the Earnings page.
 */
const TABS = [
  { key: 'earnings', label: 'Earnings' },
  { key: 'insights', label: 'Insights' },
]

function money(paise) {
  return `${paise < 0 ? '−' : ''}₹${rupees(Math.abs(paise))}`
}

function title(range) {
  return {
    this_month: 'Market this month',
    last_month: 'Market last month',
    fy: 'Market this financial year',
    last_fy: 'Market last financial year',
  }[range] ?? 'Market since you started'
}

export default function MarketEarnings() {
  const [tab, setTab] = useState('earnings')
  const [range, setRange] = useState('this_month')
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    setData(null)
    setFailed(false)
    earningsPeriod(range)
      .then((d) => live && setData(d))
      .catch((err) => {
        console.error('[market earnings] load failed:', err?.message)
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [range])

  return (
    <>
      <TopBar title="Market earnings" back backTo="/studio/market" />

      <div className="px-4 pt-4">
        <Segmented items={TABS} value={tab} onChange={setTab} />
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pt-5">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            aria-pressed={range === r.key}
            onClick={() => setRange(r.key)}
            className="pill flex-none text-meta"
          >
            {r.label}
          </button>
        ))}
      </div>

      {failed ? (
        <p className="px-5 py-8 text-meta t-body">Could not load your Market earnings. Open this page again to retry.</p>
      ) : !data ? (
        <Loader label="Adding it up" className="py-8" />
      ) : (
        <div key={tab} className="animate-fade">
          {tab === 'earnings' ? <Earned data={data} range={range} /> : <Insight data={data} />}
        </div>
      )}

      <div className="h-24" />
    </>
  )
}

function Earned({ data, range }) {
  const [shown, setShown] = useState(30)
  const week = data.last_7_days.map((d) => ({
    label: new Date(`${d.date}T12:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' }),
    value: d.net_paise,
  }))

  return (
    <>
      <section className="px-5 pb-2 pt-4">
        <PopCard raised className="p-5">
          <p className="caps-sm t-faint">{title(range)}</p>
          <p className="mt-2 font-display text-huge leading-none tnum t-heading">{money(data.net_paise)}</p>
          <p className="mt-2 text-meta t-body">
            After Namo's share. Paid on the 7th of every month for the month before.
          </p>
          {data.due_paise > 0 && (
            <p className="mt-3 rounded-xl bg-surface2 px-3 py-2 text-meta t-body">
              ₹{rupees(data.due_paise)} is due to you, next on{' '}
              {new Date(data.next_payout).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}.
            </p>
          )}
        </PopCard>
      </section>

      {data.by_kind.length > 0 && (
        <section className="border-b border-rule px-5 py-6">
          <Kicker>Where it came from</Kicker>
          <div className="mt-3">
            {data.by_kind.map((k) => (
              <Field key={k.kind} k={`${KINDS[k.kind]?.plural ?? k.kind} · ${k.count}`} v={money(k.net_paise)} />
            ))}
          </div>
        </section>
      )}

      <section className="border-b border-rule px-5 py-6">
        <Kicker>Last 7 days</Kicker>
        <Bars data={week} money />
      </section>

      <section className="px-5 py-6">
        <Kicker>Sales</Kicker>
        <ul className="mt-3">
          {data.rows.slice(0, shown).map((r) => (
            <li
              key={r.id}
              className="flex items-baseline justify-between gap-4 border-b border-rule py-3.5 last:border-b-0"
            >
              <span className="min-w-0">
                <span className="block truncate text-meta t-sub">
                  {r.title}
                  {r.units > 1 ? ` × ${r.units}` : ''}
                </span>
                <span className="mt-0.5 block caps-sm t-faint tnum">
                  {new Date(r.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}
                  {' · '}₹{rupees(r.gross_paise)} − ₹{rupees(r.namo_paise)} Namo{r.paid ? ' · Paid' : ''}
                </span>
              </span>
              <span className="flex-none text-meta tnum text-ok">+₹{rupees(r.net_paise)}</span>
            </li>
          ))}
        </ul>
        {data.rows.length === 0 && <p className="mt-3 text-meta t-faint">Nothing sold in this period.</p>}
        {data.rows.length > shown && (
          <PopButton variant="ghost" size="sm" className="mt-4" onClick={() => setShown((n) => n + 30)}>
            Show more
          </PopButton>
        )}
      </section>
    </>
  )
}

function Insight({ data }) {
  if (data.count === 0) {
    return <p className="px-5 py-8 text-meta t-faint">Nothing sold in this period.</p>
  }
  return (
    <>
      <section className="border-b border-rule px-5 py-6">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Sales" value={data.count.toLocaleString('en-IN')} />
          <Stat label="Units" value={data.units.toLocaleString('en-IN')} />
          <Stat label="Buyers" value={data.buyers.toLocaleString('en-IN')} />
        </div>
      </section>

      <section className="px-5 py-6">
        <Kicker>{`Your listings · ${data.listings.length}`}</Kicker>
        <p className="mt-2 text-meta t-faint">What sold in this period, most earned first.</p>
        <ul className="mt-2">
          {data.listings.map((x) => (
            <li key={x.listing_id} className="flex items-center gap-3 border-b border-rule py-3 last:border-b-0">
              <span className="h-12 w-12 flex-none overflow-hidden rounded-xl bg-surface">
                {x.cover_url ? (
                  <img src={x.cover_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <Plate seed={x.listing_id} className="h-full w-full" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-meta t-heading">{x.title}</span>
                <span className="mt-0.5 block text-[12px] t-faint tnum">
                  {KINDS[x.kind]?.label ?? x.kind} · {x.units} sold · {x.buyers} {x.buyers === 1 ? 'buyer' : 'buyers'}
                </span>
              </span>
              <span className="flex-none text-meta tnum t-heading">{money(x.net_paise)}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
