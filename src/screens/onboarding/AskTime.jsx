import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QuestionFrame, { Slot } from './QuestionFrame.jsx'
import { Segmented } from '../../components/Primitives.jsx'
import { useStore } from '../../store.jsx'

/**
 * The most copyable moment in the whole product.
 *
 * Asking for the birth time *to the minute* feels like precision engineering,
 * and that feeling is doing the credibility work for everything downstream.
 * So the question is asked in the largest type in the app, the minute field is
 * given equal weight to the hour, and the copy says out loud why it matters.
 */
export default function AskTime() {
  const navigate = useNavigate()
  const { setBirthField } = useStore()
  const [h, setH] = useState('')
  const [min, setMin] = useState('')
  const [ampm, setAmpm] = useState('AM')

  const valid = +h >= 1 && +h <= 12 && min.length === 2 && +min >= 0 && +min <= 59

  return (
    <QuestionFrame
      question="Down to the minute."
      hint="Four minutes moves your rising sign. If the certificate says 04:35, do not round it to half past."
      canContinue={valid}
      footnote="No idea? Ask whoever was in the room. A guess is worse than a wrong answer, because a wrong answer is at least consistent."
      onNext={() => {
        setBirthField('time', `${h.padStart(2, '0')}:${min} ${ampm}`)
        navigate('/onboarding/place')
      }}
    >
      <div className="mx-auto grid max-w-[13rem] grid-cols-[1fr_auto_1fr] items-end gap-3">
        <Slot value={h} onChange={setH} placeholder="04" label="Hour" max={2} />
        <span className="pb-9 text-display font-light text-t3">:</span>
        <Slot value={min} onChange={setMin} placeholder="35" label="Minute" max={2} />
      </div>

      <Segmented
        items={['AM', 'PM']}
        value={ampm}
        onChange={setAmpm}
        className="mx-auto mt-10 max-w-[13rem]"
      />
    </QuestionFrame>
  )
}
