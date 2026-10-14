import { Navigate } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import { Loader } from '../components/Cosmos.jsx'
import { Kicker, Stat } from '../components/Pop.jsx'
import { Row } from '../components/Primitives.jsx'
import { Insights } from '../pro/ProEarnings.jsx'
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
              <Row to="/dashboard/affiliate" title="Your links" note="Share a product, earn 10%" />
            </div>
          </section>
          <section className="px-5 pb-5">
            <Kicker>Your practice</Kicker>
            <div className="mt-2">
              <Row to="/dashboard/profile" title="Practice and reviews" note="Rates, intro video, username, reviews" />
              <Row to="/dashboard/payout-details" title="Payout details" note="PAN and bank account" />
            </div>
          </section>
          <section className="px-5 pb-8">
            <Kicker>Calls and chats</Kicker>
            <div className="mt-2">
              <Row to="/desk" title="Namo Consult" note="Go online, take calls and chats, set your slots" />
            </div>
          </section>
        </>
      ) : (
        <>
          <CreatorBook />
          <section className="px-5 pb-5">
            <div>
              <Row to="/dashboard/affiliate" title="Your links" note="Share a product, earn 10%" />
              <Row to="/profile/influencer" title="Your code" note="Who joined with your code, and who paid" />
            </div>
          </section>
          <Insights />
        </>
      )}
      <div className="h-16" />
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
