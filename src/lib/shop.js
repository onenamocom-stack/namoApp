/**
 * The shop, against the Django API.
 *
 *   GET  {API}/shop/        -> the catalogue
 *   POST {API}/shop/buy/    -> one purchase
 *
 * ── WHAT THIS REPLACES ──────────────────────────────────────────────────────
 * `src/data/mock.js`. The Shop screen read eleven hard-coded products from
 * a JavaScript file, which meant the console could add a product and the
 * app would never show it — and that `buyNow` debited the wallet without
 * touching stock, so a sold-out gemstone could be bought forever.
 *
 * ── WHAT THIS FILE DOES NOT DECIDE ──────────────────────────────────────────
 * The price. It is not in the request body at all — the server reads it
 * off the product row at the moment of purchase (rule 3). Nor whether
 * something is in stock: the badge below is drawn from the last read, and
 * the ONLY authority is the refusal that comes back from a buy.
 *
 * ── AND WHY THAT MATTERS ────────────────────────────────────────────────────
 * Two people can tap Buy on the last item in the same tick. The client
 * cannot prevent that and must not pretend to. It renders what it was
 * last told, sends the attempt, and shows whichever answer comes back —
 * one of them gets "Out of stock", and that sentence is the server's.
 */

import { supabase } from './supabase.js'

const API = import.meta.env.VITE_DJANGO_API_URL

async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

async function api(path, { method = 'GET', body } = {}) {
  const token = await accessToken()
  const response = await fetch(`${API}/shop${path}`, {
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

/** Paise to rupees at the boundary, once, so no screen divides.
 *
 *  The field names are the ones Shop.jsx already reads — `name`,
 *  `subtitle`, `category`, `price`, `mrp`, `soldOut`. Matching the shape
 *  the screen expects rather than inventing a better one keeps the change
 *  to the screen small, and a small diff on a money path is worth more
 *  than tidier keys.
 */
function toProduct(row) {
  return {
    id: row.id,
    name: row.name,
    subtitle: row.subtitle,
    category: row.category,
    subcategory: row.subcategory,
    price: row.price_paise / 100,
    mrp: row.mrp_paise ? row.mrp_paise / 100 : null,
    image: row.image_url || null,
    stock: row.stock,
    // The screen's existing flag. It is a RENDER hint and never a
    // decision: the last read can be stale by the time somebody taps, and
    // the only authority on whether an item is available is the refusal
    // that comes back from a buy.
    soldOut: !row.in_stock,
    featured: row.featured,
    /* `recommendedBy` was a mock field naming a consultant who had
       endorsed the product. No table holds it, so it is null until one
       does — a name invented here would be a fabricated endorsement, on a
       real person, attached to something for sale. */
    recommendedBy: null,
  }
}

/** Anonymous on purpose: a shopfront a signed-out visitor can browse. */
export async function fetchProducts() {
  const rows = await api('/')
  return (rows ?? []).map(toProduct)
}

/**
 * Buy. Resolves to {ok:true, order_id, total_paise, balance_paise} or
 * {ok:false, reason} — a refusal is an answer, not an exception, and
 * `reason` is the server's sentence shown verbatim.
 */
export function buy(lines, coupon = null) {
  return api('/buy/', {
    method: 'POST',
    body: { lines, ...(coupon ? { coupon } : {}) },
  })
}
