import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import { Kicker, PopCard } from '../components/Pop.jsx'
import { Button, Row, Ruler, Section, Stub } from '../components/Primitives.jsx'
import SubjectForm from '../components/SubjectForm.jsx'
import { matchCharts, matchFrom, useMyChart } from '../lib/astro.js'
import { useProfileFields, useStore } from '../store.jsx'

/**
 * Ashtakoota — two charts read against each other, out of thirty-six.
 *
 * **Two slots, and the first one defaults to you.** A seeker checking a
 * proposal is one case; a parent matching their child against somebody
 * else's is the other, and it is at least as common. Switching the first
 * slot to "somebody else" covers it without a second screen.
 *
 * **Nothing typed here is saved**, the same rule Namo AI's subject form
 * obeys: a third party did not agree to be in this database. The server
 * computes the match and stores it under a hash of the two births, with no
 * name, no date and no account id attached.
 *
 * **The total is shown with the eight kootas under it, never alone.** One
 * number out of thirty-six is the part people screenshot and the part they
 * misread — 18 is the traditional pass mark, and a pair can clear it while
 * carrying a dosha that matters more than the total does.
 */
export default function Match() {
  const { session, sessionReady } = useStore()
  const me = useProfileFields()
  const mine = useMyChart({ ready: sessionReady, who: session?.user?.id ?? null })

  // null in the first slot means "me", read server-side from my own row.
  const [first, setFirst] = useState(null)
  const [editingFirst, setEditingFirst] = useState(false)
  const [second, setSecond] = useState(null)
  const [state, setState] = useState({ loading: false, result: null, refusal: null })

  const run = async (personTwo) => {
    setSecond(personTwo)
    setState({ loading: true, result: null, refusal: null })
    const res = await matchCharts(first, personTwo)
    setState(
      res.ok
        ? { loading: false, result: { ...matchFrom(res.data), timeKnown: res.time_known }, refusal: null }
        : { loading: false, result: null, refusal: res },
    )
  }

  const reset = () => {
    setSecond(null)
    setState({ loading: false, result: null, refusal: null })
  }

  const names = {
    person1: first?.name || me.name || 'You',
    person2: second?.name || 'Them',
  }

  return (
    <>
      <TopBar title="Matching" sub="Ashtakoota, out of 36" back backTo="/consult" />

      {!state.result && !state.loading && (
        <>
          {/* ── Slot one ─────────────────────────────────────────────────── */}
          <Section label="First chart">
            {editingFirst ? (
              <SubjectForm
                title="Whose chart is first?"
                cta="Use these details"
                onDone={(person) => { setFirst(person); setEditingFirst(false) }}
                onCancel={() => setEditingFirst(false)}
              />
            ) : (
              <PersonCard
                name={names.person1}
                note={first
                  ? [first.birth_place, first.birth_date].filter(Boolean).join(' · ')
                  : [mine.rashi && `${mine.rashi} moon`, me.birthPlace].filter(Boolean).join(' · ')}
                action={first ? 'Use my own chart' : 'Somebody else'}
                onAction={() => (first ? setFirst(null) : setEditingFirst(true))}
              />
            )}
            {!first && !mine.loading && mine.refusal?.code === 'no_birth' && (
              <p className="mt-4 text-meta text-t3">
                Your own birth details are missing.{' '}
                <Link to="/profile" className="underline">Add them</Link>, or match two other
                people.
              </p>
            )}
          </Section>

          {/* ── Slot two ─────────────────────────────────────────────────── */}
          <Section label="Second chart" last>
            <SubjectForm
              title="Whose chart is second?"
              cta="Read the match"
              onDone={run}
              onCancel={reset}
            />
          </Section>
        </>
      )}

      {state.loading && (
        <p className="section text-meta text-t3">Reading the two charts against each other.</p>
      )}

      {state.refusal && (
        <div className="section">
          <p className="text-body text-t1">{state.refusal.reason}</p>
          {state.refusal.code === 'no_birth' && (
            <Link to="/profile" className="mt-3 inline-block text-meta text-t2 underline">
              Add your birth details
            </Link>
          )}
          <Button onClick={reset} variant="quiet" className="mt-6">Start again</Button>
        </div>
      )}

      {state.result && <Result match={state.result} names={names} onReset={reset} />}

      <div className="h-8" />
    </>
  )
}

