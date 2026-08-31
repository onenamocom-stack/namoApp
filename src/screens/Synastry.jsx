import { Navigate, useParams } from 'react-router-dom'
import { people } from '../data/mock.js'
import { TopBar } from '../components/Chrome.jsx'
import { Avatar, Button, Row, Ruler, Section, Stub } from '../components/Primitives.jsx'
import { useProfileFields } from '../store.jsx'

export default function Synastry() {
  const { id } = useParams()
  /* Above the early return: hooks cannot be conditional, and this screen bails
     to /people when the id is unknown. */
  const me = useProfileFields()
  const p = people.find((x) => x.id === id)
  if (!p) return <Navigate to="/people" replace />

  return (
    <>
      <TopBar title={p.name} back backTo="/people" sub={p.since} />

      <section className="section pt-10">
        <div className="flex items-center justify-center gap-6">
          <div className="text-center">
            <Avatar initials={me.initials} size={48} />
            <p className="mt-2 text-micro uppercase tracking-caps text-t3">You</p>
          </div>
          <span className="text-body text-t4">×</span>
          <div className="text-center">
            <Avatar initials={p.initials} size={48} />
            <p className="mt-2 text-micro uppercase tracking-caps text-t3">{p.name}</p>
          </div>
        </div>

        <Stub className="my-8" />
        <h1 className="mx-auto max-w-[16ch] text-center text-title font-light">{p.verdict}</h1>
        <p className="mt-6 text-center text-micro uppercase tracking-caps text-t3 tnum">
          {p.sun} · {p.moon} · {p.rising}
        </p>
      </section>

      {/* Four axes instead of one score. A single compatibility percentage is the
          part of this feature people screenshot and the part they misread. */}
      <Section label="Four axes">
        <ul>
          {p.axes.map((a) => (
            <li key={a.key} className="border-b border-rule py-5 last:border-b-0">
              <div className="mb-3 flex items-baseline justify-between gap-4">
                <span className="label text-left">{a.key}</span>
                <span className="text-body text-t1 tnum">{a.value}</span>
              </div>
              <Ruler value={a.value} />
              <p className="mt-3 text-meta text-t2">{a.note}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section label="What is actually happening">
        <ul>
          {p.aspects.map((a) => (
            <li key={a.title} className="border-b border-rule pb-6 pt-1 last:border-b-0">
              <h3 className="mb-2 text-lead font-light">{a.title}</h3>
              <p className="text-body text-t2">{a.line}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section label="One instruction">
        <p className="horoscope">{p.advice}</p>
      </Section>

      <Section label="Go further" last>
        <Row to="/premium" title="Eros — the full reading for two" note="Written for both of you to read at once" />
        <Row to="/consult" title="Take this to a person" note="A human reads the same two charts" />
        <Button to="/people" variant="quiet" className="mt-10">
          Back to people
        </Button>
      </Section>

      <div className="h-8" />
    </>
  )
}
