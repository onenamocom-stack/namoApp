import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Boundary from '../components/Boundary.jsx'
import IncomingCall from '../components/IncomingCall.jsx'
import { PresenceKeeper } from '../components/PresenceToggle.jsx'

/**
 * Namo Consult, `/desk` (Phase 16, 14 Oct 2026): the one place in the main
 * app where a Pro is on duty. The online switch, the incoming call and chat
 * requests, the queue and the slots — the pro app's own components, unchanged.
 *
 * Open, a Pro beats and can be online; anywhere else in the main app they
 * do not, because only here does a call ring. pro.1namo.com redirects here
 * since 16 Oct 2026 (firebase.json, pro-redirect/).
 *
 * It installs as its own app: on this screen the page names itself
 * Namo Consult and offers a manifest whose start is `/desk`.
 */
function useInstallAsNamoConsult() {
  useEffect(() => {
    const before = document.title
    document.title = 'NAMO Desk'
    const made = []
    const add = (tag, attrs) => {
      const el = document.createElement(tag)
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
      document.head.appendChild(el)
      made.push(el)
    }
    add('link', { rel: 'manifest', href: '/desk.webmanifest' })
    add('meta', { name: 'apple-mobile-web-app-title', content: 'NAMO Desk' })
    add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' })
    return () => {
      document.title = before
      made.forEach((el) => el.remove())
    }
  }, [])
}

export default function DeskLayout() {
  const { pathname } = useLocation()
  useInstallAsNamoConsult()
  return (
    <>
      <PresenceKeeper />
      {/* Above the scroll, as in the pro app: a request seen only by
          scrolling to it is a request missed. */}
      <IncomingCall />
      <main key={pathname} className="deal no-scrollbar min-h-0 flex-1 overflow-y-auto">
        <Boundary resetKey={pathname}>
          <Outlet />
        </Boundary>
      </main>
    </>
  )
}