function PersonCard({ name, note, action, onAction }) {
  return (
    <PopCard className="flex items-baseline justify-between gap-4 p-4">
      <span className="min-w-0">
        <span className="block text-body t-heading">{name}</span>
        {note && <span className="mt-1 block caps-sm t-faint">{note}</span>}
      </span>
      <button type="button" onClick={onAction} className="flex-none caps-sm text-t2 underline">
        {action}
      </button>
    </PopCard>
  )
}

function Result({ match, names, onReset }) {
  const unknownTime = [
    match.timeKnown?.person1 === false && names.person1,
    match.timeKnown?.person2 === false && names.person2,
  ].filter(Boolean)

  return (
    <>
      <section className="animate-fade section pt-10">
        <p className="text-center text-micro uppercase tracking-caps text-t3">
          {names.person1} × {names.person2}
        </p>
        <p className="mt-6 text-center text-title font-light tnum">
          {match.score}
          <span className="text-t3"> / {match.max}</span>
        </p>
        {match.verdict && (
          <p className="mt-3 text-center text-lead font-light">{match.verdict}</p>
        )}
        <Stub className="my-8" />
        <p className="prose-c">
          {match.passes
            ? `Above the traditional pass mark of ${match.threshold}.`
            : `Below the traditional pass mark of ${match.threshold}.`}{' '}
          The total is eight separate tests added together, and they are worth reading one by
          one — a pair can clear the mark and still carry the one dosha that matters.
        </p>

        {/* The Moon is the whole of this method, and a guessed noon can put
            somebody in the next nakshatra. Said here rather than buried. */}
        {unknownTime.length > 0 && (
          <p className="mt-6 text-meta text-t3">
            {unknownTime.join(' and ')} {unknownTime.length > 1 ? 'have' : 'has'} no birth time, so
            noon was used. Every koota below is read off the Moon, which crosses a nakshatra in
            about a day — with the real time these numbers can change.
          </p>
        )}
      </section>

      <Section label="The eight kootas">
        <ul>
          {match.kootas.map((k) => (
            <li key={k.id} className="border-b border-rule py-5 last:border-b-0">
              <div className="mb-3 flex items-baseline justify-between gap-4">
                <span className="label text-left">{k.name}</span>
                <span className="text-body text-t1 tnum">
                  {k.score}
                  <span className="text-t3"> / {k.max}</span>
                </span>
              </div>
              <Ruler value={(k.score / k.max) * 100} />
              {k.note && <p className="mt-3 text-meta text-t2">{k.note}</p>}
            </li>
          ))}
        </ul>
      </Section>

      <Section label="Doshas">
        <ul>
          {match.manglik.map((m, index) => (
            <li key={m.who} className="border-b border-rule py-4">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-body text-t1">
                  Manglik · {index === 0 ? names.person1 : names.person2}
                </span>
                <span className="flex-none caps-sm t-faint">{m.active ? m.severity : 'None'}</span>
              </div>
              {m.cancellations.length > 0 && (
                <p className="mt-2 text-meta text-t2">
                  Cancelled by {m.cancellations.map((c) => c.reason ?? c).join(', ')}.
                </p>
              )}
            </li>
          ))}
          {match.pairDoshas.map((d) => (
            <li key={d.name} className="border-b border-rule py-4 last:border-b-0">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-body text-t1">{d.name}</span>
                <span className="flex-none caps-sm t-faint">{d.active ? 'Present' : 'None'}</span>
              </div>
              {d.note && <p className="mt-2 text-meta text-t2">{d.note}</p>}
            </li>
          ))}
        </ul>
        {match.manglikTogether && (
          <p className="mt-4 text-meta text-t3">{match.manglikTogether}</p>
        )}
      </Section>

      <Section label="Where this stops" last>
        <p className="prose-c">
          This is a ruleset comparing two Moons. It is the first question an astrologer asks and
          not the last one they answer, and it says nothing about what either of you wants.
        </p>
        <Kicker className="mt-10">Take it further</Kicker>
        <Row to="/consult" title="Take this to a person" note="A human reads the same two charts" />
        <Row to="/ask" title="Ask about it" note="Namo AI, on your own chart" />
        <Button onClick={onReset} variant="quiet" className="mt-8">Match someone else</Button>
      </Section>
    </>
  )
}
