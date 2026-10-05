import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Reload into a newer build, at a moment nobody minds (6 Oct 2026).
 *
 * A phone that opened the app before a deploy kept running the old code
 * against the new server. On 5 Oct that old call screen read the new
 * "connecting" answer as "0:00 left" and hung up every call it joined.
 *
 * Every build bakes in an id (vite.config.js) and publishes the same id in
 * version.json. This asks for version.json every five minutes and when the
 * app comes back to the foreground; when the ids differ, the next change of
 * screen reloads. Never during a call or while reaching a consultant —
 * those screens are the reason this exists, and a reload there would hang
 * up the very thing it protects.
 */
/* global __BUILD_ID__ */
const MINE = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : null
const EVERY_MS = 5 * 60_000
const BUSY = /^\/(call|connect)\//

async function latest() {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) return null
    return (await r.json())?.build ?? null
  } catch {
    return null
  }
}

export function useReloadIntoNewBuild() {
  const { pathname } = useLocation()
  const stale = useRef(false)

  useEffect(() => {
    if (!MINE || import.meta.env.DEV) return undefined
    const check = async () => {
      const live = await latest()
      if (live && live !== MINE) stale.current = true
    }
    check()
    const timer = setInterval(check, EVERY_MS)
    const onShow = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onShow)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [])

  // The reload happens on a change of screen, so it reads as the screen
  // opening rather than as the page blinking under somebody's thumb.
  useEffect(() => {
    if (stale.current && !BUSY.test(pathname)) window.location.reload()
  }, [pathname])
}
