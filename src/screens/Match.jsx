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
  const { session, sessionReady, t } = useStore()
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
    person1: first?.name || me.name || t('match.you'),
    person2: second?.name || t('match.them'),
  }

  return (
    <>
      <TopBar title={t('tool.match')} sub={t('match.sub')} back backTo="/consult" />

      {!state.result && !state.loading && (
        <>
          {/* ── Slot one ─────────────────────────────────────────────────── */}
          <Section label={t('match.first')}>
            {editingFirst ? (
              <SubjectForm
                title={t('match.whoseFirst')}
                cta={t('match.useDetails')}
                onDone={(person) => { setFirst(person); setEditingFirst(false) }}
                onCancel={() => setEditingFirst(false)}
              />
            ) : (
              <PersonCard
                name={names.person1}
                note={first
                  ? [first.birth_place, first.birth_date].filter(Boolean).join(' · ')
                  : [mine.rashi && t('hs.moonSign', { sign: t(`sign.${mine.rashi}`) }), me.birthPlace]
                      .filter(Boolean)
                      .join(' · ')}
                action={first ? t('match.useMine') : t('match.someoneElse')}
                onAction={() => (first ? setFirst(null) : setEditingFirst(true))}
              />
            )}
            {!first && !mine.loading && mine.refusal?.code === 'no_birth' && (
              <p className="mt-4 text-meta text-t3">
                {t('match.missing')}{' '}
                <Link to="/profile" className="underline">{t('match.addThem')}</Link>
                {t('match.orTwo')}
              </p>
            )}
          </Section>

          {/* ── Slot two ─────────────────────────────────────────────────── */}
          <Section label={t('match.second')} last>
            <SubjectForm
              title={t('match.whoseSecond')}
              cta={t('match.read')}
              onDone={run}
              onCancel={reset}
            />
          </Section>
        </>
      )}

      {state.loading && (
        <p className="section text-meta text-t3">{t('match.loading')}</p>
      )}

      {state.refusal && (
        <div className="section">
          <p className="text-body text-t1">{state.refusal.reason}</p>
          {state.refusal.code === 'no_birth' && (
            <Link to="/profile" className="mt-3 inline-block text-meta text-t2 underline">
              {t('a.addBirth')}
            </Link>
          )}
          <Button onClick={reset} variant="quiet" className="mt-6">{t('match.again')}</Button>
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
  const { t } = useStore()
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
        <p className="mt-6 text-center text-title font-semibold tnum">
          {match.score}
          <span className="text-t3"> / {match.max}</span>
        </p>
        {match.verdict && (
          <p className="mt-3 text-center text-lead font-semibold">{match.verdict}</p>
        )}
        <Stub className="my-8" />
        <p className="prose-c">
          {match.passes
            ? t('match.above', { n: match.threshold })
            : t('match.below', { n: match.threshold })}{' '}
          {t('match.totalNote')}
        </p>

        {/* The Moon is the whole of this method, and a guessed noon can put
            somebody in the next nakshatra. Said here rather than buried. */}
        {unknownTime.length > 0 && (
          <p className="mt-6 text-meta text-t3">
            {t(unknownTime.length > 1 ? 'match.noTimeN' : 'match.noTime1', {
              names: unknownTime.join(t('match.and')),
            })}
          </p>
        )}
      </section>

      <Section label={t('match.kootas')}>
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

      <Section label={t('match.doshas')}>
        <ul>
          {match.manglik.map((m, index) => (
            <li key={m.who} className="border-b border-rule py-4">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-body text-t1">
                  {t('match.manglik')} · {index === 0 ? names.person1 : names.person2}
                </span>
                <span className="flex-none caps-sm t-faint">{m.active ? m.severity : t('match.none')}</span>
              </div>
              {m.cancellations.length > 0 && (
                <p className="mt-2 text-meta text-t2">
                  {t('match.cancelledBy', { list: m.cancellations.map((c) => c.reason ?? c).join(', ') })}
                </p>
              )}
            </li>
          ))}
          {match.pairDoshas.map((d) => (
            <li key={d.name} className="border-b border-rule py-4 last:border-b-0">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-body text-t1">{d.name}</span>
                <span className="flex-none caps-sm t-faint">{d.active ? t('match.present') : t('match.none')}</span>
              </div>
              {d.note && <p className="mt-2 text-meta text-t2">{d.note}</p>}
            </li>
          ))}
        </ul>
        {match.manglikTogether && (
          <p className="mt-4 text-meta text-t3">{match.manglikTogether}</p>
        )}
      </Section>

      <Section label={t('match.stops')} last>
        <p className="prose-c">{t('match.stopsNote')}</p>
        <Kicker className="mt-10">{t('a.further')}</Kicker>
        <Row to="/consult" title={t('match.toPerson')} note={t('match.toPersonNote')} />
        <Row to="/ask" title={t('match.askAbout')} note={t('match.askAboutNote')} />
        <Button onClick={onReset} variant="quiet" className="mt-8">{t('match.another')}</Button>
      </Section>
    </>
  )
}
