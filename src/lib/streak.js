/**
 * The japa and sadhana streak, `/v1/bhakti/streak/` (14 Oct 2026, docs/06
 * Phase 15c). A day counts when a mantra's japa plays through to its count
 * in Bhakti, or an aarti begins in Darshan; days are IST.
 */
import { supabase } from './supabase.js'

const API_BASE = import.meta.env.VITE_DJANGO_API_URL

async function api(path, { method = 'GET', body } = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return null
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) return null
  return response.json().catch(() => null)
}

/** Count today. `kind` is 'japa' (with its rounds) or 'aarti'. Never
 *  throws: a missed mark costs a day's count, not the chant. Tells
 *  `onStreak` listeners, so an open profile updates. */
export async function markSadhana(kind, rounds = 1) {
  try {
    const s = await api('/bhakti/streak/', { method: 'POST', body: { kind, rounds } })
    if (s) window.dispatchEvent(new CustomEvent('namo-streak', { detail: s }))
    return s
  } catch {
    return null
  }
}

/** `{current, best, today}` for the caller, or `{current, best}` for
 *  somebody else; null when it cannot be read. */
export function fetchStreak(profileId = null) {
  return api(profileId ? `/bhakti/streak/${profileId}/` : '/bhakti/streak/').catch(() => null)
}
