import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import PlaceField, { placeLabel } from '../components/PlaceField.jsx'
import { Kicker, PopCard } from '../components/Pop.jsx'
import { Button, Row, Section, Segmented, Stub } from '../components/Primitives.jsx'
import { findMuhurat, istDate, longDate, muhuratFrom } from '../lib/astro.js'
import { useStore } from '../store.jsx'

/**
 * When to start something — the vendor's six purposes, a month at a time.
 *
 * **A muhurat is a function of a place**, because it is built out of
 * sunrise, and sunrise moves about two hours across India. The place is
 * prefilled from the birth row because that is the only place this app
 * knows, and it is NAMED on the screen and one tap to change: where you
 * were born is rarely where you are buying a car.
 *
 * **A whole month is asked for at once**, which is what makes this cheap:
 * everyone in the same 11 km cell shares one upstream call a month. Windows
 * that have already passed are dropped here rather than upstream, so the
 * answer does not change key every day.
 *
 * **An empty month is a real answer, not a failure.** Griha pravesh returns
 * nothing through Chaturmas, and saying so is the correct screen.
 */
const PURPOSES = [
  { key: 'general_work', label: 'General work', note: 'Any start that has no rite of its own' },
  { key: 'vehicle_purchase', label: 'Vehicle', note: 'Taking delivery of a vehicle' },
  { key: 'property_purchase', label: 'Property', note: 'Registering or buying' },
  { key: 'griha_pravesh', label: 'Griha pravesh', note: 'Entering a new home' },
  { key: 'namkaran', label: 'Naming', note: 'Namkaran, the naming ceremony' },
  { key: 'mundan', label: 'Mundan', note: 'The first tonsure' },
]

/** This month and the next two, as the API clamps them. */
function months() {
  const today = istDate()
  const [year, month] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))]
  return Array.from({ length: 3 }, (_, i) => {
    const date = new Date(Date.UTC(year, month - 1 + i, 1))
    return {
      key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' }),
    }
  })
}

