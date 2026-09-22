// Phase 10, done-condition 2: two people cannot buy the last unit at once.
// DEV ONLY — it signs in with the test OTP accounts.
//
// A race that is not contended proves nothing (HANDOFF §2, phase 5: both
// racers were refused by the pre-check, a sequential test in a concurrent
// costume). So a THIRD connection holds the product row lock across the fire
// time, every checkout queues on it, and they all contend when it lets go.
//
//   1. A stock-1 product on dev, e.g. legacy_id 'race:last-unit':
//        update products set stock = 1, active = true where legacy_id = 'race:last-unit';
//   2. FIRE = now + 45 s (epoch seconds). Start this, in the repo root:
//        node backend/tools/shop-race.mjs <product uuid> <FIRE>
//   3. Straight away, in the dev SQL editor (or the MCP), hold the lock:
//        do $$ begin
//          perform 1 from products where legacy_id = 'race:last-unit' for update;
//          perform pg_sleep_until(to_timestamp(<FIRE + 3>));
//        end $$;
//
// Pass: wins 1, stockRefusals 5, allSentBeforeFirstReturn true,
// allWaitedOnLock true. The last two are what make it a race. Then check in
// SQL that stock is 0, one order line exists, and both ledgers replay.
//
// Run 15 Sep 2026: all six sent within 2 ms, all waited ~3.1 s on the lock,
// returned within 3 ms of each other — 1 paid, 5 "Not enough stock", losers
// wrote nothing and their quotes stayed unspent.
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
const PRODUCT = process.argv[2], FIRE = Number(process.argv[3])
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()]}))
if (!env.VITE_SUPABASE_URL.includes('mrjsatelbuiypodeulcx')) throw new Error('not dev')
const log = (...a) => console.log(new Date().toISOString(), ...a)

async function racer(phone) {
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await sb.auth.verifyOtp({ phone, token: '123456', type: 'sms' })
  if (error) throw error
  let { data: addr } = await sb.from('shipping_addresses').select('id').limit(1).maybeSingle()
  if (!addr) ({ data: addr } = await sb.from('shipping_addresses').insert({ name: 'Race', phone: phone.slice(3), line1: '1 Race Rd', city: 'Pune', state: 'MH', pincode: '411001' }).select('id').single())
  const quotes = []
  for (let i = 0; i < 3; i++) {
    const { data: q } = await sb.functions.invoke('shop-quote', { body: { items: [{ product_id: PRODUCT, qty: 1 }], address_id: addr.id } })
    if (!q?.ok) throw new Error('quote failed ' + JSON.stringify(q))
    quotes.push(q.quote_id)
  }
  return { sb, phone, addr: addr.id, quotes, uid: data.user.id }
}

const racers = [await racer('+919999900001'), await racer('+919999900002')]
// Server clock from the Date header — this machine has had clock skew before.
const r = await fetch(env.VITE_SUPABASE_URL + '/rest/v1/', { headers: { apikey: env.VITE_SUPABASE_ANON_KEY } })
const offsetMs = new Date(r.headers.get('date')).getTime() + 500 - Date.now()
log('ready; server offset ms', offsetMs, 'fire in s', ((FIRE * 1000 - (Date.now() + offsetMs)) / 1000).toFixed(1))
if (FIRE * 1000 - (Date.now() + offsetMs) < 2000) throw new Error('too late to fire; rerun with a later FIRE')

// Warm the connection pool so only the sends race, not TLS handshakes.
await Promise.all(racers.flatMap((x) => Array.from({ length: 4 }, () => x.sb.from('products').select('id').eq('id', PRODUCT))))
await new Promise((res) => setTimeout(res, FIRE * 1000 - (Date.now() + offsetMs)))

const t0 = Date.now()
const shots = racers.flatMap((x) => x.quotes.map((quote, i) => {
  const sent = Date.now() - t0
  return x.sb.rpc('shop_checkout', { p_items: [{ product_id: PRODUCT, qty: 1 }], p_address_id: x.addr, p_quote_id: quote, p_pay: 'wallet' })
    .then(({ data, error }) => ({ who: x.phone.slice(-1) + '#' + i, sent, ms: Date.now() - t0, res: data ?? { error: error.message } }))
}))
const out = await Promise.all(shots)
for (const o of out.sort((a, b) => a.ms - b.ms)) log(`${o.who} sent@${o.sent}ms back@${o.ms}ms`, JSON.stringify(o.res))
const wins = out.filter((o) => o.res.ok)
const stockRefusals = out.filter((o) => o.res.ok === false && /^Not enough stock/.test(o.res.reason))
const allSentBeforeFirstReturn = Math.max(...out.map((o) => o.sent)) < Math.min(...out.map((o) => o.ms))
const allWaited = out.every((o) => o.ms >= 1500)
console.log(JSON.stringify({ wins: wins.length, stockRefusals: stockRefusals.length, other: out.length - wins.length - stockRefusals.length, allSentBeforeFirstReturn, allWaitedOnLock: allWaited, winnerOrder: wins[0]?.res.order_id }))
