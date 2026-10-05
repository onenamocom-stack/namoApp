import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { Button } from '../../components/Primitives.jsx'
import { LANGS } from '../../data/i18n.js'
import { SIGNUP_REF_KEY, looksLikeReferral } from '../../lib/referrals.js'
import { supabase } from '../../lib/supabase.js'
import { PRO_APP_URL } from '../../lib/urls.js'
import { useStore } from '../../store.jsx'
import { warmCharts } from './Computing.jsx'

const RESEND_AFTER = 30

const PROMISES = [
  { icon: 'consult', key: 'w.p.consult' },
  { icon: 'horoscope', key: 'w.p.horoscope' },
  { icon: 'pooja', key: 'w.p.darshan' },
  { icon: 'shop', key: 'w.p.shop' },
]

/**
 * The one door in — phone first, for everybody (3 Oct 2026).
 *
 * This replaced an intro screen and a chain of seven one-question pages that
 * asked for the phone LAST: a returning person who tapped "Begin" instead of
 * the small "Sign in" link answered every birth question before finding out
 * they already had an account. Now the number comes first and the code is
 * typed on the same screen. After it verifies:
 *
 *   - an account with birth details → Home
 *   - a new account, or one that stopped before its details → About you
 *
 * `signInWithOtp` creates the account on first verify; the database trigger
 * names it "there" until About you writes the real name.
 *
 * The consultant app keeps its own chain (AskName → AskPhone → VerifyOtp).
 */
