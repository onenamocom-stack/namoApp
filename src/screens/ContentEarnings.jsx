import { useEffect, useState } from 'react'
import { TopBar } from '../components/Chrome.jsx'
import { Loader } from '../components/Cosmos.jsx'
import { Kicker, PopButton, PopCard, Stat } from '../components/Pop.jsx'
import { Field, Segmented } from '../components/Primitives.jsx'
import { Insights, RANGES } from '../pro/ProEarnings.jsx'
import { useDashboardRole } from './Dashboard.jsx'
import { earningsAll } from '../lib/consultants.js'
import { creatorEarnings } from '../lib/referrals.js'
import { rupees, useStore } from '../store.jsx'

/**
 * Content & Referrals: earnings and insights (16 Oct 2026, Rahul: the
 * Dashboard's first section). Earnings is commission from your links and
 * code — the shop's ("Referral cashback · …") and a Market listing's or an
 * e-book's ("Referral · …"). Insights is the Insights tab that was on the
 * mixed Earnings page: your posts and their views, and what sold with your
 * code.
 *
 * A Pro's commission is in their earnings book, so it has the periods; a
 * Creator's is their own book, which has this month, in all and waiting,
 * and the latest fifty rows.
 */
const TABS = [
  { key: 'earnings', label: 'Earnings' },
  { key: 'insights', label: 'Insights' },
]

const COMMISSION = /^Referral\b/

function money(paise) {
  return `${paise < 0 ? '−' : ''}₹${rupees(Math.abs(paise))}`
}

function day(iso) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
}

export default function ContentEarnings() {
  const role = useDashboardRole()
  const [tab, setTab] = useState('earnings')

  return (
    <>
      <TopBar title="Content & Referrals" back backTo="/dashboard" />
      <div className="px-4 pt-4">
        <Segmented items={TABS} value={tab} onChange={setTab} />
      </div>
      <div key={tab} className="animate-fade">
        {tab === 'insights' ? (
          <Insights links={false} />
        ) : role === 'pro' ? (
          <ProCommission />
        ) : role === 'creator' ? (
          <CreatorCommission />
        ) : (
          <Loader />
        )}
      </div>
      <div className="h-24" />
    </>
  )
}

function Entries({ rows }) {
  const [shown, setShown] = useState(30)
  return (
    <section className="px-5 py-6">
      <Kicker>Entries</Kicker>
      <ul className="mt-3">
        {rows.slice(0, shown).map((r) => (
          <li key={r.id} className="flex items-baseline justify-between gap-4 border-b border-rule py-3.5 last:border-b-0">
            <span className="min-w-0">
              <span className="block truncate text-meta t-sub">{r.kind}</span>
              <span className="mt-0.5 block caps-sm t-faint tnum">{day(r.at)}</span>
            </span>
            <span className={`flex-none text-meta tnum ${r.net < 0 ? 't-faint' : 'text-ok'}`}>
              {r.net < 0 ? '−' : '+'}₹{rupees(Math.abs(r.net))}
            </span>
          </li>
        ))}
      </ul>
      {rows.length === 0 && <p className="mt-3 text-meta t-faint">No commission in this period.</p>}
      {rows.length > shown && (
        <PopButton variant="ghost" size="sm" className="mt-4" onClick={() => setShown((n) => n + 30)}>
          Show more
        </PopButton>
      )}
    </section>
  )
}

function ProCommission() {
  const { consultant } = useStore()
  const id = consultant?.profile_id
  const [range, setRange] = useState('this_month')
  const [rows, setRows] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!id) return undefined
    let live = true
    setRows(null)
    setFailed(false)
    earningsAll(id, range)
      .then((all) => {
        if (!live) return
        setRows(
          all
            .filter((r) => COMMISSION.test(r.kind))
            .map((r) => ({ id: r.id, kind: r.kind, net: r.net_paise, at: r.effective_at, shop: r.kind.startsWith('Referral cashback') })),
        )
      })
      .catch((err) => {
        console.error('[content earnings] load failed:', err?.message)
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [id, range])

  const total = (rows ?? []).reduce((s, r) => s + r.net, 0)
  const shop = (rows ?? []).filter((r) => r.shop)
  const market = (rows ?? []).filter((r) => !r.shop)

  return (
    <>
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
        <p className="px-5 py-8 text-meta t-body">Could not load your commission. Open this page again to retry.</p>
      ) : !rows ? (
        <Loader label="Adding it up" className="py-8" />
      ) : (
        <>
          <section className="px-5 pb-2 pt-4">
            <PopCard raised className="p-5">
              <p className="caps-sm t-faint">Commission, {RANGES.find((r) => r.key === range)?.label.toLowerCase()}</p>
              <p className="mt-2 font-display text-huge leading-none tnum t-heading">{money(total)}</p>
              <p className="mt-2 text-meta t-body">From products, downloads, courses and events bought through your links and code.</p>
            </PopCard>
          </section>
          {rows.length > 0 && (
            <section className="border-b border-rule px-5 py-6">
              <Kicker>Where it came from</Kicker>
              <div className="mt-3">
                {shop.length > 0 && <Field k={`Shop · ${shop.length}`} v={money(shop.reduce((s, r) => s + r.net, 0))} />}
                {market.length > 0 && (
                  <Field k={`Market and e-books · ${market.length}`} v={money(market.reduce((s, r) => s + r.net, 0))} />
                )}
              </div>
            </section>
          )}
          <Entries rows={rows} />
        </>
      )}
    </>
  )
}

function CreatorCommission() {
  const [book, setBook] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    creatorEarnings()
      .then((d) => live && setBook(d))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [])

  if (failed) return <p className="px-5 py-8 text-meta t-body">Could not load your commission. Open this page again to retry.</p>
  if (!book) return <Loader label="Adding it up" className="py-8" />
  return (
    <>
      <section className="border-b border-rule px-5 py-6">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="This month" value={`₹${rupees(book.this_month_paise)}`} />
          <Stat label="In all" value={`₹${rupees(book.lifetime_paise)}`} />
          <Stat label="Waiting" value={`₹${rupees(book.pending_paise)}`} sub="7 days after delivery" />
        </div>
      </section>
      <Entries rows={book.rows.map((r) => ({ id: r.id, kind: r.kind, net: r.amount_paise, at: r.created_at }))} />
    </>
  )
}
