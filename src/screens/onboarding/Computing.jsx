import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from '../../lib/signout.js'
import { Button, Stub } from '../../components/Primitives.jsx'
import { clearBirthDraft, useStore } from '../../store.jsx'
import { cachedAstro } from '../../lib/astro.js'

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
 * The draft as the profile row's birth columns. Shared by sign-up (below) and
 * by editing them from Profile, which saves straight from the place step.
 */
export function birthFields(birth) {
  return {
    birth_date: toIsoDate(birth.date),
    // NULL rather than midnight when nobody knows it. The column exists so
    // the two are distinguishable (05-BACKEND-SCHEMA.md §4.1).
    birth_time: birth.timeKnown === false ? null : to24Hour(birth.time),
    birth_time_known: birth.timeKnown !== false,
    birth_place: birth.place,
    birth_lat: birth.lat,
    birth_lon: birth.lon,
    // The birth place's zone, carried from AskPlace. Never defaulted: India's
    // zone against a London birth shifts every cusp with no error anywhere.
    birth_zone: birth.zone,
  }
}

/**
 * The chart and every divisional chart, computed now so no screen waits on
 * them later. Both are cached forever on the server and in this browser. A
 * failure here is not the person's problem — /chart asks again.
 */
export function warmCharts(who) {
  return Promise.all([
    cachedAstro('chart', { who }),
    cachedAstro('vargas', { who }),
  ]).catch(() => {})
}

/**
 * Where the birth details stop being a draft and become the `profiles` row,
 * and where the chart is computed — then straight into the app.
 *
 * **No reveal since 30 Sep 2026.** This used to hold a loading list and then
 * a full-screen chart before "Enter Namo"; the owner asked for it gone. The
 * chart is still computed here, once, at sign-up, so /chart opens already
 * drawn.
 *
 * The account already exists (the phone step created it), so the write is an
 * UPDATE. A returning account that signs in arrives with an empty draft and a
 * stored birth date, and nothing is written for it.
 */
export default function Computing() {
  const { birth, session, profile, profileLoading, refreshProfile, saveProfile } = useStore()
  const navigate = useNavigate()
  const [saveError, setSaveError] = useState('')
  // Bumped by the retry button. The write effect keys off it, because clearing
  // the error alone changes none of its other dependencies.
  const [attempt, setAttempt] = useState(0)
  const written = useRef(false)

  /* Every field the write needs. An unknown birth time is COMPLETE, not
     missing: `timeKnown === false` is an answer somebody gave. */
  const timeAnswered = Boolean(birth.time) || birth.timeKnown === false
  const draftComplete = Boolean(birth.date && timeAnswered && birth.place && birth.zone)

  /* A session with nothing to write and nothing stored: the draft was lost
     between the questions and the code. Back to the questions. */
  useEffect(() => {
    if (!session || profileLoading || draftComplete || profile?.birth_date) return
    navigate('/onboarding/date', { replace: true })
  }, [session, profile, profileLoading, draftComplete, navigate])

  useEffect(() => {
    if (written.current || !session) return
    /* Decide nothing until the profile has loaded: null while in flight looks
       exactly like "nothing stored", and guessing wrong overwrites a real
       birth record. */
    if (profileLoading) return

    const who = session.user.id
    const enter = () => navigate('/home', { replace: true })

    /* A returning account keeps what is stored. Onboarding is also the way
       back into a session, and it arrives here with whatever was retyped to
       get past the questions — writing that would replace a real record.
       Changing birth details is Profile's job, and it saves directly. */
    if (profile?.birth_date) {
      written.current = true
      warmCharts(who).then(enter)
      return
    }
    if (!draftComplete) return

    written.current = true
    saveProfile({
      name: birth.name,
      email: (birth.email ?? '').trim() || null,
      gender: birth.gender || null,
      ...birthFields(birth),
    })
      .then(() => {
        clearBirthDraft()
        return refreshProfile(who)
      })
      .then(() => warmCharts(who))
      .then(enter)
      // Never swallow this: the account would exist with no birth details and
      // nothing on screen would say so.
      .catch((error) => {
        written.current = false
        setSaveError(error.message)
      })
  }, [session, birth, draftComplete, profile, profileLoading, refreshProfile, saveProfile, navigate, attempt])

  if (saveError) {
    return (
      <div className="flex min-h-full animate-fade flex-col justify-center px-6 pb-10 text-center">
        <p className="text-micro uppercase tracking-caps text-t3">Not saved</p>
        <h1 className="mx-auto mt-5 max-w-[16ch] text-display font-semibold">
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
              // Refetch first: when the failure was the profile read, retrying
              // the write alone re-raises the same error forever.
              if (session) await refreshProfile(session.user.id)
              setAttempt((a) => a + 1)
            }}
            variant="solid"
          >
            Try again
          </Button>

          {/* A way out, because Try again cannot always work — a stuck
              session is itself the problem, so starting over signs out. */}
          <button
            type="button"
            onClick={async () => {
              try {
                await signOut()
              } catch {
                /* Already signed out, or offline. The next screen is right either way. */
              }
              navigate('/onboarding', { replace: true })
            }}
            className="mt-6 block w-full text-center text-micro uppercase tracking-caps text-t3 underline transition-colors hover:text-t1"
          >
            Start over instead
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6">
      <Stub />
      <p className="mt-8 text-center text-meta text-t2">Setting up your chart.</p>
    </div>
  )
}
