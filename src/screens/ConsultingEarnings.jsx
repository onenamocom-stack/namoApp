import { useEffect, useMemo, useState } from 'react'
import { TopBar } from '../components/Chrome.jsx'
import { Loader } from '../components/Cosmos.jsx'
import { Kicker, PopButton, PopCard, Stat } from '../components/Pop.jsx'
import { Field, Segmented } from '../components/Primitives.jsx'
import { Bars, RANGES } from '../pro/ProEarnings.jsx'
import { earningsAll, earningsSummary } from '../lib/consultants.js'
import { rupees, useStore } from '../store.jsx'

/**
 * Consulting earnings and insights (16 Oct 2026, Rahul): the Earnings page's
 * shape — Earnings | Insights, a period, the total — holding only what
 * consulting earned: metered chat, audio and video, booked sessions and
 * their reversals. Shop commission ("Referral cashback · …", and its
 * cancellations) is left out, and so are posts.
 *
 * Front end only. The figures are added up here from the period's rows
 * (`earningsAll`), because the summary's reversals bucket cannot tell a
 * cancelled cashback from a declined booking. Who and how long come from
 * the row's label, "<name> · <n> min chat|audio call|video call", which the
 * session settle writes (`chat/services.py`).
 */
const TABS = [
  { key: 'earnings', label: 'Earnings' },
  { key: 'insights', label: 'Insights' },
]

const SHOP = /^Referral cashback/
const METERED = /^(.*) · (\d+) min (chat|audio call|video call)$/
const MODE_LABEL = { chat: 'Chat', 'audio call': 'Audio call', 'video call': 'Video call' }

/** A consulting row, read: what it was, who, how many minutes. */
function read(r) {
  const m = r.source === 'sessions' ? METERED.exec(r.kind) : null
  if (m) return { ...r, what: m[3], who: m[1], minutes: Number(m[2]) }
  return { ...r, what: r.source, who: null, minutes: 0 }
}

