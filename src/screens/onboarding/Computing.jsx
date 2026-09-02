import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadingLines, user } from '../../data/mock.js'
import ChartWheel from '../../components/ChartWheel.jsx'
import { Button, Field, Stub } from '../../components/Primitives.jsx'
import { clearBirthDraft, useStore } from '../../store.jsx'
import { supabase } from '../../lib/supabase.js'
import { housesFrom, signOf, useAstro } from '../../lib/astro.js'

/** '14/11/1996' -> '1996-11-14'. The onboarding Slot fields are already
 * zero-padded, so this is a reorder, not a parse. */
function toIsoDate(ddmmyyyy) {
  const [d, m, y] = ddmmyyyy.split('/')
  return `${y}-${m}-${d}`
}

/** '04:35 AM' -> '04:35:00'. Naive local time — see docs/05-BACKEND-SCHEMA.md
 * §4.1 on why this is never combined with a UTC offset here. */
function to24Hour(hhmmAmpm) {
  const [time, period] = hhmmAmpm.split(' ')
  let [h, min] = time.split(':').map(Number)
  if (period === 'PM' && h !== 12) h += 12
  if (period === 'AM' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`
}

/**
 * Two beats on one screen: the compute, then the reveal.
 *
 * The loading state does real brand work — naming the data source turns a
 * spinner into a credibility signal. The reveal that follows is the payoff for
 * the four questions, and it does not auto-advance: dumping someone straight
 * into a tab bar throws away the only moment the chart is the whole screen.
 *
 * It is also where the birth details stop being a draft in `birth` and become
 * the real `profiles` row — the account already exists (phone verified the
 * step before this one, which is what created it via the auth.users trigger),
 * so this is an UPDATE, not an insert.
 */
export default function Computing() {
  const { birth, session, profile, profileLoading, refreshProfile } = useStore()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [saveError, setSaveError] = useState('')
  // Bumped by the retry button. The write effect keys off it, because clearing
  // the error alone changes none of its other dependencies — the retry would
  // dismiss the message and land on the reveal without writing anything.
  const [attempt, setAttempt] = useState(0)
  const written = useRef(false)

  /* Every field the write needs, not just the date. Two reasons: `to24Hour('')`
     returns the string '00:undefined:00', which Postgres rejects as a `time`;
     and a draft saved before the place search carried zones has no `zone`, which
     would write a null birth_zone and quietly cost the chart its offset. Both
     route back to re-answer instead.

     An unknown birth time is COMPLETE, not missing. `timeKnown === false` is an
     answer somebody gave; an absent `timeKnown` is a draft from before the
     checkbox existed, and that one still needs a time. */
  const timeAnswered = Boolean(birth.time) || birth.timeKnown === false
  const draftComplete = Boolean(birth.date && timeAnswered && birth.place && birth.zone)

  /* The reveal's three lines and its wheel, computed rather than seeded.
     Gated on the profile actually carrying a birth date, because the chart is
     derived server-side FROM that row — asking before the write below lands
     returns 'no_birth', which is true for a moment and wrong afterwards. */
  const chart = useAstro('chart', {
    ready: Boolean(session && profile?.birth_date),
    who: session?.user?.id ?? null,
  })

  /* The account exists but there is nothing complete to write and nothing
     already stored — the draft was lost between the questions and the code.
     Send them back to re-answer rather than reveal a chart built from seed
     data, which is the same screen as a real one and gives no sign anything
     went wrong. */
  useEffect(() => {
    if (!session || profileLoading || draftComplete || profile?.birth_date) return
    navigate('/onboarding/date', { replace: true })
  }, [session, profile, profileLoading, draftComplete, navigate])

  const done = step >= loadingLines.length
  const name = birth.name || user.name

  useEffect(() => {
    if (done) return undefined
    const t = setTimeout(() => setStep((s) => s + 1), 780)
    return () => clearTimeout(t)
  }, [step, done])

  useEffect(() => {
    if (written.current || !session || !draftComplete) return

    /* Decide nothing until the profile has actually loaded. `profile` is null
       while it is in flight, which is indistinguishable from "nothing stored"
       — and guessing wrong here overwrites a real birth record. */
    if (profileLoading) return
    if (!profile) {
      // The trigger guarantees a row for every session, so a null profile
      // after loading is a failed read, not an absent record. Say so rather
      // than writing blind or silently doing nothing.
      setSaveError('Could not load your profile. Check your connection and try again.')
      return
    }

    /* A returning user must not lose what is already stored. There is no
       sign-in-only route yet — onboarding is the only way back to a session,
       and it arrives here with a freshly typed draft every time. Writing it
       would replace a real birth record with whatever was retyped to get past
       the questions, and every downstream cusp with it. Sign them in and
       leave the row alone. */
    if (profile.birth_date) {
      written.current = true
      return
    }

    written.current = true

    supabase
      .from('profiles')
      .update({
        name: birth.name,
        email: (birth.email ?? '').trim() || null,
        birth_date: toIsoDate(birth.date),
        // NULL rather than midnight when nobody knows it. The column exists so
        // the two are distinguishable (05-BACKEND-SCHEMA.md §4.1), and this was
        // hardcoded `true` until phase 7 — which is why four production
        // accounts are marked certain about a minute somebody estimated.
        birth_time: birth.timeKnown === false ? null : to24Hour(birth.time),
        birth_time_known: birth.timeKnown !== false,
        birth_place: birth.place,
        birth_lat: birth.lat,
        birth_lon: birth.lon,
        // The birth place's zone, carried from AskPlace. Hardcoding this was
        // survivable only while the place list was four Indian cities; with
        // worldwide search it would store India's zone against a London birth
        // and shift every cusp with no error raised anywhere.
        birth_zone: birth.zone,
      })
      .eq('id', session.user.id)
      .then(({ error }) => {
        // Never swallow this. A failed write here still lands on the reveal,
        // which looks identical to a real one — the account then exists with
        // no birth details and nothing on screen ever said so.
        if (error) {
          written.current = false
          setSaveError(error.message)
          return undefined
        }
        clearBirthDraft()
        return refreshProfile(session.user.id)
      })
  }, [session, birth, draftComplete, profile, profileLoading, refreshProfile, attempt])

  if (saveError) {
    return (
      <div className="flex min-h-full animate-fade flex-col justify-center px-6 pb-10 text-center">
        <p className="text-micro uppercase tracking-caps text-t3">Not saved</p>
        <h1 className="mx-auto mt-5 max-w-[16ch] text-display font-light">
          Your details didn&apos;t reach us.
        </h1>
        <p className="prose-c mt-6">
          You&apos;re signed in, but the birth details are still on this device. Try again.
        </p>
        <p className="mx-auto mt-4 max-w-measure text-meta text-live">{saveError}</p>
        <div className="mt-12">
          <Button
            onClick={async () => {
              setSaveError('')
              // Refetch first. When the failure was the profile read rather
              // than the write, nothing else refreshes it, and retrying the
              // effect alone just re-raises the same error forever.
              if (session) await refreshProfile(session.user.id)
              setAttempt((a) => a + 1)
            }}
            variant="solid"
          >
            Try again
          </Button>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="flex min-h-full animate-fade flex-col px-6 pb-10 pt-12 text-center">
        <p className="text-micro uppercase tracking-caps text-t3">Chart ready</p>
        <h1 className="mx-auto mt-5 max-w-[12ch] text-display font-light">Here you are, {name}.</h1>

        <Stub className="my-10" />
        <ChartWheel size={240} houses={housesFrom(chart.payload, chart.timeKnown)} />

        {/* Four states, and the last two must not read alike. A chart service
            that is down is not a person with no birth details — this project
            has already sent a working consultant to a signup form by treating
            those as the same answer. */}
        {chart.loading && (
          <p className="mt-12 text-meta text-t3">Working out where everything was.</p>
        )}

        {chart.refusal && (
          <p className="mx-auto mt-12 max-w-measure text-meta text-live">{chart.refusal.reason}</p>
        )}

        {chart.payload && (
          <>
            <div className="mx-auto mt-12 w-full max-w-[18rem] text-left">
              <Field k="Sun" v={`${signOf(chart.payload, 'Sun')} — how you push`} />
              <Field k="Moon" v={`${signOf(chart.payload, 'Moon')} — how you feel`} />
              {chart.timeKnown ? (
                <Field
                  k="Rising"
                  v={`${chart.payload.ascendant?.sign ?? '—'} — how you land`}
                />
              ) : (
                <Field k="Rising" v="Needs your birth time" />
              )}
            </div>

            <p className="prose-c mt-10">
              {chart.timeKnown
                ? 'Three positions out of nine. The rest are in your chart, and none of them are a verdict.'
                : 'Two positions out of nine. Rising and the houses need the minute you were born — add it in your profile and they appear.'}
            </p>
          </>
        )}

        {/* Both routes land in the tabbed app shell. Sending someone
            straight to /horoscope or /chart dropped them on a screen with no
            bottom nav and no way back — the stranded flow this fixes. */}
        <div className="mt-auto pt-12">
          <Button to="/home" variant="solid">
            Enter Namo
          </Button>
          <p className="mt-4 text-center text-meta text-t3">
            Your chart and today&apos;s reading are both waiting inside.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6">
      <Stub />
      <ul className="mt-10 w-full max-w-measure">
        {loadingLines.map((line, i) => (
          <li
            key={line}
            className="flex items-center justify-between gap-4 py-3 transition-opacity duration-500"
            style={{ opacity: i < step ? 1 : i === step ? 0.55 : 0.18 }}
          >
            <span className="text-meta text-t2">{line}</span>
            <span className="flex-none text-micro uppercase tracking-caps text-t3">
              {i < step ? 'Done' : i === step ? '···' : ''}
            </span>
          </li>
        ))}
      </ul>
      <Stub className="mt-10" />
      <p className="mt-10 text-center text-micro uppercase tracking-caps text-t3">
        Positions from NASA JPL ephemerides
      </p>
    </div>
  )
}
