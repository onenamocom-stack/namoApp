import { useEffect } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AppProvider, useStore } from './store.jsx'
import { isPro } from './side.js'
import { startAnalytics } from './lib/analytics.js'
import { BottomNav, PRO_TABS, Toast } from './components/Chrome.jsx'
import Boundary from './components/Boundary.jsx'
import ChatPanel from './components/ChatPanel.jsx'
import CartSheet from './components/CartSheet.jsx'
import Icon from './components/Icon.jsx'
import Reports from './screens/Reports.jsx'

import Intro from './screens/onboarding/Intro.jsx'
import AskName from './screens/onboarding/AskName.jsx'
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
import Bhakti from './screens/Bhakti.jsx'
import Shop from './screens/Shop.jsx'
import Tarot from './screens/Tarot.jsx'

import ProEarnings from './pro/ProEarnings.jsx'
import ProStudio from './pro/ProStudio.jsx'
import ProConsult from './pro/ProConsult.jsx'
import ProProfile from './pro/ProProfile.jsx'
import ProApply from './pro/ProApply.jsx'
import ProAffiliate from './pro/ProAffiliate.jsx'

import Profile from './screens/Profile.jsx'
import Wallet from './screens/Wallet.jsx'
import Orders from './screens/Orders.jsx'
import Horoscope from './screens/Horoscope.jsx'
import Ask from './screens/Ask.jsx'
import Chart from './screens/Chart.jsx'
import Placement from './screens/Placement.jsx'
import Match from './screens/Match.jsx'
import Muhurat from './screens/Muhurat.jsx'
import Numerology from './screens/Numerology.jsx'
import Invite from './screens/Invite.jsx'
import Article from './screens/Article.jsx'
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
 *
 * In the consultant build (`side.js`) none of the seeker logic below runs at
 * all: any non-`/pro` path goes straight to `/pro/studio`, and the gate takes
 * over from there.
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

    if (isPro && !onPro) {
      // The consultant build shares the seeker's name/phone/verify steps
      // for sign-up and sign-in (ProApply sends new consultants through
      // them with ?next=pro). Those three stay reachable; every other
      // non-/pro path goes to the studio, where the gate takes over.
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

    if (session) return
    const fromPro = pathname === '/chart' || pathname.startsWith('/consult/')
    if (pathname.startsWith('/onboarding') || fromPro) return
    navigate('/onboarding', { replace: true })
  }, [session, sessionReady, consultant, consultantLoading, consultantError, pathname, navigate])

  return null
}

/**
 * The cart, floating over Shop.
 *
 * It lives here rather than in `Shop.jsx` for one reason: a button rendered
 * inside a screen is positioned against the scrolling `<main>`, so it scrolls
 * away with the grid. Every persistent floating thing in this app — the toast,
 * the panels, the sheet — is mounted against the phone frame instead, which is
 * the `relative` box below. `Toast` is the precedent.
 *
 * Right-inset while the toast stays centred, so the two never sit on top of
 * each other; `z-40` puts it over the nav (30) and under the toast (50), which
 * is the order you want when a purchase toast fires with the cart on screen.
 *
 * Hidden when the cart is empty. A cart button that opens an empty sheet is
 * the affordance confusion `BarAction` already refuses elsewhere.
 */
function CartFab() {
  const { cartCount, setCartOpen } = useStore()
  const { pathname } = useLocation()

  /* On /shop, always — 25 Sep 2026. It used to appear only once something
     was in the cart, so the one control people look for was absent exactly
     when they went looking for it. An empty cart opens a sheet that says it
     is empty, which is an answer; a missing button is not. */
  if (pathname !== '/shop') return null

  return (
    <button
      type="button"
      onClick={() => setCartOpen(true)}
      aria-label={cartCount ? `Cart, ${cartCount} items` : 'Cart, empty'}
      className="pop-tap absolute bottom-24 right-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-gold-fill text-ink shadow-lg"
    >
      <Icon name="cart" size={22} />
      {cartCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-ink px-1 text-[11px] font-bold tnum text-white ring-2 ring-bg">
          {cartCount}
        </span>
      )}
    </button>
  )
}

