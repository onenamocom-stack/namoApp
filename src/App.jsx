import { applyTheme, loadAppearance } from './lib/appearance.js'
import { MilestoneCelebration } from './components/Milestones.jsx'
import { useEffect, useRef } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AppProvider, useStore } from './store.jsx'
import { isPro } from './side.js'
import { listSessions } from './lib/chat.js'
import { startAnalytics } from './lib/analytics.js'
import { BottomNav, PRO_TABS, Toast } from './components/Chrome.jsx'
import Boundary from './components/Boundary.jsx'
import ChatPanel from './components/ChatPanel.jsx'
import CartSheet from './components/CartSheet.jsx'
import Reports from './screens/Reports.jsx'

import Welcome from './screens/onboarding/Welcome.jsx'
import AboutYou from './screens/onboarding/AboutYou.jsx'
import AskName from './screens/onboarding/AskName.jsx'
import AskPhone from './screens/onboarding/AskPhone.jsx'
import VerifyOtp from './screens/onboarding/VerifyOtp.jsx'
import Computing from './screens/onboarding/Computing.jsx'

import Home from './screens/Home.jsx'
import Consult from './screens/Consult.jsx'
import Academy from './screens/Academy.jsx'
import Pooja from './screens/Pooja.jsx'
import Bhakti from './screens/Bhakti.jsx'
import Shop from './screens/Shop.jsx'
import Tarot from './screens/Tarot.jsx'

import ProEarnings from './pro/ProEarnings.jsx'
import ProStudio from './pro/ProStudio.jsx'
import ProRing from './pro/ProRing.jsx'
import ProConsult from './pro/ProConsult.jsx'
import ProProfile from './pro/ProProfile.jsx'
import ProApply from './pro/ProApply.jsx'
import Support from './screens/Support.jsx'
import ProPayoutDetails from './pro/ProPayoutDetails.jsx'
import ProAffiliate from './pro/ProAffiliate.jsx'

import Profile from './screens/Profile.jsx'
import Wallet from './screens/Wallet.jsx'
import Orders from './screens/Orders.jsx'
import Call from './screens/Call.jsx'
import Connect from './screens/Connect.jsx'
import { useReloadIntoNewBuild } from './lib/update.js'
import IncomingCall from './components/IncomingCall.jsx'
import { PresenceKeeper } from './components/PresenceToggle.jsx'
import Horoscope from './screens/Horoscope.jsx'
import Ask from './screens/Ask.jsx'
import Chart from './screens/Chart.jsx'
import Placement from './screens/Placement.jsx'
import Match from './screens/Match.jsx'
import Muhurat from './screens/Muhurat.jsx'
import Invite from './screens/Invite.jsx'
import Article from './screens/Article.jsx'
import ProductPage from './screens/ProductPage.jsx'
import SearchScreen from './screens/SearchScreen.jsx'
import UserProfile from './screens/UserProfile.jsx'
import ReelViewer from './screens/ReelViewer.jsx'
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
 * CartSheet stays mounted in Frame and is simply never opened from this side;
 * it self-gates on state nothing here sets, so there is nothing to guard
 * against.
 */
