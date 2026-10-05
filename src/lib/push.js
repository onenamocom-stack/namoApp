import { supabase } from './supabase.js'

/**
 * Let this phone ring for calls (6 Oct 2026) — the consultant app only.
 *
 * `enablePush()` asks for notification permission (call it from a tap: a
 * browser shows the prompt only in answer to one), registers public/sw.js,
 * subscribes with the server's public key and hands the subscription to
 * the API. `keepPushFresh()` does the same without asking, for an app that
 * already has permission — a phone whose subscription was rotated by the
 * browser re-registers on its next launch.
 *
 * Both answer with a word, never throw: 'granted', 'denied', 'default'
 * (dismissed), 'unsupported' (an old browser, or iPhone Safari outside an
 * installed app), or 'failed'.
 */
const API = import.meta.env.VITE_DJANGO_API_URL

async function token() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

async function call(path, { method = 'GET', body } = {}) {
  const t = await token()
  if (!t) throw new Error('signed out')
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!r.ok) throw new Error(`push ${r.status}`)
  return r.json()
}

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function keyBytes(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function register() {
  const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
  await navigator.serviceWorker.ready
  const { key } = await call('/notifications/push/key/')
  if (!key) return 'failed'
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) })
  }
  await call('/notifications/push/subscribe/', { method: 'POST', body: sub.toJSON() })
  return 'granted'
}

export async function enablePush() {
  if (!pushSupported()) return 'unsupported'
  try {
    const answer = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    if (answer !== 'granted') return answer
    return await register()
  } catch (err) {
    console.error('[push] enable failed:', err?.message)
    return 'failed'
  }
}

export async function keepPushFresh() {
  if (!pushSupported() || Notification.permission !== 'granted') return null
  try {
    return await register()
  } catch (err) {
    console.error('[push] refresh failed:', err?.message)
    return 'failed'
  }
}