function Frame() {
  const { toast } = useStore()

  useEffect(() => {
    document.title = isPro ? 'Namo — Consultant' : 'Namo'
  }, [])

  return (
    <div className="flex min-h-[100dvh] w-full justify-center bg-ink">
      <div className="relative flex h-[100dvh] w-full max-w-[420px] flex-col overflow-hidden bg-bg text-t1">
        <SessionGate />
        <Routes>
          <Route
            path="/"
            element={<Navigate to={isPro ? '/pro/studio' : '/onboarding'} replace />}
          />

          <Route element={<PlainLayout />}>
            {/* The seeker's screens. Absent from the consultant build —
                a consultant who needs the seeker app follows a link out to
                the deployed seeker site. */}
            {!isPro && (
              <>
                <Route path="/onboarding" element={<Intro />} />
                <Route path="/onboarding/name" element={<AskName />} />
                <Route path="/onboarding/date" element={<AskDate />} />
                <Route path="/onboarding/time" element={<AskTime />} />
                <Route path="/onboarding/place" element={<AskPlace />} />
                <Route path="/onboarding/phone" element={<AskPhone />} />
                <Route path="/onboarding/verify" element={<VerifyOtp />} />
                <Route path="/onboarding/computing" element={<Computing />} />

                {/* Profile carries its tab in the URL so it stays deep-linkable. */}
                <Route path="/profile" element={<Profile />} />
                <Route path="/profile/:tab" element={<Profile />} />
                <Route path="/wallet" element={<Wallet />} />
                <Route path="/orders" element={<Orders />} />
                <Route path="/horoscope" element={<Horoscope />} />
                <Route path="/ask" element={<Ask />} />
                <Route path="/chart" element={<Chart />} />
                <Route path="/chart/:id" element={<Placement />} />
                <Route path="/match" element={<Match />} />
                <Route path="/muhurat" element={<Muhurat />} />
                <Route path="/numerology" element={<Numerology />} />
                <Route path="/people/invite" element={<Invite />} />
                {/* `/people` was a list of mock friends with mock compatibility
                    scores, and `/people/:id` their synastry. Ashtakoota on
                    /match is the real version of both, and it holds nobody's
                    details on file — so the old links land there rather than
                    404, including any that are already shared. */}
                <Route path="/people" element={<Navigate to="/match" replace />} />
                <Route path="/people/:id" element={<Navigate to="/match" replace />} />
                <Route path="/read/:id" element={<Article />} />
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

                {/* The shrine is full screen and off the tab bar as of 9 Sep 2026.
                    It reached its own layout by being the one screen that does not
                    scroll — a nav bar under a fixed-height shrine cost it 56px it
                    could not spare. Home's Darshan tab is how you get here. */}
                <Route path="/darshan" element={<Pooja />} />
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
              </>
            )}
          </Route>

          {/* The five destinations. Seeker only — the consultant's nav is
              PRO_TABS inside ProLayout. */}
          {!isPro && (
            <Route element={<TabLayout />}>
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
              <Route path="/pro/affiliate" element={<ProAffiliate />} />
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
            The ask drawer, cart sheet and cart button are seeker-only; a
            consultant build never opens them, and they self-gate on store
            state nothing on that side sets. */}
        {!isPro && <ChatPanel />}
        {!isPro && <CartSheet />}
        {!isPro && <CartFab />}
        <Toast message={toast} />
      </div>
    </div>
  )
}

export default function App() {
  /* Page views, from one place. HashRouter means every route change is a
     `hashchange`, so the listener catches every screen without a hook in
     each of them — and without anything in a screen being able to forget.

     Outside the provider on purpose: analytics must not be able to delay
     or break the app's own mount, and nothing here reads store state. */
  useEffect(startAnalytics, [])

  return (
    <AppProvider>
      <Frame />
    </AppProvider>
  )
}
