import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import { ChartNorth } from '../components/ChartSquare.jsx'
import Paywall from '../components/Paywall.jsx'
import { useStore, useProfileFields } from '../store.jsx'
import {
  housesFrom,
  istDate,
  longDate,
  panchangFrom,
  useAstro,
  vargasFrom,
} from '../lib/astro.js'
import { entitlement } from '../lib/wallet.js'
import { Field, Section, Segmented, firstName } from '../components/Primitives.jsx'
import { DAY_OFFSET, DAY_TABS, ReadingView, dayFrom } from './Horoscope.jsx'

const TABS = [
  { key: 'chart', label: 'Chart' },
  { key: 'prediction', label: 'Prediction' },
]

/**
 * The full chart — where Consult's Horoscope tile lands (30 Sep 2026).
 *
 * Two tabs, as the owner laid them out: **Chart** on the left, where Table
 * used to be, and **Prediction** on the right.
 *
 * - **Chart** is Vedic only. The placement table is gone. D1 leads, drawn;
 *   under it every divisional chart the vendor computes (D2…D60), each one
 *   a row that opens to its own diagram. All of it was computed once at
 *   sign-up (`Computing.jsx`) and is cached forever, on the server and in
 *   this browser — opening this screen computes nothing.
 * - **Prediction** is the reader's own yesterday / today / tomorrow, from
 *   their birth. ₹99 for 30 days; the price is the server's and arrives on
 *   the refusal. The free reading is by sign, on Home and /horoscope.
 *
 * Without a birth time there is no ascendant, so every diagram is drawn
 * empty and says why — every division is measured from its own ascendant.
 */
export default function Chart() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'prediction' ? 'prediction' : 'chart'
  const setTab = (next) => setParams(next === 'chart' ? {} : { tab: next }, { replace: true })
  const { t, session, sessionReady } = useStore()
  const me = useProfileFields()
  const who = session?.user?.id ?? null

  const chart = useAstro('chart', { ready: sessionReady, who })

  /* A consultant's booking row (ProConsult.jsx) opens this with a client's
     birth details in the query string, for the header only. The diagrams are
     still the SIGNED-IN account's — the chart op reads the caller's own row
     (rule 3) — and the screen says so rather than passing one off as the
     other. */
  const viewingOther = params.has('name')
  const display = {
    name: params.get('name') || me.name,
    date: params.get('date') || me.birthDate,
    time: params.get('time') || me.birthTime || (chart.timeKnown ? '' : 'Time not known'),
  }

  return (
    <>
      <TopBar
        title={viewingOther ? `${firstName(display.name)}’s chart` : 'Your chart'}
        sub={[display.date, display.time].filter(Boolean).join(' · ')}
        back
        backTo="/consult"
      />

      {viewingOther && (
        <p className="mx-5 mt-4 rounded-xl bg-live/10 px-4 py-3 text-meta text-live">
          The diagrams below are still {firstName(me.name)}’s own. Charts are computed from the
          signed-in account, so this is not {firstName(display.name)}’s.
        </p>
      )}

      <Segmented items={TABS} value={tab} onChange={setTab} />

      {tab === 'chart' ? (
        <ChartTab chart={chart} who={who} ready={sessionReady} display={display} me={me} t={t} />
      ) : (
        <PredictionTab who={who} ready={sessionReady} me={me} />
      )}

      <div className="h-8" />
    </>
  )
}

