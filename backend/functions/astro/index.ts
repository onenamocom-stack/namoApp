// Phase 7. The only thing in this system that talks to freeastroapi.com.
//
// WHY A FUNCTION AT ALL: the key is a secret (INSTRUCTIONS.md rule 7) and the
// browser must never hold it. But the secret is the smaller half. The bigger
// half is rule 3 — THE CLIENT SENDS NOTHING THAT DECIDES THE ANSWER. It sends
// an op and, for two of them, a date. Birth date, time, place, coordinates and
// zone are read here, from the caller's own row, so a chart cannot be asked for
// on somebody else's birth by editing a request body.
//
// AYANAMSA AND HOUSE SYSTEM ARE CONSTANTS IN THIS FILE and are merged into
// every outbound body below. There is no code path that omits them. This is the
// whole risk of the phase (docs/02-TRD.md §8): their defaults are theirs to
// change, a wrong ayanamsa renders a beautiful chart belonging to nobody, and
// nothing anywhere raises. Verified 2 Sep 2026 against the reference birth —
// our own spherical trig put the ascendant within 0.005° of theirs.
//
// verify_jwt stays ON. `geo` runs during onboarding, BEFORE anyone has signed
// in, and that still works: supabase-js sends the anon key as the bearer token,
// which is a valid JWT with no user behind it. The platform check passes and
// `getUser()` below returns nothing, which is exactly the distinction each op
// needs to make for itself.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const API = 'https://api.freeastroapi.com'

// Settled in docs/02-TRD.md §8. Passed on every call, never defaulted.
const RECKONING = {
  ayanamsha: 'lahiri',
  house_system: 'whole_sign',
  node_type: 'mean',
} as const

// Where the panchang is anchored for somebody with no birth place yet — the
// signed-out home screen. First entry of AskPlace's DEFAULTS, so the almanac on
// the landing page is a real one rather than a blank card.
const DEFAULT_PLACE = { lat: 18.5204, lng: 73.8567, zone: 'Asia/Kolkata' }

const PAGES_ORIGIN = Deno.env.get('PAGES_ORIGIN') ?? 'https://1namo.com'

/** Explicit list, never a wildcard (docs/02-TRD.md §11). The dev server picks a
 *  free port each run, so localhost is matched by shape rather than listed. */
