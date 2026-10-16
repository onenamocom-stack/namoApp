import { Link, Navigate } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import { Loader } from '../components/Cosmos.jsx'
import Icon from '../components/Icon.jsx'
import { Kicker, Stat } from '../components/Pop.jsx'
import { Row } from '../components/Primitives.jsx'
import { Insights } from '../pro/ProEarnings.jsx'
import { RatesSheet } from '../pro/ProProfile.jsx'
import { RATE_FIELDS } from '../components/RateFields.jsx'
import { useEffect, useState } from 'react'
import { rupees, useStore } from '../store.jsx'
import { creatorEarnings } from '../lib/referrals.js'

/**
 * Dashboard (Phase 16, 14 Oct 2026): a Pro's and a Creator's own screens,
 * inside the main app. A Pro's are the pro app's — Earnings and Insights,
 * the practice, links, payout details — at `/dashboard/...`. A Creator's
 * are their code and Insights. No Studio (14 Oct 2026, Rahul): posting is
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
  const { consultant } = useStore()
  const [rating, setRating] = useState(false)

  if (role === 'loading') return <Loader />
  if (!role) return <Navigate to="/profile" replace />

  return (
    <>
      <TopBar title="Dashboard" back backTo="/profile" />

      {role === 'pro' ? (
        <>
          {consultant.status !== 'approved' && (
            <p className="mx-5 mt-4 rounded-lg border border-rule px-4 py-3 text-meta t-body">
              Your application is under review. Nobody can book you until it is approved.
            </p>
          )}
          <section className="px-5 py-5">
            <Kicker>Your work</Kicker>
            <div className="mt-2">
              <Row to="/dashboard/earnings" title="Earnings and Insights" note="What you earned, and who saw your posts" />
              <Row to="/dashboard/affiliate" title="Your links" note="Share a product and earn" />
              <Row to="/dashboard/market" title="Sell on the Market" note="Downloads, courses, events and products" />
            </div>
          </section>
          <section className="px-5 pb-5">
            {/* One heading for the practice, Go online in it, payouts last
                (16 Oct 2026, Rahul). */}
            <Kicker>Your consulting setting</Kicker>
            <div className="mt-2">
              {/* Consulting only, first (16 Oct 2026, Rahul). */}
              <Row
                to="/dashboard/consulting"
                title="Consulting earnings"
                note="What chat, calls and bookings earned"
              />
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
          <section className="px-5 pb-8">
            <Kicker>Payout details</Kicker>
            <div className="mt-2">
              <Row to="/dashboard/payout-details" title="Payout details" note="PAN and bank account" />
            </div>
          </section>
        </>
      ) : (
        <>
          <CreatorBook />
          <section className="px-5 pb-5">
            <div>
              <Row to="/dashboard/affiliate" title="Your links" note="Share a product and earn" />
              <Row to="/profile/influencer" title="Your code" note="Who joined with your code, and who paid" />
              <Row to="/dashboard/market" title="Sell on the Market" note="Downloads, courses, events and products" />
            </div>
          </section>
          <Insights />
        </>
      )}
      <div className="h-16" />
      {rating && (
        <RatesSheet current={consultant?.rates} onClose={() => setRating(false)} onSaved={() => setRating(false)} />
      )}
    </>
  )
}

/** A Creator's 10% (14 Oct 2026, 01-PRD §12): paid this month, in all,
 *  and what is still waiting out the seven days after delivery. Paid out
 *  as an astrologer's is, once payouts exist. */
function CreatorBook() {
  const [book, setBook] = useState(null)
  useEffect(() => {
    let live = true
    creatorEarnings()
      .then((d) => live && setBook(d))
      .catch(() => live && setBook(false))
    return () => {
      live = false
    }
  }, [])
  if (book === false) return null
  return (
    <section className="px-5 py-5">
      <Kicker>Your earnings</Kicker>
      {book ? (
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Stat label="This month" value={`₹${rupees(book.this_month_paise)}`} />
          <Stat label="In all" value={`₹${rupees(book.lifetime_paise)}`} />
          <Stat label="Waiting" value={`₹${rupees(book.pending_paise)}`} sub="7 days after delivery" />
        </div>
      ) : (
        <Loader />
      )}
    </section>
  )
}
