// Phase 3. Opens a Razorpay order so the browser can start checkout.
//
// This function does NOT credit anything. It writes a 'created' row, which is
// the only record tying a Razorpay order id to one of our profiles — the
// webhook reads it back to decide whose wallet a captured payment belongs to.
// Attribution therefore never round-trips through the client.
//
// The client picks what it wants to PAY, which is not a number it benefits
// from (backend/INSTRUCTIONS.md rule 3) — the credit comes from what Razorpay
// reports was captured, not from anything sent here. The band below is the
// PRD's, in docs/01-PRD.md §4.8, and is enforced here because the browser's
// copy of it is a convenience.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const MIN_PAISE = 10_000 //     ₹100
const MAX_PAISE = 10_000_000 // ₹1,00,000

// The deployed site's origin, for the CORS allowlist below. A function secret
// rather than a constant: phase 5 adds more Edge Functions that need the same
// value, and it must be set per Supabase project (dev and production both).
// Falls back to the production domain if the secret is unset.
const PAGES_ORIGIN = Deno.env.get('PAGES_ORIGIN') ?? 'https://1namo.com'

/** Explicit list, never a wildcard (docs/02-TRD.md §11). The dev server picks
 *  a free port each run, so localhost is matched by shape rather than listed. */
function cors(origin: string | null) {
  const allowed =
    origin &&
    (origin === PAGES_ORIGIN || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))
  return {
    'Access-Control-Allow-Origin': allowed ? origin : PAGES_ORIGIN,
    // `apikey` and `x-client-info` are not optional: supabase-js sends both on
    // every functions.invoke(), so a list without them fails the preflight and
    // the request never leaves the browser. It surfaces as "Failed to send a
    // request to the Edge Function", which reads like the function is down.
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

/** A refusal the interface can show, in the app's voice — second person,
 *  present tense, no hedging (backend/INSTRUCTIONS.md §2). */
function refuse(reason: string, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify({ ok: false, reason }), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get('Origin'))

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (req.method !== 'POST') return refuse('Use POST.', 405, headers)

  const keyId = Deno.env.get('RAZORPAY_KEY_ID')
  const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET')
  if (!keyId || !keySecret) {
    // Named individually. "one of these two is missing" sent someone to the
    // wrong dashboard page once already; the log is the only place that can
    // say which, because the refusal the user sees must not describe our
    // configuration.
    console.error(
      '[order] not configured:',
      [!keyId && 'RAZORPAY_KEY_ID', !keySecret && 'RAZORPAY_KEY_SECRET'].filter(Boolean).join(' and '),
    )
    return refuse('Payments are not configured yet.', 500, headers)
  }

  const authorization = req.headers.get('Authorization') ?? ''
  const asCaller = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },
  )
  const {
    data: { user },
  } = await asCaller.auth.getUser()
  if (!user) return refuse('Sign in to add money.', 401, headers)

  let amountPaise: unknown
  try {
    amountPaise = (await req.json())?.amount_paise
  } catch {
    return refuse('That amount is not something we can charge.', 400, headers)
  }

  if (
    typeof amountPaise !== 'number' ||
    !Number.isInteger(amountPaise) ||
    amountPaise < MIN_PAISE ||
    amountPaise > MAX_PAISE
  ) {
    return refuse('Add between ₹100 and ₹1,00,000.', 400, headers)
  }

  const created = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: 'INR',
      // Read by a person reconciling in the Razorpay dashboard, never by this
      // system — the webhook attributes through the 'created' row below.
      notes: { profile_id: user.id },
    }),
  })

  if (!created.ok) {
    console.error('[order] razorpay refused:', created.status, await created.text())
    return refuse('Could not reach the payment provider. Try again.', 502, headers)
  }

  const order = await created.json()

  // Service role, because `payments` has no write policy for anybody.
  const asServer = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { error } = await asServer.from('payments').insert({
    profile_id: user.id,
    provider_order_id: order.id,
    amount_paise: amountPaise,
    status: 'created',
  })

  // Fail before checkout opens rather than after. A payment whose order row is
  // missing cannot be attributed, and the webhook will refuse to credit it —
  // better the person never reaches the card form than pays into nothing.
  if (error) {
    console.error('[order] could not record order:', error.message)
    return refuse('Could not start that payment. Try again.', 500, headers)
  }

  return new Response(
    JSON.stringify({ ok: true, order_id: order.id, amount_paise: amountPaise, key_id: keyId }),
    { headers: { ...headers, 'Content-Type': 'application/json' } },
  )
})
