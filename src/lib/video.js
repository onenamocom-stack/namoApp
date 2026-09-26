import { supabase } from './supabase.js'

const API_BASE = import.meta.env.VITE_DJANGO_API_URL

/**
 * A door into the call a paid session already bought.
 *
 * THE MONEY IS NOT HERE. `lib/chat.js` owns the session: requesting it,
 * accepting it, the heartbeat and ending it. This only asks for a room
 * and a token for a window that has already been paid for, so a failure
 * here means "could not open the call", never "the session is gone".
 *
 * The countdown on screen reads the SESSION's `expires_at`, never the
 * room's — the room's own expiry is a copy of it, and two clocks
 * disagreeing about somebody's money is the complaint this product has
 * already avoided once.
 */
async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

/** Returns {url, token, expiresAt, isOwner} or {ok:false, reason}. */
export async function joinCall(sessionId) {
  const token = await accessToken()
  if (!token) return { ok: false, reason: 'Sign in to continue' }
  try {
    const response = await fetch(`${API_BASE}/video/sessions/${sessionId}/join/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      return {
        ok: false,
        reason: data?.message || 'Could not open the call.',
        // The seeker reaches this screen before the consultant has
        // accepted, so the first ask is always refused. `retry` is what
        // tells waiting apart from refused — without it the screen asked
        // once, showed an error, and sat there while the meter ran.
        retry: data?.retry === true,
        status: data?.status ?? null,
      }
    }
    return {
      ok: true,
      url: data.url,
      token: data.token,
      expiresAt: data.expires_at,
      isOwner: data.is_owner,
    }
  } catch (err) {
    return { ok: false, reason: err.message || 'Could not reach the server.' }
  }
}

/**
 * The embeddable URL: the room, plus this person's token.
 *
 * Daily's prebuilt UI rather than their SDK, deliberately. The SDK buys
 * control over a layout nobody has asked for yet, and costs a dependency
 * plus every device-permission edge case we would then own. The iframe
 * arrives with mute, camera, a device picker and a leave button that all
 * already work on the phones people actually have.
 */
export function embedUrl({ url, token }) {
  if (!url) return null
  const joiner = url.includes('?') ? '&' : '?'
  return `${url}${joiner}t=${encodeURIComponent(token)}`
}

/** m:ss, from the session's own expiry. */
export function timeLeft(expiresAt) {
  const end = new Date(expiresAt).getTime()
  if (Number.isNaN(end)) return null
  const seconds = Math.max(0, Math.round((end - Date.now()) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
