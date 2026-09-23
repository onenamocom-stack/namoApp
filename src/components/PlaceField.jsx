import { useEffect, useState } from 'react'
import { callAstro } from '../lib/astro.js'

/**
 * Pick a place, by searching for it.
 *
 * One copy, because there are three places that need one — somebody else's
 * birth place, and now the place a muhurat is for — and every one of them
 * has to debounce: a keystroke is an upstream call and the provider's quota
 * is money.
 *
 * **The district and the state are shown, not just the name.** "Ujjain"
 * returns four places in Madhya Pradesh and three in Bihar, and a list of
 * seven identical-looking rows makes the person guess. A wrong pick here is
 * a wrong chart for the life of the account.
 */
export function placeLabel(place) {
  if (!place) return ''
  if (place.label) return place.label
  return [place.name, place.district, place.state].filter(Boolean).join(', ')
}

/** What a picked place is called in one line, without repeating itself. */
function lines(place) {
  const where = [place.district, place.state, place.country]
    .filter((part) => part && part !== place.name)
    .join(', ')
  return [place.name, where]
}

export default function PlaceField({ place, onPick, placeholder = 'City' }) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState([])
  const [searching, setSearching] = useState(false)

  /* Debounced, because every keystroke is an upstream geo call. */
  useEffect(() => {
    const q = query.trim()
    if (q.length < 3 || place) return setHits([])
    setSearching(true)
    const id = setTimeout(() => {
      callAstro('geo', { q })
        .then((res) => setHits((res?.results ?? []).slice(0, 6)))
        .catch(() => setHits([]))
        .finally(() => setSearching(false))
    }, 350)
    return () => clearTimeout(id)
  }, [query, place])

  if (place) {
    return (
      <button
        type="button"
        onClick={() => { onPick(null); setQuery('') }}
        className="field-line w-full text-left"
      >
        {placeLabel(place)} · <span className="t-faint">change</span>
      </button>
    )
  }

  return (
    <>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="field-line"
      />
      {searching && <p className="mt-1.5 caps-sm t-faint">Searching</p>}
      {hits.map((hit) => {
        const [name, where] = lines(hit)
        return (
          <button
            key={`${hit.name}${hit.lat}${hit.lng ?? hit.lon}`}
            type="button"
            onClick={() => onPick(hit)}
            className="act-row !py-2.5"
          >
            <span className="min-w-0 text-left">
              <span className="block text-meta t-body">{name}</span>
              {where && <span className="block caps-sm t-faint">{where}</span>}
            </span>
          </button>
        )
      })}
    </>
  )
}