function ProLayout() {
  const { pathname } = useLocation()
  return (
    <>
      {/* Above the scroll and on every screen. A call request that can
          only be seen by being on the right tab is one that gets missed,
          and the seeker is watching a countdown while it is. */}
      <IncomingCall />
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

/** Reloads into a newer build at the next screen change (src/lib/update.js). */
function BuildWatcher() {
  useReloadIntoNewBuild()
  return null
}

/** A tapped call notification, while the app is already open: the service
 *  worker posts the route and this follows it (public/sw.js). */
function NotificationRouter() {
  const navigate = useNavigate()
  useEffect(() => {
    if (!isPro || !('serviceWorker' in navigator)) return undefined
    const onMessage = (e) => {
      if (e.data?.type === 'namo-route' && typeof e.data.path === 'string') navigate(e.data.path)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [navigate])
  return null
}

/** A paid chat still running when the app opens — after a reload, a closed
 *  tab, a phone that slept — opens straight back onto its conversation, for
 *  either side. The chat panel is an overlay, not a route, so nothing else
 *  brings it back, and the meter runs whether or not anybody can see it
 *  (6 Oct 2026). A call needs nothing: its screen is in the URL. */
function LiveChatResume() {
  const { session, openChat } = useStore()
  const uid = session?.user?.id
  const checked = useRef(null)
  useEffect(() => {
    if (!uid || checked.current === uid) return
    checked.current = uid
    listSessions().then((rows) => {
      const live = (rows || []).find((s) => s.status === 'live' && s.mode === 'chat' && s.thread_id)
      if (live) openChat('live', live.thread_id)
    })
  }, [uid, openChat])
  return null
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
 * own is the point of it. (A third, "Switch to seeking" → `/home`, was removed
 * on 4 Oct 2026 with its twin in the client app.)
 *
 * In the consultant build (`side.js`) none of the seeker logic below runs at
 * all: any non-`/pro` path goes straight to `/pro/studio`, and the gate takes
 * over from there.
 */
function SessionGate() {
  const {
    session,
    sessionReady,
    consultant,
    consultantLoading,
    consultantError,
    profile,
    profileLoading,
  } = useStore()
  const { pathname } = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (!sessionReady) return

    // `/profile` starts with the four characters `/pro`, so this has to be a
    // segment-boundary check, not startsWith('/pro') — that swallowed the
    // seeker's own profile route into the consultant exemption.
    const onPro = pathname === '/pro' || pathname.startsWith('/pro/')

    if (isPro && !onPro) {
      // The consultant build shares the seeker's name/phone/verify steps
      // for sign-up and sign-in (ProApply sends new consultants through
      // them with ?next=pro). Those three stay reachable; every other
      // non-/pro path goes to the studio, where the gate takes over.
      // A call is not a seeker screen. The consultant is ON it, with
      // their own token and the money running — bouncing them to the
      // studio would hang up on somebody who is paying by the minute.
      if (pathname.startsWith('/call/')) return
      // The two seeker screens this build carries on purpose: ProConsult
      // opens /chart?name=… for a booking, ProProfile previews /consult/:id.
      // Bounced to the studio from 20 Sep until 29 Sep.
      if (pathname === '/chart' || pathname.startsWith('/consult/')) return
      // Help and support, shared with the seeker app (3 Oct 2026), and the
      // consultant's own reels and blog posts (4 Oct 2026).
      if (pathname === '/support' || pathname.startsWith('/reels/') || pathname.startsWith('/read/')) return

      const authStep =
        pathname.startsWith('/onboarding/name') ||
        pathname.startsWith('/onboarding/phone') ||
        pathname.startsWith('/onboarding/verify')
      if (!authStep) {
        navigate('/pro/studio', { replace: true })
        return
      }
    }

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

    if (session) {
      /* A signed-in account never sees the welcome screen. Opening the bare
         site (`/`) routes to `/onboarding`, the phone screen — so until 30 Sep a person whose session had survived closing
         the tab still looked signed out, and signed in again. Only once the
         profile has arrived and carries a birth date: an account whose
         sign-up stopped before the birth details still needs them, and
         Welcome forwards it to /onboarding/details. */
      if (pathname === '/onboarding' && !profileLoading && profile?.birth_date) {
        navigate('/home', { replace: true })
      }
      return
    }
    const fromPro = pathname === '/chart' || pathname.startsWith('/consult/')
    // Support stays open signed out: the person who cannot sign in is the
    // one who most needs the phone number.
    if (pathname.startsWith('/onboarding') || fromPro || pathname === '/support') return
    navigate('/onboarding', { replace: true })
  }, [
    session,
    sessionReady,
    consultant,
    consultantLoading,
    consultantError,
    profile,
    profileLoading,
    pathname,
    navigate,
  ])

  return null
}

function Frame() {
  const { toast } = useStore()

  useEffect(() => {
    document.title = isPro ? 'Namo — Consultant' : 'Namo'
  }, [])

  // The console's festive theme, if one is showing now (4 Oct 2026).
  useEffect(() => {
    loadAppearance().then((d) => applyTheme(d?.theme ?? null))
  }, [])

  return (
    <div className="flex min-h-[100dvh] w-full justify-center bg-ink">
      <div className="relative flex h-[100dvh] w-full max-w-[420px] flex-col overflow-hidden bg-bg text-t1">
        <SessionGate />
        <BuildWatcher />
        <NotificationRouter />
        <LiveChatResume />
        {/* A consultant crossing a milestone tier sees it once (lib/milestones.js). */}
        {isPro && <MilestoneCelebration />}
        {/* The consultant's "app is open" beat, on every route — the call
            screen included, which is outside the shell (5 Oct 2026). */}
        {isPro && <PresenceKeeper />}
        <Routes>
          <Route
            path="/"
            element={<Navigate to={isPro ? '/pro/studio' : '/onboarding'} replace />}
          />

          <Route element={<PlainLayout />}>
            {/* THE CALL IS IN BOTH APPS. It is the one screen a seeker and
                a consultant are on at the same time — full-bleed, its own
                controls over the video, no bottom nav on either side. It
                shipped inside the seeker-only block below, so the
                consultant's Answer button navigated to a route their
                build did not have. */}
            <Route path="/call/:id" element={<Call />} />
            {/* Reaching a consultant: busy, ringing, answered (5 Oct 2026). */}
            <Route path="/connect/:id" element={<Connect />} />

            {/* The seeker's screens. Absent from the consultant build —
                a consultant who needs the seeker app follows a link out to
                the deployed seeker site. */}
            {!isPro && (
              <>
                {/* Sign-up is two pages since 3 Oct 2026: Welcome (phone and
                    code — the one door in) and About you (every birth detail).
                    The old one-question paths land on Welcome, so a stale link
                    or a half-finished tab still finds the door. */}
                <Route path="/onboarding" element={<Welcome />} />
                <Route path="/onboarding/details" element={<AboutYou />} />
                <Route path="/onboarding/computing" element={<Computing />} />
                {['name', 'gender', 'date', 'time', 'place', 'phone', 'verify'].map((old) => (
                  <Route key={old} path={`/onboarding/${old}`} element={<Navigate to="/onboarding" replace />} />
                ))}

                {/* Profile carries its tab in the URL so it stays deep-linkable. */}
                <Route path="/profile" element={<Profile />} />
                <Route path="/profile/:tab" element={<Profile />} />
                <Route path="/wallet" element={<Wallet />} />
                <Route path="/orders" element={<Orders />} />
                <Route path="/support" element={<Support />} />
                <Route path="/horoscope" element={<Horoscope />} />
                <Route path="/ask" element={<Ask />} />
                <Route path="/chart" element={<Chart />} />
                <Route path="/chart/:id" element={<Placement />} />
                <Route path="/match" element={<Match />} />
                <Route path="/muhurat" element={<Muhurat />} />
                <Route path="/people/invite" element={<Invite />} />
                {/* `/people` was a list of mock friends with mock compatibility
                    scores, and `/people/:id` their synastry. Ashtakoota on
                    /match is the real version of both, and it holds nobody's
                    details on file — so the old links land there rather than
                    404, including any that are already shared. */}
                <Route path="/people" element={<Navigate to="/match" replace />} />
                <Route path="/people/:id" element={<Navigate to="/match" replace />} />
                <Route path="/read/:id" element={<Article />} />
                {/* A product's own page (6 Oct 2026), by slug or id. */}
                <Route path="/shop/p/:key" element={<ProductPage />} />
                <Route path="/search" element={<SearchScreen />} />
                {/* A person who posts. Deliberately not /consult/:id — that screen
                    sells a practitioner, and publishing a photo does not make
                    anybody bookable. */}
                <Route path="/u/:id" element={<UserProfile />} />
                <Route path="/reels/:id" element={<ReelViewer />} />
                <Route path="/consult/:id" element={<ConsultantProfile />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/premium" element={<Premium />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/tarot" element={<Tarot />} />

              </>
            )}

            {/* Routes the consultant build also carries: ProApply signs a new
                consultant in, so it needs the three auth steps of the
                onboarding chain (`?next=pro` skips the birth steps and lands
                back on /pro/apply). ProConsult opens /chart?name=… for a
                booking, and ProProfile previews its own public page at
                /consult/:id. */}
            {isPro && (
              <>
                <Route path="/pro/apply" element={<ProApply />} />
                <Route path="/onboarding/name" element={<AskName />} />
                <Route path="/onboarding/phone" element={<AskPhone />} />
                <Route path="/onboarding/verify" element={<VerifyOtp />} />
                <Route path="/chart" element={<Chart />} />
                <Route path="/consult/:id" element={<ConsultantProfile />} />
                <Route path="/support" element={<Support />} />
                {/* A consultant's own reels and blog posts, opened from Studio
                    and Insights (4 Oct 2026) — both screens show only theirs. */}
                <Route path="/reels/:id" element={<ReelViewer />} />
                <Route path="/read/:id" element={<Article />} />
              </>
            )}
          </Route>

          {/* The five destinations. Seeker only — the consultant's nav is
              PRO_TABS inside ProLayout. */}
          {!isPro && (
            <Route element={<TabLayout />}>
              {/* The shrine is back under the tab bar (5 Oct 2026, owner's
                  request, after Sri Mandir's): the deity row moved into the
                  header, which pays for the 56px the nav takes. */}
              <Route path="/darshan" element={<Pooja />} />
              {/* Home carries its tab in the URL, same as Profile — a tab worth
                  switching to is worth linking to, and Back should undo the switch.
                  Without the `:tab` route, `/home/today` falls through the catch-all
                  and bounces straight back to the feed. */}
              <Route path="/home" element={<Home />} />
              <Route path="/home/:tab" element={<Home />} />
              <Route path="/consult" element={<Consult />} />
              <Route path="/bhakti" element={<Bhakti />} />
              <Route path="/academy" element={<Academy />} />
              <Route path="/shop" element={<Shop />} />
            </Route>
          )}

          {/* The consultant's five destinations — consultant build only. In
              the seeker build there is nothing at /pro: the catch-all below
              sends those paths home. */}
          {isPro && (
            <Route element={<ProLayout />}>
              <Route path="/pro/earnings" element={<ProEarnings />} />
              <Route path="/pro/studio" element={<ProStudio />} />
              {/* Where a call notification's Answer / Decline lands (6 Oct 2026). */}
              <Route path="/pro/ring/:id" element={<ProRing />} />
              <Route path="/pro/affiliate" element={<ProAffiliate />} />
              <Route path="/pro/payout-details" element={<ProPayoutDetails />} />
              <Route path="/pro/consult" element={<ProConsult />} />
              {/* Profile carries its tab in the URL too, same reason as the
                  seeker's — Earnings needs to stay deep-linkable now that it
                  is a segment rather than a route. */}
              <Route path="/pro/profile" element={<ProProfile />} />
              <Route path="/pro/profile/:tab" element={<ProProfile />} />
            </Route>
          )}

          {/* Must sit above the global catch-all. Without it a mistyped pro
              path falls through to `*` and lands in the wrong app with no
              error — the most confusing failure available here. Consultant
              build only; the seeker build's catch-all covers /pro itself. */}
          {isPro && <Route path="/pro/*" element={<Navigate to="/pro/studio" replace />} />}

          <Route
            path="*"
            element={<Navigate to={isPro ? '/pro/studio' : '/home'} replace />}
          />
        </Routes>

        {/* Global overlays — above every screen, inside the phone frame.
            The chat panel mounts in BOTH builds: it is the consultant's only
            chat screen too (Consult → Chat, the header's Messages button and
            "Open chat" all call openChat). It was seeker-only from the build
            split on 19 Sep until 3 Oct 2026, so in the consultant app every
            one of those did nothing. The cart sheet stays seeker-only. */}
        <ChatPanel />
        {!isPro && <CartSheet />}
        <Toast message={toast} />
      </div>
    </div>
  )
}

export default function App() {
  /* Page views, from one place: the listener sees every navigation (it
     wraps history), so no screen needs a hook and none can forget.

     Outside the provider on purpose: analytics must not be able to delay
     or break the app's own mount, and nothing here reads store state. */
  useEffect(startAnalytics, [])

  return (
    <AppProvider>
      <Frame />
    </AppProvider>
  )
}
