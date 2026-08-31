import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QuestionFrame from './QuestionFrame.jsx'
import { useStore } from '../../store.jsx'

/**
 * Anywhere on earth, not four cities.
 *
 * The search is Open-Meteo's geocoder, chosen over Nominatim/Photon for one
 * reason: it returns the **IANA timezone** with each hit. That is not a nicety
 * here. `birth_zone` has to be the zone of the birth *place*, and this screen
 * is the only moment anyone knows what that is — see docs/05-BACKEND-SCHEMA.md
 * §4.1 on why a stored offset silently shifts every cusp. Geocoders that return
 * only lat/lon would leave the zone to be guessed later, which is the failure
 * that raises no error anywhere.
 *
 * It also disambiguates: three places called London come back with
 * Europe/London, America/Toronto and America/New_York attached, so picking the
 * wrong one is a visible mistake rather than an invisible four-hour shift.
 */

/* Shown before anyone types. India-first because the product is, and because
   the common case should cost no network round trip at all. */
const DEFAULTS = [
  { id: 'd-pune', name: 'Pune', admin1: 'Maharashtra', country: 'India', latitude: 18.5204, longitude: 73.8567, timezone: 'Asia/Kolkata' },
  { id: 'd-mumbai', name: 'Mumbai', admin1: 'Maharashtra', country: 'India', latitude: 19.076, longitude: 72.8777, timezone: 'Asia/Kolkata' },
  { id: 'd-bengaluru', name: 'Bengaluru', admin1: 'Karnataka', country: 'India', latitude: 12.9716, longitude: 77.5946, timezone: 'Asia/Kolkata' },
  { id: 'd-delhi', name: 'Delhi', admin1: '', country: 'India', latitude: 28.6139, longitude: 77.209, timezone: 'Asia/Kolkata' },
]

const ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search'

/** "Pune, Maharashtra, India". Duplicates dropped — a city that is also its
 *  own state ("Delhi, Delhi, India") reads like a bug. */
function placeLabel(r) {
  const seen = new Set()
  return [r.name, r.admin1, r.country]
    .filter((p) => p && !seen.has(p) && seen.add(p))
    .join(', ')
}

function coordLabel(r) {
  const ns = r.latitude >= 0 ? 'N' : 'S'
  const ew = r.longitude >= 0 ? 'E' : 'W'
  return `${Math.abs(r.latitude).toFixed(2)}° ${ns} · ${Math.abs(r.longitude).toFixed(2)}° ${ew}`
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

    /* Debounced, and aborted on every keystroke. Without the abort a slow
       response for "Lon" can land after the one for "London" and replace a
       correct list with a stale one. */
    const ctrl = new AbortController()
    setLoading(true)

    const timer = setTimeout(() => {
      const url = `${ENDPOINT}?name=${encodeURIComponent(query)}&count=8&language=en&format=json`
      fetch(url, { signal: ctrl.signal })
        .then((res) => {
          if (!res.ok) throw new Error(`Search failed (${res.status})`)
          return res.json()
        })
        .then((json) => {
          setResults(json.results ?? [])
          setError('')
          setLoading(false)
        })
        .catch((err) => {
          if (err.name === 'AbortError') return
          setResults([])
          setError('Could not reach place search. Check your connection and try again.')
          setLoading(false)
        })
    }, 300)

    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [query])

  const list = results ?? DEFAULTS

  return (
    <QuestionFrame
      question="And where?"
      hint="The city fixes your horizon. Everything angular in the chart is measured from it."
      canContinue={Boolean(picked)}
      nextLabel="Continue"
      onNext={() => {
        setBirthField('place', placeLabel(picked))
        setBirthField('lat', picked.latitude)
        setBirthField('lon', picked.longitude)
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

      {results === null && query.length < 2 && (
        <p className="mt-6 text-center text-micro uppercase tracking-caps text-t3">
          Type to search anywhere
        </p>
      )}

      <ul className="mt-8" aria-busy={loading}>
        {list.map((r) => {
          const active = picked?.id === r.id
          return (
            <li key={r.id}>
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
