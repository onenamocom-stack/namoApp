import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import QuestionFrame from './QuestionFrame.jsx'
import { useStore } from '../../store.jsx'
import { supabase } from '../../lib/supabase.js'

export default function VerifyOtp() {
  const navigate = useNavigate()
  const { birth } = useStore()
  /* The consultant branch has no birth details to write, so it skips
     Computing entirely and lands on the application. */
  const pro = useSearchParams()[0].get('next') === 'pro'
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const [resent, setResent] = useState(false)

  const valid = /^\d{6}$/.test(code)

  const verify = async () => {
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

    navigate(pro ? '/pro/apply' : '/onboarding/computing')
  }

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
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
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