function ChartTab({ chart, who, ready, display, me, t }) {
  const vargas = useAstro('vargas', { ready, who })
  const divisions = vargasFrom(vargas.payload, vargas.timeKnown).filter((v) => v.division !== 1)
  const houses = housesFrom(chart.payload, chart.timeKnown)
  const [open, setOpen] = useState(null)

  /* Loading and refusal before anything else: an empty diagram under a
     working header looks like an answer. */
  if (chart.loading) {
    return <p className="mx-5 mt-6 text-meta text-t3">Opening your chart.</p>
  }
  if (chart.refusal) {
    return (
      <div className="mx-5 mt-6 border-t border-rule pt-6">
        <p className="text-body text-t1">{chart.refusal.reason}</p>
        {chart.refusal.code === 'no_birth' && (
          <Link to="/profile" className="mt-3 inline-block text-meta text-t2 underline">
            Add them in your profile
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className="animate-fade">
      <Section label="D1 · Rashi · Lahiri, whole sign">
        <ChartNorth size={280} houses={houses} />
        {!houses && (
          <p className="prose-c mt-8">
            Empty, because there is no birth time. Every line in this diagram is measured from the
            ascendant, and the ascendant is the one thing a rough time does not survive.
          </p>
        )}
        {houses && <p className="prose-c mt-8">{t('chart.northNote')}</p>}
      </Section>

      <Section label="Divisional charts">
        {vargas.loading && <p className="text-meta text-t3">Working out the divisions.</p>}
        {vargas.refusal && <p className="text-meta text-t2">{vargas.refusal.reason}</p>}
        <ul>
          {divisions.map((v) => (
            <li key={v.key} className="border-b border-rule">
              <button
                type="button"
                onClick={() => setOpen(open === v.key ? null : v.key)}
                aria-expanded={open === v.key}
                className="flex w-full items-baseline justify-between gap-4 py-4 text-left"
              >
                <span className="min-w-0">
                  <span className="text-body font-semibold text-t1">{v.key}</span>
                  <span className="ml-2 text-meta text-t2">{v.name}</span>
                </span>
                <span className="flex-none text-meta text-t3" aria-hidden>
                  {open === v.key ? '▴' : '▾'}
                </span>
              </button>
              {open === v.key && (
                <div className="animate-fade pb-6">
                  <ChartNorth size={260} houses={v.houses} />
                  {v.ascendant && v.houses && (
                    <p className="mt-4 text-center text-meta text-t3">{v.ascendant} ascendant</p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section label="Birth data" last>
        <Field k="Date" v={display.date} />
        <Field k="Time" v={chart.timeKnown ? display.time : 'Not known'} />
        <Field k="Place" v={me.birthPlace} />
        {/* Printed, not assumed: a chart on the wrong ayanamsa renders
            perfectly and belongs to nobody. */}
        <Field k="Ayanamsa" v="Lahiri" />
        <Field k="Houses" v="Whole sign" />
      </Section>
    </div>
  )
}

function PredictionTab({ who, ready, me }) {
  const [key, setKey] = useState('today')
  // Bumped after a purchase, so the refused reading is asked for again.
  const [attempt, setAttempt] = useState(0)
  const [until, setUntil] = useState(null)
  const date = useMemo(() => istDate(DAY_OFFSET[key]), [key])

  const reading = useAstro('horoscope', { date, ready, who, attempt })
  const almanac = useAstro('panchang', { date, ready })
  const day = dayFrom(reading.payload, key)
  const locked = reading.refusal?.code === 'needs_purchase'

  /* How long the plan runs, said once under the tabs — a monthly plan whose
     end date is nowhere on screen is one people find out about by losing. */
  useEffect(() => {
    if (!ready || !who || locked || reading.loading) return
    entitlement('prediction').then((s) => setUntil(s.owned ? s.expires_at : null))
  }, [ready, who, locked, reading.loading, attempt])

  return (
    <div className="animate-fade">
      <Segmented items={DAY_TABS} value={key} onChange={setKey} />

      {until && (
        <p className="mt-3 text-center caps-sm t-faint">Your plan runs to {longDate(until)}</p>
      )}

      {reading.loading && (
        <p className="section text-meta text-t3">Reading the sky for {longDate(date)}.</p>
      )}

      {locked && (
        <section className="section">
          <Paywall
            title="Your own predictions"
            note="Yesterday, today and tomorrow, read from the minute and place you were born — not your sign's. Thirty days."
            sku="prediction"
            pricePaise={reading.refusal.pricePaise}
            onBought={() => setAttempt((a) => a + 1)}
          />
          <Link to="/horoscope" className="mt-5 block text-center text-meta text-t2 underline">
            Read your sign&apos;s free reading instead
          </Link>
        </section>
      )}

      {reading.refusal && !locked && (
        <div className="section">
          <p className="text-body text-t1">{reading.refusal.reason}</p>
          {reading.refusal.code === 'no_birth' && (
            <Link to="/profile" className="mt-3 inline-block text-meta text-t2 underline">
              Add them in your profile
            </Link>
          )}
        </div>
      )}

      {day && !reading.loading && (
        <ReadingView
          key={key}
          day={day}
          sky={panchangFrom(almanac.payload)}
          city={almanac.city}
          windowsAt={me.birthPlace ? `${me.birthPlace}, where you were born` : null}
        />
      )}
    </div>
  )
}