export default function Muhurat() {
  const { profile, session, sessionReady } = useStore()
  const monthTabs = useMemo(months, [])

  const [purpose, setPurpose] = useState('general_work')
  const [month, setMonth] = useState(monthTabs[0].key)
  const [place, setPlace] = useState(null)
  const [changingPlace, setChangingPlace] = useState(false)
  const [mine, setMine] = useState(false)
  const [state, setState] = useState({ loading: true, result: null, refusal: null })

  /* The birth place is the starting point, not the answer: it is the one
     place on file. Named on screen, changed in one tap. */
  useEffect(() => {
    if (place || !profile?.birth_lat) return
    setPlace({
      label: profile.birth_place,
      name: profile.birth_place,
      lat: Number(profile.birth_lat),
      lng: Number(profile.birth_lon),
      timezone: profile.birth_zone || 'Asia/Kolkata',
    })
  }, [profile, place])

  const hasBirth = Boolean(profile?.birth_date && profile?.birth_lat)

  useEffect(() => {
    if (!sessionReady || !place) return undefined
    let live = true
    setState((s) => ({ ...s, loading: true }))
    findMuhurat({ purpose, month, place, mine }).then((res) => {
      if (!live) return
      setState(
        res.ok
          ? { loading: false, result: muhuratFrom(res.data), refusal: null }
          : { loading: false, result: null, refusal: res },
      )
    })
    return () => { live = false }
  }, [purpose, month, place, mine, sessionReady, session?.user?.id])

  const chosen = PURPOSES.find((p) => p.key === purpose)
  const result = state.result

  return (
    <>
      <TopBar title="Muhurat" sub={chosen.note} back backTo="/consult" />

      <Section label="What for" tight>
        <ul className="flex flex-wrap gap-2">
          {PURPOSES.map((p) => (
            <li key={p.key}>
              <button
                type="button"
                onClick={() => setPurpose(p.key)}
                className="pill caps-sm"
                aria-pressed={purpose === p.key}
              >
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Segmented items={monthTabs} value={month} onChange={setMonth} />

      <Section label="Where" tight>
        {changingPlace || !place ? (
          <PlaceField
            place={null}
            onPick={(picked) => { if (picked) { setPlace(picked); setChangingPlace(false) } }}
            placeholder="City"
          />
        ) : (
          <div className="flex items-baseline justify-between gap-4">
            <p className="min-w-0 text-body text-t1">{placeLabel(place)}</p>
            <button
              type="button"
              onClick={() => setChangingPlace(true)}
              className="flex-none caps-sm text-t2 underline"
            >
              Change
            </button>
          </div>
        )}
        <p className="mt-3 text-meta text-t3">
          Sunrise moves about two hours across India, and every window below is built from it.
        </p>

        {/* Only offered when there is a chart to judge against. An empty
            toggle that refuses on tap is worse than no toggle. */}
        {hasBirth && (
          <button
            type="button"
            onClick={() => setMine((v) => !v)}
            className="pill caps-sm mt-5"
            aria-pressed={mine}
          >
            {mine ? 'Judged against your chart' : 'Judge against your chart'}
          </button>
        )}
      </Section>

      {state.loading && (
        <p className="section text-meta text-t3">Reading {chosen.label.toLowerCase()} windows.</p>
      )}

      {state.refusal && (
        <div className="section">
          <p className="text-body text-t1">{state.refusal.reason}</p>
          {state.refusal.code === 'no_birth' && (
            <Link to="/profile" className="mt-3 inline-block text-meta text-t2 underline">
              Add your birth details
            </Link>
          )}
        </div>
      )}

      {result && !state.loading && (
        <>
          {/* The personal search often promotes no single moment and says
              why. That sentence IS the answer when it happens. */}
          {mine && result.verdict && (
            <section className="section">
              {result.moment ? (
                <PopCard raised className="p-5">
                  <p className="caps-sm gold">Best moment</p>
                  <p className="mt-3 text-title font-light tnum">{result.moment.time}</p>
                  <p className="mt-1 text-body t-sub">{longDate(result.moment.date)}</p>
                  <Stub className="my-5" />
                  <p className="text-read t-sub">{result.moment.line}</p>
                </PopCard>
              ) : (
                <p className="prose-c">{result.verdict}</p>
              )}
            </section>
          )}

          {result.windows.length === 0 ? (
            <Section label="Nothing this month" last>
              <p className="prose-c">
                No {chosen.label.toLowerCase()} window in{' '}
                {monthTabs.find((m) => m.key === month).label}. This is the answer, not a
                failure — whole months are closed to some rites, and the tradition would rather
                you waited than picked a bad one. Try the next month.
              </p>
            </Section>
          ) : (
            <Section label={mine ? 'Windows, ranked for you' : 'Windows'}>
              <ul>
                {result.windows.map((w) => (
                  <li key={w.id} className="border-b border-rule py-5 last:border-b-0">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-body text-t1">{longDate(w.date)}</span>
                      <span className="flex-none text-meta text-t2 tnum">
                        {w.start} – {w.end}
                        {w.overnight && <span className="text-t4"> +1d</span>}
                      </span>
                    </div>
                    {w.hours !== null && (
                      <p className="mt-1 caps-sm t-faint tnum">
                        {w.hours} hours
                        {w.hours >= 23 && ' · sunrise to sunrise'}
                      </p>
                    )}
                    {w.reasons.length > 0 && (
                      <p className="mt-2 caps-sm t-faint">{w.reasons.join(' · ')}</p>
                    )}
                    {w.warnings.map((warning) => (
                      <p key={warning} className="mt-2 text-meta text-t3">{warning}</p>
                    ))}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-meta text-t3">
                Times are local to {placeLabel(place)}. A window that ends after midnight is
                marked +1.
              </p>
            </Section>
          )}

          <Section label="Before you act on this" last>
            <p className="prose-c">
              A muhurat is a ruleset over tithi, nakshatra and the weekday. It says when the day
              is clean, not whether the thing itself is wise.
            </p>
            <Kicker className="mt-10">Take it further</Kicker>
            <Row to="/consult" title="Ask an astrologer" note="A person, on your own chart" />
            <Row to="/horoscope" title="Today's reading" note="The day you are in now" />
            <Button to="/consult" variant="solid" className="mt-8">Book fifteen minutes</Button>
          </Section>
        </>
      )}

      <div className="h-8" />
    </>
  )
}
