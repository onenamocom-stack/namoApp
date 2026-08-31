#!/usr/bin/env node
/**
 * Ask Razorpay what actually happened to every payment we never resolved.
 *
 * WHY THIS EXISTS. `payments` records intent and never records an expected
 * outcome, so a row stuck at `created` is byte-identical whether the person
 * wandered off the checkout or paid and got nothing. No query inside the
 * database can tell those apart. Only the provider knows, so the sweep has to
 * ask it.
 *
 * That gap is not theoretical: a captured payment was lost once, the webhook
 * deliveries bounced off a wrong secret, Razorpay gave up, and nothing
 * anywhere noticed. It was found by hand, days later. This is the thing that
 * would have caught it in one command.
 *
 * It is READ ONLY. It credits nothing and writes nothing — deliberately.
 * Crediting a wallet from a script is a mint, and the whole point of phase 3
 * is that only a signature-verified webhook moves money. What this prints is
 * a list for a person to act on.
 *
 * Usage — production:
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service role key> \
 *   RAZORPAY_KEY_ID=rzp_live_... RAZORPAY_KEY_SECRET=... \
 *   node backend/tools/reconcile-payments.mjs
 *
 * Run it after re-saving a webhook secret, after any Razorpay config change,
 * and before believing the first live payment worked.
 */

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
} = process.env

for (const [k, v] of Object.entries({
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
})) {
  if (!v) {
    console.error(`Missing ${k}. See the header of this file.`)
    process.exit(2)
  }
}

const rzpAuth = 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')
const live = RAZORPAY_KEY_ID.startsWith('rzp_live_')

/* Every attempt, so a `created` row can be matched against its own terminal
   sibling. One request; there are not many of these and there never will be
   many at once. */
const rows = await fetch(
  `${SUPABASE_URL}/rest/v1/payments?select=provider_order_id,provider_payment_id,status,amount_paise,profile_id,created_at&order=created_at.asc`,
  { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
).then((r) => r.json())

if (!Array.isArray(rows)) {
  console.error('Could not read payments:', rows)
  process.exit(1)
}

const terminal = new Set(
  rows.filter((r) => r.status !== 'created').map((r) => r.provider_order_id),
)
const unresolved = rows.filter((r) => r.status === 'created' && !terminal.has(r.provider_order_id))

console.log(`${rows.length} payment rows, ${unresolved.length} unresolved (${live ? 'LIVE' : 'test'} keys)\n`)

const owed = []

for (const row of unresolved) {
  const res = await fetch(`https://api.razorpay.com/v1/orders/${row.provider_order_id}/payments`, {
    headers: { authorization: rzpAuth },
  })
  if (!res.ok) {
    console.log(`  ?  ${row.provider_order_id}  Razorpay said ${res.status} — check by hand`)
    continue
  }
  const items = (await res.json()).items ?? []
  const captured = items.filter((p) => p.status === 'captured' || p.status === 'authorized')
  const rupees = (p) => `₹${(p / 100).toLocaleString('en-IN')}`

  if (captured.length) {
    // The case this file exists for: their money left, ours never arrived.
    owed.push({ row, captured })
    for (const p of captured) {
      console.log(`  !! ${row.provider_order_id}  ${p.id} ${p.status} ${rupees(p.amount)}  NOT CREDITED`)
    }
  } else if (items.length) {
    const why = items[items.length - 1].error_description ?? 'failed'
    console.log(`  ok ${row.provider_order_id}  ${items.length} attempt(s), all failed — ${why}`)
  } else {
    console.log(`  ok ${row.provider_order_id}  no payment attempts — checkout abandoned`)
  }
}

if (!owed.length) {
  console.log('\nNothing owed. Every unresolved order was abandoned or failed at Razorpay.')
  process.exit(0)
}

const total = owed.reduce((n, o) => n + o.captured.reduce((m, p) => m + p.amount, 0), 0)
console.log(`\n${owed.length} PAYMENT(S) TAKEN AND NOT CREDITED — ₹${(total / 100).toLocaleString('en-IN')}`)
console.log(`
These people paid and received nothing. This script will not credit them:
only a signature-verified webhook moves money, and a script that mints
would undo the reason phase 3 is shaped the way it is.

Two things, in order:
  1. Find out WHY the webhook did not land — a wrong or rotated secret, a
     deleted webhook (Razorpay's Status toggle deletes rather than disables),
     or an unsubscribed event. Fix that first, or the next one is lost too.
  2. Credit each person by hand with the ledger-insert recipe at the foot of
     backend/schema/003_wallets_ledger.sql, noting the payment id in the note.
`)
process.exit(1)
