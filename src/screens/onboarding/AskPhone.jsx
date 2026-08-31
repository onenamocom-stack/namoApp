import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import QuestionFrame from './QuestionFrame.jsx'
import { useStore } from '../../store.jsx'
import { supabase } from '../../lib/supabase.js'

/**
 * The last question, and the only one that leaves the device. Everything
 * before this is a draft; this step is what turns it into an account.
 * India-only for now, like the rest of onboarding — the +91 is fixed rather
 * than a country picker nobody needs yet.
 *
 * Two fields, one identity. The phone is the account: it is what receives the
 * code and the only channel anyone proves they hold. The email is never used
 * to sign in and is never verified here — it is a contact address, required
 * so it is actually there when it is wanted, and stored on the profile.
 */
export default function AskPhone() {
  const navigate = useNavigate()
  const { birth, setBirthField } = useStore()
  const next = useSearchParams()[0].get('next') === 'pro' ? '?next=pro' : ''
  const [digits, setDigits] = useState(() => (birth.phone || '').replace('+91', ''))
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  // Defaulted, not assumed. A draft restored from an older sessionStorage
  // write predates this field, and reading `.trim()` off undefined here would
  // white-screen the one route nobody can go around.
  const email = birth.email ?? ''

  const phoneValid = /^[6-9]\d{9}$/.test(digits)
  // Shape only, and the same shape the column's CHECK enforces. Nothing short
  // of sending mail to an address proves it exists, so this does not pretend to.
  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
  const valid = phoneValid && emailValid

  const send = async () => {
    if (!valid || sending) return
    setSending(true)
    setError('')

    const phone = `+91${digits}`
    const { error: err } = await supabase.auth.signInWithOtp({
      phone,
      options: { data: { name: birth.name } },
    })

    if (err) {
      setError(err.message)
      setSending(false)
      return
    }

    setBirthField('phone', phone)
    navigate(`/onboarding/verify${next}`)
  }

  return (
    <QuestionFrame
      question="Where do we reach you?"
      hint="The code goes to your number. The email is how we reach you outside the app."
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

      {/* Bound straight to the draft rather than local state, so it survives
          the same reload the phone number now does. */}
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

      {error && <p className="mx-auto mt-6 max-w-measure text-center text-meta text-live">{error}</p>}
    </QuestionFrame>
  )
}
