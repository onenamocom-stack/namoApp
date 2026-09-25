import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QuestionFrame from './QuestionFrame.jsx'
import { claimCode } from '../../lib/referrals.js'

/**
 * "Were you invited?" — the last onboarding question, and the only
 * optional one.
 *
 * WHY IT IS HERE AND NOT EARLIER. Claiming a code is an authenticated
 * write: the server credits two accounts and has to know which one is
 * asking. Before the OTP there is no session, so this cannot run until
 * after it. It sits between Verify and Computing, which is the last
 * moment somebody is still in the flow and the first moment the call
 * would work.
 *
 * WHY IT IS ASKED AT ALL, when the same box exists on the profile. A
 * code is claimable **once per account, ever**, and somebody who has to
 * find Settings three days later has usually thrown the code away. The
 * person who shared it is waiting on it too — this is the only moment
 * both sides are guaranteed to be paid.
 *
 * SKIPPING IS THE DEFAULT ACTION. Most people arrive with no code, and a
 * required field here would be a wall in front of the app for everybody
 * to satisfy a minority. "Skip" is the plain button; Continue only lights
 * up when something is typed.
 *
 * A REFUSAL DOES NOT TRAP ANYONE. If the code is wrong, expired, their
 * own, or an astrologer's shop coupon, the sentence is shown and the flow
 * carries on being skippable. Nobody is held at the door over a perk.
 */
export default function AskReferral() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)

  const onward = () => navigate('/onboarding/computing')

  const apply = async () => {
    const typed = code.trim()
    if (!typed || working) return
    setWorking(true)
    setError('')
    try {
      await claimCode(typed)
      onward()
    } catch (err) {
      // The server's own sentence. Every refusal it gives names the fix —
      // wrong kind of code, already used one, your own.
      setError(err.message)
      setWorking(false)
    }
  }

  return (
    <QuestionFrame
      question="Were you invited?"
      hint="If someone gave you a code, you both get three free questions a day for three days."
      canContinue={code.trim().length > 0 && !working}
      onNext={apply}
    >
      <label className="mx-auto flex max-w-[19rem] flex-col items-center gap-2">
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase())
            setError('')
          }}
          placeholder="NXXXXXXX"
          maxLength={16}
          aria-label="Referral code"
          autoComplete="off"
          autoCapitalize="characters"
          className="w-full border-b border-rule bg-transparent pb-3 text-center text-display font-light tracking-[0.15em] text-t1 outline-none transition-colors placeholder:tracking-normal placeholder:text-t4 focus:border-t1"
        />
        <span className="text-micro uppercase tracking-caps text-t3">Referral code</span>
      </label>

      {error && (
        <p className="mx-auto mt-5 max-w-[19rem] text-center text-meta text-live">{error}</p>
      )}

      {/* The plain way out, and the one most people take. Below the field
          rather than beside it, so it is never the thing a thumb hits
          while reaching for the input. */}
      <button
        type="button"
        onClick={onward}
        className="mx-auto mt-8 block text-micro uppercase tracking-caps text-t3 underline transition-colors hover:text-t1"
      >
        I don&apos;t have one
      </button>

      <p className="mx-auto mt-6 max-w-[19rem] text-center text-micro t-faint">
        An astrologer&apos;s shop coupon is different — that one goes in at
        checkout, on your first order.
      </p>
    </QuestionFrame>
  )
}
