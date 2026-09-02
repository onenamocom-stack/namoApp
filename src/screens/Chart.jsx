import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import ChartWheel from '../components/ChartWheel.jsx'
import { ChartNorth, ChartSouth } from '../components/ChartSquare.jsx'
import { useStore, useProfileFields } from '../store.jsx'
import { housesFrom, placementsFrom, useAstro } from '../lib/astro.js'
import { Field, Section, Segmented, Stub, firstName } from '../components/Primitives.jsx'

const SYSTEMS = ['vedic', 'south', 'western']
const NOTE = { vedic: 'northNote', south: 'southNote', western: 'westernNote' }

/**
 * Table view is the default, not the diagram.
 *
 * A wheel is beautiful and illegible to anyone who has not been taught to read
 * one. The table carries the same data in a form you can scan, and the wheel is
 * one tap away for people who want it. Every row drills into a placement page.
 *
 * Since phase 7 every number here is computed from the signed-in person's own
 * birth row rather than seeded. Three things follow, and all three are on
 * screen rather than in a comment:
 *
 * - **It can be loading, and it can fail.** A chart service that is down is not
 *   a person with no birth details, and the two never render as one sentence.
 * - **It can be incomplete.** Without a birth time there is no ascendant and no
 *   house has a cusp, so the houses and the diagrams are withheld and said to be
 *   withheld. Planets are unaffected and still shown.
 * - **The ayanamsa and house system are printed under Birth data.** A wrong one
 *   is wrong silently (docs/02-TRD.md §8); the only defence a reader has is
 *   being told which was used.
 */
