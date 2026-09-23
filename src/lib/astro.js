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
  match: '/astro/match/',
  muhurat: '/astro/muhurat/',
}

/**
 * One call. Always resolves — never throws and never returns null, so a
 * caller cannot forget a branch and render an empty screen.
 *
 * The Django API answers the repo's { ok, reason, message } envelope for
 * refusals; this maps it back onto the { ok, code, reason } shape every
 * screen branches on, with the edge function's exact code strings.
 */
export async function callAstro(op, params = {}, body = null) {
  const token = await accessToken()
  const query = new URLSearchParams()
  for (const [name, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') query.set(name, value)
  }
  const suffix = query.size ? `?${query.toString()}` : ''

  let response
  try {
    response = await fetch(`${API_BASE}${OP_PATH[op]}${suffix}`, {
      // A body means POST: birth details typed about somebody else do not
      // belong in a URL, where they would sit in every access log.
      method: body ? 'POST' : 'GET',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    return UNREACHABLE
  }

  let answer = null
  try {
    answer = await response.json()
  } catch {
    return UNREACHABLE
  }

  if (!response.ok || answer?.ok === false) {
    // 401 'unauthenticated' is the edge function's 'signed_out'; every other
    // refusal reason already IS the code the screens branch on.
    const code = response.status === 401 ? 'signed_out' : (answer?.reason ?? 'unavailable')
    return { ok: false, code, reason: answer?.message ?? UNREACHABLE.reason }
  }

  return answer ?? UNREACHABLE
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
 *  all. Everything else is a function of the IST day and dies with it.
 *
 *  The chart's stamp is a generation, not a date: change it and every phone
 *  refetches. 'provider-1' retired the charts the API computed on the mock
 *  provider from 21 to 22 Sep 2026 (HANDOFF, "The astro API ran on the mock"). */
const cacheStamp = (op) => (op === 'chart' ? 'provider-1' : istDate())

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
 * The daily reading.
 *
 * All of it is the reader's own again, as of 22 Sep 2026: the reading is
 * computed from their birth rather than from one of twelve invented ones,
 * so the headline, the scores, the dasha and the transits describe them.
 * Between 9 and 22 Sep this returned two fields, because those were the
 * only two the canonical-birth payload could honestly show — see
 * `docs/02-TRD.md` §8 for what that cost and what it now costs instead.
 *
 * One thing on this payload is still NOT used: its own panchang, computed
 * at the birth place. The screens read the shared Ujjain almanac, so that
 * two tithis for one day cannot appear on two screens.
 */
export function readingFrom(horoscope, label, context) {
  if (!horoscope) return null

  const s = horoscope.scores ?? {}
  const t = horoscope.timing ?? {}
  const dasha = (horoscope.profile?.active_dasha_stack ?? []).map((d) => d.lord).filter(Boolean)

  return {
    label,
    context,
    date: horoscope.meta?.target_date ?? null,
    headline: horoscope.theme?.headline ?? '',
    body: horoscope.narrative?.summary ?? '',
    dayMood: horoscope.narrative?.best_use ?? '',
    focus: horoscope.remedy?.simple_action ?? '',
    focusLabel: horoscope.remedy?.focus ?? 'Do this',
    // 0–100 already, and it is the API's own overall band rather than
    // anything this file arithmetic'd into existence.
    intensity: s.overall?.score ?? null,
    /* THE DASHA IS BACK, and it belongs to the reader. It was dropped on
       7 Sep because the reading came from an invented birth, which made the
       Vimshottari period that person's rather than this one's. */
    glance: [['Tone', s.overall?.band], ['Period', dasha.join(' / ')]]
      .filter(([, v]) => v)
      .map(([key, value]) => ({ key, value })),
    power: horoscope.narrative?.opportunity ?? '',
    pressure: horoscope.narrative?.caution ?? '',
    reflections: [horoscope.remedy?.reflection, horoscope.remedy?.avoid].filter(Boolean),
    do: [horoscope.remedy?.simple_action].filter(Boolean),
    dont: [horoscope.remedy?.avoid].filter(Boolean),
    /* Six, not four. The payload scores six domains and the old screen
       showed four of them, which threw away two for no reason. */
    ratings: [
      ['Career', s.career], ['Money', s.wealth], ['Relationships', s.relationships],
      ['Health', s.health], ['Mind', s.mind], ['Spiritual', s.spiritual],
    ]
      .filter(([, band]) => typeof band?.score === 'number')
      .map(([area, band]) => ({ area, score: band.score })),
    sections: horoscope.sections ?? [],
    transits: (horoscope.influences?.all_ranked ?? []).map((i) => ({
      id: i.fact_id ?? i.id,
      title: i.title,
      body: i.summary,
      weight: i.polarity,
    })),
    windows: [t.abhijit, t.rahu_kalam, t.yamaganda, t.gulika].filter(Boolean),
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Matching and muhurat, added 22 Sep 2026.

   NEITHER IS CACHED IN THE BROWSER. A match holds birth details somebody
   typed about a third party, and `localStorage` outlives the session that
   was told they would not be kept; muhurat is already one shared row a
   month on the server, so a second call is cheap.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Ashtakoota for two people. `mine` as the first argument means the signed-in
 * caller, whose birth the server reads from their own row — the client sends
 * nothing about them.
 */
export function matchCharts(first, second) {
  return callAstro('match', {}, { person1: first ?? null, person2: second })
}

/** Auspicious windows for a purpose, a month and a place. `mine` asks for the
 *  version judged against the caller's own chart. */
export function findMuhurat({ purpose, month, place, mine = false }) {
  return callAstro('muhurat', {
    purpose,
    month,
    lat: place?.lat,
    lng: place?.lng ?? place?.lon,
    zone: place?.timezone ?? place?.zone,
    mine: mine ? 1 : '',
  })
}

/** The eight kootas, the doshas and the total, in the shape the screen
 *  renders. Points can be halves, so they print as given. */
export function matchFrom(payload) {
  if (!payload) return null
  const ashtakoota = payload.ashtakoota ?? {}
  const summary = payload.summary ?? {}
  const doshas = payload.doshas ?? {}
  const manglik = doshas.manglik ?? {}

  return {
    score: summary.total_score ?? ashtakoota.score ?? 0,
    max: summary.max_score ?? ashtakoota.max_score ?? 36,
    percentage: ashtakoota.percentage ?? null,
    verdict: ashtakoota.recommendation ?? '',
    threshold: summary.minimum_traditional_threshold ?? 18,
    passes: Boolean(summary.passes_minimum_threshold),
    people: (payload.persons ?? []).map((p) => ({
      moon: p.moon_sign?.name ?? '',
      nakshatra: p.moon_nakshatra?.name ?? '',
    })),
    kootas: (ashtakoota.kootas ?? []).map((k) => ({
      id: k.id,
      name: k.name,
      score: k.score,
      max: k.max_score,
      status: k.status,
      note: k.evidence?.[0]?.message ?? '',
    })),
    /* Manglik is per person and the other two are about the pair. A screen
       that showed one number for all three would be saying something the
       payload does not. */
    manglik: ['person1', 'person2']
      .map((side) => manglik[side])
      .filter((m) => m?.available)
      .map((m, index) => ({
        who: index === 0 ? 'person1' : 'person2',
        active: Boolean(m.active),
        severity: m.severity ?? '',
        cancellations: m.cancellations ?? [],
        note: m.message ?? '',
      })),
    manglikTogether: manglik.compatibility?.message ?? '',
    pairDoshas: [['Nadi', doshas.nadi], ['Bhakoot', doshas.bhakoot]]
      .filter(([, d]) => d)
      .map(([name, d]) => ({ name, active: Boolean(d.active), note: d.message ?? '' })),
  }
}

/** A muhurat search as the screen reads it: windows in time order, the ones
 *  that have already passed dropped, and whatever the personal search decided
 *  about a single best moment. */
export function muhuratFrom(payload, { now = new Date() } = {}) {
  if (!payload) return null
  const windows = (payload.best_windows ?? [])
    .filter((w) => new Date(w.end) > now)
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .map((w) => ({
      id: `${w.start}${w.end}`,
      date: w.date,
      start: clockOf(w.start),
      end: clockOf(w.end),
      // A window can end after midnight; saying so beats a time that reads
      // as earlier than the start. Some run sunrise to sunrise — a full 24
      // hours, where the two clock times are identical and the length is
      // the only thing that says so.
      overnight: (w.date ?? '') !== (w.end ?? '').slice(0, 10),
      hours: typeof w.duration_minutes === 'number'
        ? Math.round(w.duration_minutes / 6) / 10
        : null,
      score: w.score ?? null,
      quality: w.quality ?? '',
      reasons: w.reasons ?? [],
      warnings: w.warnings ?? [],
    }))

  const moment = payload.best_moment
  return {
    windows,
    /* The personal search often promotes nothing and explains why. That
       explanation IS the answer in that case, so it is not optional. */
    verdict: payload.selection_explanation?.headline ?? '',
    moment: moment
      ? {
          date: (moment.datetime ?? '').slice(0, 10),
          time: clockOf(moment.datetime),
          score: moment.score ?? null,
          quality: moment.quality ?? '',
          line: moment.explanation?.headline ?? '',
        }
      : null,
  }
}

/** "2026-10-29T22:11:05.251934+05:30" → "22:11". The offset is the place's
 *  own, so the clock is read off the string rather than through a Date, which
 *  would render it in the phone's timezone. */
export function clockOf(iso) {
  return typeof iso === 'string' ? iso.slice(11, 16) : ''
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
