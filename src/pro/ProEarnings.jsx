import { Loader } from '../components/Cosmos.jsx'
import { useEffect, useState } from 'react'
import { answerRatePct, earningsSeries, proMetrics, referrals } from '../data/mock.js'
import { TabHeader } from '../components/Chrome.jsx'
import Icon from '../components/Icon.jsx'
import { Kicker, PopAvatar, PopButton, PopCard, PopTag, Stat } from '../components/Pop.jsx'
import { Field, Segmented } from '../components/Primitives.jsx'
import { rupees, useStore } from '../store.jsx'
import { earningsPage, earningsSummary, myInsights } from '../lib/consultants.js'
import { PieceRow, fromInsights } from '../components/Pieces.jsx'
import Plate from '../components/Plate.jsx'

/**
 * Earnings — the money and the reach that drives it, one tab. The two used
 * to be a route (Earnings) and a Profile segment (Insights); a consultant
 * checks both in the same breath, so they're the bottom nav's first stop
 * now rather than split across two places.
 *
 * Local state, not the URL — same call as Studio's Reel/Article split.
 * Nothing needs to deep-link into a specific side of this one.
 */
const TABS = [
  { key: 'earnings', label: 'Earnings' },
  { key: 'insights', label: 'Insights' },
]

export default function ProEarnings() {
  const [tab, setTab] = useState('earnings')

  return (
    <>
      <TabHeader />

      <div className="px-4 pt-4">
        <Segmented items={TABS} value={tab} onChange={setTab} />
      </div>

      <div key={tab} className="animate-fade">
        {tab === 'earnings' && <Earnings />}
        {tab === 'insights' && <Insights />}
      </div>

      <div className="h-24" />
    </>
  )
}

/* ── Earnings ─────────────────────────────────────────────────────────────
   Real since 3 Oct 2026 (payouts P1). Every figure is a sum the API makes
   over `earnings_ledger` for a period — IST months and Indian financial
   years, because a consultant is paid by month and files tax by year. The
   sample card ("₹38,420 available", "Next payout 12 Aug") and the Withdraw
   sheet are gone: there is no withdrawing, the month's earnings are paid on
   the 7th of the next (owner's call), and the sheet took the 18% fee a
   second time from money already net of it. Every row still carries gross,
   the platform's cut and net. */

const RANGES = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'fy', label: 'This FY' },
  { key: 'last_fy', label: 'Last FY' },
  { key: 'lifetime', label: 'Lifetime' },
]

const SOURCE_LABEL = {
  sessions: 'Chat, call and video',
  bookings: 'Booked sessions',
  shop: 'Shop commission · 10%',
  reversals: 'Reversals',
}

/** "2026-11-07" → "7 Nov"; with `year`, "7 Nov 2026". */
function day(iso, year = false) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(year ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  })
}

function monthName(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-IN', { month: 'long', timeZone: 'UTC' })
}

/** What the big number is, in words, and the line under it.
 *
 *  No payout date until payouts exist (3 Oct 2026). "Payout day 7 Oct"
 *  four days before anything could pay anyone was a promise the app could
 *  not keep; `pays_on` comes back from the API and is shown again once a
 *  payout has actually been made. */
function heading(s) {
  switch (s.range) {
    case 'this_month':
      return ['Earned this month', `${day(s.from)} to ${day(s.to)}.`]
    case 'last_month':
      return [`Earned in ${monthName(s.from)}`, `${day(s.from)} to ${day(s.to)}.`]
    case 'fy':
      return ['Earned this financial year', `${day(s.from, true)} to ${day(s.to, true)}.`]
    case 'last_fy':
      return ['Earned last financial year', `${day(s.from, true)} to ${day(s.to, true)}.`]
    default:
      return ['Earned since you joined', 'Every session, booking and commission.']
  }
}

