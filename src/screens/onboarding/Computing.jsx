import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { signOut } from '../../lib/signout.js'
import { Button } from '../../components/Primitives.jsx'
import { clearBirthDraft, useStore } from '../../store.jsx'
import { RASHIS, cachedAstro, signOf } from '../../lib/astro.js'

const RASHI_HI = {
  Aries: 'मेष', Taurus: 'वृषभ', Gemini: 'मिथुन', Cancer: 'कर्क', Leo: 'सिंह', Virgo: 'कन्या',
  Libra: 'तुला', Scorpio: 'वृश्चिक', Sagittarius: 'धनु', Capricorn: 'मकर', Aquarius: 'कुंभ', Pisces: 'मीन',
}
const REVEAL_MS = 4200

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
    // The birth place's zone, carried from the place search on AboutYou. Never defaulted: India's
    // zone against a London birth shifts every cusp with no error anywhere.
    birth_zone: birth.zone,
  }
}

/**
 * The chart, every divisional chart and the dasha timeline, computed now so
 * no screen waits on them later. Both are cached forever on the server and in this browser. A
 * failure here is not the person's problem — /chart asks again.
 */
export function warmCharts(who) {
  return Promise.all([
    cachedAstro('chart', { who }),
    cachedAstro('vargas', { who }),
    cachedAstro('dasha', { who }),
  ]).catch(() => {})
}

/**
 * Where the birth details stop being a draft and become the `profiles` row,
 * and where the chart is computed — then into the app.
 *
 * **A one-time reveal since 3 Oct 2026.** 30 Sep removed the old
 * loading-list-then-"Enter Namo" screen; the owner asked for a moment back,
 * but as a flash rather than a stop: a few seconds of the wheel turning, the
 * person's name and their Sun, Moon and Lagna, then Home on its own (or on a
 * tap). Only a brand-new sign-up sees it — a returning account goes straight
 * through. The chart is computed here either way, so /chart opens drawn.
 *
 * The account already exists (the phone step created it), so the write is an
 * UPDATE. A returning account that signs in arrives with an empty draft and a
 * stored birth date, and nothing is written for it.
 */
export default function Computing() {
  const { birth, session, profile, profileLoading, refreshProfile, saveProfile, t, lang } =
    useStore()
  const navigate = useNavigate()
  const [saveError, setSaveError] = useState('')
  // null while saving; { name, sun, moon, rising } once the chart is in.
  const [reveal, setReveal] = useState(null)
  // Bumped by the retry button. The write effect keys off it, because clearing
  // the error alone changes none of its other dependencies.
  const [attempt, setAttempt] = useState(0)
  const written = useRef(false)

  /* Every field the write needs. An unknown birth time is COMPLETE, not
     missing: `timeKnown === false` is an answer somebody gave. */
  const timeAnswered = Boolean(birth.time) || birth.timeKnown === false
  const draftComplete = Boolean(birth.date && timeAnswered && birth.place && birth.zone)

  /* A session with nothing to write and nothing stored: the draft was lost
     between the page and here. Back to About you. Not while a reveal is up —
     the draft is cleared the moment the profile is written. */
  useEffect(() => {
    if (reveal || written.current) return
    if (!session || profileLoading || draftComplete || profile?.birth_date) return
    navigate('/onboarding/details', { replace: true })
  }, [session, profile, profileLoading, draftComplete, navigate, reveal])

  // The reveal ends itself; a tap ends it sooner.
  useEffect(() => {
    if (!reveal) return undefined
    const id = setTimeout(() => navigate('/home', { replace: true }), REVEAL_MS)
    return () => clearTimeout(id)
  }, [reveal, navigate])

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
    const name = birth.name
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
      .then(() => cachedAstro('chart', { who }))
      .then((res) => {
        const chart = res?.ok ? res.data : null
        if (!chart) return enter()
        setReveal({
          name,
          sun: signOf(chart, 'Sun'),
          moon: signOf(chart, 'Moon'),
          rising: res.time_known === false ? null : chart.ascendant?.sign ?? null,
        })
      })
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

  return <Reveal reveal={reveal} t={t} lang={lang} onDone={() => navigate('/home', { replace: true })} />
}

/**
 * The wheel. While saving it turns slowly over "Making your kundli…"; when
 * the chart arrives the name and three signs rise in over it, a bar fills
 * along the bottom, and Home follows. Full-bleed and fixed, so the phone
 * frame's own chrome cannot sit on top of it.
 */
