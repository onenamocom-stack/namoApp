/**
 * CUTOVER — module 6 (consultants): replace src/lib/consultants.js with this
 * file, set VITE_DJANGO_API_URL, deploy the API then the client.
 *
 * A drop-in rewrite of src/lib/consultants.js with the identical exported
 * surface and semantics — listConsultants, getConsultant, listServices,
 * openSlots, listAvailability, setAvailability, listBookings,
 * listMyBookings, bookSession, decideBooking, istToday, weekdayOf,
 * nextDateFor, listEarnings — against the Django API instead of Supabase
 * PostgREST:
 *
 *   GET  {API}/consultants/                     -> the approved consultants,
 *                                                  shaped rows with services
 *   GET  {API}/consultants/<id>/                -> one, or null (a 404 is the
 *                                                  same answer as unapproved)
 *   GET  {API}/consultants/<id>/services/       -> the active price list
 *   GET  {API}/consultants/<id>/slots/?date=    -> the open slots; the
 *                                                  subtraction is the
 *                                                  server's, never rebuilt here
 *   GET/POST {API}/consultants/<id>/availability/...   -> the 7x6 grid
 *   GET  {API}/consultants/<id>/bookings/       -> the consultant's queue
 *   GET  {API}/consultants/bookings/mine/       -> the seeker's own bookings
 *   POST {API}/consultants/bookings/            -> bookSession; one
 *                                                  transaction server-side,
 *                                                  still no price in the body
 *   POST {API}/consultants/bookings/<id>/decide/ -> accept/decline; a decline
 *                                                  reverses the money in the
 *                                                  same transaction
 *   GET  {API}/consultants/<id>/earnings/       -> the consultant's book
 *
 * Plus three exports that did not exist before, for the call sites that
 * read tables this module now owns (they are part of THIS cutover, applied
 * in the same commit — see below):
 *   myConsultant()      -> store.jsx's refreshConsultant read of the raw
 *                          `consultants` table; /me/ answers it, pending row
 *                          included
 *   applyAsConsultant() -> ProApply's two writes (consultants INSERT +
 *                          consultant_services INSERTs) collapsed into one
 *                          server transaction (rule 5)
 *   listPriceBands()    -> ProApply's band picker read
 *
 * Auth is unchanged: the JWT is still Supabase-issued, read off the existing
 * supabase-js session. Identity stays in Supabase Auth (docs/07 §1).
 *
 * Behaviour parity notes:
 *   - shape() is byte-identical, including the fixed-sort and the 20-minute
 *     base price — the band prices arrive already 011-rounded from the
 *     server, and nothing here re-derives them.
 *   - startsAt still comes from openSlots untouched and goes back to
 *     bookSession unmodified — the browser never rebuilds a timestamp.
 *   - bookSession still returns the server's own { ok, reason }; a network
 *     failure still answers 'Could not reach the diary. Try again.' A
 *     per-call Idempotency-Key rides along so a retried create replays
 *     rather than double-books (the server's partial unique index is the
 *     backstop either way).
 *   - Refusals arrive in the app's { ok, reason, message } envelope where
 *     the HTTP status says so; the booking RPC keeps its JSON {ok, reason}
 *     contract, exactly as under PostgREST.
 *   - The same-commit client edits this cutover needs: store.jsx's
 *     refreshConsultant switches from .from('consultants') to
 *     myConsultant(); ProApply's submit switches to applyAsConsultant() and
 *     its band picker to listPriceBands(). No other screen changes — every
 *     screen imports this file and flips with it.
 */

import { supabase } from './supabase.js'

const API_BASE = import.meta.env.VITE_DJANGO_API_URL // e.g. https://api.example.com/v1

/** The Supabase access token off the existing session; null when signed out. */
async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

