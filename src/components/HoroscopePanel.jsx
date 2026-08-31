import { useState } from 'react'
import { Link } from 'react-router-dom'
import { days, user } from '../data/mock.js'
import { Kicker, PopBar, PopButton, PopCard, PopTag } from './Pop.jsx'
import { Ticks } from './Primitives.jsx'
import { useStore } from '../store.jsx'

const DAYS = [
  { key: 'yesterday', label: 'Yest' },
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tmrw' },
]

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
 */
export default function HoroscopePanel() {
  const { horoscopeOpen, setHoroscopeOpen, showToast, hasFlag, toggleFlag } = useStore()
  const [key, setKey] = useState('today')

  if (!horoscopeOpen) return null

  const day = days[key]
  const transit = day.transits[0]
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
              <p className="mt-0.5 caps-sm t-faint">
                {user.sunSign} · {user.moonSign} · {user.risingSign}
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
          <section className="border-b border-rule px-4 py-5">
            <p className="caps-sm gold">{day.date}</p>
            <h2 className="mt-2 font-display text-title leading-tight t-heading">{day.headline}</h2>
            <p className="mt-3 text-meta t-body">{day.body}</p>

            <dl className="mt-5 grid grid-cols-3 border-y border-stroke py-3">
              {[
                ['Mood', day.mood],
                ['Colour', day.luckyColour],
                ['Number', day.luckyNumber],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="caps-sm t-faint">{k}</dt>
                  <dd className="mt-1 text-meta tnum t-heading">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-4">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="caps-sm t-faint">Day intensity</span>
                <span className="caps-sm gold tnum">{day.intensity}%</span>
              </div>
              <PopBar value={day.intensity} />
            </div>
          </section>

          <section className="border-b border-rule px-4 py-5">
            <Kicker>{day.focusLabel}</Kicker>
            <PopCard className="mt-3 p-3">
              <p className="text-body t-heading">{day.focus}</p>
            </PopCard>
          </section>

          <section className="border-b border-rule px-4 py-5">
            <Kicker>Current transit</Kicker>
            <PopCard className="mt-3 p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-meta t-heading">{transit.title}</p>
                <PopTag tone="gold">{transit.weight}</PopTag>
              </div>
              <p className="mt-1.5 caps-sm t-faint tnum">{transit.window}</p>
              <p className="mt-2 text-meta t-body">{transit.body}</p>
            </PopCard>
          </section>

          <section className="border-b border-rule px-4 py-5">
            <Kicker>Across four areas</Kicker>
            <ul className="mt-3">
              {Object.entries(day.ratings).map(([area, value]) => (
                <li key={area} className="flex items-center gap-3 border-b border-rule py-2.5">
                  <span className="w-14 flex-none caps-sm t-faint">{area}</span>
                  <Ticks value={value} className="flex-1" />
                  <span className="w-8 flex-none text-right caps-sm tnum t-sub">{value}/5</span>
                </li>
              ))}
            </ul>
          </section>

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
