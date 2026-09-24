import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import { Kicker, PopButton, PopCard } from '../components/Pop.jsx'
import { Button, Row, Section, Stub } from '../components/Primitives.jsx'
import { fetchNumerology, numbersFrom } from '../lib/numerology.js'
import { useProfileFields, useStore } from '../store.jsx'

/**
 * Numerology — the numbers in a name and a birth date.
 *
 * **The name is editable and that is the whole design.** Numerology counts
 * the name as it was GIVEN: a married name, a shortened one, a different
 * spelling on the certificate all produce different numbers, and only the
 * person reading knows which is theirs. So the profile's name is a
 * starting point in a field, not an answer computed behind their back.
 *
 * The birth DATE is not editable here. It is on file, a date has no
 * spelling, and a screen that let you try dates would be a screen for
 * trying other people's.
 *
 * Numbers first, lucky things second. The vendor is strongest at the
 * lucky-thing deck — colour, day, metal, stone, deity, mantra — but
 * somebody came for the number, and leading with a gemstone reads as a
 * shop.
 *
 * `evil_num` comes back from the vendor under that name and is printed as
 * "Harder number". A number nobody chose is not evil, and telling a seeker
 * otherwise is not what this product means.
 */
export default function Numerology() {
  const { session, sessionReady, lang } = useStore()
  const me = useProfileFields()

  const [name, setName] = useState('')
  const [editing, setEditing] = useState(false)
  const [state, setState] = useState({ loading: true, payload: null, refusal: null, name: '' })

  /* The profile's name is the first thing tried, once it has loaded. */
  useEffect(() => {
    if (me.name && !name) setName(me.name)
  }, [me.name, name])

  const load = (askFor) => {
    setState((s) => ({ ...s, loading: true }))
    fetchNumerology({ name: askFor, lang }).then((res) => {
      setState(
        res.ok
          ? { loading: false, payload: res.data, refusal: null, name: res.name }
          : { loading: false, payload: null, refusal: res, name: askFor ?? '' },
      )
    })
  }

  useEffect(() => {
    if (!sessionReady || !session) return
    load(undefined)   // the server falls back to the profile's name
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionReady, session?.user?.id, lang])

  const numbers = numbersFrom(state.payload)

  return (
    <>
      <TopBar
        title="Numerology"
        sub={state.name || null}
        back
        backTo="/consult"
      />

      {/* ── The name being read ───────────────────────────────────────── */}
      <Section label="Read for" tight>
        {editing ? (
          <>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="The name you were given"
              aria-label="The name to read"
              className="field-line w-full"
              autoFocus
            />
            <p className="mt-2 text-meta t-faint">
              Numerology counts the name as it was given at birth. A married name or a different
              spelling is a different set of numbers.
            </p>
            <div className="mt-4 flex gap-2">
              <PopButton
                className="flex-1"
                full={false}
                disabled={!name.trim()}
                onClick={() => { setEditing(false); load(name.trim()) }}
              >
                Read this name
              </PopButton>
              <button
                type="button"
                onClick={() => { setEditing(false); setName(state.name || me.name || '') }}
                className="pill caps-sm"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-baseline justify-between gap-4">
            <div className="min-w-0">
              <p className="text-body t-heading">{state.name || me.name || '—'}</p>
              {me.birthDate && <p className="mt-1 caps-sm t-faint">{me.birthDate}</p>}
            </div>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex-none caps-sm text-t2 underline"
            >
              Another name
            </button>
          </div>
        )}
      </Section>

      {state.loading && (
        <p className="section text-meta text-t3">Counting the letters.</p>
      )}

      {state.refusal && !state.loading && (
        <div className="section">
          <p className="text-body text-t1">{state.refusal.reason}</p>
          {state.refusal.code === 'no_birth' && (
            <Link to="/profile" className="mt-3 inline-block text-meta text-t2 underline">
              Add your birth date
            </Link>
          )}
          {state.refusal.code === 'invalid' && (
            <PopButton className="mt-4" onClick={() => setEditing(true)}>
              Type a name
            </PopButton>
          )}
        </div>
      )}

      {numbers && !state.loading && (
        <>
          <Section label="Your numbers">
            <ul>
              {numbers.core.map((n) => (
                <li
                  key={n.label}
                  className="flex items-baseline gap-4 border-b border-rule py-4 last:border-b-0"
                >
                  <span className="w-10 flex-none text-title font-light tnum gold">{n.value}</span>
                  <span className="min-w-0">
                    <span className="block text-body text-t1">{n.label}</span>
                    <span className="mt-1 block text-meta text-t3">{n.note}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          {(numbers.friendly || numbers.difficult || numbers.challenges.length > 0) && (
            <Section label="Numbers around yours">
              <dl className="mx-auto max-w-[20rem]">
                {[
                  ['Friendly', numbers.friendly],
                  ['Neutral', numbers.neutral],
                  /* NOT "evil", whatever the vendor's field is called. */
                  ['Harder', numbers.difficult],
                  ['Challenges', numbers.challenges.join(' · ')],
                ]
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between gap-6 py-3 rule-b">
                      <dt className="label text-left">{label}</dt>
                      <dd className="text-body text-t1 tnum">{value}</dd>
                    </div>
                  ))}
              </dl>
            </Section>
          )}

          {numbers.lucky.length > 0 && (
            <Section label="What it says to keep near">
              <ul className="grid grid-cols-2 gap-3">
                {numbers.lucky.map((l) => (
                  <li key={l.label}>
                    <PopCard className="p-4">
                      <p className="caps-sm t-faint">{l.label}</p>
                      <p className="mt-1.5 text-body t-heading">{l.value}</p>
                    </PopCard>
                  </li>
                ))}
              </ul>
              {numbers.mantra && (
                <>
                  <Stub className="my-6" />
                  <p className="text-center text-read t-heading">{numbers.mantra}</p>
                </>
              )}
            </Section>
          )}

          <Section label="Where this stops" last>
            <p className="prose-c">
              Numerology reads a name and a date. It does not read a chart, and where the two
              disagree the chart is the one computed from the sky you were born under.
            </p>
            <Kicker className="mt-10">Take it further</Kicker>
            <Row to="/chart" title="Your chart" note="Nine placements, computed from your birth" />
            <Row to="/match" title="Matching" note="Two charts read against each other" />
            <Button to="/consult" variant="solid" className="mt-8">
              Ask an astrologer
            </Button>
          </Section>
        </>
      )}

      <div className="h-8" />
    </>
  )
}