function Reveal({ reveal, t, lang, onDone }) {
  const sign = (s) => (lang === 'hi' ? RASHI_HI[s] ?? s : s)
  const chips = reveal
    ? [
        ['r.sun', reveal.sun],
        ['r.moon', reveal.moon],
        ...(reveal.rising ? [['r.rising', reveal.rising]] : []),
      ]
    : []

  /* Portalled and centred with margins, not translate: a translated fixed
     element inside the app's animated frame landed half off-screen. */
  return createPortal(
    <div
      role={reveal ? 'button' : undefined}
      tabIndex={reveal ? 0 : undefined}
      onClick={reveal ? onDone : undefined}
      onKeyDown={(e) => reveal && (e.key === 'Enter' || e.key === ' ') && onDone()}
      aria-live="polite"
      className="fixed inset-0 z-[70] mx-auto flex w-full max-w-[420px] flex-col items-center justify-center overflow-hidden px-6 text-center text-white"
      style={{ background: 'radial-gradient(120% 90% at 50% 35%, #f5782c 0%, #b8400f 42%, #4a1208 100%)' }}
    >
      <style>{`
        @keyframes namo-turn { to { transform: rotate(360deg) } }
        @keyframes namo-turn-back { to { transform: rotate(-360deg) } }
        @keyframes namo-twinkle { 0%,100% { opacity: .15 } 50% { opacity: .9 } }
        @keyframes namo-rise { from { opacity: 0; transform: translateY(18px) scale(.96) } to { opacity: 1; transform: none } }
        @keyframes namo-glow { 0%,100% { opacity: .55; transform: scale(1) } 50% { opacity: .95; transform: scale(1.08) } }
        @keyframes namo-fill { from { transform: scaleX(0) } to { transform: scaleX(1) } }
      `}</style>

      {/* Stars. Fixed positions, so the field does not jump on re-render. */}
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="absolute h-1 w-1 rounded-full bg-white"
          style={{
            left: `${(i * 37) % 100}%`,
            top: `${(i * 53 + 11) % 100}%`,
            animation: `namo-twinkle ${1.6 + (i % 5) * 0.4}s ease-in-out ${(i % 7) * 0.25}s infinite`,
          }}
        />
      ))}

      {/* The wheel: twelve rashis on a ring, a counter-turning inner ring, a glowing centre. */}
      <div aria-hidden="true" className="relative h-64 w-64">
        <svg viewBox="0 0 200 200" className="absolute inset-0" style={{ animation: `namo-turn ${reveal ? 18 : 9}s linear infinite` }}>
          <circle cx="100" cy="100" r="92" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1" />
          <circle cx="100" cy="100" r="74" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="1" />
          {RASHIS.map((r, i) => {
            const a = (i * 30 * Math.PI) / 180
            return (
              <g key={r}>
                <line
                  x1={100 + 74 * Math.cos(a)} y1={100 + 74 * Math.sin(a)}
                  x2={100 + 92 * Math.cos(a)} y2={100 + 92 * Math.sin(a)}
                  stroke="rgba(255,255,255,.45)" strokeWidth="1"
                />
                <text
                  x={100 + 83 * Math.cos(a + Math.PI / 12)} y={100 + 83 * Math.sin(a + Math.PI / 12)}
                  fill="rgba(255,255,255,.8)" fontSize="7" textAnchor="middle" dominantBaseline="middle"
                >
                  {(lang === 'hi' ? RASHI_HI[r] : r).slice(0, 3)}
                </text>
              </g>
            )
          })}
        </svg>
        <svg viewBox="0 0 200 200" className="absolute inset-0" style={{ animation: 'namo-turn-back 14s linear infinite' }}>
          <circle cx="100" cy="100" r="52" fill="none" stroke="rgba(255,255,255,.3)" strokeDasharray="2 6" strokeWidth="2" />
          <polygon points="100,58 136,121 64,121" fill="none" stroke="rgba(255,255,255,.25)" />
          <polygon points="100,142 64,79 136,79" fill="none" stroke="rgba(255,255,255,.25)" />
        </svg>
        <span
          className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background: 'radial-gradient(circle, #fff6d6 0%, #ffcf6b 45%, rgba(255,160,60,0) 72%)',
            animation: 'namo-glow 2.4s ease-in-out infinite',
          }}
        />
      </div>

      {!reveal ? (
        <p className="mt-10 text-body font-medium text-white/90" style={{ animation: 'namo-twinkle 2s ease-in-out infinite' }}>
          {t('r.making')}
        </p>
      ) : (
        <>
          <p className="mt-8 text-meta uppercase tracking-[0.2em] text-white/75" style={{ animation: 'namo-rise .6s ease-out both' }}>
            {t('r.readySub')}
          </p>
          <h1 className="mt-2 text-title font-semibold" style={{ animation: 'namo-rise .7s ease-out .15s both' }}>
            {t('r.ready', { name: reveal.name })}
          </h1>
          <div className="mt-6 flex justify-center gap-2.5">
            {chips.map(([k, s], i) => (
              <span
                key={k}
                className="rounded-2xl bg-white/15 px-3.5 py-2.5 backdrop-blur-sm"
                style={{ animation: `namo-rise .55s cubic-bezier(.2,.7,.3,1) ${0.45 + i * 0.18}s both` }}
              >
                <span className="block text-[11px] uppercase tracking-wider text-white/70">{t(k)}</span>
                <span className="mt-0.5 block text-body font-semibold">{sign(s)}</span>
              </span>
            ))}
          </div>
          <span className="absolute inset-x-10 bottom-14 h-1 overflow-hidden rounded-full bg-white/20">
            <span
              className="block h-full origin-left rounded-full bg-white"
              style={{ animation: `namo-fill ${REVEAL_MS}ms linear both` }}
            />
          </span>
        </>
      )}
    </div>,
    document.body,
  )
}
