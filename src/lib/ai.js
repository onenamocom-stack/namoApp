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
 * ── THE PRICE ───────────────────────────────────────────────────────────────
 * ₹9 a question, and `state.price_paise` carries it so the panel can say
 * so BEFORE anybody is charged. Nobody should meet a debit as a surprise.
 *
 * A failed answer is refunded by the server. The client does not have to
 * arrange that and must not try — it shows the refusal and the money is
 * already back.
 */

import { supabase } from './supabase.js'

const API = import.meta.env.VITE_DJANGO_API_URL

async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

async function api(path, { method = 'GET', body, keepalive = false } = {}) {
  const token = await accessToken()
  const response = await fetch(`${API}/ai${path}`, {
    method,
    /* Set only on the way out of the page: it lets the request outlive the
       document, which is what makes the settle-on-leave land. */
    ...(keepalive ? { keepalive: true } : {}),
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
/** `subject` is somebody else's birth details, typed by the seeker. It is
 *  sent with EVERY question about that person rather than once, because the
 *  server stores none of it — the conversation here is the only place it
 *  lives, and a reload is meant to lose it. */
export function ask(question, subject = null) {
  return api('/ask/', {
    method: 'POST',
    body: subject ? { question, subject } : { question },
  })
}

/* startSession, heartbeat, endSession and `ticker` lived here and are
   gone (23 Sep). Billing is ₹9 a QUESTION now, so there is no clock to
   start, nothing to settle, and no meter for a closing tab to leave
   running. git show 6419773 has them if per-minute ever comes back. */


