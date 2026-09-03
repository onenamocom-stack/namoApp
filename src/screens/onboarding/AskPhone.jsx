import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import QuestionFrame from './QuestionFrame.jsx'
import { useStore } from '../../store.jsx'
import { supabase } from '../../lib/supabase.js'

/**
 * The last question on a fresh signup, and the only one that leaves the
 * device. Everything before this is a draft; this step is what turns it into
 * an account. India-only for now, like the rest of onboarding — the +91 is
 * fixed rather than a country picker nobody needs yet.
 *
 * `?mode=signin` is the other door in, from AskSide's "Sign in instead"
 * links. A returning person has nothing to draft — the account and the birth
 * record already exist — so this mode asks for the phone alone and refuses
 * to mint a new account for a number nobody has verified before
 * (`shouldCreateUser: false`). Everything downstream of the code screen
 * already does the right thing for a returning user without being told:
 * `Computing.jsx` signs them in and leaves an existing birth record alone,
 * and the pro branch has never touched Computing at all.
 *
 * Two fields on the signup path, one identity. The phone is the account: it
 * is what receives the code and the only channel anyone proves they hold.
 * The email is never used to sign in and is never verified here — it is a
 * contact address, required so it is actually there when it is wanted, and
 * stored on the profile. Sign-in skips it entirely: it is not needed to
 * resume an account that already has one.
 */
export default function AskPhone() {
  const navigate = useNavigate()
  const { birth, setBirthField } = useStore()
  const [params] = useSearchParams()
  const pro = params.get('next') === 'pro'
  const signin = params.get('mode') === 'signin'
  const next = pro ? '?next=pro' : ''
  const [digits, setDigits] = useState(() => (birth.phone || '').replace('+91', ''))
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [noAccount, setNoAccount] = useState(false)

  // Defaulted, not assumed. A draft restored from an older sessionStorage
  // write predates this field, and reading `.trim()` off undefined here would
  // white-screen the one route nobody can go around.
  const email = birth.email ?? ''

  const phoneValid = /^[6-9]\d{9}$/.test(digits)
  // Shape only, and the same shape the column's CHECK enforces. Nothing short
  // of sending mail to an address proves it exists, so this does not pretend to.
  const emailValid = signin || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
  const valid = phoneValid && emailValid

  const send = async () => {
    if (!valid || sending) return
    setSending(true)
    setError('')
    setNoAccount(false)

    const phone = `+91${digits}`
    const { error: err } = await supabase.auth.signInWithOtp({
      phone,
      options: signin
        ? { shouldCreateUser: false }
        : { data: { name: birth.name } },
    })

    if (err) {
      // Supabase's own wording for this ("Signups not allowed for otp") reads
      // like an outage, not "we don't know that number" — the one sentence a
      // returning-but-mistaken person actually needs.
      if (signin && /signups? not allowed/i.test(err.message)) {
        setNoAccount(true)
      } else {
        setError(err.message)
      }
      setSending(false)
      return
    }

    setBirthField('phone', phone)
    navigate(`/onboarding/verify${next}`)
  }

  return (
    <QuestionFrame
      question={signin ? 'What is your number?' : 'Where do we reach you?'}
      hint={
        signin
          ? 'The code goes to your number, same as the last time.'
          : 'The code goes to your number. The email is how we reach you outside the app.'
      }
      canContinue={valid && !sending}
      nextLabel={sending ? 'Sending…' : 'Send code'}
      onNext={send}
    >
      <label className="mx-auto flex max-w-[19rem] flex-col items-center gap-2">
        <div className="flex w-full items-baseline justify-center gap-2 border-b border-rule pb-3 focus-within:border-t1">
          <span className="text-display font-light text-t3">+91</span>
          <input
            value={digits}
            onChange={(e) => setDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="98765 43210"
            aria-label="Phone number"
            inputMode="numeric"
            autoComplete="tel-national"
            className="w-full bg-transparent text-center text-display font-light text-t1 tnum outline-none placeholder:text-t4"
          />
        </div>
        <span className="text-micro uppercase tracking-caps text-t3">Mobile number</span>
      </label>

      {/* Not part of resuming an account — only a new one needs a contact
          address collected. */}
      {!signin && (
        <label className="mx-auto mt-10 flex max-w-[19rem] flex-col items-center gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setBirthField('email', e.target.value)}
            placeholder="you@example.com"
            aria-label="Email address"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck="false"
            className="w-full border-b border-rule bg-transparent pb-3 text-center text-lead font-light text-t1 outline-none transition-colors placeholder:text-t4 focus:border-t1"
          />
          <span className="text-micro uppercase tracking-caps text-t3">Email</span>
        </label>
      )}

      {noAccount && (
        <p className="mx-auto mt-6 max-w-measure text-center text-meta text-live">
          We don&apos;t have an account for that number.{' '}
          <Link to={pro ? '/onboarding/name?next=pro' : '/onboarding/name'} className="underline">
            Create one instead
          </Link>
          .
        </p>
      )}
      {error && <p className="mx-auto mt-6 max-w-measure text-center text-meta text-live">{error}</p>}
    </QuestionFrame>
  )
}
