import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QuestionFrame from './QuestionFrame.jsx'
import { useStore } from '../../store.jsx'
import { callAstro } from '../../lib/astro.js'

/**
 * Anywhere on earth, not four cities.
 *
 * The search goes through the `astro` Edge Function to freeastroapi.com's geo
 * endpoint — **replacing Open-Meteo, whose free geocoder is non-commercial and
 * this product is not** (docs/01-PRD.md §8). It sat on the signup path, which
 * is the worst place for a licence problem to sit.
 *
 * What both geocoders had, and what this screen exists for: each hit carries
 * the **IANA timezone**. That is not a nicety. `birth_zone` has to be the zone
 * of the birth *place*, and this screen is the only moment anybody knows what
 * that is — docs/05-BACKEND-SCHEMA.md §4.1 on why a stored offset silently
 * shifts every cusp. A geocoder returning only lat/lon leaves the zone to be
 * guessed later, which is the failure that raises no error anywhere.
 *
 * It also disambiguates: three places called London come back with
 * Europe/London, America/Toronto and America/New_York attached, so picking the
 * wrong one is a visible mistake rather than an invisible four-hour shift. The
 * new one adds an Indian **district**, which is how two villages of the same
 * name in the same state are told apart at all.
 *
 * Ordering is the function's, not theirs — theirs is relevance, and relevance
 * puts a hamlet of a hundred above the city of three million.
 */

/* Shown before anyone types. India-first because the product is, and because
   the common case should cost no network round trip at all. Same field names
   the search returns, so nothing downstream has to know which list it got. */
const DEFAULTS = [
  { name: 'Pune', district: null, state: 'Maharashtra', country: 'IN', lat: 18.5204, lng: 73.8567, timezone: 'Asia/Kolkata' },
  { name: 'Mumbai', district: null, state: 'Maharashtra', country: 'IN', lat: 19.076, lng: 72.8777, timezone: 'Asia/Kolkata' },
  { name: 'Bengaluru', district: null, state: 'Karnataka', country: 'IN', lat: 12.9716, lng: 77.5946, timezone: 'Asia/Kolkata' },
  { name: 'Delhi', district: null, state: 'Delhi', country: 'IN', lat: 28.6139, lng: 77.209, timezone: 'Asia/Kolkata' },
]

/* The API returns ISO country codes. `Intl` already knows every one of them in
   every language the browser has, so there is no table here to fall behind. */
const REGIONS = new Intl.DisplayNames(['en'], { type: 'region' })
const countryName = (code) => {
  try {
    return REGIONS.of(code) ?? code
  } catch {
    return code
  }
}

/** "Pune, Maharashtra, India". Duplicates dropped — a city that is also its
 *  own state ("Delhi, Delhi, India") reads like a bug, and a district that
 *  repeats the town name is the same thing one level down. */
function placeLabel(r) {
  const seen = new Set()
  return [r.name, r.district, r.state, countryName(r.country)]
    .filter((p) => p && !seen.has(p) && seen.add(p))
    .join(', ')
}

/** Two places can share a name, a district and a state. Nothing can share
 *  coordinates, so they are the identity — the API sends no id of its own. */
const placeKey = (r) => `${r.name}|${r.lat}|${r.lng}`

function coordLabel(r) {
  const ns = r.lat >= 0 ? 'N' : 'S'
  const ew = r.lng >= 0 ? 'E' : 'W'
  return `${Math.abs(r.lat).toFixed(2)}° ${ns} · ${Math.abs(r.lng).toFixed(2)}° ${ew}`
}

export default function AskPlace() {
  const navigate = useNavigate()
  const { setBirthField } = useStore()
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState(null)
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const query = q.trim()

  useEffect(() => {
    if (query.length < 2) {
      setResults(null)
      setError('')
      setLoading(false)
      return undefined
    }

    /* Debounced, and discarded on every keystroke. Without that a slow
       response for "Lon" can land after the one for "London" and replace a
       correct list with a stale one. The function owns the request, so this is
       a flag rather than an AbortController — the round trip is spent either
       way, and only the answer is thrown away. */
    let live = true
    setLoading(true)

    const timer = setTimeout(() => {
      callAstro('geo', { q: query }).then((res) => {
        if (!live) return
        setLoading(false)
        if (res.ok) {
          setResults(res.results ?? [])
          setError('')
          return
        }
        // The function's own words, in the app's voice. It distinguishes a
        // search that is down from one that found nothing, and so does this.
        setResults([])
        setError(res.reason)
      })
    }, 300)

    return () => {
      clearTimeout(timer)
      live = false
    }
  }, [query])

  /* The India-first shortlist is for somebody who has not typed, and for
     nobody else. Showing it UNDER a search that is still running was the
     original behaviour and it is a trap: the round trip is a few seconds cold,
     and for those seconds the screen offers four confident wrong answers to
     the question you just asked. Somebody typing "Varanasi" and tapping Pune
     because it was on screen has filed their chart in the wrong city, and
     nothing downstream will ever say so. */
  const list = query.length < 2 ? DEFAULTS : (results ?? [])

  return (
    <QuestionFrame
      question="And where?"
      hint="The city fixes your horizon. Everything angular in the chart is measured from it."
      canContinue={Boolean(picked)}
      nextLabel="Continue"
      onNext={() => {
        setBirthField('place', placeLabel(picked))
        setBirthField('lat', picked.lat)
        setBirthField('lon', picked.lng)
        // The whole reason this geocoder was chosen. Never defaulted.
        setBirthField('zone', picked.timezone)
        navigate('/onboarding/phone')
      }}
    >
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setPicked(null)
        }}
        placeholder="City, town or village of birth"
        aria-label="Place of birth"
        autoCapitalize="words"
        autoComplete="off"
        className="w-full border-b border-rule bg-transparent pb-3 text-center text-lead font-light text-t1 outline-none transition-colors placeholder:text-t4 focus:border-t1"
      />

      {query.length < 2 && (
        <p className="mt-6 text-center text-micro uppercase tracking-caps text-t3">
          Type to search anywhere
        </p>
      )}

      <ul className="mt-8" aria-busy={loading}>
        {list.map((r) => {
          const key = placeKey(r)
          const active = picked && placeKey(picked) === key
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => setPicked(r)}
                aria-pressed={active}
                className="flex w-full items-center justify-between gap-4 border-b border-rule py-4 text-left transition-opacity hover:opacity-60"
              >
                <span className="min-w-0">
                  <span className={`block truncate text-body ${active ? 'text-t1' : 'text-t2'}`}>
                    {placeLabel(r)}
                  </span>
                  {/* The zone is the field that is invisible when wrong, so it
                      is shown before it is committed, not after. */}
                  <span className="mt-1 block text-micro uppercase tracking-caps text-t3">
                    {r.timezone}
                  </span>
                </span>
                <span className="flex-none text-micro uppercase tracking-caps text-t3 tnum">
                  {active ? 'Selected' : coordLabel(r)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {loading && <p className="mt-6 text-center text-meta text-t3">Searching…</p>}

      {!loading && results?.length === 0 && !error && (
        <p className="mt-6 text-center text-meta text-t3">
          Nothing matches “{query}”. Try the nearest town.
        </p>
      )}

      {error && <p className="mx-auto mt-6 max-w-measure text-center text-meta text-live">{error}</p>}
    </QuestionFrame>
  )
}
