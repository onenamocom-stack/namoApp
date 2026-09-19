/**
 * CUTOVER — module 7 (chat): replace src/lib/chat.js with this file, set
 * VITE_DJANGO_API_URL, deploy the API then the client.
 *
 * A drop-in rewrite of src/lib/chat.js with the identical exported surface
 * and semantics — requestChat, acceptChat, endChat, heartbeat, listSessions,
 * listThreads, listMessages, sendMessage, markRead, subscribeToThread,
 * subscribeToMySessions, subscribeToRequests, clock — against the Django
 * API instead of Supabase PostgREST + Realtime:
 *
 *   POST {API}/chat/sessions/request/            -> requestChat; still no
 *                                                 rate in the body (rule 3)
 *   GET  {API}/chat/sessions/                    -> listSessions; the
 *                                                 consultant's queue is
 *                                                 this list filtered
 *                                                 client-side, as today
 *   POST {API}/chat/sessions/<id>/accept/        -> acceptChat; the hold
 *   POST {API}/chat/sessions/<id>/end/           -> endChat; idempotent
 *   POST {API}/chat/sessions/<id>/heartbeat/     -> heartbeat; seconds_left
 *                                                 and rate_paise, the room's
 *                                                 meter
 *   GET  {API}/chat/threads/                     -> listThreads; the
 *                                                 threads_view shape (names,
 *                                                 unread, live_session_id)
 *   GET  {API}/chat/threads/<id>/messages/       -> listMessages; oldest
 *                                                 first
 *       ?after=<message id>&limit=<n>            -> the POLLING CURSOR: every
 *                                                 row strictly after the
 *                                                 anchor's (created_at, id)
 *                                                 — no gaps, no duplicates
 *                                                 while new messages land
 *   POST {API}/chat/threads/<id>/messages/send/  -> sendMessage; {body}
 *                                                 only, sender is the JWT
 *   POST {API}/chat/threads/<id>/read/           -> markRead
 *
 * ── POLLING REPLACES SUBSCRIPTIONS ──────────────────────────────────────────
 * The Supabase build receives new messages and session events through
 * supabase.channel('postgres_changes') subscriptions (Realtime). The
 * Django API is plain REST, and the plan's stated M1 transport is REST as
 * the source of truth (docs/07 §6 step 7: Channels/WebSocket delivery is a
 * LATER phase, after cutover). So the three subscriptions become pollers
 * that return an unsubscribe function, exactly like the Realtime ones did —
 * every screen that imports this file is untouched:
 *
 *   subscribeToThread      polls messages?after=<last seen id> every
 *                          MESSAGE_POLL_MS (3s). New rows are delivered
 *                          through onMessage one by one; the screens' merge
 *                          logic already de-dupes by id, so a poll
 *                          overlapping the screen's own listMessages fetch
 *                          cannot duplicate. The first poll takes the full
 *                          transcript and primes the cursor.
 *   subscribeToMySessions  polls listSessions every SESSIONS_POLL_MS (5s)
 *                          and fires onChange only when the payload
 *                          changes — how the seeker's room learns the
 *                          consultant JOINED (the thread appears) or the
 *                          session was swept, the two events `015`
 *                          published sessions to Realtime for.
 *   subscribeToRequests    the same poll for the consultant's queue: a
 *                          request nobody sees for thirty seconds is a
 *                          seeker who has left, so 5s — the honest M1
 *                          trade of polling vs the Realtime push it
 *                          replaces. Push delivery is the later phase.
 *
 * The heartbeat cadence is unchanged and screen-driven: the room asks the
 * server every tenth 1s tick, and the server's seconds_left always wins.
 *
 * Auth is unchanged: the JWT is still Supabase-issued, read off the
 * existing supabase-js session; identity stays in Supabase Auth
 * (docs/07 §1). Business refusals arrive as 200 + {ok:false, reason} —
 * byte-parity with the PostgREST RPC contract; the transcript read of a
 * non-participant is a 403 and maps to an empty list, exactly like an RLS
 * refusal did. A failed heartbeat still answers {ok:false, unreachable:
 * true, seconds_left:null} so the room never tears its meter down on one
 * dropped packet while the server keeps billing.
 *
 * sendMessage attaches a per-call Idempotency-Key so a client-side retry of
 * the same send replays rather than double-posts (the server's middleware
 * stores 2xx responses under (key, user)).
 */