/** Today in IST as YYYY-MM-DD, shifted by `days`. */
function istDay(days = 0) {
  const d = new Date(Date.now() + days * 86_400_000)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function title(range) {
  return {
    this_month: 'Consulting this month',
    last_month: 'Consulting last month',
    fy: 'Consulting this financial year',
    last_fy: 'Consulting last financial year',
  }[range] ?? 'Consulting since you joined'
}

function money(paise) {
  return `${paise < 0 ? '−' : ''}₹${rupees(Math.abs(paise))}`
}

export default function ConsultingEarnings() {
  const { consultant } = useStore()
  const id = consultant?.profile_id
  const [tab, setTab] = useState('earnings')
  const [range, setRange] = useState('this_month')
  const [rows, setRows] = useState(null)
  const [upcoming, setUpcoming] = useState(0)
  const [week, setWeek] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!id) return undefined
    let live = true
    setRows(null)
    setFailed(false)
    Promise.all([earningsAll(id, range), earningsSummary(id, range)])
      .then(([all, sum]) => {
        if (!live) return
        setRows(all.filter((r) => !SHOP.test(r.kind)).map(read))
        // Only a booking can be ahead of its time, so all of it is consulting.
        setUpcoming(sum.upcoming_paise ?? 0)
      })
      .catch((err) => {
        console.error('[consulting] load failed:', err?.message)
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [id, range])

  // The last seven IST days, whatever the period.
  useEffect(() => {
    if (!id) return undefined
    let live = true
    earningsAll(id, 'custom', { from: istDay(-6), to: istDay(0) })
      .then((all) => {
        if (!live) return
        const days = Array.from({ length: 7 }, (_, i) => istDay(i - 6))
        const by = Object.fromEntries(days.map((d) => [d, 0]))
        for (const r of all) {
          if (SHOP.test(r.kind)) continue
          const d = new Date(r.effective_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
          if (d in by) by[d] += r.net_paise
        }
        setWeek(
          days.map((d) => ({
            label: new Date(`${d}T12:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' }),
            value: by[d],
          })),
        )
      })
      .catch(() => live && setWeek([]))
    return () => {
      live = false
    }
  }, [id])

  return (
    <>
      <TopBar title="Consulting" back backTo="/dashboard" />

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
        <p className="px-5 py-8 text-meta t-body">Could not load your consulting. Open this page again to retry.</p>
      ) : !rows ? (
        <Loader label="Adding it up" className="py-8" />
      ) : (
        <div key={tab} className="animate-fade">
          {tab === 'earnings' ? (
            <Earned rows={rows} range={range} upcoming={upcoming} week={week} />
          ) : (
            <Insight rows={rows} range={range} rating={consultant?.rating_avg_cache} reviews={consultant?.rating_count_cache} />
          )}
        </div>
      )}

      <div className="h-24" />
    </>
  )
}

function Earned({ rows, range, upcoming, week }) {
  const [shown, setShown] = useState(30)
  const total = rows.reduce((s, r) => s + r.net_paise, 0)

  const sources = useMemo(() => {
    const order = ['chat', 'audio call', 'video call', 'bookings', 'reversals']
    const label = { ...MODE_LABEL, bookings: 'Booked sessions', reversals: 'Reversals' }
    const by = {}
    for (const r of rows) {
      const k = r.net_paise < 0 ? 'reversals' : r.what
      by[k] = by[k] ?? { n: 0, net: 0 }
      by[k].n += 1
      by[k].net += r.net_paise
    }
    return order.filter((k) => by[k]).map((k) => ({ k, label: label[k], ...by[k] }))
  }, [rows])

  return (
    <>
      <section className="px-5 pb-2 pt-4">
        <PopCard raised className="p-5">
          <p className="caps-sm t-faint">{title(range)}</p>
          <p className="mt-2 font-display text-huge leading-none tnum t-heading">{money(total)}</p>
          <p className="mt-2 text-meta t-body">Chat, calls and booked sessions. Shop commission is not in this.</p>
          {upcoming > 0 && (range === 'this_month' || range === 'lifetime') && (
            <p className="mt-3 rounded-xl bg-surface2 px-3 py-2 text-meta t-body">
              ₹{rupees(upcoming)} more is booked for sessions that have not happened yet. Each counts in the
              month it takes place.
            </p>
          )}
        </PopCard>
      </section>

      {sources.length > 0 && (
        <section className="border-b border-rule px-5 py-6">
          <Kicker>Where it came from</Kicker>
          <div className="mt-3">
            {sources.map((x) => (
              <Field key={x.k} k={`${x.label} · ${x.n}`} v={money(x.net)} />
            ))}
          </div>
        </section>
      )}

      {week && week.length > 0 && (
        <section className="border-b border-rule px-5 py-6">
          <Kicker>Last 7 days</Kicker>
          <Bars data={week} money />
        </section>
      )}

      <section className="px-5 py-6">
        <Kicker>Entries</Kicker>
        <ul className="mt-3">
          {rows.slice(0, shown).map((r) => (
            <li
              key={r.id}
              className="flex items-baseline justify-between gap-4 border-b border-rule py-3.5 last:border-b-0"
            >
              <span className="min-w-0">
                <span className="block truncate text-meta t-sub">{r.kind}</span>
                <span className="mt-0.5 block caps-sm t-faint tnum">
                  {new Date(r.effective_at).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    timeZone: 'Asia/Kolkata',
                  })}
                </span>
              </span>
              <span className={`flex-none text-meta tnum ${r.net_paise < 0 ? 't-faint' : 'text-ok'}`}>
                {r.net_paise < 0 ? '−' : '+'}₹{rupees(Math.abs(r.net_paise))}
              </span>
            </li>
          ))}
        </ul>
        {rows.length === 0 && <p className="mt-3 text-meta t-faint">No consulting earned in this period.</p>}
        {rows.length > shown && (
          <PopButton variant="ghost" size="sm" className="mt-4" onClick={() => setShown((n) => n + 30)}>
            Show more
          </PopButton>
        )}
      </section>
    </>
  )
}

function Insight({ rows, range, rating, reviews }) {
  const done = rows.filter((r) => r.net_paise > 0)
  const metered = done.filter((r) => r.who !== null)
  const minutes = metered.reduce((s, r) => s + r.minutes, 0)
  // A declined booking reverses under the same booking: not a session.
  const undone = new Set(rows.filter((r) => r.net_paise < 0 && r.booking_id).map((r) => r.booking_id))
  const booked = done.filter((r) => r.source === 'bookings' && !undone.has(r.booking_id)).length

  const people = {}
  for (const r of metered) {
    people[r.who] = people[r.who] ?? { n: 0, net: 0, minutes: 0 }
    people[r.who].n += 1
    people[r.who].net += r.net_paise
    people[r.who].minutes += r.minutes
  }
  const names = Object.keys(people)
  const back = names.filter((n) => people[n].n > 1).length
  const top = names.sort((a, b) => people[b].net - people[a].net).slice(0, 5)

  const modes = ['chat', 'audio call', 'video call']
    .map((k) => {
      const these = metered.filter((r) => r.what === k)
      return { k, n: these.length, minutes: these.reduce((s, r) => s + r.minutes, 0) }
    })
    .filter((m) => m.n > 0)

  if (done.length === 0) {
    return <p className="px-5 py-8 text-meta t-faint">No sessions in this period. Go online to take calls and chats.</p>
  }

  return (
    <>
      <section className="border-b border-rule px-5 py-6">
        <Kicker>{RANGES.find((r) => r.key === range)?.label}</Kicker>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Stat label="Sessions" value={metered.length + booked} sub={booked ? `${booked} booked` : null} />
          <Stat label="Minutes" value={minutes.toLocaleString('en-IN')} sub={metered.length ? `${Math.round(minutes / metered.length)} min each` : null} />
          <Stat label="People" value={names.length} sub={`${back} came back`} />
        </div>
        {rating != null && (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Stat label="Rating" value={Number(rating).toFixed(1)} sub={`${reviews ?? 0} reviews in all`} />
          </div>
        )}
      </section>

      {modes.length > 0 && (
        <section className="border-b border-rule px-5 py-6">
          <Kicker>Chat and calls</Kicker>
          <div className="mt-3">
            {modes.map((m) => (
              <Field key={m.k} k={`${MODE_LABEL[m.k]} · ${m.n}`} v={`${m.minutes.toLocaleString('en-IN')} min`} />
            ))}
          </div>
        </section>
      )}

      {top.length > 0 && (
        <section className="px-5 py-6">
          <Kicker>Who you talked to most</Kicker>
          <div className="mt-3">
            {top.map((n) => (
              <Field
                key={n}
                k={`${n} · ${people[n].n} ${people[n].n === 1 ? 'session' : 'sessions'}, ${people[n].minutes} min`}
                v={money(people[n].net)}
              />
            ))}
          </div>
        </section>
      )}
    </>
  )
}
