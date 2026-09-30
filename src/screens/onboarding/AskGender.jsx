import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QuestionFrame from './QuestionFrame.jsx'
import { useStore } from '../../store.jsx'

const OPTIONS = [
  { key: 'male', label: 'Male' },
  { key: 'female', label: 'Female' },
  { key: 'other', label: 'Other' },
]

/**
 * Asked after the name, since 30 Sep 2026. A reading and a match both read
 * differently for it, and a consultant sees it on a booking.
 */
export default function AskGender() {
  const navigate = useNavigate()
  const { birth, setBirthField } = useStore()
  const [gender, setGender] = useState(birth.gender ?? '')

  return (
    <QuestionFrame
      question="And you are?"
      hint="Readings and matching use it. It stays on your account and nowhere else."
      canContinue={Boolean(gender)}
      onNext={() => {
        setBirthField('gender', gender)
        navigate('/onboarding/date')
      }}
    >
      <div className="mx-auto flex max-w-[19rem] flex-col gap-3">
        {OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => setGender(o.key)}
            aria-pressed={gender === o.key}
            className="pill justify-center py-3 text-body"
          >
            {o.label}
          </button>
        ))}
      </div>
    </QuestionFrame>
  )
}