function cors(origin: string | null) {
  const allowed =
    origin &&
    (origin === PAGES_ORIGIN || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))
  return {
    'Access-Control-Allow-Origin': allowed ? origin : PAGES_ORIGIN,
    // All four, and none of them optional: supabase-js sends `apikey` and
    // `x-client-info` on every functions.invoke(). A list missing one fails the
    // preflight and the request never leaves the browser, surfacing as "Failed
    // to send a request to the Edge Function" — which reads like the function
    // being down. Phase 3 paid for this once already.
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

/** A refusal the interface can show, in the app's voice (INSTRUCTIONS.md §2).
 *  `code` is for the caller to BRANCH on, and it exists because this project has
 *  already sent a working consultant to a signup form by conflating a failed
 *  read with an absent row. 'no_birth' and 'upstream' must never render the
 *  same sentence. */
function refuse(code: string, reason: string, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify({ ok: false, code, reason }), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

function ok(body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

/** Today in IST. Not `new Date()` — this runs in UTC, and an IST-anchored
 *  midnight is half past six the previous evening there, so a date read off UTC
 *  is a day early for six and a half hours out of every twenty-four
 *  (docs/02-TRD.md §10). IST has no DST, so the shift is a constant and this is
 *  the whole of the arithmetic. */
function istToday(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10)
}

/** Yesterday, today, tomorrow — the only dates any screen asks for, and
 *  therefore the only dates worth spending quota on. Without this an anonymous
 *  caller can walk the calendar and spend 50,000 requests a month for us. */
function allowedDate(date: unknown): string | null {
  const today = istToday()
  const around = [-1, 0, 1].map((d) => {
    const t = new Date(`${today}T00:00:00Z`)
    t.setUTCDate(t.getUTCDate() + d)
    return t.toISOString().slice(0, 10)
  })
  if (date === undefined || date === null) return today
  return typeof date === 'string' && around.includes(date) ? date : null
}

/** A date split the way the API's body wants it. Noon, because the endpoint
 *  reports the sunrise-to-sunrise day plus whatever is running at the instant
 *  you ask, and noon is unambiguously inside the day you named. */
function dateParts(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return { year, month, day, hour: 12, minute: 0 }
}

/** Short digest of everything about a birth that moves a chart. It is half the
 *  cache key, and it is why there is no TTL and no invalidation anywhere: a
 *  corrected birth time produces a different key and therefore a miss. Nothing
 *  in the cache can be stale, only unused. */
async function birthDigest(p: Record<string, unknown>): Promise<string> {
  const material = [
    p.birth_date, p.birth_time, p.birth_time_known,
    p.birth_lat, p.birth_lon, p.birth_zone,
  ].join('|')
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material))
  return [...new Uint8Array(hash)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Birth details as the API's body wants them. `birth_time` is NULL when the
 *  person does not know it (05-BACKEND-SCHEMA.md §4.1) and noon is substituted
 *  here — planets survive a rough time, the ascendant does not, so the caller is
 *  told `time_known: false` and the screens suppress the houses rather than
 *  drawing precise fiction. */
function birthBody(p: Record<string, any>) {
  const [year, month, day] = String(p.birth_date).split('-').map(Number)
  const [hour, minute] =
    p.birth_time_known && p.birth_time
      ? String(p.birth_time).split(':').map(Number)
      : [12, 0]
  return {
    year, month, day, hour, minute,
    lat: Number(p.birth_lat),
    lng: Number(p.birth_lon),
    // The birth PLACE's zone, stored at signup, and never today's offset.
    // India ran +06:30 through the war years; a 1943 birth computed at +05:30
    // lands a whole sign off at the ascendant, silently. Tested against both,
    // and it is the reason this column exists at all.
    tz_str: p.birth_zone || 'Asia/Kolkata',
    ...RECKONING,
  }
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get('Origin'))

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (req.method !== 'POST') return refuse('bad_request', 'Use POST.', 405, headers)

  const apiKey = Deno.env.get('FREE_ASTRO_API_KEY')
  if (!apiKey) {
    // Named in the log, generic to the caller. Our configuration is not the
    // user's problem and must not be described to them.
    console.error('[astro] not configured: FREE_ASTRO_API_KEY')
    return refuse('upstream', 'Charts are not available right now.', 500, headers)
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) ?? {}
  } catch {
    return refuse('bad_request', 'That request is not something we can answer.', 400, headers)
  }
  const op = body.op

  // Service role: `astro_cache` has RLS on and no policy, by design (019).
  const asServer = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const post = (path: string, payload: unknown) =>
    fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(payload),
    })

  /** Read-through. The cache key carries every input, so a hit needs no
   *  freshness test — only a match. Returns null when upstream refused, which
   *  the caller turns into a 502 rather than an empty screen. */
  async function memo(cacheKey: string, compute: () => Promise<Response>) {
    const hit = await asServer
      .from('astro_cache')
      .select('payload')
      .eq('key', cacheKey)
      .maybeSingle()
    if (hit.data) return { payload: hit.data.payload, cached: true }

    // A read that FAILED and a key that is ABSENT both arrive here as no data,
    // and only one of them is normal. Recomputing is the right answer to both —
    // the caller gets a correct chart either way — but a broken cache that
    // reads as a permanent miss spends the whole month's quota looking healthy,
    // so the two are told apart in the log even though they are not in the code.
    if (hit.error) {
      console.error('[astro] CACHE READ FAILED, recomputing:', cacheKey, hit.error.message)
    }

    const res = await compute()
    if (!res.ok) {
      console.error('[astro] upstream refused:', cacheKey, res.status, await res.text())
      return null
    }
    const payload = await res.json()
    // ponytail: last write wins on a race, which for a pure function of the key
    // means the two writers agreed. Upsert rather than insert so the second one
    // is not an error. Per-key locking if the 5 req/sec ceiling ever bites.
    const stored = await asServer.from('astro_cache').upsert({ key: cacheKey, payload })

    // A failed cache write is NOT a failed request — the caller still gets a
    // correct answer, so this never becomes a refusal. But it must not be
    // silent either: the only symptom is every call missing, which spends the
    // month's 50,000 requests at 5 a second and looks exactly like normal
    // operation until the quota is gone. The log is the one place it can
    // surface, so it says so.
    if (stored.error) {
      console.error('[astro] CACHE WRITE FAILED, serving uncached:', cacheKey, stored.error.message)
    }

    return { payload, cached: false }
  }

  // ── geo ──────────────────────────────────────────────────────────────────
  // The one op with no session behind it: AskPlace runs before AskPhone, so
  // there is nobody to be yet. Unlimited on our tier, which is what retires the
  // Open-Meteo licence problem this search sat on before (01-PRD.md §8).
  if (op === 'geo') {
    const q = typeof body.q === 'string' ? body.q.trim() : ''
    if (q.length < 2) return refuse('bad_request', 'Type at least two letters.', 400, headers)

    const res = await fetch(`${API}/api/v2/geo/search?q=${encodeURIComponent(q)}&limit=8`, {
      headers: { 'x-api-key': apiKey },
    })
    if (!res.ok) {
      console.error('[astro] geo refused:', res.status, await res.text())
      return refuse('upstream', 'Could not reach place search. Try again.', 502, headers)
    }
    const found = await res.json()

    // Their order is relevance, and relevance puts a hamlet of a hundred people
    // above the city of three million with the same name — "Pune" and "New
    // Delhi" both do it. On the signup path a wrong pick is a wrong chart for
    // the life of the account, so the largest place goes first and the rest stay
    // visible underneath it.
    const ranked = [...(found.results ?? [])].sort(
      (a: any, b: any) => (b.population ?? 0) - (a.population ?? 0),
    )

    // And then collapse the ones that would render as the same row. "Varanasi"
    // comes back three times with an identical name, district and state, at
    // coordinates a kilometre apart — which the screen rounds to two decimals
    // and shows as the same numbers. A list offering three indistinguishable
    // choices is worse than one offering a single choice, because it reads as a
    // decision the person is failing to make. A kilometre moves no house cusp,
    // so the largest of each group is kept and the rest are dropped.
    const seen = new Set<string>()
    const results = ranked.filter((r: any) => {
      const same = [r.name, r.district, r.state, r.country, r.lat.toFixed(2), r.lng.toFixed(2)].join('|')
      if (seen.has(same)) return false
      seen.add(same)
      return true
    })

    return ok({ ok: true, results }, headers)
  }

  if (op !== 'chart' && op !== 'panchang' && op !== 'horoscope') {
    return refuse('bad_request', 'That request is not something we can answer.', 400, headers)
  }

  const date = allowedDate(body.date)
  if (!date) return refuse('bad_request', 'That date is outside what we compute.', 400, headers)

  const asCaller = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  )
  const { data: { user } } = await asCaller.auth.getUser()

  // Signed out, a panchang is still a real almanac: it is a function of a date
  // and a place, not of a person. The chart and the horoscope are functions of a
  // person, and say so instead of showing somebody else's.
  if (!user) {
    if (op !== 'panchang') return refuse('signed_out', 'Sign in to see your chart.', 401, headers)
    const { lat, lng, zone } = DEFAULT_PLACE
    const got = await memo(`panchang:${date}:${lat},${lng}`, () =>
      post('/api/v2/vedic/panchang', { ...dateParts(date), lat, lng, tz_str: zone, ...RECKONING }))
    if (!got) return refuse('upstream', 'Charts are unavailable right now. Try again shortly.', 502, headers)
    return ok({ ok: true, data: got.payload, date, cached: got.cached }, headers)
  }

  const { data: profile, error } = await asServer
    .from('profiles')
    .select('birth_date, birth_time, birth_time_known, birth_lat, birth_lon, birth_zone')
    .eq('id', user.id)
    .maybeSingle()

  // A FAILED READ IS NOT AN ABSENT ROW. Conflating the two sent a working
  // consultant to a signup form once already; here it would tell somebody with a
  // perfectly good birth record that they never entered one.
  if (error) {
    console.error('[astro] could not read profile:', error.message)
    return refuse('unavailable', 'Could not load your birth details. Try again.', 500, headers)
  }
  if (!profile?.birth_date || profile.birth_lat === null || profile.birth_lon === null) {
    return refuse('no_birth', 'Add your birth details to see your chart.', 409, headers)
  }

  const digest = await birthDigest(profile)
  const birth = birthBody(profile)
  const timeKnown = Boolean(profile.birth_time_known && profile.birth_time)

  const plan = {
    chart: {
      // A natal chart never changes, so its key carries no date at all.
      key: `chart:${user.id}:${digest}`,
      run: () => post('/api/v2/vedic/chart', birth),
    },
    panchang: {
      // Anchored on this person's birth place, on the same ruleset the
      // horoscope uses, so the two calendars on the home screen cannot disagree
      // — which is precisely what the mock they replace did.
      key: `panchang:${date}:${birth.lat},${birth.lng}`,
      run: () => post('/api/v2/vedic/panchang', {
        ...dateParts(date), lat: birth.lat, lng: birth.lng, tz_str: birth.tz_str, ...RECKONING,
      }),
    },
    horoscope: {
      key: `horoscope:${user.id}:${digest}:${date}`,
      run: () => post('/api/v2/vedic/horoscope/daily/personal', {
        ...birth,
        target_date: date,
        include_evidence: false,
        include_raw_facts: false,
      }),
    },
  }[op]

  const got = await memo(plan.key, plan.run)
  if (!got) return refuse('upstream', 'Charts are unavailable right now. Try again shortly.', 502, headers)

  return ok({ ok: true, data: got.payload, time_known: timeKnown, date, cached: got.cached }, headers)
})
