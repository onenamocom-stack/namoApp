import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Kicker, PopBar, PopButton, PopCard, PopTag } from './Pop.jsx'
import { useStore } from '../store.jsx'
import { istDate, longDate, readingFrom, useAstro, useMyChart } from '../lib/astro.js'

const DAYS = [
  { key: 'yesterday', label: 'Yest' },
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tmrw' },
]

const OFFSET = { yesterday: -1, today: 0, tomorrow: 1 }

/**
 * The horoscope panel.
 *
 * The top-right Horoscope control is a focused action, so it opens this over
 * whatever tab you are on rather than navigating to Profile — sending it to
 * `/profile/horoscope` was the reported bug: a one-tap reading turned into a
 * trip to a different section you then had to find your way back from.
 *
 * Slides from the right like the chat panel, so the two overlays behave
 * identically and neither one is a route.
 *
 * It reads the same computed horoscope `/horoscope` does, on the same three
 * dates, so the panel and the full screen cannot say different things about the
 * same day — and whichever opens second pays nothing, because the server cached
 * the first.
 */
export default function HoroscopePanel() {
  const { horoscopeOpen, setHoroscopeOpen, showToast, hasFlag, toggleFlag, session, sessionReady } =
    useStore()
  const [key, setKey] = useState('today')

  /* Hooks stay unconditional, so they sit above the early return and the panel
     being shut is expressed as `ready: false` rather than as no hook at all.
     Nothing is fetched until it opens. */
  const date = useMemo(() => istDate(OFFSET[key]), [key])
  const horoscope = useAstro('horoscope', {
    date,
    ready: sessionReady && horoscopeOpen,
    who: session?.user?.id ?? null,
  })

  /* The header line is a fact about a birth, not about today, so it comes off
     the chart — which is cached with no expiry and costs nothing to ask for
     again. Reading it off the day's reading, as this used to, tied a permanent
     fact to a daily fetch and would start lying the moment the reading stops
     being per-person. */
  const mine = useMyChart({
    ready: sessionReady && horoscopeOpen,
    who: session?.user?.id ?? null,
  })

  if (!horoscopeOpen) return null

  const day = readingFrom(horoscope.payload, key, null)
  const transit = day?.transits[0]
  const close = () => setHoroscopeOpen(false)

  return (
    <div className="absolute inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close horoscope"
        onClick={close}
        className="absolute inset-0 animate-fade bg-ink opacity-40"
      />

      <aside className="glass-panel relative flex h-full w-[88%] max-w-[380px] animate-slide-in flex-col border-l border-stroke">
        <header className="flex-none border-b border-stroke">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="min-w-0">
              <p className="caps t-heading">Horoscope</p>
              {/* `rising` is already null when the birth time is unknown, so
                  there is no second guard here. */}
              <p className="mt-0.5 caps-sm t-faint">
                {[mine.rashi && `${mine.rashi} moon`, mine.rising && `${mine.rising} rising`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <button type="button" onClick={close} className="caps-sm t-body" aria-label="Close">
              Close
            </button>
          </div>

          <div className="flex" role="tablist">
            {DAYS.map((d) => (
              <button
                key={d.key}
                role="tab"
                type="button"
                aria-selected={key === d.key}
                onClick={() => setKey(d.key)}
                className={`caps-sm flex-1 border-b-2 py-2.5 transition-colors ${
                  key === d.key ? 'border-gold gold' : 'border-transparent t-faint'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </header>

        <div key={key} className="no-scrollbar min-h-0 flex-1 animate-fade overflow-y-auto">
          {horoscope.loading && <p className="px-4 py-6 text-meta t-faint">Reading the sky.</p>}

          {/* The refusal in the panel's own words rather than a blank column. A
              chart service that is down and a person with no birth details are
              different answers, and they read differently here too. */}
          {horoscope.refusal && (
            <div className="px-4 py-6">
              <p className="text-meta t-body">{horoscope.refusal.reason}</p>
              {horoscope.refusal.code === 'no_birth' && (
                <Link to="/profile" onClick={close} className="mt-3 block caps-sm t-faint">
                  Add them in your profile
                </Link>
              )}
            </div>
          )}

          {day && (
            <>
          <section className="border-b border-rule px-4 py-5">
            <p className="caps-sm gold">{longDate(day.date)}</p>
            <h2 className="mt-2 font-display text-title leading-tight t-heading">{day.headline}</h2>
            <p className="mt-3 text-meta t-body">{day.body}</p>

            {/* Mood, lucky colour and lucky number stood here and are gone.
                Nothing computes them, and a number presented as yours has to
                come from somewhere. The overall score does come from
                somewhere. */}
            {day.intensity !== null && (
              <div className="mt-5 border-t border-stroke pt-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="caps-sm t-faint">Overall</span>
                  <span className="caps-sm gold tnum">{day.intensity}/100</span>
                </div>
                <PopBar value={day.intensity} />
              </div>
            )}
          </section>

          <section className="border-b border-rule px-4 py-5">
            <Kicker>{day.focusLabel}</Kicker>
            <PopCard className="mt-3 p-3">
              <p className="text-body t-heading">{day.focus}</p>
            </PopCard>
          </section>

          {transit && (
            <section className="border-b border-rule px-4 py-5">
              <Kicker>Current transit</Kicker>
              <PopCard className="mt-3 p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-meta t-heading">{transit.title}</p>
                  <PopTag tone="gold">{transit.weight}</PopTag>
                </div>
                <p className="mt-2 text-meta t-body">{transit.body}</p>
              </PopCard>
            </section>
          )}

          <section className="border-b border-rule px-4 py-5">
            <Kicker>Across four areas</Kicker>
            <ul className="mt-3">
              {Object.entries(day.ratings)
                .filter(([, value]) => value !== null)
                .map(([area, value]) => (
                  <li key={area} className="flex items-center gap-3 border-b border-rule py-2.5">
                    <span className="w-14 flex-none caps-sm t-faint">{area}</span>
                    <PopBar value={value} className="flex-1" />
                    <span className="w-10 flex-none text-right caps-sm tnum t-sub">{value}</span>
                  </li>
                ))}
            </ul>
          </section>
            </>
          )}

          <section className="px-4 py-5">
            <div className="flex gap-2">
              <PopButton
                size="sm"
                variant={hasFlag(`save:day-${key}`) ? 'gold' : 'default'}
                onClick={() =>
                  toggleFlag(`save:day-${key}`, {
                    on: 'Saved to your readings',
                    off: 'Removed from your readings',
                  })
                }
              >
                {hasFlag(`save:day-${key}`) ? 'Saved' : 'Save'}
              </PopButton>
              <PopButton size="sm" onClick={() => showToast('Reading copied')}>
                Share
              </PopButton>
            </div>

            <Link
              to="/profile/horoscope"
              onClick={close}
              className="mt-5 block text-center caps-sm t-faint"
            >
              Open the full reading in Profile
            </Link>
          </section>
        </div>
      </aside>
    </div>
  )
}
