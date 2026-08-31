import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  earnings,
  earningsSeries,
  insights,
  payouts,
  proMetrics,
  referrals,
  topUpAmounts,
  warnings,
} from '../data/mock.js'
import { Sheet, TabHeader } from '../components/Chrome.jsx'
import Icon from '../components/Icon.jsx'
import { Kicker, PopAvatar, PopButton, PopCard, PopTag, Stat } from '../components/Pop.jsx'
import { Field, Segmented } from '../components/Primitives.jsx'
import { rupees, useStore } from '../store.jsx'
import { listEarnings } from '../lib/consultants.js'

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
   Structurally the mirror of the seeker's Wallet screen: a balance card,
   figures, a ledger, a sheet. Where it differs is that every row carries
   gross, the platform's cut and net — a consultant ledger whose rows are all
   credits of the sticker price is the one thing that makes this look fake. */

function Earnings() {
  const { showToast, consultant } = useStore()
  const [sheet, setSheet] = useState(false)
  const [amount, setAmount] = useState(earnings.available)

  /* The real book, from phase 5. Every row carries gross, the platform's cut
     and net, and a declined session shows as two rows that cancel rather than
     as a row that vanished — the ledger is append-only.
     `mock.js`'s `proLedger` is gone from this screen: fabricated rupees beside
     real ones is a demo worse than no demo. The card above and the figures
     below are still the prototype's, and stay that way until phase 12 has
     payouts to draw a "clearing" number from. */
  const [rows, setRows] = useState([])
  useEffect(() => {
    let live = true
    if (consultant?.profile_id) {
      listEarnings(consultant.profile_id).then((r) => live && setRows(r))
    } else setRows([])
    return () => {
      live = false
    }
  }, [consultant])

  const fee = Math.round((amount * earnings.commissionPct) / 100)

  const answerRate = Math.round((proMetrics.callsAttended / proMetrics.callsRequested) * 100)
  const missed = proMetrics.callsRequested - proMetrics.callsAttended
  // `Bars` wants {label, value}; the reply series is seven bare minutes.
  const replySeries = proMetrics.replyByDay.map((value, i) => ({
    label: earningsSeries[i].label,
    value,
  }))

  return (
    <>
      {/* ── The balance ────────────────────────────────────────────────── */}
      <section className="px-5 pb-2 pt-5">
        <PopCard raised className="p-5">
          <p className="caps-sm t-faint">Available to withdraw</p>
          <p className="mt-2 font-display text-huge leading-none tnum t-heading">
            ₹{earnings.available.toLocaleString('en-IN')}
          </p>
          <p className="mt-2 text-meta t-body">
            ₹{earnings.pending.toLocaleString('en-IN')} still clearing. Next payout{' '}
            {earnings.nextPayoutOn}.
          </p>

          <div className="mt-5 flex items-center gap-2">
            <PopButton variant="gold" className="flex-1" full={false} onClick={() => setSheet(true)}>
              Withdraw
            </PopButton>
            <PopButton
              variant="ghost"
              className="flex-1"
              full={false}
              onClick={() => showToast('Statement — prototype only')}
            >
              Statement
            </PopButton>
          </div>
        </PopCard>
      </section>

      {/* ── Figures ────────────────────────────────────────────────────── */}
      <section className="border-b border-rule px-5 py-6">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="This month" value={`₹${(earnings.thisMonth / 1000).toFixed(1)}k`} />
          <Stat label="Clearing" value={`₹${(earnings.pending / 1000).toFixed(1)}k`} />
          <Stat label="Lifetime" value={`₹${(earnings.lifetime / 100000).toFixed(1)}L`} />
        </div>
      </section>

      {/* ── Last seven days ────────────────────────────────────────────── */}
      <section className="border-b border-rule px-5 py-6">
        <Kicker>Last 7 days</Kicker>
        <Bars data={earningsSeries} />
      </section>

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
            <p className="mt-1 caps-sm tnum t-body">{answerRate}% answered</p>
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

      {/* ── Per-session ledger ─────────────────────────────────────────── */}
      <section className="border-b border-rule px-5 py-6">
        <Kicker>Sessions</Kicker>
        <ul className="mt-3">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-baseline justify-between gap-4 border-b border-rule py-3.5 last:border-b-0"
            >
              <span className="min-w-0">
                <span className="block truncate text-meta t-sub">{r.kind}</span>
                <span className="mt-0.5 block caps-sm t-faint tnum">
                  {new Date(r.created_at).toLocaleDateString('en-IN', {
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
        {rows.length === 0 && (
          <p className="mt-3 text-meta t-faint">
            Nothing earned yet. A session pays into this list the moment it is booked.
          </p>
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

      {/* ── Payouts ────────────────────────────────────────────────────── */}
      <section className="px-5 py-6">
        <Kicker>Payouts</Kicker>
        <ul className="mt-3">
          {payouts.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-4 border-b border-rule py-3.5 last:border-b-0"
            >
              <span className="min-w-0">
                <span className="block text-meta tnum t-heading">
                  ₹{p.amount.toLocaleString('en-IN')}
                </span>
                <span className="mt-0.5 block caps-sm t-faint">
                  {p.date} · {p.method}
                </span>
              </span>
              <PopTag>{p.status}</PopTag>
            </li>
          ))}
        </ul>
      </section>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Withdraw">
        <p className="label mb-4 text-left">Amount</p>
        <div className="mb-8 grid grid-cols-3 gap-2">
          {[...topUpAmounts, earnings.available].map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={amount === a}
              onClick={() => setAmount(a)}
              className="pill caps-sm justify-center tnum"
            >
              ₹{a.toLocaleString('en-IN')}
            </button>
          ))}
        </div>

        <Field k="Gross" v={`₹${amount.toLocaleString('en-IN')}`} />
        <Field k={`Platform fee · ${earnings.commissionPct}%`} v={`−₹${fee.toLocaleString('en-IN')}`} />
        <Field k="You receive" v={`₹${(amount - fee).toLocaleString('en-IN')}`} />
        <Field k="To" v="HDFC ••4412" />

        <PopButton
          variant="gold"
          className="mt-8"
          disabled={amount > earnings.available}
          onClick={() => {
            setSheet(false)
            showToast(`Withdrawal requested · ₹${(amount - fee).toLocaleString('en-IN')}`)
          }}
        >
          {amount > earnings.available ? 'More than you have' : 'Request withdrawal'}
        </PopButton>
        <p className="mt-5 text-center text-meta t-faint">
          Prototype — no money moves and no account is debited.
        </p>
      </Sheet>
    </>
  )
}

/**
 * Seven bars. Heights go through `style`, never an interpolated class —
 * Tailwind scans source text, so `h-[${n}px]` is a class that is never
 * generated and a bar that never renders. `PopBar` and `Ruler` do the same.
 */
function Bars({ data }) {
  const max = Math.max(...data.map((d) => d.value))
  const best = data.find((d) => d.value === max)

  return (
    <>
      <div className="mt-4 flex h-24 items-end gap-2" aria-hidden="true">
        {data.map((d) => (
          <span key={d.label} className="flex flex-1 flex-col items-center gap-1.5">
            <span
              className="w-full rounded-t-md bg-gold-fill"
              style={{ height: `${Math.max(6, (d.value / max) * 100)}%` }}
            />
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        {data.map((d) => (
          <span key={d.label} className="flex-1 text-center text-[10px] t-faint">
            {d.label}
          </span>
        ))}
      </div>
      <p className="mt-4 text-meta t-body">
        Best day was {best.label} at ₹{max.toLocaleString('en-IN')}. Weekends carry this practice.
      </p>
    </>
  )
}

/* ── Insights ─────────────────────────────────────────────────────────────
   Reach, who it reached, when they are awake, and what is slipping. The last
   of those is the only part that asks for an action, so it is visually
   separated and every item links to the screen that fixes it. */

function Insights() {
  return (
    <>
      <section className="border-b border-rule px-5 py-6">
        <Kicker>Last 7 days</Kicker>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Stat
            label="Reach"
            value={`${(insights.reach / 1000).toFixed(1)}k`}
            sub={`${insights.reachDeltaPct > 0 ? '↑' : '↓'} ${Math.abs(insights.reachDeltaPct)}%`}
          />
          <Stat
            label="Profile views"
            value={insights.profileViews.toLocaleString('en-IN')}
            sub={`${insights.profileViewsDeltaPct > 0 ? '↑' : '↓'} ${Math.abs(insights.profileViewsDeltaPct)}%`}
          />
          <Stat label="New followers" value={`+${insights.followersGained}`} sub={`${insights.saves} saves`} />
        </div>
      </section>

      {/* ── Who saw it ───────────────────────────────────────────────── */}
      <section className="border-b border-rule px-5 py-6">
        <Kicker>Who saw your work</Kicker>
        <ul className="mt-4 space-y-3">
          {insights.viewers.map((v) => (
            <li key={v.label} className="flex items-center gap-3">
              <span className="w-24 flex-none text-meta t-sub">{v.label}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-black/10">
                <span
                  className="block h-full rounded-full bg-gold-fill"
                  style={{ width: `${v.pct}%` }}
                />
              </span>
              <span className="w-9 flex-none text-right text-meta tnum t-heading">{v.pct}%</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 caps-sm t-faint">Mostly from {insights.topCities.join(' · ')}</p>
      </section>

      {/* ── When to post ─────────────────────────────────────────────── */}
      <section className="border-b border-rule px-5 py-6">
        <Kicker>When they are awake</Kicker>
        <div className="mt-4 flex h-20 items-end gap-1" aria-hidden="true">
          {insights.byHour.map((v, i) => {
            const max = Math.max(...insights.byHour)
            const peak = v === max
            return (
              <span
                key={i}
                className={`flex-1 rounded-t-sm ${peak ? 'bg-gold-fill' : 'bg-black/15'}`}
                style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
              />
            )
          })}
        </div>
        <div className="mt-2 flex justify-between caps-sm t-faint tnum">
          <span>12a</span>
          <span>6a</span>
          <span>12p</span>
          <span>6p</span>
          <span>12a</span>
        </div>
        <p className="mt-4 text-meta t-body">
          Your audience is on at <span className="gold">{insights.bestWindow}</span>. Posting
          before six in the evening costs you roughly a third of the reach.
        </p>
      </section>

      {/* ── Per piece ────────────────────────────────────────────────── */}
      <section className="border-b border-rule px-5 py-6">
        <Kicker>How each piece did</Kicker>
        <ul className="mt-3">
          {insights.topContent.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-4 border-b border-rule py-3.5 last:border-b-0"
            >
              <span className="min-w-0">
                <span className="block truncate text-meta t-sub">{c.title}</span>
                <span className="mt-0.5 flex items-center gap-1.5 caps-sm t-faint tnum">
                  <Icon name="eye" size={13} />
                  {c.views.toLocaleString('en-IN')} · {c.kind}
                </span>
              </span>
              <span
                className={`flex-none text-meta tnum ${c.vsAvgPct >= 0 ? 'text-ok' : 'text-live'}`}
              >
                {c.vsAvgPct >= 0 ? '+' : ''}
                {c.vsAvgPct}%
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 caps-sm t-faint">Against your own average, not the platform's.</p>
      </section>

      {/* ── What is slipping ─────────────────────────────────────────── */}
      <section className="px-5 py-6">
        <Kicker>Worth fixing</Kicker>
        <ul className="mt-4 space-y-3">
          {warnings.map((w) => (
            <li key={w.id}>
              <Link to={w.to} className="pop-card pop-tap block p-4">
                <span className="flex items-start gap-3">
                  <span
                    className={`flex-none ${w.tone === 'bad' ? 'text-live' : 'gold'}`}
                    aria-hidden="true"
                  >
                    <Icon name="alert" size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-meta t-heading">{w.title}</span>
                    <span className="mt-1 block text-meta t-body">{w.line}</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
