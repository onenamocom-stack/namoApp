import { Link, Navigate } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import { Loader } from '../components/Cosmos.jsx'
import Icon from '../components/Icon.jsx'
import { Kicker, PopCard } from '../components/Pop.jsx'
import { Field, Row } from '../components/Primitives.jsx'
import { RatesSheet } from '../pro/ProProfile.jsx'
import { RATE_FIELDS } from '../components/RateFields.jsx'
import { useEffect, useState } from 'react'
import { rupees, useStore } from '../store.jsx'
import { earningsSummary } from '../lib/consultants.js'
import { earningsPeriod } from '../lib/market.js'
import { contentEarnings } from '../lib/content.js'

/**
 * Dashboard (Phase 16, 14 Oct 2026): a Pro's and a Creator's own screens,
 * inside the main app, at `/dashboard/...`. Since 16 Oct 2026 (Rahul) it is
 * this month's earnings on top, then three sections, each with its own
 * earnings, insights and settings — Content & Referrals, Market, Consulting
 * (a Pro only) — and one Payout details last: everything is paid together
 * on the 7th. No Studio (14 Oct 2026, Rahul): posting is
 * Home's +, where a Pro and a Creator also get video. Calls are not here: they ring only in
 * Namo Consult (`/desk`) and in the pro app.
 *
 * Anybody else reaching this address goes to their Profile.
 */
export function useDashboardRole() {
  const { session, sessionReady, consultant, consultantLoading, profile, profileLoading } = useStore()
  if (!sessionReady || (session && (consultantLoading || profileLoading))) return 'loading'
  if (consultant) return 'pro'
  if (profile?.influencer) return 'creator'
  return null
}

/** Wraps a Dashboard route: `need` is 'pro' (a consultant row) or 'any'
 *  (a Pro or a Creator). */
export function DashboardGate({ need = 'any', children }) {
  const role = useDashboardRole()
  if (role === 'loading') return <Loader />
  if (!role || (need === 'pro' && role !== 'pro')) return <Navigate to="/profile" replace />
  return children
}

export default function Dashboard() {
  const role = useDashboardRole()
  const { consultant, profile } = useStore()
  const [rating, setRating] = useState(false)

  if (role === 'loading') return <Loader />
  if (!role) return <Navigate to="/profile" replace />
  const pro = role === 'pro'

  return (
    <>
      <TopBar title="Dashboard" back backTo="/profile" />

      {pro && consultant.status !== 'approved' && (
        <p className="mx-5 mt-4 rounded-lg border border-rule px-4 py-3 text-meta t-body">
          Your application is under review. Nobody can book you until it is approved.
        </p>
      )}

      <ThisMonth pro={pro} consultantId={consultant?.profile_id} />

      <section className="px-5 py-5">
        <Kicker>Content &amp; Referrals</Kicker>
        <div className="mt-2">
          <Row to="/dashboard/content" title="Earnings and insights" note="Commission from your links and code, and who saw your posts" />
          <Row to="/dashboard/affiliate" title="Your links" note="Share a product and earn" />
          {profile?.influencer && (
            <Row to="/profile/influencer" title="Your code" note="Who joined with your code, and who paid" />
          )}
        </div>
      </section>

      <section className="px-5 pb-5">
        <Kicker>Market</Kicker>
        <div className="mt-2">
          <Row to="/dashboard/market/earnings" title="Earnings and insights" note="By month and year, and what sold" />
          <Row to="/dashboard/market" title="Your listings" note="Add, edit or remove downloads, courses, events and products" />
        </div>
      </section>

      {pro && (
        <section className="px-5 pb-5">
          <Kicker>Consulting</Kicker>
          <div className="mt-2">
            <Row to="/dashboard/consulting" title="Earnings" note="What chat, calls and bookings earned" />
            {/* Rates open here (14 Oct 2026, Rahul): the "Practice and
                reviews" page went — reviews are on your page, the intro
                and username in Edit profile, the slots in Namo Consult. */}
            <Row
              onClick={() => setRating(true)}
              title="Your consulting price"
              note={
                consultant.rates
                  ? RATE_FIELDS.map(([k, label]) => `${label} ₹${consultant.rates[k] ?? '—'}`).join(' · ') + ' /min'
                  : 'Not set yet'
              }
            />
            {/* The week as windows, 20-minute bookings (15 Oct 2026, Rahul). */}
            <Row to="/dashboard/calendar" title="Booking calendar" note="Your hours each day, 20-minute bookings" />
            {/* The one row that earns, made to stand out (16 Oct 2026, Rahul):
                the main-action green, a phone and a live dot. */}
            <Link
              to="/desk"
              className="pop-tap mt-3 flex items-center gap-4 rounded-2xl bg-gradient-to-br from-btn to-btn-deep px-4 py-4 text-white shadow-lg"
            >
              <span className="relative flex h-12 w-12 flex-none items-center justify-center rounded-full bg-white/20">
                <Icon name="phone" size={22} />
                <span className="absolute right-0.5 top-0.5 block h-3 w-3 animate-pulse rounded-full border-2 border-white bg-[#ffd27a]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lead font-semibold">Go online</span>
                <span className="mt-0.5 block text-meta text-white/85">Take calls and chats, and start earning</span>
              </span>
              <span aria-hidden="true" className="text-lead">→</span>
            </Link>
          </div>
        </section>
      )}

      {/* One row for all three (16 Oct 2026, Rahul). A Pro's is payout
          details; a Creator's is still the Market's bank form. */}
      <section className="px-5 pb-8">
        <Kicker>Payout details</Kicker>
        <div className="mt-2">
          <Row
            to={pro ? '/dashboard/payout-details' : '/dashboard/market/bank'}
            title="Payout details"
            note="Where we pay everything you earn, on the 7th"
          />
        </div>
      </section>

      <div className="h-16" />
      {rating && (
        <RatesSheet current={consultant?.rates} onClose={() => setRating(false)} onSaved={() => setRating(false)} />
      )}
    </>
  )
}

