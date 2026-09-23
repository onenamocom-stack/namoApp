/**
 * The tarot pull, against the API.
 *
 * Two calls and no cache. A pull is charged and its answer is written for
 * one question, so there is nothing here worth keeping between mounts —
 * unlike a chart, which is a fact about a birth.
 *
 * **The client does not choose the card.** It sends a deck and a question;
 * the server deals (`backend-django/apps/ai/tarot_decks.py`). Anything
 * about the draw that arrived from here could be retried until it flattered
 * the person reading it.
 */

import { supabase } from './supabase.js'

const API_BASE = import.meta.env.VITE_DJANGO_API_URL

const UNREACHABLE = {
  ok: false,
  reason: 'Could not reach the reader. Check your connection and try again.',
}

async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

async function call(path, body = null) {
  const token = await accessToken()
  if (!token) return { ok: false, code: 'signed_out', reason: 'Sign in to pull a card.' }

  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    return UNREACHABLE
  }

  let answer = null
  try {
    answer = await response.json()
  } catch {
    return UNREACHABLE
  }

  /* A refusal the server MEANT — no money, no deck, empty question — comes
     back 200 with ok:false and its own sentence, and is rendered as-is
     (backend/INSTRUCTIONS.md §2). Only a transport or validation failure
     becomes a code the screen branches on. */
  if (!response.ok) {
    return {
      ok: false,
      code: response.status === 401 ? 'signed_out' : 'invalid',
      reason: answer?.message ?? UNREACHABLE.reason,
    }
  }
  return answer ?? UNREACHABLE
}

/** Free pulls left this week, and what a paid one costs. */
export function tarotState() {
  return call('/ai/tarot/state/')
}

/** One card, read against one question. */
export function pullCard({ deck, question }) {
  return call('/ai/tarot/', { deck, question })
}

/** Paise as the screens print money. `rupees()` in the store is the general
 *  one; this is here so the screen does not import the store for a price it
 *  got from the server. */
export function priceLabel(paise) {
  return `₹${Math.round(paise / 100)}`
}