export default function Welcome() {
  const navigate = useNavigate()
  const { t, lang, setLang, session, profile, profileLoading, setBirthField } = useStore()
  const [params] = useSearchParams()
  const [digits, setDigits] = useState('')
  const [phone, setPhone] = useState('') // set once a code has been sent

  /* A sign-up link (`/#/onboarding?ref=N…`, what an influencer or a friend
     shares) carries their code. Kept for this visit and filled in on the
     details page, where it is claimed (3 Oct 2026). Only seeker codes: an A
     code is a shop coupon and belongs to the cart. */
  useEffect(() => {
    const ref = (params.get('ref') || '').trim().toUpperCase()
    if (!looksLikeReferral(ref) || !ref.startsWith('N')) return
    try {
      sessionStorage.setItem(SIGNUP_REF_KEY, ref)
    } catch {
      /* storage off: the code can still be typed */
    }
  }, [params])
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wait, setWait] = useState(0)
  const [resent, setResent] = useState(false)
  const [verified, setVerified] = useState(false)
  const codeRef = useRef(null)
  const autoFilled = useRef(false)

  const phoneValid = /^[6-9]\d{9}$/.test(digits)
  const codeValid = /^\d{6}$/.test(code)

  /* Where to go once there is a session. Waits for the profile, because a
     profile still in flight looks exactly like one with no birth details. */
  useEffect(() => {
    if (!session || profileLoading) return
    if (!verified && !phone) {
      // Already signed in and landed here (SessionGate sends anyone WITH a
      // birth date to Home): the details are what is missing.
      if (!profile?.birth_date) navigate('/onboarding/details', { replace: true })
      return
    }
    if (!verified) return
    if (profile?.birth_date) {
      warmCharts(session.user.id)
      navigate('/home', { replace: true })
    } else {
      navigate('/onboarding/details', { replace: true })
    }
  }, [session, profile, profileLoading, verified, phone, navigate])

  // Resend countdown.
  useEffect(() => {
    if (wait <= 0) return undefined
    const id = setTimeout(() => setWait((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [wait])

  const send = async (again = false) => {
    if (!phoneValid || busy) return
    setBusy(true)
    setError('')
    setResent(false)
    const full = `+91${digits}`
    const { error: err } = await supabase.auth.signInWithOtp({ phone: full })
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    setBirthField('phone', full)
    setPhone(full)
    setWait(RESEND_AFTER)
    if (again) setResent(true)
    setTimeout(() => codeRef.current?.focus(), 50)
  }

  const verify = useCallback(async () => {
    if (!codeValid || busy) return
    setBusy(true)
    setError('')
    const { error: err } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' })
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    setVerified(true)
  }, [codeValid, busy, phone, code])

  /* WebOTP: Android Chrome reads the code out of the SMS. Only a code that
     came from the SMS submits itself — auto-submitting while somebody types
     takes the field away mid-keystroke. (The SMS template must end with the
     origin line; see VerifyOtp.jsx.) */
  useEffect(() => {
    if (!phone || !('OTPCredential' in window)) return undefined
    const ac = new AbortController()
    navigator.credentials
      .get({ otp: { transport: ['sms'] }, signal: ac.signal })
      .then((cred) => {
        const d = (cred?.code || '').replace(/\D/g, '').slice(0, 6)
        if (d.length !== 6) return
        autoFilled.current = true
        setCode(d)
      })
      .catch(() => {})
    return () => ac.abort()
  }, [phone])

  useEffect(() => {
    if (autoFilled.current && codeValid) {
      autoFilled.current = false
      verify()
    }
  }, [codeValid, verify])

  return (
    <div className="flex min-h-full flex-col px-6 pb-8 pt-6">
      {/* Language first — the first audience reads Hindi, and the choice is
          remembered (store.jsx). */}
      <div className="flex justify-end">
        <div className="seg w-[10.5rem]">
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              aria-selected={lang === l.code}
              onClick={() => setLang(l.code)}
              className="seg-item !text-[12px] !normal-case !tracking-normal"
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 animate-fade-rise text-center">
        <img
          src={`${import.meta.env.BASE_URL}namo-logo.png`}
          alt="Namo"
          className="mx-auto block h-11 w-auto"
        />
        <h1 className="mx-auto mt-6 max-w-[18ch] text-title font-semibold leading-snug text-t1">
          {t('w.title')}
        </h1>
      </div>

      {/* What the app is for, in four tiles — the old intro said what a chart
          is not, and never what Namo does. */}
      <ul className="mt-7 grid grid-cols-2 gap-2.5">
        {PROMISES.map((p, i) => (
          <li
            key={p.key}
            className="flex items-center gap-2.5 rounded-2xl bg-white px-3 py-3 shadow-sm"
            style={{ animation: `pop-in .5s cubic-bezier(.2,.7,.3,1) ${120 + i * 70}ms backwards` }}
          >
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gold-wash text-gold">
              <Icon name={p.icon} size={18} weight={1.9} />
            </span>
            <span className="text-meta font-medium leading-tight text-t1">{t(p.key)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        {!phone ? (
          <>
            <label className="block">
              <span className="text-meta font-semibold text-t1">{t('w.phone')}</span>
              <span className="mt-2 flex items-center gap-3 rounded-2xl border border-rule bg-white px-4 py-3.5 focus-within:border-gold-fill">
                <span className="text-lead font-semibold text-t3">+91</span>
                <input
                  value={digits}
                  onChange={(e) => setDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  onKeyDown={(e) => e.key === 'Enter' && send()}
                  placeholder="98765 43210"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  aria-label={t('w.phone')}
                  className="min-w-0 flex-1 bg-transparent text-lead font-semibold tracking-wide text-t1 tnum outline-none placeholder:text-t4"
                />
              </span>
            </label>
            <p className="mt-2 text-meta text-t3">{t('w.phoneHint')}</p>
            <Button variant="solid" className="mt-5" onClick={() => send()} disabled={!phoneValid || busy}>
              {busy ? t('w.sending') : t('w.send')}
            </Button>
          </>
        ) : (
          <div className="animate-fade-rise">
            <p className="text-meta text-t2">{t('w.codeTo', { phone })}</p>
            <input
              ref={codeRef}
              value={code}
              onChange={(e) => {
                const next = e.target.value.replace(/\D/g, '').slice(0, 6)
                /* All six digits arriving in one change is the phone filling
                   the code in (iOS "From Messages", a paste) — submit it, as
                   WebOTP does. Typing digit by digit still waits for Verify
                   (4 Oct 2026). */
                autoFilled.current = next.length === 6 && code.length <= 1
                setCode(next)
              }}
              onKeyDown={(e) => e.key === 'Enter' && verify()}
              placeholder="••••••"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label={t('w.code')}
              className="mt-3 w-full rounded-2xl border border-rule bg-white px-4 py-3.5 text-center text-title font-semibold tracking-[0.5em] text-t1 tnum outline-none placeholder:text-t4 focus:border-gold-fill"
            />
            <Button variant="solid" className="mt-5" onClick={verify} disabled={!codeValid || busy}>
              {busy ? t('w.verifying') : t('w.verify')}
            </Button>
            <div className="mt-4 flex items-center justify-between text-meta">
              <button
                type="button"
                onClick={() => {
                  setPhone('')
                  setCode('')
                  setError('')
                }}
                className="font-medium text-gold"
              >
                {t('w.change')}
              </button>
              {wait > 0 ? (
                <span className="text-t3 tnum">{t('w.resendIn', { s: wait })}</span>
              ) : (
                <button type="button" onClick={() => send(true)} className="font-medium text-gold">
                  {t('w.resend')}
                </button>
              )}
            </div>
            {resent && <p className="mt-2 text-meta text-t3">{t('w.resent')}</p>}
          </div>
        )}
        {error && <p className="mt-4 text-center text-meta text-live">{error}</p>}
      </div>

      <div className="mt-auto pt-10 text-center">
        <p className="text-[12px] leading-relaxed text-t3">
          {t('w.terms')}{' '}
          <a href={`${import.meta.env.BASE_URL}terms.html`} className="underline">
            {t('w.termsLink')}
          </a>{' '}
          ·{' '}
          <a href={`${import.meta.env.BASE_URL}privacy.html`} className="underline">
            {t('w.privacyLink')}
          </a>
        </p>
        <a href={PRO_APP_URL} className="mt-3 inline-block text-[12px] text-t3 underline">
          {t('w.consultant')}
        </a>
        {/* Before an account exists is when a phone number helps most. */}
        <Link to="/support" className="mt-2 block text-[12px] text-t3 underline">
          {t('sup.title')}
        </Link>
      </div>
    </div>
  )
}
