/**
 * CUTOVER — module 3 (astro): replace src/lib/astro.js with this file, set
 * VITE_DJANGO_API_URL, deploy the API (ASTRO_PROVIDER=freeastroapi,
 * FREE_ASTRO_API_KEY set) then the client.
 *
 * A drop-in rewrite of src/lib/astro.js with the identical exported surface
 * and semantics — callAstro, clearAstroCache, useAstro, useMyChart,
 * signLine, istDate, longDate, signOf, degreeLabel, placementsFrom,
 * housesFrom, readingFrom, panchangFrom — against the Django API instead of
 * the `astro` Edge Function:
 *
 *   GET {API}/astro/chart/?date=       -> { ok, data, time_known, date, cached }
 *   GET {API}/astro/horoscope/?date=   -> { ok, data, time_known, date, rashi, cached }
 *   GET {API}/astro/panchang/?date=    -> { ok, data, date, city, cached }
 *   GET {API}/astro/geo/?q=            -> { ok, results }
 *
 * Auth is unchanged: the JWT is still Supabase-issued, read off the existing
 * supabase-js session (docs/07 §1). geo and panchang are anonymous, exactly
 * as the edge function answered the anon key; chart and horoscope send the
 * token, and a missing session now fails as a refusal rather than a call.
 *
 * Behaviour parity notes:
 *   - The server memoises in astro_cache with the same keys and no TTL, and
 *     the localStorage/inFlight caches below are byte-identical to the old
 *     file — refusals are never cached, the stamp is the IST day, the user
 *     id is in the key, panchang is keyed for everybody.
 *   - The edge function's refusal codes arrive here as the Django envelope's
 *     `reason` ('no_birth', 'unavailable', 'upstream', 'invalid'); the 401
 *     'unauthenticated' maps back to 'signed_out'. This file restores the
 *     { ok, code, reason } shape the screens branch on.
 *   - The upstream key stays server-side (INSTRUCTIONS.md rule 7) — nothing
 *     here touches freeastroapi.com.
 */

import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

/**
 * Everything computed rather than stored, in one file.
 *
 * Four ops against the Django API, none of them freeastroapi.com directly.
 * Nothing here sends a birth date, a time, a place or a pair of coordinates:
 * the server reads those from the caller's own row. `geo` sends a search
 * string and `panchang`/`horoscope` send a date, and that is the whole of
 * what the client decides.
 *
 * **A refusal is not a failure.** Every response carries a `code` and the
 * screens branch on it:
 *
 *   `no_birth`     no birth details on the row      → send them to add some
 *   `signed_out`   nobody is signed in              → send them to sign in
 *   `unavailable`  we could not read our own data   → try again
 *   `upstream`     the chart service is down        → try again, not their fault
 *
 * The last two are the ones that must never render as the first two.
 */

/** The generic refusal, for when the API could not be reached at all —
 *  no response means no `code`, and inventing one would be a guess about
 *  whose fault it is. */
const UNREACHABLE = {
  ok: false,
  code: 'unavailable',
  reason: 'Could not reach the chart service. Check your connection and try again.',
}

/** The Django API's base, e.g. https://api.example.com/v1 */
const API_BASE = import.meta.env.VITE_DJANGO_API_URL

/** The Supabase access token off the existing session; null when signed out. */
async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

/* Each op's URL and how its params ride. `geo` goes through its own path on
 * every keystroke and is never cached by cachedAstro. */
const OP_PATH = {
  chart: '/astro/chart/',
  horoscope: '/astro/horoscope/',
  panchang: '/astro/panchang/',
  geo: '/astro/geo/',
}

/**
 * One call. Always resolves — never throws and never returns null, so a
 * caller cannot forget a branch and render an empty screen.
 *
 * The Django API answers the repo's { ok, reason, message } envelope for
 * refusals; this maps it back onto the { ok, code, reason } shape every
 * screen branches on, with the edge function's exact code strings.
 */
