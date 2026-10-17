/**
 * The Market's sellers, against `/v1/market/` (15 Oct 2026, Phase 17).
 *
 * A Pro or a Creator lists a download, a course, an event or a product; an
 * admin approves it; it shows on the Market and on the seller's profile.
 * A paid one is bought at PhonePe through the wallet's `payOnline('listing',
 * id)`; a free one is taken here. The price is never sent — the server
 * reads it off the listing.
 */

import { supabase } from './supabase.js'
import { payOnline } from './wallet.js'

const API = import.meta.env.VITE_DJANGO_API_URL

async function token() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

async function call(path, { method = 'GET', body } = {}) {
  const jwt = await token()
  const response = await fetch(`${API}/market${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(data?.message || firstError(data) || `Request failed (${response.status})`)
    error.status = response.status
    throw error
  }
  return data
}

/* A serializer's 400 is {field: [sentence]}; the form shows the first. */
function firstError(data) {
  if (!data || typeof data !== 'object') return null
  const v = Object.values(data)[0]
  return Array.isArray(v) ? String(v[0]) : typeof v === 'string' ? v : null
}

export const KINDS = {
  download: { label: 'Download', plural: 'Downloads', tile: ':ebooks' },
  course: { label: 'Course', plural: 'Courses', tile: ':courses' },
  event: { label: 'Event', plural: 'Events', tile: ':events' },
  product: { label: 'Product', plural: 'Products', tile: null },
}

/** Approved listings; `kind` and `seller` narrow them. */
export async function browse({ kind, seller } = {}) {
  const q = new URLSearchParams()
  if (kind) q.set('kind', kind)
  if (seller) q.set('seller', seller)
  return (await call(`/listings/${q.toString() ? `?${q}` : ''}`)) ?? []
}

/** One listing as its page needs it, or null. */
export async function listing(id) {
  try {
    return await call(`/listings/${id}/`)
  } catch (err) {
    if (err.status === 404) return null
    throw err
  }
}

/** The file, the lessons or the joining link — for an owner. */
export function access(id) {
  return call(`/listings/${id}/access/`)
}

export async function previewLesson(id, index) {
  return (await call(`/listings/${id}/preview/${index}/`)).url
}

/**
 * Get it: free is taken; paid opens PhonePe. Resolves {ok, closed?,
 * unconfirmed?, reason?} as `payOnline` does.
 */
export async function get(row, { prefill } = {}) {
  if (!row.price_paise) {
    try {
      await call(`/listings/${row.id}/take/`, { method: 'POST' })
      return { ok: true }
    } catch (err) {
      return { ok: false, reason: err.message }
    }
  }
  return payOnline('listing', row.id, { prefill, description: row.title })
}

// ── the seller's side ──────────────────────────────────────────────────────

export function mine() {
  return call('/me/listings/')
}

export function create(data) {
  return call('/me/listings/', { method: 'POST', body: data })
}

export function update(id, data) {
  return call(`/me/listings/${id}/`, { method: 'PUT', body: data })
}

export function withdraw(id) {
  return call(`/me/listings/${id}/`, { method: 'DELETE' })
}

export function earnings() {
  return call('/me/earnings/')
}

/** One period of your Market earnings (16 Oct 2026): totals, by kind, the
 *  last seven days, the sales, and `listings` — the same period by listing. */
export function earningsPeriod(range) {
  return call(`/me/earnings/period/?range=${range}`)
}

export function bank() {
  return call('/me/bank/')
}

export function saveBank(data) {
  return call('/me/bank/', { method: 'PUT', body: data })
}

/** "₹1,499" from paise; "Free" for 0. */
export function priceText(paise) {
  return paise ? `₹${(paise / 100).toLocaleString('en-IN')}` : 'Free'
}
