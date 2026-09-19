/**
 * CUTOVER — module 2 (reactions): replace src/lib/reactions.js with this
 * file, set VITE_DJANGO_API_URL, deploy API then client.
 *
 * A drop-in rewrite of src/lib/reactions.js with the identical exported
 * surface and semantics — parseKey, fetchMine, setReaction — against the
 * Django API instead of Supabase PostgREST:
 *
 *   GET    {API}/reactions/                 -> own rows (what fetchMine reads)
 *   POST   {API}/reactions/                 -> toggle on, idempotent by the
 *                                              (actor, target, kind) unique key
 *   DELETE {API}/reactions/                 -> toggle off, owner-scoped
 *   GET    {API}/reactions/counts/?...      -> public aggregates
 *
 * Auth is unchanged: the JWT is still Supabase-issued, read off the existing
 * supabase-js session. Identity stays in Supabase Auth (docs/07 §1).
 *
 * Behaviour parity notes:
 *   - setReaction(key, on) still returns false for keys this table cannot
 *     hold (mock IDs, preferences) and for signed-out visitors; those stay
 *     local flags exactly as before.
 *   - Doubling a reaction on is the same row server-side — the API answers
 *     200/201 both times, so there is nothing to swallow the way the old
 *     client's 23505 was. Real failures (network, 4xx) still throw, and
 *     store.jsx's optimistic rollback catches them exactly as it does today.
 *   - Refusals arrive in the app's {ok, reason, message} envelope; we throw
 *     the human-readable `message` so the store's console.error line and
 *     rollback read the same as they did under Supabase errors.
 */

import { supabase } from './supabase.js'

const API_BASE = import.meta.env.VITE_DJANGO_API_URL // e.g. https://api.example.com/v1

const KINDS = {
  follow: 'consultant',
  followp: 'profile',
  save: 'content',
  like: 'content',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `'follow:9f2c…'` → `{ kind, targetType, targetId }`, or null when the key is
 * not a reaction this table can hold. Byte-identical to the Supabase version —
 * every toggleFlag call site keeps working untouched.
 */
export function parseKey(key) {
  const at = key.indexOf(':')
  if (at < 0) return null

  const kind = key.slice(0, at)
  const targetId = key.slice(at + 1)
  const targetType = KINDS[kind]

  if (!targetType || !UUID.test(targetId)) return null
  return { kind, targetType, targetId }
}

/** The Supabase access token off the existing session; null when signed out. */
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
    // { ok, reason, message } envelope — throw the message, like the old
    // `throw error` did with supabase-js.
    throw new Error(data?.message || `Request failed (${response.status})`)
  }
  return data
}

/** Every reaction this user has, as the store's namespaced strings. */
export async function fetchMine() {
  const token = await accessToken()
  if (!token) return []

  const rows = await api('/reactions/', { token })
  return (rows ?? []).map((r) => `${r.kind}:${r.target_id}`)
}

/**
 * Write one reaction on or off. Same contract as before: `on` is passed in
 * (the store already flipped its own copy), returns true when the row caught
 * up, false when the key is not persistable or nobody is signed in. Throws on
 * real failures so the store rolls its optimistic Set back.
 */
export async function setReaction(key, on) {
  const parsed = parseKey(key)
  if (!parsed) return false

  const token = await accessToken()
  if (!token) return false

  const { kind, targetType, targetId } = parsed

  await api('/reactions/', {
    method: on ? 'POST' : 'DELETE',
    body: { target_type: targetType, target_id: targetId, kind },
    token,
  })
  return true
}
