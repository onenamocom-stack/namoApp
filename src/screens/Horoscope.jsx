import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import { Button, Row, Ruler, Section, Segmented, Stub } from '../components/Primitives.jsx'
import { useStore } from '../store.jsx'
import {
  RASHIS,
  istDate,
  longDate,
  panchangFrom,
  readingFrom,
  useAstro,
  useMyChart,
} from '../lib/astro.js'

export const DAY_TABS = [
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
]

export const DAY_OFFSET = { yesterday: -1, today: 0, tomorrow: 1 }
const CONTEXT = { yesterday: 'Looking back.', today: null, tomorrow: 'Looking ahead.' }

/** The day's reading as the screen reads it, for either kind of reading. */
export function dayFrom(payload, key) {
  return readingFrom(payload, DAY_TABS.find((tb) => tb.key === key).label, CONTEXT[key])
}

/**
 * One day's reading, laid out. Used twice since 30 Sep 2026:
 *
 * - **generic** — a sign's reading here on /horoscope, free. It is computed
 *   from a fixed birth with the Moon in that sign (`docs/02-TRD.md` §8), so
 *   the dasha "Period" on it is that birth's and is not shown, and its clock
 *   windows are Ujjain's.
 * - **personal** — the reader's own, on /chart's Prediction tab, paid.
 *
 * `sky` is the shared Ujjain almanac. Two tithis for one day on two screens
 * is the disagreement phase 7 ended, so the reading's own panchang is never
 * shown.
 */
