import { Navigate, useParams } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import Plate from '../components/Plate.jsx'
import { useStore } from '../store.jsx'
import { placementsFrom, useAstro } from '../lib/astro.js'
import { Field, Row, Section, Stub } from '../components/Primitives.jsx'

/**
 * One placement, at length.
 *
 * Until phase 7 the length was authored prose — a paragraph and three keywords
 * per planet, written once and shown to everyone. The chart is real now and
 * that prose is not: it was never computed from anybody's birth, and the API
 * does not return an equivalent. **So it is gone rather than kept as filler.**
 * What is here instead is the position itself, in full — nakshatra, its pada
 * and its lord, retrograde motion — which is more than the old page said and
 * all of it true of this person.
 */
export default function Placement() {
  const { id } = useParams()
  const { session, sessionReady } = useStore()

  const chart = useAstro('chart', { ready: sessionReady, who: session?.user?.id ?? null })
  const placements = placementsFrom(chart.payload, chart.timeKnown)

  if (chart.loading) {
    return (
      <>
        <TopBar title="Placement" back backTo="/chart" />
        <p className="section text-meta text-t3">Working out where everything was.</p>
      </>
    )
  }

  if (chart.refusal) {
    return (
      <>
        <TopBar title="Placement" back backTo="/chart" />
        <p className="section text-body text-t1">{chart.refusal.reason}</p>
      </>
    )
  }

  const p = placements.find((x) => x.id === id)
  // Not a 404: with no birth time there is no `asc` row, so a link that worked
  // yesterday can be absent today. Back to the chart, which explains why.
  if (!p) return <Navigate to="/chart" replace />

  const idx = placements.findIndex((x) => x.id === id)
  const next = placements[(idx + 1) % placements.length]

  return (
    <>
      <TopBar title={p.body} back backTo="/chart" />

      <section className="section pt-12">
        <p className="text-center text-huge font-light text-t2">{p.glyph}</p>
        <h1 className="mx-auto mt-6 max-w-[14ch] text-center text-title font-light">
          {p.body} in {p.sign}
        </h1>
        <p className="mt-3 text-center text-micro uppercase tracking-caps text-t3 tnum">
          {p.degree}
          {chart.timeKnown && ` · House ${p.house}`}
          {p.retrograde && ' · Retrograde'}
        </p>
        <Stub className="my-9" />
      </section>

      <Plate seed={p.id} className="h-44 w-full" label={`${p.body} · ${p.sign}`} />

      <Section label="Position">
        <Field k="Sign" v={p.sign} />
        <Field k="Degree" v={p.degree} />
        {/* Whole-sign houses need an ascendant, and an ascendant needs a
            minute. Saying so beats printing a number that moves. */}
        <Field k="House" v={chart.timeKnown ? p.house : 'Needs your birth time'} />
        <Field k="Motion" v={p.retrograde ? 'Retrograde' : 'Direct'} />
      </Section>

      {p.nakshatra && (
        <Section label="Nakshatra">
          <Field k="Nakshatra" v={p.nakshatra} />
          <Field k="Pada" v={p.pada} />
          <Field k="Lord" v={p.nakshatraLord} />
        </Section>
      )}

      <Section label="Keep going" last>
        <Row
          to={`/chart/${next.id}`}
          title={`${next.body} in ${next.sign}`}
          note={next.nakshatra ? `${next.nakshatra} · pada ${next.pada}` : undefined}
        />
        <Row to="/chart" title="Back to the full chart" />
        <Row to="/ask" title="Ask about this placement" note="Uses one question" />
      </Section>

      <div className="h-8" />
    </>
  )
}
