/**
 * Alerts.
 *
 * POLLING, NOT PUSH — and that is this codebase's existing answer rather
 * than a shortcut taken here. `src/lib/chat.js` says it at the top: the
 * Supabase Realtime subscriptions became pollers at the cutover, and
 * WebSocket delivery is a later phase (docs/07 §6 step 7). Chat has run
 * on a three-second poll since. Alerts are far less urgent than a
 * message arriving mid-conversation, so this polls slower.
 *
 * The Alerts tab read seven hard-coded strings out of `mock.js` until
 * today — the same seven for every account, forever.
 */
import { supabase } from './supabase.js'

const API_BASE = import.meta.env.VITE_DJANGO_API_URL

/* Fifteen seconds. An alert is something you find when you look, not
   something you are interrupted by — and a three-second poll on every
   open tab is a lot of requests to learn nothing happened. */
export const POLL_MS = 15_000

async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

async function api(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(data?.message || `Request failed (${response.status})`)
    error.status = response.status
    throw error
  }
  return data
}

/** The list, newest first, with the unread count beside it. */
export async function fetchAlerts({ limit = 50 } = {}) {
  const token = await accessToken()
  if (!token) return { items: [], unread: 0 }
  try {
    return await api(`/notifications/?limit=${limit}`, { token })
  } catch (err) {
    console.error('[alerts] load failed:', err?.message)
    return { items: [], unread: 0 }
  }
}

/**
 * Poll for alerts. Returns an unsubscribe function, the same shape the
 * chat pollers return, so a screen can swap one for the other.
 */
export function subscribeToAlerts(onUpdate) {
  let alive = true
  let timer = null

  const tick = async () => {
    if (!alive) return
    const payload = await fetchAlerts()
    if (alive) onUpdate(payload)
    if (alive) timer = setTimeout(tick, POLL_MS)
  }
  tick()

  return () => {
    alive = false
    if (timer) clearTimeout(timer)
  }
}

/** No ids means all of them — opening the tab is the usual case. */
export async function markRead(ids = null) {
  const token = await accessToken()
  if (!token) return null
  try {
    return await api('/notifications/read/', {
      method: 'POST', token, body: ids ? { ids } : {},
    })
  } catch (err) {
    console.error('[alerts] mark read failed:', err?.message)
    return null
  }
}

/** "3m", "2h", "5d" — the same clock the feed uses. */
export function ago(iso) {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const mins = Math.max(0, Math.round((Date.now() - then) / 60_000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}