/**
 * This month so far, by section (16 Oct 2026, Rahul: "Top table me sirf
 * earning due this month till date"). Content & Referrals is the content
 * earnings figure (qualified views plus link and tag commission); Market is
 * the seller's; Consulting is the Pro's earnings book less that commission.
 * A part that fails to load shows a dash; the total counts what arrived.
 */
function ThisMonth({ pro, consultantId }) {
  const [parts, setParts] = useState(null)

  useEffect(() => {
    let live = true
    Promise.allSettled([
      contentEarnings('this_month'),
      earningsPeriod('this_month'),
      pro ? earningsSummary(consultantId, 'this_month') : Promise.resolve(null),
    ]).then(([c, m, s]) => {
      if (!live) return
      const out = {
        content: c.status === 'fulfilled' ? c.value.earnings_paise : null,
        market: m.status === 'fulfilled' ? m.value.net_paise : null,
      }
      if (pro) {
        const book = s.status === 'fulfilled' ? s.value : null
        const shop = book?.by_source.find((x) => x.source === 'shop')?.net_paise ?? 0
        out.consulting = book ? book.net_paise - shop : null
      }
      setParts(out)
    })
    return () => {
      live = false
    }
  }, [pro, consultantId])

  const rows = [
    ['Content & Referrals', parts?.content],
    ['Market', parts?.market],
    ...(pro ? [['Consulting', parts?.consulting]] : []),
  ]
  const total = rows.reduce((s, [, v]) => s + (v ?? 0), 0)

  return (
    <section className="px-5 pt-5">
      <PopCard raised className="p-5">
        <p className="caps-sm t-faint">Earned this month so far</p>
        {!parts ? (
          <Loader label="Adding it up" className="py-4" />
        ) : (
          <>
            <p className="mt-2 font-display text-huge leading-none tnum t-heading">₹{rupees(total)}</p>
            <div className="mt-3">
              {rows.map(([k, v]) => (
                <Field key={k} k={k} v={v == null ? '—' : `₹${rupees(v)}`} />
              ))}
            </div>
            <p className="mt-3 text-meta t-body">After Namo's share. Paid together on the 7th of next month.</p>
          </>
        )}
      </PopCard>
    </section>
  )
}
