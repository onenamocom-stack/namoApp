import { Navigate, useParams } from 'react-router-dom'
import { placements } from '../data/mock.js'
import { TopBar } from '../components/Chrome.jsx'
import Plate from '../components/Plate.jsx'
import { Field, Row, Section, Stub, Tag } from '../components/Primitives.jsx'

export default function Placement() {
  const { id } = useParams()
  const p = placements.find((x) => x.id === id)
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
          {p.degree} · House {p.house}
        </p>
        <Stub className="my-9" />
        <p className="horoscope">{p.line}</p>
      </section>

      <Plate seed={p.id} className="h-44 w-full" label={`${p.body} · ${p.sign}`} />

      <Section label="The long version">
        <p className="text-read text-t2">{p.detail}</p>
      </Section>

      <Section label="Reads as">
        <div className="flex flex-wrap justify-center gap-2">
          {p.keywords.map((k) => (
            <Tag key={k}>{k}</Tag>
          ))}
        </div>
      </Section>

      <Section label="Position">
        <Field k="Sign" v={p.sign} />
        <Field k="House" v={p.house} />
        <Field k="Degree" v={p.degree} />
      </Section>

      <Section label="Keep going" last>
        <Row to={`/chart/${next.id}`} title={`${next.body} in ${next.sign}`} note={next.line} />
        <Row to="/chart" title="Back to the full chart" />
        <Row to="/ask" title="Ask about this placement" note="Uses one question" />
      </Section>

      <div className="h-8" />
    </>
  )
}
