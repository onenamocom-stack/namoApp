/* ─────────────────────────────────────────────────────────────────────────────
   RETIRED — the shop-quote Edge Function.
   Commented out 21 Sep 2026 when phase 10 moved onto the Django API, kept
   rather than deleted so the behaviour it encoded stays readable.

   Replaced by: apps/shop/ — POST /v1/shop/quote/ (flat rate; Shiprocket not ported)

   COMMENTING THIS OUT DID NOT TURN IT OFF. If this is an Edge Function it
   may still be deployed and still answering; `supabase functions delete`
   is what stops it. Nothing calls it — the client makes no PostgREST or
   functions.invoke() call at all (HANDOFF §18, §21).

   Do NOT redeploy from this file. Every line below is commented, so a
   deploy would ship an empty function. To restore, strip the leading
   "// " from the body — git history has the original.
   ───────────────────────────────────────────────────────────────────────── */

// // Phase 10. Prices delivery for one cart to one address, and stores the price.
// //
// // The browser gets back a quote id and the amount to SHOW. Checkout takes the
// // id and reads the amount from `shipping_quotes` itself, so the delivery
// // charge never round-trips through the client (backend/INSTRUCTIONS.md rule 3).
// //
// // Where the rate comes from, in order:
// //   1. Shiprocket, if SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD are set — the
// //      cheapest courier that serves the pincode. UNTESTED: written against
// //      their documented serviceability API before an account existed.
// //   2. SHIPPING_FLAT_PAISE, the stand-in until then.
// //   3. Neither: refuse. A defaulted delivery price on production is a charge
// //      nobody decided.
// // Connecting Shiprocket is therefore setting two secrets. No code change.
//
// import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
// import { createClient } from 'jsr:@supabase/supabase-js@2'
//
// const PAGES_ORIGIN = Deno.env.get('PAGES_ORIGIN') ?? 'https://1namo.com'
// const QUOTE_TTL_MS = 30 * 60 * 1000
// const MAX_QTY = 10
//
// /** Same allowlist as razorpay-order. */
// function cors(origin: string | null) {
//   const allowed =
//     origin &&
//     (origin === PAGES_ORIGIN || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))
//   return {
//     'Access-Control-Allow-Origin': allowed ? origin : PAGES_ORIGIN,
//     'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
//     'Access-Control-Allow-Methods': 'POST, OPTIONS',
//   }
// }
//
// function reply(body: unknown, status: number, headers: Record<string, string>) {
//   return new Response(JSON.stringify(body), {
//     status,
//     headers: { ...headers, 'Content-Type': 'application/json' },
//   })
// }
//
// type Rate = { amountPaise: number; courier: string | null; etdDays: number | null }
//
// // A Shiprocket token lives ten days. Held per isolate, refreshed after nine.
// let srToken: { value: string; until: number } | null = null
//
// async function shiprocketRate(pincode: string, grams: number): Promise<Rate | null> {
//   const email = Deno.env.get('SHIPROCKET_EMAIL')
//   const password = Deno.env.get('SHIPROCKET_PASSWORD')
//   if (!email || !password) return null
//
//   if (!srToken || srToken.until < Date.now()) {
//     const login = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ email, password }),
//     })
//     if (!login.ok) throw new Error(`shiprocket login ${login.status}`)
//     srToken = { value: (await login.json()).token, until: Date.now() + 9 * 86_400_000 }
//   }
//
//   const pickup = Deno.env.get('SHIP_PICKUP_PINCODE') ?? '201011'
//   const url = new URL('https://apiv2.shiprocket.in/v1/external/courier/serviceability/')
//   url.search = new URLSearchParams({
//     pickup_postcode: pickup,
//     delivery_postcode: pincode,
//     weight: String(grams / 1000), // kilograms
//     cod: '0',
//   }).toString()
//
//   const res = await fetch(url, { headers: { Authorization: `Bearer ${srToken.value}` } })
//   if (!res.ok) throw new Error(`shiprocket serviceability ${res.status}`)
//   const couriers: any[] = (await res.json())?.data?.available_courier_companies ?? []
//   if (!couriers.length) return { amountPaise: -1, courier: null, etdDays: null } // not serviceable
//
//   const cheapest = couriers.reduce((a, b) => (Number(b.rate) < Number(a.rate) ? b : a))
//   return {
//     amountPaise: Math.round(Number(cheapest.rate) * 100), // Shiprocket quotes rupees
//     courier: cheapest.courier_name ?? null,
//     etdDays: Number.parseInt(cheapest.estimated_delivery_days, 10) || null,
//   }
// }
//
// function flatRate(): Rate | null {
//   const flat = Deno.env.get('SHIPPING_FLAT_PAISE')
//   if (flat === undefined || !/^\d+$/.test(flat)) return null
//   return { amountPaise: Number(flat), courier: null, etdDays: null }
// }
//
// Deno.serve(async (req) => {
//   const headers = cors(req.headers.get('Origin'))
//   if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
//   if (req.method !== 'POST') return reply({ ok: false, reason: 'Use POST.' }, 405, headers)
//
//   const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
//     global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
//   })
//   const {
//     data: { user },
//   } = await asCaller.auth.getUser()
//   if (!user) return reply({ ok: false, reason: 'Sign in to check delivery.' }, 401, headers)
//
//   let body: any
//   try {
//     body = await req.json()
//   } catch {
//     return reply({ ok: false, reason: 'That cart could not be read.' }, 400, headers)
//   }
//
//   // Merge repeats the way checkout does, so the weight here is the weight there.
//   const qty = new Map<string, number>()
//   for (const it of Array.isArray(body?.items) ? body.items : []) {
//     if (typeof it?.product_id !== 'string' || !Number.isInteger(it?.qty)) {
//       return reply({ ok: false, reason: 'That cart could not be read.' }, 400, headers)
//     }
//     qty.set(it.product_id, (qty.get(it.product_id) ?? 0) + it.qty)
//   }
//   if (!qty.size) return reply({ ok: false, reason: 'Your cart is empty.' }, 400, headers)
//   if ([...qty.values()].some((q) => q < 1 || q > MAX_QTY)) {
//     return reply({ ok: false, reason: 'You can order up to 10 of each item.' }, 400, headers)
//   }
//
//   // Read as the caller: RLS is what makes the address theirs.
//   const { data: addr } = await asCaller
//     .from('shipping_addresses')
//     .select('pincode')
//     .eq('id', body?.address_id ?? '')
//     .maybeSingle()
//   if (!addr) return reply({ ok: false, reason: 'Pick a delivery address.' }, 400, headers)
//
//   const { data: products, error: pErr } = await asCaller
//     .from('products')
//     .select('id, weight_grams')
//     .in('id', [...qty.keys()])
//   if (pErr || !products || products.length !== qty.size) {
//     return reply({ ok: false, reason: 'Something in your cart is no longer sold.' }, 400, headers)
//   }
//   const grams = products.reduce((n, p) => n + p.weight_grams * qty.get(p.id)!, 0)
//
//   let rate: Rate | null
//   try {
//     rate = (await shiprocketRate(addr.pincode, grams)) ?? flatRate()
//   } catch (err) {
//     console.error('[quote]', (err as Error).message)
//     return reply({ ok: false, reason: 'Could not price delivery right now. Try again.' }, 502, headers)
//   }
//   if (!rate) {
//     console.error('[quote] not configured: set SHIPROCKET_EMAIL/PASSWORD or SHIPPING_FLAT_PAISE')
//     return reply({ ok: false, reason: 'Delivery is not available yet.' }, 500, headers)
//   }
//   if (rate.amountPaise < 0) {
//     return reply({ ok: false, reason: `We do not deliver to ${addr.pincode} yet.` }, 200, headers)
//   }
//
//   const asServer = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
//   const { data: quote, error } = await asServer
//     .from('shipping_quotes')
//     .insert({
//       profile_id: user.id,
//       pincode: addr.pincode,
//       weight_grams: grams,
//       amount_paise: rate.amountPaise,
//       courier: rate.courier,
//       etd_days: rate.etdDays,
//       expires_at: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
//     })
//     .select('id, amount_paise, courier, etd_days')
//     .single()
//   if (error) {
//     console.error('[quote] could not store:', error.message)
//     return reply({ ok: false, reason: 'Could not price delivery right now. Try again.' }, 500, headers)
//   }
//
//   return reply({ ok: true, quote_id: quote.id, amount_paise: quote.amount_paise,
//                  courier: quote.courier, etd_days: quote.etd_days }, 200, headers)
// })
