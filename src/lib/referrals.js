/**
 * Referral codes, affiliate links and cashback.
 *
 * TWO PROGRAMMES, AND THEY ARE NOT THE SAME THING — the server enforces
 * the difference, this file only has to render it:
 *
 *   N… a seeker's code       typed at sign-up. Both sides get extra free
 *                            AI questions for three days. No money.
 *   A… a consultant's code   used at shop checkout on a FIRST order.
 *                            Both sides get 10% back, after delivery.
 *
 * THE 10% IS CASHBACK, NEVER A DISCOUNT. The order is paid in full and
 * the money arrives afterwards as wallet credit. Nothing here may render
 * it as "₹X off" — that would be a different offer, and a worse one for
 * everybody including the seeker, who can spend cashback on a reading.
 */
import { supabase } from './supabase.js'

const API_BASE = import.meta.env.VITE_DJANGO_API_URL

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
    const error = new Error(data?.message || `Request failed (${response.status})`)
    error.status = response.status
    error.body = data
    throw error
  }
  return data
}

/** The caller's own codes, minted on first ask. */
export async function myCodes() {
  const token = await accessToken()
  if (!token) return null
  try {
    return await api('/referrals/me/', { token })
  } catch (err) {
    console.error('[referrals] codes failed:', err?.message)
    return null
  }
}

/**
 * Claim somebody's sign-up code. Once per account, ever.
 * Returns the server's refusal sentence rather than inventing one.
 */
export async function claimCode(code) {
  const token = await accessToken()
  if (!token) throw new Error('Sign in to continue')
  return api('/referrals/claim/', { method: 'POST', token, body: { code } })
}

/**
 * A shareable link with the consultant's code already in it.
 *
 * The SERVER builds the URL. These get pasted into WhatsApp and live for
 * months, so the shape of one is a contract — a link built by string
 * concatenation in this file is one that cannot be corrected later
 * without breaking every link already shared.
 */
export async function affiliateLink(productId = null) {
  const token = await accessToken()
  if (!token) return null
  try {
    return await api('/referrals/link/', {
      method: 'POST',
      token,
      body: productId ? { product_id: productId } : {},
    })
  } catch (err) {
    console.error('[referrals] link failed:', err?.message)
    return null
  }
}

/** What is owed and what has landed. Both sides read the same shape. */
export async function myCashback() {
  const token = await accessToken()
  if (!token) return null
  try {
    return await api('/referrals/earnings/', { token })
  } catch (err) {
    console.error('[referrals] cashback failed:', err?.message)
    return null
  }
}

/**
 * Is this a referral code rather than a shop coupon?
 *
 * Used only to change what the basket SAYS before it is sent — "10% back
 * after delivery" instead of "10% off". The server decides what it
 * actually is; guessing wrong here costs a wrong label for one render,
 * never a wrong price.
 */
export function looksLikeReferral(code) {
  return /^[NA][23456789ABCDEFGHJKMNPQRSTUVWXYZ]{7}$/i.test((code || '').trim())
}