import { supabase } from './supabase.js'

const API_BASE = import.meta.env.VITE_DJANGO_API_URL // e.g. https://api.example.com/v1

/** The polling cadences. 3s inside an open conversation, 5s for the session
 *  lists (a new chat request is the most latency-sensitive poll). */
const MESSAGE_POLL_MS = 3000
const SESSIONS_POLL_MS = 5000

/** The Supabase access token off the existing session; null when signed out. */
async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

async function api(path, { method = 'GET', body, idempotencyKey } = {}) {
  const token = await accessToken()
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Cutover-Module': 'chat',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(data?.message || `Request failed (${response.status})`)
    error.status = response.status
    error.body = data
    throw error
  }
  return data
}

/* ── the session RPCs ─────────────────────────────────────────────────────────
 * Every answer is the server's own {ok, reason}: a refusal is shown in the
 * words the server chose, exactly as under PostgREST. */

/** Ask for a chat. Costs nothing — the meter starts when the consultant joins. */
export async function requestChat(consultantId, serviceId) {
  try {
    return await api('/chat/sessions/request/', {
      method: 'POST',
      body: { consultant_id: consultantId, service_id: serviceId },
    })
  } catch (err) {
    console.error('[chat] request failed:', err.message)
    return { ok: false, reason: 'Could not reach the consultant. Try again.' }
  }
}

/** The consultant's join. This is where the hold is taken and the clock starts. */
export async function acceptChat(sessionId) {
  try {
    return await api(`/chat/sessions/${sessionId}/accept/`, { method: 'POST' })
  } catch (err) {
    console.error('[chat] accept failed:', err.message)
    return { ok: false, reason: 'Could not start that session. Try again.' }
  }
}

/** Either party may end it. Idempotent — both sides pressing End is normal. */
export async function endChat(sessionId) {
  try {
    return await api(`/chat/sessions/${sessionId}/end/`, { method: 'POST' })
  } catch (err) {
    console.error('[chat] end failed:', err.message)
    return { ok: false, reason: 'Could not close that session.' }
  }
}

/**
 * Says "still here" and asks how long is left.
 *
 * It does NOT advance the meter and cannot extend anything — the cutoff is
 * `expires_at` on the server. A failed REQUEST is not an ended session:
 * `live` is left UNDEFINED here (unreachable: true) so the caller can tell
 * "the server says it is over" from "I could not ask" — the room must not
 * tear its meter down on one dropped packet while the server keeps billing.
 */
export async function heartbeat(sessionId) {
  try {
    return await api(`/chat/sessions/${sessionId}/heartbeat/`, { method: 'POST' })
  } catch (err) {
    return { ok: false, unreachable: true, seconds_left: null }
  }
}

/* ── the read side ──────────────────────────────────────────────────────────── */

/** My sessions, either side of them, newest first — the seeker's history
 *  and the consultant's queue (filtered client-side, as today) in one read. */
export async function listSessions() {
  try {
    return await api('/chat/sessions/')
  } catch (err) {
    console.error('[chat] sessions load failed:', err.message)
    return []
  }
}

/** The thread list, carrying the other party's name, the unread count and
 *  the live session id — the threads_view shape, unchanged. */
export async function listThreads() {
  try {
    return await api('/chat/threads/')
  } catch (err) {
    console.error('[chat] threads load failed:', err.message)
    return []
  }
}

/** The transcript, oldest first. The polling cursor lives in
 *  subscribeToThread; this is the whole-conversation load the screen runs
 *  on open. */
