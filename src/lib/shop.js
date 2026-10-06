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
    sku: row.sku ?? null,
    slug: row.slug || null,
    name: row.name,
    subtitle: row.subtitle,
    brand: row.brand || '',
    category: row.category,
    subcategory: row.subcategory,
    price: row.price_paise / 100,
    mrp: row.mrp_paise ? row.mrp_paise / 100 : null,
    image: row.image_url || null,
    // The cover then the gallery, photos and videos (6 Oct 2026).
    media: row.media ?? (row.image_url ? [{ url: row.image_url, kind: 'image' }] : []),
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

/** The categories and their subcategories, in the console's names and
 *  order (6 Oct 2026: they were a list in this app's code, so a rename in
 *  the console emptied its own tile). [{id, name, subcategories:[name]}] */
export async function fetchCategories() {
  return (await api('/categories/')) ?? []
}

/** One product's page, by slug or id: the card's fields plus description,
 *  faq [{q, a}], seo_title and seo_description. null when it is not in the
 *  shop. */
export async function fetchProduct(key) {
  try {
    const row = await api(`/p/${encodeURIComponent(key)}/`)
    if (!row?.id) return null
    return {
      ...toProduct(row),
      description: row.description || '',
      faq: row.faq ?? [],
      seoTitle: row.seo_title || row.name,
      seoDescription: row.seo_description || '',
    }
  } catch (err) {
    if (err.status !== 404) throw err
    /* Not found — or an API from before this endpoint existed (the app
       and the API deploy separately). Look in the catalogue, so a card
       still opens a page with what the list knows. */
    const all = await fetchProducts()
    const hit = all.find((p) => p.id === key || p.slug === key)
    return hit ? { ...hit, description: '', faq: [], seoTitle: hit.name, seoDescription: hit.subtitle || '' } : null
  }
}

/** The page address for a product: its slug when it has one. */
export function productHref(p) {
  return `/shop/p/${encodeURIComponent(p.slug || p.id)}`
}

/**
 * Buy. Resolves to {ok:true, order_id, total_paise, balance_paise} or
 * {ok:false, reason} — a refusal is an answer, not an exception, and
 * `reason` is the server's sentence shown verbatim.
 */
export function buy(lines, coupon = null, delivery = null) {
  return api('/buy/', {
    method: 'POST',
    body: {
      lines,
      ...(coupon ? { coupon } : {}),
      ...(delivery ? { address_id: delivery.addressId, quote_id: delivery.quoteId } : {}),
    },
  })
}

/* ── delivery (5 Oct 2026) ───────────────────────────────────────────────
 * The fee is the server's: `quote` returns a quote id and an amount, and
 * Buy names the id. A doctored amount buys nothing — there is no amount
 * in the Buy body to doctor. */

/** Saved addresses, newest first. */
export async function fetchAddresses() {
  const data = await api('/addresses/')
  return data?.items ?? []
}

/** {ok:true, address} or {ok:false, reason}. */
export function saveAddress(address) {
  return api('/addresses/', { method: 'POST', body: address })
}

export function deleteAddress(id) {
  return api(`/addresses/${id}/`, { method: 'DELETE' })
}

/** {city, state} or null. Never throws: the seeker can type them. */
export async function lookupPincode(pin) {
  try {
    const data = await api(`/pincode/${pin}/`)
    return data?.place ?? null
  } catch {
    return null
  }
}

/** {ok, quote_id, amount_paise, courier, etd_days} or {ok:false, reason}. */
export function deliveryQuote(addressId, lines) {
  return api('/quote/', { method: 'POST', body: { address_id: addressId, lines } })
}

/** Send a paid parcel. Fire-and-forget after Buy; idempotent on the server,
 *  and the console finishes any that stop half-way. */
export function dispatchOrder(orderId) {
  return api(`/orders/${orderId}/dispatch/`, { method: 'POST' }).catch((err) => {
    console.error('[orders] dispatch:', err?.message)
  })
}

/**
 * What this person has bought. Newest first, products only.
 *
 * Products only is the server's decision and the right one: `orders`
 * also carries sessions and AI questions, and a shop history listing
 * "Namo AI · chat ₹9" beside a rudraksha would be a statement rather
 * than an order list. The wallet ledger is where money is read.
 */
export async function fetchOrders() {
  // `api` prefixes /shop and carries the token itself.
  if (!(await accessToken())) return []
  try {
    const data = await api('/orders/')
    return (data?.items ?? []).map((o) => ({
      id: o.id,
      placedAt: o.created_at,
      status: o.status,
      totalPaise: o.total_paise,
      items: (o.items ?? []).map((i) => ({
        title: i.title,
        qty: i.qty,
        unitPricePaise: i.unit_price_paise,
      })),
      shipment: o.shipment,
      // null when this order earned none, which is most of them. The
      // screen shows nothing at all in that case.
      cashback: o.cashback,
    }))
  } catch (err) {
    console.error('[orders] load failed:', err?.message)
    return []
  }
}