async function api(path, { method = 'GET', body, token, idempotencyKey } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Cutover-Module': 'consultants',
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

/* ── Shaping ─────────────────────────────────────────────────────────────────
 * Byte-identical to the Supabase version: `initials` and the fixed/perMinute
 * split are rendering, done here, and `pricePaise` is the 20-minute session
 * straight off the service rows — the one the whole app quotes against. */

function shape(row, services = []) {
  const fixed = services
    .filter((s) => s.billing === 'fixed')
    .sort((a, b) => a.duration_mins - b.duration_mins)
  const base = fixed.find((s) => s.duration_mins === 20) ?? fixed[0] ?? null
  const perMinute = services.find((s) => s.billing === 'per_minute') ?? null

  return {
    id: row.profile_id,
    name: row.name,
    initials: (row.name || '')
      .split(' ')
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase(),
    category: row.category,
    specialization: row.specialization ?? '',
    languages: row.languages ?? [],
    experienceYrs: row.experience_yrs,
    bio: row.bio ?? '',
    credentials: row.credentials ?? [],
    verified: row.verified,
    rating: row.rating_avg_cache,
    reviewCount: row.rating_count_cache,
    fixed,
    perMinute,
    pricePaise: base?.price_paise ?? null,
    perMinutePaise: perMinute?.price_paise ?? null,
  }
}

/** The approved consultants, best rating first. Anonymous, like the view. */
export async function listConsultants() {
  try {
    const rows = await api('/consultants/')
    return rows.map((r) => shape(r, r.services ?? []))
  } catch (err) {
    console.error('[consultants] list failed:', err?.message)
    return []
  }
}

/** One consultant, or null — the same answer for "no such id", "not approved
 *  yet" and "blocked" (the server's 404 is the view's predicate, so a typed
 *  URL cannot reach past it any more than it could under RLS). */
export async function getConsultant(id) {
  try {
    const row = await api(`/consultants/${id}/`)
    return shape(row, row.services ?? [])
  } catch (err) {
    if (err?.status === 404) return null
    console.error('[consultants] load failed:', err?.message)
    return null
  }
}

/** A consultant's price list. Paise, priced off a platform band, never typed. */
export async function listServices(id) {
  try {
    return await api(`/consultants/${id}/services/`)
  } catch (err) {
    console.error('[services] load failed:', err?.message)
    return []
  }
}

/** The open slots for one consultant on one date, as [{ slot, startsAt }].
 *  `startsAt` is the server's own timestamp, carried through untouched, and
 *  it is what bookSession hands back — the browser never rebuilds it from
 *  the date and the 'HH:MM'. */
export async function openSlots(id, isoDate) {
  try {
    const rows = await api(`/consultants/${id}/slots/?date=${isoDate}`)
    return rows.map((r) => ({ slot: r.slot_time.slice(0, 5), startsAt: r.starts_at }))
  } catch (err) {
    console.error('[slots] load failed:', err?.message)
    return []
  }
}

/** The consultant's own availability rules — the 7 x 6 grid. */
export async function listAvailability(id) {
  const token = await accessToken()
  try {
    const rows = await api(`/consultants/${id}/availability/`, { token })
    return rows.map((r) => ({ weekday: r.weekday, slot: r.slot_time.slice(0, 5) }))
  } catch (err) {
    console.error('[availability] load failed:', err?.message)
    return []
  }
}

/** One cell of the grid, on or off — one server-side INSERT or DELETE. */
export async function setAvailability(id, weekday, slot, open) {
  const token = await accessToken()
  try {
    await api(`/consultants/${id}/availability/set/`, {
      method: 'POST',
      body: { weekday, slot, open },
      token,
    })
    return true
  } catch (err) {
    console.error('[availability] write failed:', err?.message)
    return false
  }
}

/* ── Bookings ─────────────────────────────────────────────────────────────── */

/** Every booking on this consultant, newest slot first — carrying the
 *  seeker's name and birth details, which a reading cannot be done without. */
export async function listBookings(consultantId) {
  const token = await accessToken()
  try {
    return await api(`/consultants/${consultantId}/bookings/`, { token })
  } catch (err) {
    console.error('[bookings] load failed:', err?.message)
    return []
  }
}

/** Every booking this seeker has made, newest slot first. */
export async function listMyBookings() {
  const token = await accessToken()
  try {
    return await api('/consultants/bookings/mine/', { token })
  } catch (err) {
    console.error('[bookings] load failed:', err?.message)
    return []
  }
}

/**
 * Book a session. One call, one transaction on the server: the price lookup,
 * the slot claim, the wallet debit, both ledgers, the order and the booking.
 * Still NO PRICE in the body — the total the screen renders is for the
 * person reading it, never for the server (rule 3).
 *
 * Returns the server's own { ok, reason }, so a refusal shows in the words
 * the server chose. A fresh Idempotency-Key per call makes a retry replay
 * the first create instead of racing it.
 */
export async function bookSession(consultantId, serviceId, startsAt) {
  const token = await accessToken()
  try {
    return await api('/consultants/bookings/', {
      method: 'POST',
      body: {
        consultant_id: consultantId,
        service_id: serviceId,
        starts_at: startsAt,
      },
      token,
      idempotencyKey: crypto.randomUUID(),
    })
  } catch (err) {
    console.error('[bookings] booking failed:', err?.message)
    return { ok: false, reason: 'Could not reach the diary. Try again.' }
  }
}

/**
 * Accept or decline. A real status write, exactly the pending -> confirmed |
 * declined edge — tapping Accept twice cannot un-accept. A decline reverses
 * the money on the server, in the same transaction; there is deliberately no
 * second call here to forget.
 */
export async function decideBooking(id, status) {
  const token = await accessToken()
  try {
    const body = await api(`/consultants/bookings/${id}/decide/`, {
      method: 'POST',
      body: { status },
      token,
    })
    return body.ok === true
  } catch (err) {
    console.error('[bookings] decision failed:', err?.message)
    return false
  }
}

/* ── Dates ──────────────────────────────────────────────────────────────────
 * The app speaks "today" and "Thu"; the database speaks (weekday, time) and
 * dates. These three functions are the whole translation, unchanged — they
 * are client-side calendar arithmetic, not backend calls. */

/** Today in IST, as `YYYY-MM-DD`. The app is Indian; slot times are IST. */
export function istToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
}

