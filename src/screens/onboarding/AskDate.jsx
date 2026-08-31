import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QuestionFrame, { Slot } from './QuestionFrame.jsx'
import { useStore } from '../../store.jsx'

export default function AskDate() {
  const navigate = useNavigate()
  const { setBirthField } = useStore()
  const [d, setD] = useState('')
  const [m, setM] = useState('')
  const [y, setY] = useState('')

  /* A real calendar check, not a range check. `31/02/1997` passed the old one
     and reached Postgres as `1997-02-31`, which a `date` column rejects — and
     since phase 1 that rejection lands on the reveal screen as a raw driver
     message, after the account and wallet already exist. Constructing the date
     and reading it back is the shortest thing that cannot be fooled by a short
     month or a non-leap February. */
  const valid = (() => {
    if (y.length !== 4) return false
    const [dd, mm, yy] = [+d, +m, +y]
    if (!(yy >= 1900 && yy <= new Date().getFullYear())) return false
    if (!(mm >= 1 && mm <= 12) || !(dd >= 1 && dd <= 31)) return false
    const at = new Date(yy, mm - 1, dd)
    return at.getFullYear() === yy && at.getMonth() === mm - 1 && at.getDate() === dd
  })()

  return (
    <QuestionFrame
      question="When were you born?"
      hint="Date first. We will ask for the time separately, and we will be fussy about it."
      canContinue={valid}
      onNext={() => {
        setBirthField('date', `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`)
        navigate('/onboarding/time')
      }}
    >
      <div className="mx-auto grid max-w-[19rem] grid-cols-[1fr_1fr_1.5fr] gap-5">
        <Slot value={d} onChange={setD} placeholder="14" label="Day" max={2} />
        <Slot value={m} onChange={setM} placeholder="11" label="Month" max={2} />
        <Slot value={y} onChange={setY} placeholder="1996" label="Year" max={4} />
      </div>
    </QuestionFrame>
  )
}
