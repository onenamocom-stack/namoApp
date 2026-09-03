import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

/**
 * Everything computed rather than stored, in one file.
 *
 * Four ops, all of them the `astro` Edge Function and none of them
 * freeastroapi.com directly — the key is a secret and the browser never holds
 * it (`backend/INSTRUCTIONS.md` rule 7). Nothing here sends a birth date, a
 * time, a place or a pair of coordinates: the server reads those from the
 * caller's own row. `geo` sends a search string and `panchang`/`horoscope` send
 * a date, and that is the whole of what the client decides.
 *
 * **A refusal is not a failure.** Every response carries a `code` and the
 * screens branch on it, because this project has already sent a working
 * consultant to a signup form by treating a failed read as an absent row. Here
 * the same mistake would tell somebody with a perfectly good birth record that
 * they never entered one:
 *
 *   `no_birth`     no birth details on the row      → send them to add some
 *   `signed_out`   nobody is signed in              → send them to sign in
 *   `unavailable`  we could not read our own data   → try again
 *   `upstream`     the chart service is down        → try again, not their fault
 *
 * The last two are the ones that must never render as the first two.
 */

/** The generic refusal, for when the function could not be reached at all —
 *  no response means no `code`, and inventing one would be a guess about
 *  whose fault it is. */
const UNREACHABLE = {
  ok: false,
  code: 'unavailable',
  reason: 'Could not reach the chart service. Check your connection and try again.',
}

/**
 * One call. Always resolves — never throws and never returns null, so a caller
 * cannot forget a branch and render an empty screen.
 *
 * `functions.invoke` treats any non-2xx as an error and leaves `data` null, so
 * the server's own words arrive on `error.context` and have to be read back off
 * it. Skipping that step is what turns a precise refusal into "something went
 * wrong".
 */
export async function callAstro(op, params = {}) {
  const { data, error } = await supabase.functions.invoke('astro', { body: { op, ...params } })

  if (error) {
    if (error.context && typeof error.context.json === 'function') {
      try {
        const refusal = await error.context.json()
        if (refusal?.reason) return refusal
      } catch {
        // The body was not JSON. Fall through to the generic refusal rather
        // than showing a parse error to somebody looking at their chart.
      }
    }
    console.error('[astro] %s failed:', op, error.message)
    return UNREACHABLE
  }

  return data ?? UNREACHABLE
}

/* ══════════════════════════════════════════════════════════════════════════
   The client's own cache.

   The SERVER already memoises every derivation, so a second call is cheap for
   our API quota — but it is not free for the person holding the phone. Every
   mount was a network round trip, and `/home` alone mounts the reading card
   and the panchang card, then opening the horoscope overlay asks for the same
   reading a third time. Three requests, one answer, on a phone on Indian
   mobile data.

   Two mechanisms, because they solve two different problems:

   - `inFlight` de-duplicates CONCURRENT callers. Two components mounting in
     the same tick share one promise instead of racing two identical requests.
   - `localStorage` de-duplicates callers SEPARATED IN TIME — a reload, a new
     tab, coming back this evening.

   localStorage rather than sessionStorage, deliberately: sessionStorage dies
   with the tab, so every new tab would refetch a chart that cannot have
   changed. The cost of the stronger store is that entries outlive a sign-out,
   which is why THE USER ID IS IN THE KEY — a second person on the same phone
   gets different keys and cannot read the first one's chart. Supabase already
   keeps the session itself in localStorage, so this stores nothing in a place
   the app was not already using.

   Refusals are NEVER cached. `no_birth` stops being true the moment somebody
   adds their birth details, and `upstream` stops being true when the service
   comes back; caching either would make a temporary answer permanent.
   ══════════════════════════════════════════════════════════════════════════ */

const inFlight = new Map()

/** A chart is a function of a birth and nothing else, so it has no expiry at
 *  all. Everything else is a function of the IST day and dies with it. */
const cacheStamp = (op) => (op === 'chart' ? 'never' : istDate())

const cacheKey = (op, date, who) => `astro:${op}:${who ?? 'anon'}:${date ?? 'today'}`

