/**
 * Namo AI — the client half.
 *
 *   GET  {API}/ai/                       -> state: transcript, quota, live session
 *   POST {API}/ai/ask/                   -> one question
 *   POST {API}/ai/session/               -> start the meter
 *   POST {API}/ai/session/<id>/heartbeat/-> seconds_left, for the clock
 *   POST {API}/ai/session/<id>/end/      -> settle
 *
 * ── WHAT THIS FILE DOES NOT DO ──────────────────────────────────────────────
 * It does not decide anything. Not whether a question is free, not what a
 * minute costs, not what the astrologer refuses to answer. Every one of
 * those is the server's (backend/INSTRUCTIONS.md rule 3) and the reason is
 * the same each time: the previous build kept the free-question counter in
 * React state, so a page reload handed out five more. A number the browser
 * owns is a number the browser can edit.
 *
 * Refusals arrive as 200 + {ok:false, reason} and the reason is rendered
 * verbatim. There are no refusal sentences in this file.
 *
 * ── THE CLOCK ───────────────────────────────────────────────────────────────
 * The meter is per-minute, so the seeker must be able to see it. `ticker`
 * counts down locally between heartbeats for smoothness and takes the
 * server's seconds_left as truth every time one lands — the same rule the
 * consultant room follows. A clock that drifts in the seeker's favour is a
 * bug; one that drifts the other way is a complaint.
 */

import { supabase } from './supabase.js'

const API = import.meta.env.VITE_DJANGO_API_URL

/** The server's number wins; this is only how often we ask for it. */
const HEARTBEAT_MS = 10_000

async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

async function api(path, { method = 'GET', body } = {}) {
  const token = await accessToken()
  const response = await fetch(`${API}/ai${path}`, {
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

/** Transcript, quota and any session already running. A tab reopened
 *  mid-session must find its meter rather than start a second one, which is
 *  why the live session comes back with the transcript and not separately. */
export function fetchState() {
  return api('/')
}

/** One question. Resolves to {ok:true, text, free_left} or {ok:false,
 *  reason, needs_session?} — a refusal is an answer, not an exception. */
export function ask(question) {
  return api('/ask/', { method: 'POST', body: { question } })
}

export function startSession() {
  return api('/session/', { method: 'POST' })
}

export function heartbeat(sessionId) {
  return api(`/session/${sessionId}/heartbeat/`, { method: 'POST' })
}

export function endSession(sessionId) {
  return api(`/session/${sessionId}/end/`, { method: 'POST' })
}

/**
 * The visible clock.
 *
 * Starts from the server's seconds_left, ticks down every second so the
 * number on screen moves, and re-asks the server every ten seconds. The
 * local tick is cosmetic: every heartbeat overwrites it, and when the
 * server says the session is over `onEnd` fires once and the ticker stops
 * itself. Returns its own stop function.
 *
 * Nothing here settles anything. The money is closed by the server — by the
 * seeker pressing End, or by the sweeper — because a browser that is
 * closed, asleep or offline cannot be the thing that ends a meter.
 */
export function ticker(sessionId, { seconds, onTick, onEnd }) {
  let left = seconds
  let stopped = false

  const stop = () => {
    stopped = true
    clearInterval(tick)
    clearInterval(beat)
  }

  const finish = () => {
    if (stopped) return
    stop()
    onEnd?.()
  }

  const tick = setInterval(() => {
    left = Math.max(0, left - 1)
    onTick?.(left)
    if (left === 0) finish()
  }, 1000)

  const beat = setInterval(async () => {
    try {
      const state = await heartbeat(sessionId)
      if (!state.live) return finish()
      left = state.seconds_left
      onTick?.(left)
    } catch {
      /* A dropped beat is not an ended session. The local tick keeps
         running and the next beat corrects it; the server is still
         holding the real clock and the sweeper is still behind it. */
    }
  }, HEARTBEAT_MS)

  onTick?.(left)
  return stop
}

/** m:ss, for the header. Not a duration library: this is the only place in
 *  the app that prints one. */
export function clock(seconds) {
  const s = Math.max(0, seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
