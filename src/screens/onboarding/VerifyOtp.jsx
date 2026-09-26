import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import QuestionFrame from './QuestionFrame.jsx'
import { useStore } from '../../store.jsx'
import { isPro } from '../../side.js'
import { supabase } from '../../lib/supabase.js'
import { PRO_APP_URL } from '../../lib/urls.js'
import { claimCode } from '../../lib/referrals.js'

export default function VerifyOtp() {
  const navigate = useNavigate()
  const { birth, showToast } = useStore()
  /* The consultant branch has no birth details to write, so it skips
     Computing entirely and lands on the application. */
  const [params] = useSearchParams()
  const pro = isPro || params.get('next') === 'pro'
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const [resent, setResent] = useState(false)

  const valid = /^\d{6}$/.test(code)

  /* WEBOTP: READ THE CODE OUT OF THE SMS INSTEAD OF MAKING SOMEBODY TYPE IT.
     Android Chrome only — `autoComplete="one-time-code"` below is the whole of
     what iOS offers, and that one is a keyboard suggestion the person still
     taps. Everywhere else this block does nothing and the field behaves as it
     always did.

     THIS NEEDS THE SMS TEMPLATE TO COOPERATE. The browser will not hand over a
     code from a message that is not bound to this origin, so the text has to
     END with the origin and the code on its own last line:

         Your Namo code is 123456

         @onenamocom-stack.github.io #123456

     Without that last line the promise below simply never resolves, silently,
     which is exactly how this looks when it is misconfigured. Set it in
     Supabase → Authentication → SMS templates. The origin has to match the
     deployment, so it changes again at the move to 1namo.com. */
  const autoFilled = useRef(false)
  useEffect(() => {
    if (!('OTPCredential' in window)) return
    const ac = new AbortController()
    navigator.credentials
      .get({ otp: { transport: ['sms'] }, signal: ac.signal })
      .then((cred) => {
        const digits = (cred && cred.code ? cred.code : '').replace(/\D/g, '').slice(0, 6)
        if (digits.length !== 6) return
        autoFilled.current = true
        setCode(digits)
      })
      .catch(() => {
        /* Aborted on unmount, dismissed by the person, or no SMS arrived.
           None of those is an error worth showing: the field still works. */
      })
    return () => ac.abort()
  }, [])

  const verify = useCallback(async () => {
    if (!valid || verifying) return
    setVerifying(true)
    setError('')

    const { error: err } = await supabase.auth.verifyOtp({
      phone: birth.phone,
      token: code,
      type: 'sms',
    })

    if (err) {
      setError(err.message)
      setVerifying(false)
      return
    }

    // `next=pro` lands in the consultant app — a separate deployment, not a
    // route this build carries. A seeker bookmarked through an old pro link
    // still ends up in the right place.
    if (pro) {
      window.location.href = PRO_APP_URL
      return
    }
    /* The referral code was typed on the phone screen, beside the number,
       and is claimed HERE — the first moment there is a session for the
       server to credit.

       NOT NAMED `code`. It was, for one deploy, and `const code` inside
       this function shadowed the OTP state of the same name for the whole
       function scope — so `token: code` above it read a `const` in its
       temporal dead zone and threw before the request was ever sent. The
       throw was swallowed by the unawaited async call, `setVerifying(false)`
       never ran, and every sign-up sat on "Verifying…" forever. Lint and
       build were both clean: shadowing is legal JavaScript.
 It is deliberately not awaited into the happy
       path: a bad code must not hold somebody at the door over a perk, so
       a refusal becomes a toast and onboarding carries on. The code is
       still claimable from the profile afterwards. */
    const referral = (birth.referralCode || '').trim()
    if (referral) {
      claimCode(referral)
        .then(() => showToast('Referral applied. Three free questions a day from tomorrow.'))
        .catch((e) => showToast(e.message))
    }
    navigate('/onboarding/computing')
  }, [valid, verifying, birth.phone, birth.referralCode, code, pro, navigate, showToast])

  /* Only a code that came from the SMS submits itself. Auto-submitting while
     somebody is typing takes the screen away mid-keystroke on the one field
     where a typo is likely. */
  useEffect(() => {
    if (autoFilled.current && valid && !verifying) {
      autoFilled.current = false
      verify()
    }
  }, [valid, verifying, verify])

  const resend = async () => {
    setError('')
    setResent(false)
    const { error: err } = await supabase.auth.signInWithOtp({ phone: birth.phone })
    if (err) setError(err.message)
    else setResent(true)
  }

  return (
    <QuestionFrame
      question="The code we just sent."
      hint={`Six digits, texted to ${birth.phone || 'your number'}.`}
      canContinue={valid && !verifying}
      nextLabel={verifying ? 'Verifying…' : 'Verify'}
      onNext={verify}
      footnote="No code? Wait a minute for the text, or send another one below."
    >
      <label className="mx-auto flex max-w-[13rem] flex-col items-center gap-2">
        <input
          value={code}
          onChange={(e) => {
            autoFilled.current = false
            setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
          }}
          placeholder="000000"
          aria-label="Six-digit code"
          inputMode="numeric"
          autoComplete="one-time-code"
          className="w-full border-b border-rule bg-transparent pb-3 text-center text-display font-light tracking-[0.4em] text-t1 tnum outline-none transition-colors placeholder:text-t4 focus:border-t1"
        />
        <span className="text-micro uppercase tracking-caps text-t3">Code</span>
      </label>

      <button
        type="button"
        onClick={resend}
        className="mx-auto mt-8 block text-meta text-t3 underline transition-colors hover:text-t1"
      >
        Send another code
      </button>
      {resent && <p className="mt-3 text-center text-meta text-t3">Sent again.</p>}
      {error && <p className="mx-auto mt-6 max-w-measure text-center text-meta text-live">{error}</p>}
    </QuestionFrame>
  )
}
