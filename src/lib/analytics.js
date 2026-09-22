/**
 * Events, to our own server.
 *
 * No PostHog, no GA4, no third-party script — decided 22 Sep. This is an
 * app where people ask an astrologer about their marriage and their
 * health, and the pages they visit while doing it say a great deal about
 * them. Nothing here leaves our own infrastructure.
 *
 * ── WHAT THIS FILE WILL NOT DO ──────────────────────────────────────────────
 * It will not break a screen. Every failure is swallowed, the queue is
 * capped, and nothing in the app awaits a send. An analytics library that
 * can throw is a analytics library that eventually takes a page down with
 * it, and no metric is worth that.
 *
 * ── AND WILL NOT SEND ───────────────────────────────────────────────────────
 * No ids in paths — `/consult/8f3e…` is sent as `/consult/:id`, because a
 * path carrying a real id turns a page-view counter into a record of who
 * looked at whom. The server strips them again; this is the belt to that
 * pair of braces.
 */

import { SIDE } from '../side.js'

const API = import.meta.env.VITE_DJANGO_API_URL

/* One visit, one id. sessionStorage rather than localStorage on purpose:
   this is meant to expire when the tab does. It is not an identity and
   must not become one. */
const VISIT_KEY = 'namo-visit'

function visitId() {
  try {
    let id = sessionStorage.getItem(VISIT_KEY)
    if (!id) {
      id = crypto.randomUUID()
      sessionStorage.setItem(VISIT_KEY, id)
    }
    return id
  } catch {
    /* Private windows and blocked site data both throw here. A visit that
       cannot be remembered still gets counted, just not joined up. */
    return crypto.randomUUID()
  }
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

function cleanPath(hash) {
  const path = (hash || '').split('?')[0].replace(/^#/, '') || '/'
  return path.replace(UUID, ':id').replace(/\/\d+(?=\/|$)/g, '/:n').slice(0, 160)
}

/* Batched, because a page view and the three taps after it are four
   requests otherwise, on a phone on Indian mobile data. Flushed on a timer
   and on the way out. */
let queue = []
let timer = null
const FLUSH_MS = 4000
const MAX_QUEUE = 25

function flush({ keepalive = false } = {}) {
  if (!queue.length || !API) return
  const events = queue
  queue = []
  clearTimeout(timer)
  timer = null
  try {
    fetch(`${API}/events/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
      ...(keepalive ? { keepalive: true } : {}),
    }).catch(() => {})
  } catch {
    /* Nothing. See the module docstring. */
  }
}

/** Record one thing. Never awaits, never throws. */
export function track(name, props = {}) {
  try {
    queue.push({
      name,
      path: cleanPath(window.location.hash),
      visit_id: visitId(),
      props,
      platform: /android/i.test(navigator.userAgent)
        ? 'android'
        : /iphone|ipad/i.test(navigator.userAgent)
          ? 'ios'
          : 'web',
      app: SIDE,
    })
    /* The cap is the point: a runaway loop calling track() should cost a
       few dropped events, not memory. */
    if (queue.length >= MAX_QUEUE) return flush()
    if (!timer) timer = setTimeout(flush, FLUSH_MS)
  } catch {
    /* Nothing. */
  }
}

export function trackPageView() {
  track('page_view')
}

/** Start listening. Called once from the app shell. */
export function startAnalytics() {
  if (!API) return () => {}
  trackPageView()
  const onHash = () => trackPageView()
  const onLeave = () => flush({ keepalive: true })
  window.addEventListener('hashchange', onHash)
  window.addEventListener('pagehide', onLeave)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onLeave()
  })
  return () => {
    window.removeEventListener('hashchange', onHash)
    window.removeEventListener('pagehide', onLeave)
    flush({ keepalive: true })
  }
}
