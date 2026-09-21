// Phase 10b, done-condition 2: two people cannot take an event's last seat at
// once. DEV ONLY — it signs in with the test OTP accounts. Same shape as
// shop-race.mjs, for the same reason: a THIRD connection holds the event row
// lock across the fire time, so every enrol queues on it and they contend
// when it lets go. Without that, a "race" is sequential in disguise.
//
//   1. A one-seat event on dev that neither test account is enrolled in, e.g.
//      the template's (fresh after academy.mjs; otherwise import a new slug):
//        update academy_events set seats = 1, seats_left = 1, status = 'scheduled'
//         where legacy_id = 'placeholder-last-seat';
//   2. FIRE = now + 45 s (epoch seconds). In the repo root:
//        node backend/tools/academy-race.mjs <event uuid> <FIRE>
//   3. Straight away, in the dev SQL editor (or the MCP), hold the lock:
//        do $$ begin
//          perform 1 from academy_events where legacy_id = 'placeholder-last-seat' for update;
//          perform pg_sleep_until(to_timestamp(<FIRE + 3>));
//        end $$;
//
// Pass: wins 1, fullRefusals 5, allSentBeforeFirstReturn true,
// allWaitedOnLock true. Then in SQL: seats_left 0, one active enrolment, one
// order, one ledger debit, and both ledgers replay.
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
const EVENT = process.argv[2], FIRE = Number(process.argv[3])
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
if (!env.VITE_SUPABASE_URL.includes('mrjsatelbuiypodeulcx')) throw new Error('not dev')
const log = (...a) => console.log(new Date().toISOString(), ...a)

async function racer(phone) {
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { error } = await sb.auth.verifyOtp({ phone, token: '123456', type: 'sms' })
  if (error) throw error
  return { sb, phone }
}

const racers = [await racer('+919999900001'), await racer('+919999900002')]
// Server clock from the Date header — this machine has had clock skew before.
const r = await fetch(env.VITE_SUPABASE_URL + '/rest/v1/', { headers: { apikey: env.VITE_SUPABASE_ANON_KEY } })
const offsetMs = new Date(r.headers.get('date')).getTime() + 500 - Date.now()
log('ready; server offset ms', offsetMs, 'fire in s', ((FIRE * 1000 - (Date.now() + offsetMs)) / 1000).toFixed(1))
if (FIRE * 1000 - (Date.now() + offsetMs) < 2000) throw new Error('too late to fire; rerun with a later FIRE')

// Warm the connection pool so only the sends race, not TLS handshakes.
await Promise.all(racers.flatMap((x) => Array.from({ length: 4 }, () => x.sb.from('academy_events').select('id').eq('id', EVENT))))
await new Promise((res) => setTimeout(res, FIRE * 1000 - (Date.now() + offsetMs)))

const t0 = Date.now()
const shots = racers.flatMap((x) => [0, 1, 2].map((i) => {
  const sent = Date.now() - t0
  return x.sb.rpc('academy_enrol', { p_item_type: 'event', p_item_id: EVENT, p_pay: 'wallet' })
    .then(({ data, error }) => ({ who: x.phone.slice(-1) + '#' + i, sent, ms: Date.now() - t0, res: data ?? { error: error.message } }))
}))
const out = await Promise.all(shots)
for (const o of out.sort((a, b) => a.ms - b.ms)) log(`${o.who} sent@${o.sent}ms back@${o.ms}ms`, JSON.stringify(o.res))
const wins = out.filter((o) => o.res.ok)
const full = out.filter((o) => o.res.ok === false && o.res.reason === 'That one is full')
const allSentBeforeFirstReturn = Math.max(...out.map((o) => o.sent)) < Math.min(...out.map((o) => o.ms))
const allWaited = out.every((o) => o.ms >= 1500)
console.log(JSON.stringify({ wins: wins.length, fullRefusals: full.length, other: out.length - wins.length - full.length, allSentBeforeFirstReturn, allWaitedOnLock: allWaited, winnerOrder: wins[0]?.res.order_id }))