function readCache(op, date, who) {
  try {
    const raw = localStorage.getItem(cacheKey(op, date, who))
    if (!raw) return null
    const entry = JSON.parse(raw)
    return entry?.stamp === cacheStamp(op) ? entry.value : null
  } catch {
    // Private mode, a full quota, or a half-written entry. A cache that cannot
    // be read is a miss, never an error the person sees.
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
 * every keystroke and must never be cached — a search for "Var" is not an
 * answer to "Varanasi".
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
 * The hook every screen uses.
 *
 * `ready` gates the call on the session being *resolved*, not on it existing —
 * firing before then asks for a chart as nobody and gets a refusal that is
 * true for a tenth of a second and wrong afterwards. `who` is in the
 * dependencies so signing in as somebody else refetches rather than leaving
 * the previous person's chart on screen.
 *
 * Returns four things and expects all four to be handled:
 * `loading`, `payload` (what the API computed), `timeKnown`, `refusal`.
 */
export function useAstro(op, { date, ready = true, who = null } = {}) {
  const [state, setState] = useState({ loading: true, payload: null, timeKnown: true, refusal: null })

  useEffect(() => {
    if (!ready) {
      setState({ loading: true, payload: null, timeKnown: true, refusal: null })
      return undefined
    }

    /* Aborted by flag rather than by AbortController: `functions.invoke` owns
       its own request. The flag is only here so a response for yesterday
       cannot land after the one for today and replace it. */
    let live = true
    setState((s) => ({ ...s, loading: true }))

    cachedAstro(op, { date, who }).then((res) => {
      if (!live) return
      setState(
        res.ok
          ? { loading: false, payload: res.data, timeKnown: res.time_known !== false, refusal: null }
          : { loading: false, payload: null, timeKnown: true, refusal: res },
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
 * A separate hook rather than three more fields on `useProfileFields()`,
 * because that hook is called on screens with no interest in a chart and
 * putting a fetch inside it would spend a request on all of them. This is
 * called by the four that print the signs, and the fourth costs nothing — the
 * server cached the first.
 *
 * `rising` is **null when the birth time is unknown**, never a substituted
 * value. The ascendant moves a whole sign every two hours; the caller decides
 * what to say about that, and giving it a dash to print would take the decision
 * away.
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
    /* RASHI IS THE MOON SIGN, not the sun sign. In Indian usage "rashi" on its
       own means janma rashi — where the Moon stood at birth — and it is what
       every rashifal in the country is keyed on. Western daily horoscopes key
       on the Sun, which is why the same person is told two different signs by
       two different apps.

       It comes off the natal chart, so it is a function of the birth and never
       changes, and the chart is cached with no expiry. It also survives an
       unknown birth time: the Moon moves about half a degree an hour, so it is
       in the right sign whatever the hour — unlike the ascendant, which is not.

       Same value as `moon` deliberately. The two names are here because the
       screens mean different things by them: `moon` is one placement among
       nine on a chart, `rashi` is the bucket a daily reading is chosen by. */
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
 * calendar this product has (docs/02-TRD.md §10).
 *
 * Not `new Date().toISOString()`: a browser in London reading a date off UTC
 * gets yesterday's for the five and a half hours after Indian midnight, and a
 * reading labelled with the wrong day is the exact class of bug the mock had.
 * IST has no DST, so the shift is a constant and this is all of the arithmetic.
 * The server independently clamps to the same three days.
 */
export function istDate(offsetDays = 0) {
  const ist = new Date(Date.now() + 5.5 * 3_600_000)
  ist.setUTCDate(ist.getUTCDate() + offsetDays)
  return ist.toISOString().slice(0, 10)
}

/** "Wednesday, 2 September 2026" from an ISO date, without dragging in a date
 *  library for one line. Parsed as UTC and formatted as UTC so the string never
 *  shifts a day under the reader's own zone. */
export function longDate(iso) {
  if (!iso) return ''
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   Shapes. The API returns more than any screen needs; these turn its response
   into the shape the components were already written against, in one place,
   so a field rename upstream is one edit rather than nine.
   ══════════════════════════════════════════════════════════════════════════ */

/** Two letters per planet, as the chart diagram draws them. */
const ABBREV = {
  Sun: 'Su', Moon: 'Mo', Mars: 'Ma', Mercury: 'Me', Jupiter: 'Ju',
  Venus: 'Ve', Saturn: 'Sa', Rahu: 'Ra', Ketu: 'Ke',
}

/** Glyphs, for the placement table. Rahu and Ketu have no astronomical glyph
 *  in common use, so they carry their nodal ones. */
const GLYPH = {
  Sun: '☉', Moon: '☽', Mars: '♂', Mercury: '☿', Jupiter: '♃',
  Venus: '♀', Saturn: '♄', Rahu: '☊', Ketu: '☋',
}

/** One planet's sign out of a chart, or an em dash. Used wherever a screen
 *  wants a single position in a sentence — the sun on Shop, the three lines on
 *  the reveal — so none of them reach into `payload.planets` themselves.
 *
 *  There is no `signOf(chart, 'Rising')`: the ascendant is not a planet, it
 *  lives on `chart.ascendant`, and it is absent when the birth time is
 *  unknown. Every caller has to decide what to say in that case, and giving
 *  them a function that quietly returns a dash would take the decision away. */
export function signOf(chart, name) {
  return chart?.planets?.find((p) => p.name === name)?.sign ?? '—'
}

/** `22.2361` → `22° 14′`. Degrees within the sign, never absolute — the sign
 *  is already named beside it, and 214° means nothing to a reader. */
export function degreeLabel(degreeInSign) {
  const d = Math.floor(degreeInSign)
  const m = Math.floor((degreeInSign - d) * 60)
  return `${String(d).padStart(2, '0')}° ${String(m).padStart(2, '0')}′`
}

/**
 * The placement rows. The ascendant leads, because it is the thing the rest is
 * measured from — and it is dropped entirely when the birth time is unknown,
 * since it moves a whole sign every two hours and a rising sign computed from
 * a guess is precise fiction.
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
 * Twelve houses, each with the planets standing in it. Whole Sign, so one
 * house is one sign with no split and no interception — which is what the
 * diagram this feeds has always assumed.
 *
 * Returns `null` when the birth time is unknown. That is deliberate and the
 * callers check for it: an empty array would draw twelve empty boxes, which
 * reads as a chart with nothing in it rather than as a question nobody
 * answered.
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
 * The daily reading, in the shape the horoscope screens were built against.
 *
 * Fields the API does not compute are GONE rather than invented: mood, lucky
 * colour, lucky number, and the sign-compatibility lists. A number presented
 * as your lucky one has to come from somewhere, and "we made it up" is not a
 * somewhere this app is willing to have.
 */
export function readingFrom(horoscope, label, context) {
  if (!horoscope) return null

  const s = horoscope.scores ?? {}
  const t = horoscope.timing ?? {}

  return {
    label,
    context,
    date: horoscope.meta?.target_date ?? null,
    headline: horoscope.theme?.headline ?? '',
    body: horoscope.narrative?.summary ?? '',
    focus: horoscope.remedy?.simple_action ?? '',
    focusLabel: horoscope.remedy?.focus ?? 'Do this',
    // 0–100 already, and it is the API's own overall band rather than
    // anything this file arithmetic'd into existence.
    intensity: s.overall?.score ?? null,
    glance: [
      ['Tone', s.overall?.band],
      ['Dasha', horoscope.dasha?.dominant_period?.lord],
      ['Nakshatra', horoscope.panchang?.nakshatra?.name],
    ]
      .filter(([, v]) => v)
      .map(([key, value]) => ({ key, value })),
    power: horoscope.narrative?.opportunity ?? '',
    pressure: horoscope.narrative?.caution ?? '',
    reflections: [horoscope.remedy?.reflection, horoscope.remedy?.avoid].filter(Boolean),
    do: [horoscope.remedy?.simple_action].filter(Boolean),
    dont: [horoscope.remedy?.avoid].filter(Boolean),
    ratings: {
      love: s.relationships?.score ?? null,
      career: s.career?.score ?? null,
      health: s.health?.score ?? null,
      money: s.wealth?.score ?? null,
    },
    sections: horoscope.sections ?? [],
    /* The almanac for this day, carried on the reading itself.
       It is here because it is the part that ACTUALLY MOVES between yesterday,
       today and tomorrow. Their ruleset derives the headline and the six scores
       from the dasha stack and ranked gochar, neither of which shifts in three
       days, so those come back identical across the tabs — measured, not
       assumed. The tithi, the nakshatra and the windows do change daily, so the
       screen leads with them and the three tabs stop looking broken. */
    panchang: panchangFrom(horoscope.panchang),
    transits: (horoscope.influences?.all_ranked ?? []).map((i) => ({
      id: i.fact_id ?? i.id,
      title: i.title,
      body: i.summary,
      weight: i.polarity,
      window: horoscope.meta?.target_date ?? '',
    })),
    windows: [t.abhijit, t.rahu_kalam, t.yamaganda, t.gulika].filter(Boolean),
  }
}

/** The almanac card. `ends_at` runs past 24:00 on purpose — a tithi ending at
 *  "28:26" ends at half past four the next morning, and that is how a panchang
 *  is read. Left verbatim. */
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
