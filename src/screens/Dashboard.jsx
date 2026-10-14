import { Navigate } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import { Loader } from '../components/Cosmos.jsx'
import { Kicker } from '../components/Pop.jsx'
import { Row } from '../components/Primitives.jsx'
import { Insights } from '../pro/ProEarnings.jsx'
import { PRO_APP_URL } from '../lib/urls.js'
import { useStore } from '../store.jsx'

/**
 * Dashboard (Phase 16, 14 Oct 2026): a Pro's and a Creator's own screens,
 * inside the main app. A Pro's are the pro app's — Studio, Earnings and
 * Insights, the practice, links, payout details — at `/dashboard/...`. A
 * Creator's are Studio and Insights. Calls are not here: they ring in the
 * pro app until Namo Consult (`/desk`) carries them.
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
              <Row to="/dashboard/studio" title="Studio" note="Post a reel, a photo or a blog post" />
              <Row to="/dashboard/earnings" title="Earnings and Insights" note="What you earned, and who saw your posts" />
              <Row to="/dashboard/affiliate" title="Your links" note="Share a product, earn 10%" />
            </div>
          </section>
          <section className="px-5 pb-5">
            <Kicker>Your practice</Kicker>
            <div className="mt-2">
              <Row to="/dashboard/profile" title="Practice and reviews" note="Rates, intro video, username, reviews" />
              <Row to="/practice/edit" title="Edit your page" note="Specialization, About, experience, languages" />
              <Row to={`/consult/${consultant.profile_id}`} title="View your public page" note="Exactly what a client sees" />
              <Row to="/dashboard/payout-details" title="Payout details" note="PAN and bank account" />
            </div>
          </section>
          <section className="px-5 pb-8">
            <Kicker>Calls and chats</Kicker>
            {/* The pro app until Namo Consult (`/desk`) takes the calls. */}
            <div className="mt-2">
              <Row href={PRO_APP_URL} title="Open the consultant app" note="Go online, and take calls and chats there" />
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="px-5 py-5">
            <div>
              <Row to="/dashboard/studio" title="Studio" note="Post a reel, a photo or a blog post" />
              <Row to="/profile/influencer" title="Your code" note="Who joined with your code, and who paid" />
            </div>
          </section>
          <Insights links={false} />
        </>
      )}
      <div className="h-16" />
    </>
  )
}
