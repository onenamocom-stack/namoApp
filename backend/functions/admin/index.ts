/* ─────────────────────────────────────────────────────────────────────────────
   RETIRED — the admin Edge Function.
   Commented out 21 Sep 2026 when phase 10 moved onto the Django API, kept
   rather than deleted so the behaviour it encoded stays readable.

   Replaced by: the Django console (namo-console, HANDOFF §22), behind its
   own login. Shop refunds and the Academy actions are not in it yet (§24).

   COMMENTING THIS OUT DID NOT TURN IT OFF. If this is an Edge Function it
   may still be deployed and still answering; `supabase functions delete`
   is what stops it. Nothing calls it — the client makes no PostgREST or
   functions.invoke() call at all (HANDOFF §18, §24).

   Do NOT redeploy from this file. Every line below is commented, so a
   deploy would ship an empty function. To restore, strip the leading
   "// " from the body — git history has the original.
   ───────────────────────────────────────────────────────────────────────── */

// // Phase 13's elevated path (docs/02-TRD.md §7): shop orders and the Academy.
// //
// // The ONLY thing holding the service role on behalf of a person. Every
// // request proves who it is (a Supabase session, same phone OTP as the app),
// // then that it is an active row in `admin_users`, then that its tier allows
// // the action — and only then touches anything. Nothing here relies on RLS,
// // because the service role bypasses it: the checks below are the whole gate.
// //
// // Every write goes through a SQL function that writes its `admin_actions` row
// // in the same transaction (030).
// //
// // The console runs on localhost only for now, so that is the CORS allowlist.
// // Hosting it somewhere is a line here and a decision, not an accident.
//
// import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
// import { createClient } from 'jsr:@supabase/supabase-js@2'
//
// const TIERS = ['support', 'fulfilment', 'finance', 'superadmin'] as const
// type Tier = (typeof TIERS)[number]
//
// /** The least tier each action needs. A tier includes everything below it. */
// const NEEDS: Record<string, Tier> = {
//   whoami: 'support',
//   'shop.orders': 'support',
//   'shop.ship': 'fulfilment',
//   'shop.deliver': 'fulfilment',
//   'shop.refund': 'finance',
//   'academy.list': 'support',
//   'academy.refund': 'finance',
//   'academy.cancel_event': 'finance',
// }
//
// function cors(origin: string | null) {
//   const allowed = origin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
//   return {
//     'Access-Control-Allow-Origin': allowed ? origin : 'http://localhost',
//     'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
//     'Access-Control-Allow-Methods': 'POST, OPTIONS',
//   }
// }
//
// Deno.serve(async (req) => {
//   const headers = { ...cors(req.headers.get('Origin')), 'Content-Type': 'application/json' }
//   const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })
//
//   if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
//   if (req.method !== 'POST') return reply({ ok: false, reason: 'Use POST.' }, 405)
//
//   const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
//     global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
//   })
//   const {
//     data: { user },
//   } = await asCaller.auth.getUser()
//   if (!user) return reply({ ok: false, reason: 'Sign in.' }, 401)
//
//   const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
//
//   const { data: admin } = await db
//     .from('admin_users')
//     .select('profile_id, tier, active, profiles(name, phone)')
//     .eq('profile_id', user.id)
//     .maybeSingle()
//   // The same answer for "not an admin" and "deactivated": neither is told
//   // anything about the console.
//   if (!admin?.active) return reply({ ok: false, reason: 'This account is not an admin.' }, 403)
//
//   let body: any
//   try {
//     body = await req.json()
//   } catch {
//     return reply({ ok: false, reason: 'Bad request.' }, 400)
//   }
//
//   const action = String(body?.action ?? '')
//   const needs = NEEDS[action]
//   if (!needs) return reply({ ok: false, reason: `Unknown action ${action}.` }, 400)
//   if (TIERS.indexOf(admin.tier) < TIERS.indexOf(needs)) {
//     return reply({ ok: false, reason: `Your tier (${admin.tier}) cannot do that.` }, 403)
//   }
//
//   const fail = (where: string, error: { message: string }) => {
//     console.error(`[admin] ${action} ${where}:`, error.message)
//     return reply({ ok: false, reason: 'Something went wrong. Try again.' }, 500)
//   }
//
//   const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
//   if (action.startsWith('shop.') && action !== 'shop.orders' && !UUID.test(String(body.order_id ?? ''))) {
//     return reply({ ok: false, reason: 'That is not an order id.' }, 400)
//   }
//   if (action === 'academy.refund' && !UUID.test(String(body.order_id ?? ''))) {
//     return reply({ ok: false, reason: 'That is not an order id.' }, 400)
//   }
//   if (action === 'academy.cancel_event' && !UUID.test(String(body.event_id ?? ''))) {
//     return reply({ ok: false, reason: 'That is not an event id.' }, 400)
//   }
//
//   switch (action) {
//     case 'whoami':
//       return reply({ ok: true, tier: admin.tier, name: (admin as any).profiles?.name ?? null })
//
//     case 'shop.orders': {
//       // Newest first. 300 is weeks of orders at launch volume; paginate when
//       // it is not.
//       const { data, error } = await db
//         .from('shipments')
//         .select(
//           'status, courier, awb, shipping_paise, address, weight_grams, shipped_at, delivered_at, ' +
//             'orders!inner(id, status, total_paise, created_at, expires_at, profile_id, ' +
//             'profiles(name, phone), order_items(id, item_type, title, qty, unit_price_paise, tax_rate_bps))',
//         )
//         // Most recently touched first, so a fresh order and a fresh change
//         // both surface inside the limit; re-sorted by order date below.
//         .order('updated_at', { ascending: false })
//         .limit(300)
//       if (error) return fail('list', error)
//       const rows = (data as any[])
//         .map((s) => ({ ...s, order: s.orders, orders: undefined }))
//         .sort((a, b) => b.order.created_at.localeCompare(a.order.created_at))
//       return reply({ ok: true, orders: rows })
//     }
//
//     case 'shop.ship':
//     case 'shop.deliver': {
//       const { data, error } = await db.rpc('admin_shipment_update', {
//         p_admin: admin.profile_id,
//         p_order_id: String(body.order_id ?? ''),
//         p_status: action === 'shop.ship' ? 'shipped' : 'delivered',
//         p_courier: body.courier ?? null,
//         p_awb: body.awb ?? null,
//       })
//       if (error) return fail('update', error)
//       return reply(data)
//     }
//
//     case 'shop.refund': {
//       const { data, error } = await db.rpc('admin_order_refund', {
//         p_admin: admin.profile_id,
//         p_order_id: String(body.order_id ?? ''),
//         p_reason: body.reason ?? null,
//         p_restock: body.restock === true,
//       })
//       if (error) return fail('refund', error)
//       return reply(data)
//     }
//
//     case 'academy.list': {
//       // Upcoming and recent events, every course, and the newest 300
//       // enrolments with who and what they paid. Titles are joined here.
//       const [events, courses, enrolments] = await Promise.all([
//         db.from('academy_events').select('id, title, host, kind, starts_at, seats, seats_left, price_paise, status, active')
//           .order('starts_at', { ascending: false }).limit(100),
//         db.from('courses').select('id, title, tutor, price_paise, active').order('sort'),
//         db.from('enrolments').select('id, item_type, item_id, status, created_at, profiles(name, phone), orders(id, status, total_paise)')
//           .order('created_at', { ascending: false }).limit(300),
//       ])
//       const error = events.error || courses.error || enrolments.error
//       if (error) return fail('academy list', error)
//       return reply({ ok: true, events: events.data, courses: courses.data, enrolments: enrolments.data })
//     }
//
//     case 'academy.refund': {
//       // 030 refund, which 031 taught to refund an Academy order and remove access.
//       const { data, error } = await db.rpc('admin_order_refund', {
//         p_admin: admin.profile_id,
//         p_order_id: String(body.order_id),
//         p_reason: body.reason ?? null,
//         p_restock: false,
//       })
//       if (error) return fail('academy refund', error)
//       return reply(data)
//     }
//
//     case 'academy.cancel_event': {
//       const { data, error } = await db.rpc('admin_event_cancel', {
//         p_admin: admin.profile_id,
//         p_event_id: String(body.event_id),
//         p_reason: body.reason ?? null,
//       })
//       if (error) return fail('cancel event', error)
//       return reply(data)
//     }
//   }
//   return reply({ ok: false, reason: 'Unhandled.' }, 400)
// })