export async function listMessages(threadId) {
  try {
    return await api(`/chat/threads/${threadId}/messages/`)
  } catch (err) {
    console.error('[chat] messages load failed:', err.message)
    return []
  }
}

/* ── the one write ──────────────────────────────────────────────────────────── */

/**
 * Send. Bounded by the live-session gate server-side: outside a paid window
 * the server refuses with its own sentence and this returns {ok:false,
 * reason} — it is the meter having stopped, not a network failure. The
 * inserted row comes back so the sender renders it immediately rather than
 * waiting for the next poll.
 */
export async function sendMessage(threadId, body) {
  const text = body.trim()
  if (!text) return { ok: false, reason: '' }
  try {
    return await api(`/chat/threads/${threadId}/messages/send/`, {
      method: 'POST',
      body: { body: text },
      idempotencyKey: crypto.randomUUID(), // a retried send replays, never double-posts
    })
  } catch (err) {
    console.error('[chat] send failed:', err.message)
    return { ok: false, reason: 'That session has ended. Start another to reply.' }
  }
}

/** Mark the other party's messages read. Own side untouched — the unread
 *  badge clears for the opener only. The server stamps read_at with its own
 *  clock; this sends no time and no id. */
export async function markRead(threadId) {
  try {
    await api(`/chat/threads/${threadId}/read/`, { method: 'POST' })
  } catch (err) {
    console.error('[chat] mark read failed:', err.message)
  }
}

/* ── polling, where subscriptions used to be ──────────────────────────────────
 * Each returns an unsubscribe function — call it on unmount, or the poller
 * outlives the panel and the same message arrives twice. See the header for
 * the cadences and why (M1 transport: REST is the source of truth; push
 * delivery is a later phase). */

/**
 * New messages in this thread, polled with a cursor.
 *
 * The first poll loads the transcript and primes the cursor; every poll
 * after asks for rows strictly after the last one delivered. The screens
 * merge by id, so overlap with their own listMessages fetch cannot
 * duplicate; the keyset cursor cannot gap.
 */
export function subscribeToThread(threadId, onMessage) {
  let lastId = null
  let stopped = false
  let timer = null

  const poll = async () => {
    if (stopped) return
    try {
      const path = lastId
        ? `/chat/threads/${threadId}/messages/?after=${lastId}`
        : `/chat/threads/${threadId}/messages/`
      const rows = await api(path)
      for (const row of rows) {
        onMessage(row) // the screen de-dupes by id
        lastId = row.id
      }
    } catch (err) {
      if (err.status !== 403) console.error('[chat] thread poll failed:', err.message)
      // A 403 means this thread is no longer ours to read; polling on would
      // just log. Everything else retries next beat.
    }
    if (!stopped) timer = setTimeout(poll, MESSAGE_POLL_MS)
  }

  poll()
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}

/**
 * A seeker's own sessions, polled. This is how the room learns the
 * consultant has JOINED — the thread does not exist until accept — and that
 * the session has been swept. Fires only when the list actually changes.
 */
export function subscribeToMySessions(seekerId, onChange) {
  return _pollSessions(onChange)
}

/** A consultant's incoming requests — the ones waiting for an accept. The
 *  queue is listSessions filtered client-side, exactly as the current
 *  screen does it. */
export function subscribeToRequests(consultantId, onChange) {
  return _pollSessions(onChange)
}

function _pollSessions(onChange) {
  let last = null
  let stopped = false
  let timer = null

  const poll = async () => {
    if (stopped) return
    try {
      const rows = await api('/chat/sessions/')
      const fingerprint = JSON.stringify(rows)
      if (last !== null && fingerprint !== last) onChange({})
      last = fingerprint
    } catch (err) {
      console.error('[chat] sessions poll failed:', err.message)
    }
    if (!stopped) timer = setTimeout(poll, SESSIONS_POLL_MS)
  }

  poll()
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}

/** `mm:ss` from seconds. The room shows this ticking down, because a charge
 *  nobody can see accruing is a charge that gets disputed. Unchanged. */
export function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