/** `0 = Sunday … 6 = Saturday`, matching Postgres `dow` and the `weekday`
 *  column. Anchored at NOON UTC: noon is the same calendar day in every
 *  zone on earth, which is what keeps the grid from shifting a weekday. */
export function weekdayOf(isoDate) {
  return new Date(`${isoDate}T12:00:00Z`).getUTCDay()
}

/** The next date, today included, falling on this weekday. */
export function nextDateFor(weekday) {
  const today = istToday()
  const ahead = (weekday - weekdayOf(today) + 7) % 7
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + ahead)
  return d.toISOString().slice(0, 10)
}

/** The consultant's own book — gross, the platform's cut and net, one row
 *  per movement. A decline shows as two rows that cancel rather than
 *  disappearing. Paise. */
export async function listEarnings(consultantId) {
  const token = await accessToken()
  try {
    return await api(`/consultants/${consultantId}/earnings/`, { token })
  } catch (err) {
    console.error('[earnings] load failed:', err?.message)
    return []
  }
}

/* ── The caller's own consultant row (this module's cutover additions) ────── */

/** The signed-in user's `consultants` row, or null — the read store.jsx's
 *  refreshConsultant does against the raw table today. The pending row is
 *  included: it is the applicant's own row. A 404 is "not a consultant",
 *  the common case, not an error. */
export async function myConsultant() {
  const token = await accessToken()
  if (!token) return null
  try {
    return await api('/consultants/me/', { token })
  } catch (err) {
    if (err?.status === 404) return null
    console.error('[consultant] load failed:', err?.message)
    throw err // store.jsx's consultantError path needs the failure distinct
  }
}

/** The application, one transaction: the consultants row (status lands
 *  'pending' — the request cannot carry it) plus the chosen tier's service
 *  rows, priced BY COPYING the band rows server-side. Returns the row;
 *  a refusal throws with the server's message, which ProApply renders. */
export async function applyAsConsultant({ category, specialization, languages,
                                          experienceYrs, bio, credentials, tier }) {
  const token = await accessToken()
  return api('/consultants/apply/', {
    method: 'POST',
    body: {
      category,
      specialization,
      languages,
      experience_yrs: experienceYrs,
      bio,
      credentials,
      tier,
    },
    token,
  })
}

/** The active price catalogue, tier order — ProApply's six buttons. */
export async function listPriceBands() {
  try {
    return await api('/consultants/price-bands/')
  } catch (err) {
    console.error('[bands] load failed:', err?.message)
    throw err
  }
}