export async function callAstro(op, params = {}) {
  const token = await accessToken()
  const query = new URLSearchParams()
  if (params.date) query.set('date', params.date)
  if (params.q) query.set('q', params.q)
  const suffix = query.size ? `?${query.toString()}` : ''

  let response
  try {
    response = await fetch(`${API_BASE}${OP_PATH[op]}${suffix}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  } catch {
    return UNREACHABLE
  }

  let body = null
  try {
    body = await response.json()
  } catch {
    return UNREACHABLE
  }

  if (!response.ok || body?.ok === false) {
    // 401 'unauthenticated' is the edge function's 'signed_out'; every other
    // refusal reason already IS the code the screens branch on.
    const code = response.status === 401 ? 'signed_out' : (body?.reason ?? 'unavailable')
    return { ok: false, code, reason: body?.message ?? UNREACHABLE.reason }
  }

  return body ?? UNREACHABLE
}

/* ══════════════════════════════════════════════════════════════════════════
   The client's own cache.

   The SERVER already memoises every derivation, so a second call is cheap —
   but it is not free for the person holding the phone. Two mechanisms:

   - `inFlight` de-duplicates CONCURRENT callers.
   - `localStorage` de-duplicates callers SEPARATED IN TIME.

   localStorage rather than sessionStorage, deliberately: sessionStorage dies
   with the tab. The cost is that entries outlive a sign-out, which is why
   THE USER ID IS IN THE KEY. Refusals are NEVER cached.
   ══════════════════════════════════════════════════════════════════════════ */

const inFlight = new Map()

/** A chart is a function of a birth and nothing else, so it has no expiry at
 *  all. Everything else is a function of the IST day and dies with it. */
const cacheStamp = (op) => (op === 'chart' ? 'never' : istDate())

/* THE PANCHANG CARRIES NO USER: it is computed at Ujjain for everybody. */
const PER_USER = (op) => op !== 'panchang'

/* THE DATE IS RESOLVED, NEVER LEFT AS THE WORD "today"; a chart carries no
 * date at all. The server clamps to the same three days either way. */
const keyDate = (op, date) => (op === 'chart' ? 'birth' : (date ?? istDate()))

const cacheKey = (op, date, who) =>
  `astro:${op}:${PER_USER(op) ? (who ?? 'anon') : 'all'}:${keyDate(op, date)}`

function readCache(op, date, who) {
  try {
    const raw = localStorage.getItem(cacheKey(op, date, who))
    if (!raw) return null
    const entry = JSON.parse(raw)
    return entry?.stamp === cacheStamp(op) ? entry.value : null
  } catch {
    return null
  }
}

function writeCache(op, date, who, value) {
  try {
    localStorage.setItem(
      cacheKey(op, date, who),
      JSON.stringify({ stamp: cacheStamp(op), value }),
    )
  } catch {
    /* Quota full or storage denied. The answer is already on screen. */
  }
}

/**
 * `callAstro` with the two caches in front of it.
 *
 * Not folded into `callAstro` itself, because `geo` goes through that one on
 * every keystroke and must never be cached.
 */
function cachedAstro(op, { date, who }) {
  const hit = readCache(op, date, who)
  if (hit) return Promise.resolve(hit)

  const key = cacheKey(op, date, who)
  const running = inFlight.get(key)
  if (running) return running

  const promise = callAstro(op, date ? { date } : {})
    .then((res) => {
      if (res.ok) writeCache(op, date, who, res)
      return res
    })
    .finally(() => inFlight.delete(key))

  inFlight.set(key, promise)
  return promise
}

/** Forget everything cached for everybody. Called on sign-out, so a shared
 *  phone does not keep the previous person's chart one key lookup away. */
export function clearAstroCache() {
  inFlight.clear()
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('astro:')) localStorage.removeItem(k)
    }
  } catch {
    /* Storage denied. There is nothing cached to clear either. */
  }
}

/**
 * The hook every screen uses. Same contract as before: `ready` gates the
 * call on the session being resolved; `who` is in the dependencies so
 * signing in as somebody else refetches.
 *
 * Returns four things and expects all four to be handled:
 * `loading`, `payload` (what the API computed), `timeKnown`, `refusal`.
 */
export function useAstro(op, { date, ready = true, who = null } = {}) {
  const [state, setState] = useState({
    loading: true, payload: null, timeKnown: true, city: null, rashi: null, refusal: null,
  })

  useEffect(() => {
    if (!ready) {
      setState({ loading: true, payload: null, timeKnown: true, city: null, rashi: null, refusal: null })
      return undefined
    }

    let live = true
    setState((s) => ({ ...s, loading: true }))

    cachedAstro(op, { date, who }).then((res) => {
      if (!live) return
      setState(
        res.ok
          ? {
              loading: false,
              payload: res.data,
              timeKnown: res.time_known !== false,
              city: res.city ?? null,
              rashi: res.rashi ?? null,
              refusal: null,
            }
          : { loading: false, payload: null, timeKnown: true, city: null, rashi: null, refusal: res },
      )
    })

    return () => {
      live = false
    }
  }, [op, date, ready, who])

  return state
}

/**
 * The three lines every screen wants in a header: sun, moon, rising.
 *
 * `rising` is **null when the birth time is unknown**, never a substituted
 * value. `rashi` is the MOON sign — janma rashi, the bucket a daily reading
 * is chosen by — same value as `moon`, named differently because the screens
 * mean different things by them.
 */
export function useMyChart({ ready = true, who = null } = {}) {
  const chart = useAstro('chart', { ready, who })
  return {
    loading: chart.loading,
    refusal: chart.refusal,
    timeKnown: chart.timeKnown,
    chart: chart.payload,
    sun: chart.payload ? signOf(chart.payload, 'Sun') : null,
    moon: chart.payload ? signOf(chart.payload, 'Moon') : null,
    rising: chart.timeKnown ? (chart.payload?.ascendant?.sign ?? null) : null,
    rashi: chart.payload ? signOf(chart.payload, 'Moon') : null,
  }
}

/** "Scorpio · Pisces · Leo", or as much of it as is true. Empty while loading,
 *  so a header never flashes three dashes before the real answer. */
export function signLine({ sun, moon, rising }) {
  return [sun, moon, rising].filter(Boolean).join(' · ')
}

/**
 * Yesterday, today or tomorrow as `YYYY-MM-DD` **in IST**, which is the only
 * calendar this product has (docs/02-TRD.md §10). The server independently
 * clamps to the same three days.
 */
export function istDate(offsetDays = 0) {
  const ist = new Date(Date.now() + 5.5 * 3_600_000)
  ist.setUTCDate(ist.getUTCDate() + offsetDays)
  return ist.toISOString().slice(0, 10)
}

/** "Wednesday, 2 September 2026" from an ISO date, without dragging in a date
 *  library for one line. */
export function longDate(iso) {
  if (!iso) return ''
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   Shapes — byte-identical to the Supabase version: the API returns more than
   any screen needs, and these turn its response into the shape the components
   were written against.
   ══════════════════════════════════════════════════════════════════════════ */

/** Two letters per planet, as the chart diagram draws them. */
const ABBREV = {
  Sun: 'Su', Moon: 'Mo', Mars: 'Ma', Mercury: 'Me', Jupiter: 'Ju',
  Venus: 'Ve', Saturn: 'Sa', Rahu: 'Ra', Ketu: 'Ke',
}

/** Glyphs, for the placement table. Rahu and Ketu carry their nodal ones. */
const GLYPH = {
  Sun: '☉', Moon: '☽', Mars: '♂', Mercury: '☿', Jupiter: '♃',
  Venus: '♀', Saturn: '♄', Rahu: '☊', Ketu: '☋',
}

/** One planet's sign out of a chart, or an em dash. There is no
 *  `signOf(chart, 'Rising')`: the ascendant is not a planet. */
export function signOf(chart, name) {
  return chart?.planets?.find((p) => p.name === name)?.sign ?? '—'
}

/** `22.2361` → `22° 14′`. Degrees within the sign, never absolute. */
export function degreeLabel(degreeInSign) {
  const d = Math.floor(degreeInSign)
  const m = Math.floor((degreeInSign - d) * 60)
  return `${String(d).padStart(2, '0')}° ${String(m).padStart(2, '0')}′`
}

/**
 * The placement rows. The ascendant leads; it is dropped entirely when the
 * birth time is unknown, since it moves a whole sign every two hours.
 */
export function placementsFrom(chart, timeKnown = true) {
  if (!chart) return []

  const rows = (chart.planets ?? []).map((p) => ({
    id: p.name.toLowerCase(),
    glyph: GLYPH[p.name] ?? p.name.slice(0, 2),
    body: p.name,
    sign: p.sign,
    house: p.house,
    degree: degreeLabel(p.degree_in_sign),
    nakshatra: p.nakshatra,
    pada: p.pada,
    nakshatraLord: p.nakshatra_lord,
    retrograde: p.is_retrograde,
  }))

  if (!timeKnown || !chart.ascendant) return rows

  const asc = chart.ascendant
  return [
    {
      id: 'asc',
      glyph: 'Asc',
      body: 'Rising',
      sign: asc.sign,
      house: 1,
      degree: degreeLabel(asc.degree % 30),
      nakshatra: asc.nakshatra?.name ?? null,
      pada: asc.nakshatra?.pada ?? null,
      nakshatraLord: asc.nakshatra?.lord ?? null,
      retrograde: false,
    },
    ...rows,
  ]
}

/**
 * Twelve houses, each with the planets standing in it. Whole Sign. Returns
 * `null` when the birth time is unknown — an empty array would draw twelve
 * empty boxes, which reads as a chart with nothing in it.
 */
export function housesFrom(chart, timeKnown = true) {
  if (!chart || !timeKnown) return null

  const inHouse = new Map()
  for (const p of chart.planets ?? []) {
    if (!inHouse.has(p.house)) inHouse.set(p.house, [])
    inHouse.get(p.house).push(ABBREV[p.name] ?? p.name.slice(0, 2))
  }

  return (chart.houses ?? []).map((h) => ({
    house: h.house,
    sign: h.sign,
    planets: inHouse.get(h.house) ?? [],
  }))
}

/**
 * The daily reading — the fields that are actually true for the person
 * reading them: the panchang windows and the panchang mood sentence, both a
 * function of the day at the anchor city rather than of any birth.
 */
export function readingFrom(horoscope, label, context) {
  if (!horoscope) return null

  const t = horoscope.timing ?? {}

  return {
    label,
    context,
    date: horoscope.meta?.target_date ?? null,
    dayMood: horoscope.narrative?.best_use ?? '',
    windows: [t.abhijit, t.rahu_kalam, t.yamaganda, t.gulika].filter(Boolean),
  }
}

/** The almanac card. `ends_at` runs past 24:00 on purpose — left verbatim. */
export function panchangFrom(p) {
  if (!p) return null
  return {
    date: p.date,
    weekday: p.weekday?.name ?? '',
    tithi: p.tithi?.name ?? '',
    nakshatra: p.nakshatra?.name ?? '',
    yoga: p.yoga?.name ?? '',
    karana: p.karanas?.[0]?.name ?? p.karana?.name ?? '',
    paksha: p.tithi?.paksha ?? '',
    moonSign: p.request_time_panchang?.moon_sign?.name ?? '',
    sunrise: (p.sunrise ?? '').slice(0, 5),
    sunset: (p.sunset ?? '').slice(0, 5),
    rahuKaal: p.rahu_kalam ? `${p.rahu_kalam.start} – ${p.rahu_kalam.end}` : '',
    lunarMonth: p.lunar_month?.name ?? '',
    samvat: p.lunar_month?.vikram_samvat ?? null,
  }
}
