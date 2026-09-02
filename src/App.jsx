import { useEffect } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AppProvider, useStore } from './store.jsx'
import { BottomNav, PRO_TABS, Toast } from './components/Chrome.jsx'
import Boundary from './components/Boundary.jsx'
import ChatPanel from './components/ChatPanel.jsx'
import HoroscopePanel from './components/HoroscopePanel.jsx'
import CartSheet from './components/CartSheet.jsx'
import Reports from './screens/Reports.jsx'

import Intro from './screens/onboarding/Intro.jsx'
import AskName from './screens/onboarding/AskName.jsx'
import AskSide from './screens/onboarding/AskSide.jsx'
import AskDate from './screens/onboarding/AskDate.jsx'
import AskTime from './screens/onboarding/AskTime.jsx'
import AskPlace from './screens/onboarding/AskPlace.jsx'
import AskPhone from './screens/onboarding/AskPhone.jsx'
import VerifyOtp from './screens/onboarding/VerifyOtp.jsx'
import Computing from './screens/onboarding/Computing.jsx'

import Home from './screens/Home.jsx'
import Consult from './screens/Consult.jsx'
import Academy from './screens/Academy.jsx'
import Pooja from './screens/Pooja.jsx'
import Shop from './screens/Shop.jsx'
import Tarot from './screens/Tarot.jsx'

import ProEarnings from './pro/ProEarnings.jsx'
import ProStudio from './pro/ProStudio.jsx'
import ProGoLive from './pro/ProGoLive.jsx'
import ProConsult from './pro/ProConsult.jsx'
import ProProfile from './pro/ProProfile.jsx'
import ProApply from './pro/ProApply.jsx'

import Profile from './screens/Profile.jsx'
import Wallet from './screens/Wallet.jsx'
import Horoscope from './screens/Horoscope.jsx'
import Ask from './screens/Ask.jsx'
import Chart from './screens/Chart.jsx'
import Placement from './screens/Placement.jsx'
import People from './screens/People.jsx'
import Synastry from './screens/Synastry.jsx'
import Invite from './screens/Invite.jsx'
import Article from './screens/Article.jsx'
import ReelViewer from './screens/ReelViewer.jsx'
import LiveRoom from './screens/LiveRoom.jsx'
import ConsultantProfile from './screens/ConsultantProfile.jsx'
import Notifications from './screens/Notifications.jsx'
import Premium from './screens/Premium.jsx'

/**
 * Tab shell. The nav takes real layout space; the floating Ask AI button sits
 * above it and stays visible on every tab.
 */
function TabLayout() {
  const { pathname } = useLocation()
  return (
    <>
      <main key={pathname} className="deal no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {/* Inside the shell, not around it: a screen that throws must not take
            the bottom nav with it, or there is no way out of the crash. */}
        <Boundary resetKey={pathname}>
          <Outlet />
        </Boundary>
      </main>
      <BottomNav />
    </>
  )
}

/**
 * The consultant's shell. Identical to TabLayout minus the floating Ask AI
 * button — the consultant is not the one asking.
 *
 * CartSheet and HoroscopePanel stay mounted in Frame and are simply never
 * opened from this side; they self-gate on state nothing here sets, so there
 * is nothing to guard against.
 */
function ProLayout() {
  const { pathname } = useLocation()
  return (
    <>
      <main key={pathname} className="deal no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {/* Inside the shell, not around it: a screen that throws must not take
            the bottom nav with it, or there is no way out of the crash. */}
        <Boundary resetKey={pathname}>
          <Outlet />
        </Boundary>
      </main>
      <BottomNav tabs={PRO_TABS} />
    </>
  )
}

/** Shell for onboarding and drill-in screens — no bottom nav. */
function PlainLayout() {
  const { pathname } = useLocation()
  return (
    <main key={pathname} className="deal no-scrollbar min-h-0 flex-1 overflow-y-auto">
      <Boundary resetKey={pathname}>
        <Outlet />
      </Boundary>
    </main>
  )
}

/**
 * Restores the session on load and sends a signed-out visitor back to
 * onboarding. Waits for `sessionReady` before acting, so a page reload with a
 * valid session never flashes onboarding first.
 *
 * `/pro` used to be exempt, because consultant identity did not exist: anyone
 * who typed the URL was `consultants[0]`. From phase 4 it is the opposite —
 * the consultant screens read a real `consultants` row, so reaching them
 * without one shows a practice belonging to nobody. Signed out, or signed in
 * with no row, goes to the application at `/pro/apply`; the application screen
 * itself is what handles both.
 *
 * Two seeker routes the `/pro` side links *out* to stay exempt: ProConsult
 * opens `/chart?name=…` for a booking, and ProProfile opens `/consult/:id` to
 * preview a public page — the second is now a real page, and previewing your
 * own is the point of it. The third cross-link, "Switch to seeking" → `/home`,
 * is NOT exempt: that one is genuinely asking for the seeker app.
 */
