import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

/**
 * Every shop call in one file (phase 10, `backend/schema/028_shop.sql`), on
 * the Django API since the move (`/v1/shop/`, backend-django/apps/shop).
 *
 * Nothing here sends a price. Checkout sends product ids and quantities, an
 * address id and a quote id; the server reads every number itself. The prices
 * this file hands to screens are for DISPLAY, and a cart total computed from
 * them is a preview the server will replace.
 *
 * The exports and what they return are unchanged from the Supabase version,
 * so no screen changed with the move.
 */

/* VITE_DJANGO_API_URL already carries the /v1 prefix — `${API}/v1/...` is
   the /v1/v1 404 that HANDOFF §18 records, which reads as an empty screen
   rather than an error. */
const API = import.meta.env.VITE_DJANGO_API_URL

/** `{ ok, status, data }` — never throws on a refusal; callers decide. */
async function api(path, { method = 'GET', body } = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json().catch(() => null)
  return { ok: response.ok, status: response.status, data }
}

/** The sentence to show: the API envelope's `message`, or a refusal's `reason`. */
function reasonOf(data, fallback) {
  return data?.message || data?.reason || fallback
}

function shapeProduct(row) {
  return {
    id: row.id,
    name: row.name,
    subtitle: row.subtitle ?? '',
    imageUrl: row.image_url,
    pricePaise: row.price_paise,
    mrpPaise: row.mrp_paise,
    stock: row.stock,
    soldOut: row.stock <= 0,
    featured: row.featured,
    category: row.category ?? '',
    subcategory: row.subcategory ?? null,
  }
}

/* One load per page view, shared by Shop and Home's product card. Cleared
   after a checkout, because stock just moved. */
let catalogueLoad = null

export function fetchCatalogue() {
  if (!catalogueLoad) {
    catalogueLoad = api('/shop/catalogue/').then(({ ok, status, data }) => {
      if (!ok) throw new Error(`catalogue ${status}`)
      return {
        categories: data.categories.map((c) => ({ name: c.name, subcategories: c.subcategories })),
        products: data.products.map(shapeProduct),
      }
    })
    catalogueLoad.catch(() => {
      catalogueLoad = null // a failed load retries on the next mount
    })
  }
  return catalogueLoad
}

export function refreshCatalogue() {
  catalogueLoad = null
}

/** `{ status: 'loading' | 'ready' | 'error', categories, products }` */
export function useCatalogue() {
  const [state, setState] = useState({ status: 'loading', categories: [], products: [] })
  useEffect(() => {
    let active = true
    fetchCatalogue()
      .then((c) => active && setState({ status: 'ready', ...c }))
      .catch((err) => {
        console.error('[shop] catalogue:', err.message)
        if (active) setState({ status: 'error', categories: [], products: [] })
      })
    return () => {
      active = false
    }
  }, [])
  return state
}

// ── Addresses ────────────────────────────────────────────────────────────────

export async function listAddresses() {
  const { ok, status, data } = await api('/shop/addresses/')
  if (!ok) throw new Error(`addresses ${status}`)
  return data
}

/** Returns the saved row, or throws with a message a person can act on. */
export async function saveAddress(fields) {
  const { ok, status, data } = await api('/shop/addresses/', { method: 'POST', body: fields })
  if (!ok) {
    console.error('[shop] address:', status)
    // A 400 carries the CHECK's sentence (phone or pincode shape).
    throw new Error(status === 400 ? reasonOf(data, 'Could not save that address.') : 'Could not save that address.')
  }
  return data
}

// ── Quote, checkout, cancel ─────────────────────────────────────────────────

const toItems = (cart) => cart.map((l) => ({ product_id: l.id, qty: l.qty }))

/** `{ ok, quote_id, amount_paise, courier, etd_days }` or `{ ok: false, reason }` */
export async function quoteDelivery(cart, addressId) {
  const { data, status } = await api('/shop/quote/', {
    method: 'POST',
    body: { items: toItems(cart), address_id: addressId },
  })
  if (data?.ok) return data
  console.error('[shop] quote:', status)
  return { ok: false, reason: reasonOf(data, 'Could not price delivery. Try again.') }
}

/** `pay` is 'wallet' or 'razorpay'. Returns the server's `{ ok, reason?, order_id?, status? }`. */
export async function checkout(cart, addressId, quoteId, pay) {
  const { ok, status, data } = await api('/shop/checkout/', {
    method: 'POST',
    body: { items: toItems(cart), address_id: addressId, quote_id: quoteId, pay },
  })
  if (!ok) {
    console.error('[shop] checkout:', status)
    return { ok: false, reason: 'Could not reach the shop. Try again.' }
  }
  return data
}

/** Your own pending order, cancelled so its stock (or seat) goes straight back. */
export async function cancelOrder(orderId) {
  const { ok, status } = await api(`/shop/orders/${orderId}/cancel/`, { method: 'POST' })
  if (!ok) console.error('[shop] cancel:', status)
}

export async function orderStatus(orderId) {
  const { ok, data } = await api(`/shop/orders/${orderId}/`)
  return ok ? data.status : null
}

// ── Orders ───────────────────────────────────────────────────────────────────

/** Shop orders only: an order with a shipment. Sessions are orders too. */
export async function listMyOrders() {
  const { ok, status, data } = await api('/shop/orders/')
  if (!ok) throw new Error(`orders ${status}`)
  return data.map((o) => ({
    id: o.id,
    createdAt: o.created_at,
    orderStatus: o.order_status,
    totalPaise: o.total_paise,
    shipmentStatus: o.shipment_status,
    courier: o.courier,
    awb: o.awb,
    address: o.address,
    lines: o.lines,
    shippingPaise: o.shipping_paise,
  }))
}