function Earnings() {
  const { consultant, showToast } = useStore()
  const id = consultant?.profile_id
  const [range, setRange] = useState('this_month')
  const [sum, setSum] = useState(null)
  const [failed, setFailed] = useState(false)
  const [rows, setRows] = useState([])
  const [next, setNext] = useState(null)
  const [more, setMore] = useState(false)

  useEffect(() => {
    if (!id) return undefined
    let live = true
    setSum(null)
    setFailed(false)
    setRows([])
    setNext(null)
    Promise.all([earningsSummary(id, range), earningsPage(id, range)])
      .then(([s, page]) => {
        if (!live) return
        setSum(s)
        setRows(page.rows)
        setNext(page.next_offset)
      })
      .catch((err) => {
        console.error('[earnings] load failed:', err?.message)
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [id, range])

  async function loadMore() {
    if (next === null || more) return
    setMore(true)
    try {
      const page = await earningsPage(id, range, next)
      setRows((r) => [...r, ...page.rows])
      setNext(page.next_offset)
    } catch (err) {
      showToast(err.message)
    } finally {
      setMore(false)
    }
  }

  const missed = proMetrics.callsRequested - proMetrics.callsAttended
  // `Bars` wants {label, value}; the reply series is seven bare minutes.
  const replySeries = proMetrics.replyByDay.map((value, i) => ({
    label: earningsSeries[i].label,
    value,
  }))
  const week = (sum?.last_7_days ?? []).map((d) => ({
    label: new Date(`${d.date}T12:00:00Z`).toLocaleDateString('en-IN', {
      weekday: 'short',
      timeZone: 'UTC',
    }),
    value: d.net_paise,
  }))
  const [title, line] = sum ? heading(sum) : ['', '']
  const sources = (sum?.by_source ?? []).filter((x) => x.count > 0)

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

      {/* ── The total ──────────────────────────────────────────────────── */}
      <section className="px-5 pb-2 pt-4">
        <PopCard raised className="p-5">
          {failed ? (
            <p className="text-meta t-body">Could not load your earnings. Open this tab again to retry.</p>
          ) : !sum ? (
            <Loader label="Adding it up" className="py-4" />
          ) : (
            <>
              <p className="caps-sm t-faint">{title}</p>
              <p className="mt-2 font-display text-huge leading-none tnum t-heading">
                ₹{rupees(sum.net_paise)}
              </p>
              <p className="mt-2 text-meta t-body">{line}</p>
              {sum.count > 0 && (
                <p className="mt-1 text-meta tnum t-faint">
                  ₹{rupees(sum.gross_paise)} earned, less ₹{rupees(sum.fee_paise)} platform fee.
                </p>
              )}
              {sum.upcoming_paise > 0 && (range === 'this_month' || range === 'lifetime') && (
                <p className="mt-3 rounded-xl bg-surface2 px-3 py-2 text-meta t-body">
                  ₹{rupees(sum.upcoming_paise)} more is booked for sessions that have not happened
                  yet. Each counts in the month it takes place.
                </p>
              )}
            </>
          )}
        </PopCard>
      </section>

      {/* ── Where it came from ─────────────────────────────────────────── */}
      {sources.length > 0 && (
        <section className="border-b border-rule px-5 py-6">
          <Kicker>Where it came from</Kicker>
          <div className="mt-3">
            {sources.map((x) => (
              <Field
                key={x.source}
                k={`${SOURCE_LABEL[x.source]} · ${x.count}`}
                v={`${x.net_paise < 0 ? '−' : ''}₹${rupees(Math.abs(x.net_paise))}`}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Last seven days ────────────────────────────────────────────── */}
      {week.length > 0 && (
        <section className="border-b border-rule px-5 py-6">
          <Kicker>Last 7 days</Kicker>
          <Bars data={week} money />
        </section>
      )}

      {/* ── How she is performing ───────────────────────────────────────
          Answer rate and reply speed live with the money because that is what
          they are: the two things that decide whether a request becomes a
          session. A missed call is a refund and a slow reply is a cancelled
          booking. */}
      <section className="border-b border-rule px-5 py-6">
        <Kicker>Performance</Kicker>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <PopCard className="p-4">
            <p className="caps-sm t-faint">Median reply</p>
            <p className="mt-1.5 text-lead tnum t-heading">{proMetrics.medianReplyMins} min</p>
            <p className="mt-1 caps-sm tnum text-ok">
              Target {proMetrics.replyTargetMins} min
            </p>
          </PopCard>
          <PopCard className="p-4">
            <p className="caps-sm t-faint">Calls attended</p>
            <p className="mt-1.5 text-lead tnum t-heading">
              {proMetrics.callsAttended}
              <span className="t-faint">/{proMetrics.callsRequested}</span>
            </p>
            <p className="mt-1 caps-sm tnum t-body">{answerRatePct}% answered</p>
          </PopCard>
        </div>

        <div className="mt-3">
          <Field k="Sessions completed" v={proMetrics.sessionsCompleted} />
          <Field k="Repeat clients" v={`${proMetrics.repeatClientPct}%`} />
          <Field k="Rating" v={proMetrics.ratingAvg} />
        </div>

        <p className="mt-4 caps-sm t-faint">Median reply, last 7 days · minutes</p>
        <Bars data={replySeries} />
        <p className="mt-3 text-meta t-faint">
          {missed} requests went unanswered. Each one was a session someone booked
          elsewhere.
        </p>
      </section>

      {/* ── The entries behind the total ───────────────────────────────── */}
      <section className="border-b border-rule px-5 py-6">
        <Kicker>Entries</Kicker>
        <ul className="mt-3">
          {rows.map((r) => (
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
                  })}{' '}
                  {/* Absolute values: the sign lives on the net figure to the
                      right, and a reversing row rendered raw reads
                      "₹-1,499 − ₹-269.82", which is two minus signs saying one
                      thing badly. */}
                  · ₹{rupees(Math.abs(r.gross_paise))} − ₹{rupees(Math.abs(r.fee_paise))}
                </span>
              </span>
              <span
                className={`flex-none text-meta tnum ${r.net_paise < 0 ? 't-faint' : 'text-ok'}`}
              >
                {r.net_paise < 0 ? '−' : '+'}₹{rupees(Math.abs(r.net_paise))}
              </span>
            </li>
          ))}
        </ul>
        {sum && rows.length === 0 && (
          <p className="mt-3 text-meta t-faint">Nothing earned in this period.</p>
        )}
        {next !== null && (
          <PopButton variant="ghost" size="sm" className="mt-4" onClick={loadMore} disabled={more}>
            {more ? 'Loading' : 'Show more'}
          </PopButton>
        )}
      </section>

      {/* ── Referrals ──────────────────────────────────────────────────────
          Sits with the money because that is what it is: another line of
          revenue, not a social feature. */}
      <section className="border-b border-rule px-5 py-6">
        <Kicker>Referrals</Kicker>

        <PopCard className="mt-4 p-4">
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="caps-sm t-faint">Your code</span>
              <span className="mt-1 block font-display text-lead tnum t-heading">
                {referrals.code}
              </span>
            </span>
            <button
              type="button"
              aria-label="Share your code"
              onClick={() => showToast('Code copied')}
              className="pill knob !h-10 !w-10 flex-none justify-center"
            >
              <Icon name="share" size={17} />
            </button>
          </div>
          <p className="mt-3 text-meta t-body">
            Bring another reader in. You earn ₹{referrals.perJoin.toLocaleString('en-IN')} once
            they finish their first paid session — not when they sign up.
          </p>
        </PopCard>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <Stat label="Invited" value={referrals.invited} />
          <Stat label="Joined" value={referrals.joined} />
          <Stat label="Earned" value={`₹${(referrals.earned / 1000).toFixed(1)}k`} />
        </div>

        <ul className="mt-5">
          {referrals.list.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 border-b border-rule py-3 last:border-b-0"
            >
              <PopAvatar initials={r.initials} size={34} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-meta t-heading">{r.name}</span>
                <span className="mt-0.5 block caps-sm t-faint">Joined {r.joined}</span>
              </span>
              {r.earned > 0 ? (
                <span className="flex-none text-meta tnum text-ok">
                  +₹{r.earned.toLocaleString('en-IN')}
                </span>
              ) : (
                <PopTag>{r.status}</PopTag>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* ── Payouts ──────────────────────────────────────────────────────
          Nothing is paid yet: sending money is P3. This says how it will
          work, without a date, rather than listing transfers that never
          happened. */}
      <section className="px-5 py-6">
        <Kicker>Payouts</Kicker>
        <p className="mt-3 text-meta t-body">
          Payouts have not started yet. When they do, you are paid once a month for everything you
          earned the month before, with TDS deducted, into the bank account in your payout details.
        </p>
        <PopButton variant="ghost" size="sm" className="mt-4" to="/pro/payout-details">
          Add payout details
        </PopButton>
      </section>
    </>
  )
}

/**
 * Seven bars. Heights go through `style`, never an interpolated class —
 * Tailwind scans source text, so `h-[${n}px]` is a class that is never
 * generated and a bar that never renders. `PopBar` and `Ruler` do the same.
 *
 * `money`: values are paise, and the line under the bars names the best day.
 * Without it (reply minutes) there is no line — it used to print "Best day
 * was Mon at ₹6" under a chart of minutes, and "Weekends carry this
 * practice" under any week at all.
 */
function Bars({ data, money = false }) {
  const max = Math.max(0, ...data.map((d) => d.value))
  const best = data.find((d) => d.value === max)

  return (
    <>
      <div className="mt-4 flex h-24 items-end gap-2" aria-hidden="true">
        {data.map((d, i) => (
          <span key={`${d.label}${i}`} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span
              className="w-full rounded-t-md bg-gold-fill"
              style={{ height: `${max > 0 ? Math.max(6, (Math.max(0, d.value) / max) * 100) : 6}%` }}
            />
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        {data.map((d, i) => (
          <span key={`${d.label}${i}`} className="flex-1 text-center text-[11px] t-faint">
            {d.label}
          </span>
        ))}
      </div>
      {money && (
        <p className="mt-4 text-meta t-body">
          {max > 0 ? `Best day was ${best.label} at ₹${rupees(max)}.` : 'Nothing earned in the last seven days.'}
        </p>
      )}
    </>
  )
}

/* ── Insights ─────────────────────────────────────────────────────────────
   Real since 4 Oct 2026. It was the prototype's: "3,12,000 views" on reels
   this consultant never posted, a city list and an hour-by-hour audience
   nothing measures. Now three things, all theirs and all counted
   (apps/consultants/insights.py): the last seven days, every post they have
   published with its views — tap to open it — and the shop products people
   bought with their coupon. */

function Insights() {
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    myInsights()
      .then((d) => live && setData(d))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [])

  if (failed) return <p className="px-5 py-8 text-meta t-body">Could not load your insights. Open this tab again.</p>
  if (!data) return <Loader />

  const { week, pieces, shop } = data

  return (
    <>
      <section className="border-b border-rule px-5 py-6">
        <Kicker>Last 7 days</Kicker>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Stat label="Views" value={week.views.toLocaleString('en-IN')} />
          <Stat label="New followers" value={`+${week.new_followers}`} />
          <Stat label="Saves" value={week.saves} sub={`${week.comments} comments`} />
        </div>
      </section>

      <section className="border-b border-rule px-5 py-6">
        <Kicker action={pieces.length ? 'Post more' : null} to="/pro/studio">
          {`Your posts · ${pieces.length}`}
        </Kicker>
        {pieces.length === 0 ? (
          <p className="mt-3 text-meta t-faint">
            Nothing published yet. Reels, photos and blog posts you publish in Studio appear here
            with their views.
          </p>
        ) : (
          <>
            <p className="mt-2 text-meta t-faint tnum">
              {data.totals.views.toLocaleString('en-IN')} {data.totals.views === 1 ? 'view' : 'views'} in all. Tap one to open it.
            </p>
            <div className="mt-2">
              {pieces.map((p) => (
                <PieceRow key={p.id} piece={fromInsights(p)} />
              ))}
            </div>
          </>
        )}
      </section>

      <section className="px-5 py-6">
        <Kicker action="Your links" to="/pro/affiliate">
          Sold with your code
        </Kicker>
        {shop.products.length === 0 ? (
          <p className="mt-3 text-meta t-faint">
            Nobody has bought with your code yet. Tag products on your posts or share a product
            link, and every purchase made with it shows here.
          </p>
        ) : (
          <>
            <p className="mt-2 text-meta t-faint tnum">
              {shop.units} {shop.units === 1 ? 'item' : 'items'} across {shop.orders}{' '}
              {shop.orders === 1 ? 'order' : 'orders'}. You earn 10% on each, after delivery.
            </p>
            <ul className="mt-2">
              {shop.products.map((p) => (
                <li
                  key={p.product_id}
                  className="flex items-center gap-3 border-b border-rule py-3 last:border-b-0"
                >
                  <span className="h-12 w-12 flex-none overflow-hidden rounded-xl bg-surface">
                    {p.image_url ? (
                      <img src={p.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <Plate seed={p.product_id} className="h-full w-full" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-meta t-heading">{p.name}</span>
                    <span className="mt-0.5 block text-[12px] t-faint tnum">
                      {p.buyers} {p.buyers === 1 ? 'buyer' : 'buyers'}
                    </span>
                  </span>
                  <span className="flex-none text-right">
                    <span className="block font-display text-lead leading-none tnum t-heading">{p.units}</span>
                    <span className="text-[11px] t-faint">sold</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  )
}