function SessionGate() {
  const { session, sessionReady, consultant, consultantLoading, consultantError } = useStore()
  const { pathname } = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (!sessionReady) return

    // `/profile` starts with the four characters `/pro`, so this has to be a
    // segment-boundary check, not startsWith('/pro') — that swallowed the
    // seeker's own profile route into the consultant exemption.
    const onPro = pathname === '/pro' || pathname.startsWith('/pro/')

    if (onPro) {
      if (pathname === '/pro/apply') return
      // A row that has not arrived yet is not the same as no row. Waiting
      // costs one paint; guessing bounces a real consultant to the form.
      if (session && consultantLoading) return
      // Nor is a failed read. Redirecting on an error would hand a working
      // consultant a signup form for their own practice — seen on production
      // as `JWT issued at future`, from nothing worse than a fast clock. The
      // apply screen says what happened instead.
      if (session && consultantError) return
      if (session && consultant) return
      navigate('/pro/apply', { replace: true })
      return
    }

    if (session) return
    const fromPro = pathname === '/chart' || pathname.startsWith('/consult/')
    if (pathname.startsWith('/onboarding') || fromPro) return
    navigate('/onboarding', { replace: true })
  }, [session, sessionReady, consultant, consultantLoading, consultantError, pathname, navigate])

  return null
}

function Frame() {
  const { toast } = useStore()

  return (
    <div className="flex min-h-[100dvh] w-full justify-center bg-ink">
      <div className="relative flex h-[100dvh] w-full max-w-[420px] flex-col overflow-hidden bg-bg text-t1">
        <SessionGate />
        <Routes>
          <Route path="/" element={<Navigate to="/onboarding" replace />} />

          <Route element={<PlainLayout />}>
            <Route path="/onboarding" element={<Intro />} />
            <Route path="/onboarding/side" element={<AskSide />} />
            <Route path="/onboarding/name" element={<AskName />} />
            <Route path="/onboarding/date" element={<AskDate />} />
            <Route path="/onboarding/time" element={<AskTime />} />
            <Route path="/onboarding/place" element={<AskPlace />} />
            <Route path="/onboarding/phone" element={<AskPhone />} />
            <Route path="/onboarding/verify" element={<VerifyOtp />} />
            <Route path="/onboarding/computing" element={<Computing />} />

            {/* The consultant application. Plain layout, because there is no
                practice to put a nav bar around yet — and it is the one /pro
                route the gate does not redirect away from. */}
            <Route path="/pro/apply" element={<ProApply />} />

            {/* Profile carries its tab in the URL so it stays deep-linkable. */}
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/:tab" element={<Profile />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/horoscope" element={<Horoscope />} />
            <Route path="/ask" element={<Ask />} />
            <Route path="/chart" element={<Chart />} />
            <Route path="/chart/:id" element={<Placement />} />
            <Route path="/people" element={<People />} />
            <Route path="/people/invite" element={<Invite />} />
            <Route path="/people/:id" element={<Synastry />} />
            <Route path="/read/:id" element={<Article />} />
            <Route path="/reels/:id" element={<ReelViewer />} />
            <Route path="/live/:id" element={<LiveRoom />} />
            <Route path="/consult/:id" element={<ConsultantProfile />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/premium" element={<Premium />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/tarot" element={<Tarot />} />
          </Route>

          {/* The five destinations. */}
          <Route element={<TabLayout />}>
            <Route path="/home" element={<Home />} />
            <Route path="/consult" element={<Consult />} />
            <Route path="/pooja" element={<Pooja />} />
            <Route path="/academy" element={<Academy />} />
            <Route path="/shop" element={<Shop />} />
          </Route>

          <Route element={<ProLayout />}>
            <Route path="/pro/earnings" element={<ProEarnings />} />
            <Route path="/pro/studio" element={<ProStudio />} />
            <Route path="/pro/live" element={<ProGoLive />} />
            <Route path="/pro/consult" element={<ProConsult />} />
            {/* Profile carries its tab in the URL too, same reason as the
                seeker's — Earnings needs to stay deep-linkable now that it
                is a segment rather than a route. */}
            <Route path="/pro/profile" element={<ProProfile />} />
            <Route path="/pro/profile/:tab" element={<ProProfile />} />
          </Route>

          {/* Must sit above the global catch-all. Without it a mistyped pro
              path falls through to `*` and teleports the consultant into the
              seeker app with no error — the most confusing failure available
              here. */}
          {/* Live has no destination of its own — the rooms that are on air
              surface inside Consult now, so the old bare path still resolves
              there rather than falling through to the catch-all. */}
          <Route path="/live" element={<Navigate to="/consult" replace />} />

          <Route path="/pro/*" element={<Navigate to="/pro/studio" replace />} />

          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>

        {/* Global overlays — above every screen, inside the phone frame. */}
        <ChatPanel />
        <HoroscopePanel />
        <CartSheet />
        <Toast message={toast} />
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Frame />
    </AppProvider>
  )
}
