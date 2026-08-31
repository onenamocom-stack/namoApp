// Phase 3. The only path by which money enters a wallet.
//
// Deployed with verify_jwt = false, because Razorpay is not a signed-in user
// and cannot present a Supabase JWT. The signature IS the authentication:
// nothing in the body is parsed, trusted or acted on until the HMAC matches
// (backend/INSTRUCTIONS.md rule 6).
//
// Idempotency is not implemented here. It is the unique index on
// provider_payment_id, inside payment_capture(), which rolls the credit back
// with the duplicate event row in one transaction. An application-level "have
// I seen this?" check in this file would race with its own write.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const HANDLED: Record<string, 'captured' | 'failed'> = {
  'payment.captured': 'captured',
  'payment.failed': 'failed',
}

async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Constant time. A `===` on a signature leaks how many leading bytes were
 *  right, one request at a time. */
function sameSignature(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Use POST.', { status: 405 })

  const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET')
  if (!secret) {
    console.error('[webhook] RAZORPAY_WEBHOOK_SECRET is not set')
    return new Response('Not configured.', { status: 500 })
  }

  // The RAW body, byte for byte. Parsing and re-serialising changes key order
  // and whitespace, and the signature is over the exact bytes Razorpay sent.
  const raw = await req.text()
  const signature = req.headers.get('x-razorpay-signature') ?? ''

  if (!sameSignature(signature, await hmacHex(secret, raw))) {
    console.error('[webhook] signature did not match; body ignored')
    return new Response('Bad signature.', { status: 401 })
  }

  // Only past this line is anything in the body worth reading.
  let event: any
  try {
    event = JSON.parse(raw)
  } catch {
    return new Response('Bad payload.', { status: 400 })
  }

  const status = HANDLED[event?.event]
  // 200, deliberately. An event we do not handle is not a failure, and a
  // non-2xx would have Razorpay retrying it until it gave up.
  if (!status) return new Response('Ignored.', { status: 200 })

  const payment = event?.payload?.payment?.entity
  if (!payment?.id || !payment?.order_id) {
    console.error('[webhook] %s carried no payment entity', event.event)
    return new Response('Bad payload.', { status: 400 })
  }

  const asServer = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data, error } = await asServer.rpc('payment_capture', {
    p_event_id: req.headers.get('x-razorpay-event-id'),
    p_order_id: payment.order_id,
    p_payment_id: payment.id,
    // Razorpay denominates in paise, which is what this system stores.
    p_amount_paise: payment.amount,
    p_status: status,
    p_raw: event,
  })

  // 500 so Razorpay retries. The failure modes here are an unattributable
  // order or a database that is down, and both are worth another delivery.
  if (error) {
    console.error('[webhook] payment_capture failed:', error.message)
    return new Response('Could not record that payment.', { status: 500 })
  }

  console.log('[webhook] %s %s duplicate=%s', status, payment.id, data?.duplicate)
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
