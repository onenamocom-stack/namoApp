import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import QuestionFrame from './QuestionFrame.jsx'
import { useStore } from '../../store.jsx'

/**
 * Asked first because it is the only question here with no wrong answer — it
 * sets the tone before the fussy ones about minutes and coordinates.
 */
export default function AskName() {
  const navigate = useNavigate()
  const { setBirthField } = useStore()
  const [name, setName] = useState('')
  /* `?next=pro` is the consultant branch of AskSide. It skips the four birth
     questions — a consultant is not here for a reading — and rejoins at the
     phone step, which is the same account either way. */
  const pro = useSearchParams()[0].get('next') === 'pro'

  const valid = name.trim().length > 0

  return (
    <QuestionFrame
      question="What should we call you?"
      hint="It appears at the top of every reading, and on your account."
      canContinue={valid}
      onNext={() => {
        setBirthField('name', name.trim())
        navigate(pro ? '/onboarding/phone?next=pro' : '/onboarding/date')
      }}
    >
      <label className="mx-auto flex max-w-[19rem] flex-col items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ananya"
          aria-label="Your name"
          autoComplete="given-name"
          className="w-full border-b border-rule bg-transparent pb-3 text-center text-display font-light text-t1 outline-none transition-colors placeholder:text-t4 focus:border-t1"
        />
        <span className="text-micro uppercase tracking-caps text-t3">Name</span>
      </label>
    </QuestionFrame>
  )
}