export default function Chart() {
  const [view, setView] = useState('table')
  const { chartSystem, setChartSystem, t, session, sessionReady } = useStore()
  const me = useProfileFields()
  const [params] = useSearchParams()

  const chart = useAstro('chart', {
    ready: sessionReady,
    who: session?.user?.id ?? null,
  })

  const placements = placementsFrom(chart.payload, chart.timeKnown)
  const houses = housesFrom(chart.payload, chart.timeKnown)

  /* A consultant's booking row (ProConsult.jsx) can open this with a client's
     birth date/time in the query string, so the header and "Birth data" fields
     below prefill for them. What does NOT change: the diagram and the placement
     table are still the SIGNED-IN user's own. The chart op derives from the
     caller's row by design (rule 3) and there is no consultant-reads-a-client
     path yet, so this is flagged on screen rather than quietly passed off as a
     real reading for somebody else. */
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
      />

      {viewingOther && (
        <p className="mx-5 mt-4 rounded-xl bg-live/10 px-4 py-3 text-meta text-live">
          The diagram and placements below are still {firstName(me.name)}’s own. Charts are computed
          from the signed-in account, so this is not {firstName(display.name)}’s.
        </p>
      )}

      {/* Loading and refusal come before the tabs. Showing an empty table under
          a working switcher is the failure mode this project keeps paying for:
          it looks like an answer. */}
      {chart.loading && (
        <p className="mx-5 mt-6 text-meta text-t3">Working out where everything was.</p>
      )}

      {chart.refusal && (
        <div className="mx-5 mt-6 border-t border-rule pt-6">
          <p className="text-body text-t1">{chart.refusal.reason}</p>
          {chart.refusal.code === 'no_birth' && (
            <Link to="/profile" className="mt-3 inline-block text-meta text-t2 underline">
              Add them in your profile
            </Link>
          )}
        </div>
      )}

      {chart.payload && (
        <>
          {/* Two switches, not one four-way. The first is *what you are looking
              at* — the numbers or the diagram — and the second is *which
              tradition's diagram*. Folding them together would put "Table"
              beside "South Indian" as though they were the same kind of
              choice. */}
          <Segmented
            items={[
              { key: 'table', label: t('chart.table') },
              { key: 'chart', label: t(`chart.${chartSystem}`) },
            ]}
            value={view}
            onChange={setView}
          />

          {view === 'table' ? (
            <div key="table" className="animate-fade">
              <Section label="Placements">
                {/* Column headers, so the four numbers are not a guessing game. */}
                <div className="grid grid-cols-[2.5rem_1fr_4.5rem_2rem] items-baseline gap-3 border-b border-rule pb-2">
                  <span className="label text-left">Body</span>
                  <span className="label text-left">Sign</span>
                  <span className="label text-left">Degree</span>
                  <span className="label text-left">Hs</span>
                </div>

                <ul>
                  {placements.map((p) => (
                    <li key={p.id}>
                      <Link
                        to={`/chart/${p.id}`}
                        className="grid grid-cols-[2.5rem_1fr_4.5rem_2rem] items-baseline gap-3 border-b border-rule py-4 transition-opacity hover:opacity-60"
                      >
                        <span className="text-body text-t2">{p.glyph}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-body text-t1">
                            {p.body} in {p.sign}
                            {p.retrograde && <span className="text-t3"> ℞</span>}
                          </span>
                          <span className="mt-1 block text-meta text-t3">
                            {p.nakshatra ? `${p.nakshatra} · pada ${p.pada}` : ''}
                          </span>
                        </span>
                        <span className="text-meta text-t2 tnum">{p.degree}</span>
                        <span className="text-meta text-t2 tnum">
                          {chart.timeKnown ? p.house : '—'}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>

                <p className="mt-6 text-meta text-t3">Tap any row for the long version.</p>
              </Section>

              {houses ? (
                <Section label="Houses" last>
                  <ul className="grid grid-cols-2 gap-x-6">
                    {houses.map((h) => (
                      <li
                        key={h.house}
                        className="flex items-baseline justify-between gap-3 border-b border-rule py-3"
                      >
                        <span className="text-meta text-t3 tnum">{h.house}</span>
                        <span className="flex-1 text-meta text-t2">{h.sign}</span>
                        <span className="text-meta text-t1 tnum">{h.planets.join(' ') || '—'}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : (
                <Section label="Houses" last>
                  <p className="prose-c">
                    Your houses need the minute you were born. The ascendant moves a whole sign
                    every two hours, so twelve houses drawn from a guess are precise and wrong.
                  </p>
                  <Link to="/profile" className="mt-4 inline-block text-meta text-t2 underline">
                    Add your birth time
                  </Link>
                </Section>
              )}
            </div>
          ) : (
            <div key="chart" className="animate-fade">
              <Section label="Whole sign · Lahiri ayanamsa">
                <div className="no-scrollbar mb-6 flex gap-2 overflow-x-auto">
                  {SYSTEMS.map((sys) => (
                    <button
                      key={sys}
                      type="button"
                      aria-pressed={chartSystem === sys}
                      onClick={() => setChartSystem(sys)}
                      className="pill caps-sm flex-none"
                    >
                      {t(`chart.${sys}`)}
                    </button>
                  ))}
                </div>

                {/* All three take `houses`, which is null without a birth time.
                    Each draws its own empty frame in that case — the diagram is
                    the diagram, it just has nobody in it. */}
                {chartSystem === 'vedic' && <ChartNorth size={280} houses={houses} />}
                {chartSystem === 'south' && <ChartSouth size={280} houses={houses} />}
                {chartSystem === 'western' && <ChartWheel size={280} houses={houses} />}

                {!houses && (
                  <p className="prose-c mt-8">
                    Empty, because there is no birth time. Every line in this diagram is measured
                    from the ascendant, and the ascendant is the one thing a rough time does not
                    survive.
                  </p>
                )}

                <Stub className="mt-8" />
                <p className="prose-c mt-8">{t(`chart.${NOTE[chartSystem]}`)}</p>
                {chartSystem === 'south' && houses && (
                  <p className="mt-3 text-meta text-t3">
                    {t('chart.ascendant')} · {houses.find((h) => h.house === 1)?.sign}
                  </p>
                )}
              </Section>

              <Section label="Birth data" last>
                <Field k="Date" v={display.date} />
                <Field k="Time" v={chart.timeKnown ? display.time : 'Not known'} />
                <Field k="Place" v={me.birthPlace} />
                {/* Printed, not assumed. A chart on the wrong ayanamsa renders
                    perfectly and belongs to nobody, and the only way a reader
                    can catch that is by being told which one was used. */}
                <Field k="Ayanamsa" v="Lahiri" />
                <Field k="Houses" v="Whole sign" />
                <Field k="Source" v="freeastroapi.com" />
              </Section>
            </div>
          )}
        </>
      )}

      <div className="h-8" />
    </>
  )
}