export function ReadingView({ day, sky, city, windowsAt, generic = false }) {
  const glance = generic ? day.glance.filter((g) => g.key !== 'Period') : day.glance
  return (
    <>
      <section className="animate-fade section pt-10">
        <p className="label mb-4">{longDate(day.date)}</p>

        {/* The day's own almanac, directly under its date — the only part
            that visibly changes between the three tabs. */}
        {sky && (
          <p className="mb-8 text-center text-micro uppercase tracking-caps text-t3">
            {[sky.tithi, sky.nakshatra, sky.yoga].filter(Boolean).join(' · ')}
            {city && <span className="text-t4"> · {city}</span>}
          </p>
        )}

        {day.context && (
          <p className="mb-6 text-center text-micro uppercase tracking-caps text-t3">
            {day.context}
          </p>
        )}

        <h1 className="mx-auto max-w-[16ch] text-center text-title font-semibold">{day.headline}</h1>
        <Stub className="my-8" />
        <p className="horoscope">{day.body}</p>
      </section>

      {day.focus && (
        <Section label={day.focusLabel}>
          <p className="mx-auto max-w-[20ch] text-center text-lead font-semibold">{day.focus}</p>
        </Section>
      )}

      {(glance.length > 0 || day.intensity !== null) && (
        <Section label="Day at a glance">
          <dl className="mx-auto max-w-[18rem]">
            {glance.map((g) => (
              <div key={g.key} className="flex items-baseline justify-between gap-6 py-3 rule-b">
                <dt className="label text-left">{g.key}</dt>
                <dd className="text-body text-t1">{g.value}</dd>
              </div>
            ))}
          </dl>
          {day.intensity !== null && (
            <div className="mx-auto mt-10 max-w-[18rem]">
              <div className="mb-3 flex items-baseline justify-between">
                <span className="label text-left">Overall</span>
                <span className="text-body text-t1 tnum">{day.intensity}</span>
              </div>
              <Ruler value={day.intensity} />
            </div>
          )}
        </Section>
      )}

      {(day.do.length > 0 || day.dont.length > 0) && (
        <Section label="Do / Don't">
          <div className="grid grid-cols-2 gap-x-5">
            <div>
              <p className="label border-b border-rule pb-2 text-left">Do</p>
              <ul className="mt-3">
                {day.do.map((t) => (
                  <li key={t} className="py-2.5 text-body text-t1">{t}</li>
                ))}
              </ul>
            </div>
            <div className="border-l border-rule pl-5">
              <p className="label border-b border-rule pb-2 text-left">Don&apos;t</p>
              <ul className="mt-3">
                {day.dont.map((t) => (
                  <li key={t} className="py-2.5 text-body text-t2">{t}</li>
                ))}
              </ul>
            </div>
          </div>
        </Section>
      )}

      {/* Named with its place: sunrise moves about two hours across India. */}
      {day.windows.length > 0 && (
        <Section label="Windows">
          <ul>
            {day.windows.map((w) => (
              <li
                key={w.key}
                className="flex items-baseline justify-between gap-4 border-b border-rule py-3.5"
              >
                <span className="text-body text-t1">{w.label}</span>
                <span className="flex-none text-meta text-t2 tnum">
                  {w.start} – {w.end}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-meta text-t3">
            Auspicious first, then the three to work around.
            {windowsAt && ` Clock times for ${windowsAt}.`}
          </p>
        </Section>
      )}

      {(day.power || day.pressure) && (
        <Section label="Power &amp; pressure">
          {day.power && (
            <div className="border-b border-rule pb-6">
              <p className="label mb-2 text-left">Power</p>
              <p className="text-read text-t1">{day.power}</p>
            </div>
          )}
          {day.pressure && (
            <div className="pt-6">
              <p className="label mb-2 text-left">Pressure</p>
              <p className="text-read text-t2">{day.pressure}</p>
            </div>
          )}
        </Section>
      )}

      {day.ratings.length > 0 && (
        <Section label={`Read across ${day.ratings.length} areas`}>
          <ul className="mx-auto max-w-[18rem]">
            {day.ratings.map((r) => (
              <li key={r.area} className="border-b border-rule py-4">
                <div className="mb-2 flex items-baseline justify-between gap-5">
                  <span className="label text-left">{r.area}</span>
                  <span className="text-meta text-t3 tnum">{r.score}/100</span>
                </div>
                <Ruler value={r.score} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {day.transits.length > 0 && (
        <Section label="What is moving">
          <ul>
            {day.transits.map((t) => (
              <li key={t.id} className="border-b border-rule pb-6 pt-1 last:border-b-0">
                <div className="mb-2 flex items-baseline justify-between gap-4">
                  <h3 className="text-lead font-semibold">{t.title}</h3>
                  <span className="flex-none text-micro uppercase tracking-caps text-t3">
                    {t.weight}
                  </span>
                </div>
                <p className="text-body text-t2">{t.body}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {day.sections.length > 0 && (
        <Section label="At length">
          <ul>
            {day.sections.map((s) => (
              <li key={s.key} className="border-b border-rule pb-6 pt-1 last:border-b-0">
                <div className="mb-2 flex items-baseline justify-between gap-4">
                  <h3 className="text-lead font-semibold">{s.title}</h3>
                  <span className="flex-none text-micro uppercase tracking-caps text-t3 tnum">
                    {s.score}
                  </span>
                </div>
                <p className="text-body text-t2">{s.summary}</p>
                {s.advice && <p className="mt-3 text-body text-t1">{s.advice}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {day.reflections.length > 0 && (
        <Section label="Sit with this">
          {day.reflections.map((r, i) => (
            <div key={r}>
              {i > 0 && <Stub className="my-7" />}
              <p className="horoscope">{r}</p>
            </div>
          ))}
        </Section>
      )}
    </>
  )
}

/** Twelve chips, one per rashi, in a row that scrolls sideways. */
export function SignPicker({ value, onChange, className = '' }) {
  return (
    <ul className={`no-scrollbar flex gap-2 overflow-x-auto ${className}`}>
      {RASHIS.map((s) => (
        <li key={s} className="flex-none">
          <button type="button" onClick={() => onChange(s)} className="pill caps-sm" aria-pressed={value === s}>
            {s}
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * The daily horoscope for any of the twelve signs — free, and the same for
 * everybody born with the Moon in that sign (30 Sep 2026).
 *
 * This page was the reader's own reading from 22 to 30 Sep. That reading is
 * paid now and lives on /chart's Prediction tab; this page is what it was on
 * 7 Sep, twelve readings a day for everybody, with the sign named because
 * the reading belongs to the sign. It opens on the reader's own moon sign,
 * off their chart, and any other sign is one tap.
 */
export default function Horoscope() {
  const [key, setKey] = useState('today')
  const { session, sessionReady } = useStore()
  const mine = useMyChart({ ready: sessionReady, who: session?.user?.id ?? null })
  const [picked, setPicked] = useState(null)
  const sign = picked ?? mine.rashi ?? 'Aries'

  const date = useMemo(() => istDate(DAY_OFFSET[key]), [key])
  // Waits for the chart only while it can still name the reader's sign.
  const reading = useAstro('rashifal', { date, sign, ready: Boolean(sessionReady && (!mine.loading || picked)) })
  const almanac = useAstro('panchang', { date, ready: sessionReady })
  const day = dayFrom(reading.payload, key)

  return (
    <>
      <TopBar
        title="Daily horoscope"
        sub={`${sign} moon${sign === mine.rashi ? ' · yours' : ''}`}
        back
        backTo="/home"
      />

      <section className="px-5 pt-4">
        <SignPicker value={sign} onChange={setPicked} />
      </section>

      <Segmented items={DAY_TABS} value={key} onChange={setKey} />

      {reading.loading && (
        <p className="section text-meta text-t3">Reading {sign} for {longDate(date)}.</p>
      )}
      {reading.refusal && (
        <div className="section">
          <p className="text-body text-t1">{reading.refusal.reason}</p>
        </div>
      )}

      {day && !reading.loading && (
        <ReadingView
          key={`${sign}-${key}`}
          day={day}
          sky={panchangFrom(almanac.payload)}
          city={almanac.city}
          windowsAt="Ujjain"
          generic
        />
      )}

      <Section label="Your own" last>
        <p className="prose-c">
          This is {sign}&apos;s reading, the same for everyone born with the Moon there. Yours,
          from the minute and place you were born, is in your chart.
        </p>
        <Button to="/chart?tab=prediction" variant="solid" className="mt-8">
          Your predictions
        </Button>
        <Row to="/chart" title="Your full chart" note="D1 and every divisional chart" />
        <Row to="/muhurat" title="Muhurat" note="When to start something that matters" />
        <Link to="/consult" className="mt-6 block text-center text-meta text-t2 underline">
          Or ask an astrologer
        </Link>
      </Section>

      <div className="h-8" />
    </>
  )
}
