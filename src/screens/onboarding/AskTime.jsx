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
 *
 * **And it can be declined.** A large share of Indian users do not know their
 * minute of birth — `birth_time_known` exists for exactly that reason
 * (docs/05-BACKEND-SCHEMA.md §4.1) and was hardcoded `true` here until phase 7,
 * which meant every guess was stored as a certainty. Planets survive a rough
 * time. The ascendant moves a whole sign every two hours, so the houses do not,
 * and a chart that hides them is worth more than one that invents them.
 */
export default function AskTime() {
  const navigate = useNavigate()
  const { setBirthField } = useStore()
  const [h, setH] = useState('')
  const [min, setMin] = useState('')
  const [ampm, setAmpm] = useState('AM')
  const [unknown, setUnknown] = useState(false)

  const valid = +h >= 1 && +h <= 12 && min.length === 2 && +min >= 0 && +min <= 59

  return (
    <QuestionFrame
      question="Down to the minute."
      hint="Four minutes moves your rising sign. If the certificate says 04:35, do not round it to half past."
      canContinue={unknown || valid}
      footnote="Ask whoever was in the room before you guess. A guess is stored as a fact, and everything angular in the chart is built on it."
      onNext={() => {
        // Two fields, always both. Writing a time without saying whether it is
        // known is what produced four production accounts marked certain about
        // a minute somebody estimated.
        setBirthField('timeKnown', !unknown)
        setBirthField('time', unknown ? '' : `${h.padStart(2, '0')}:${min} ${ampm}`)
        navigate('/onboarding/place')
      }}
    >
      <div
        className={`transition-opacity ${unknown ? 'pointer-events-none opacity-30' : ''}`}
        aria-hidden={unknown}
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
      </div>

      {/* A real checkbox rather than a styled div: it is focusable, it is in the
          tab order, and a screen reader announces its state without being told
          to. The consequence is stated on the control itself, because the cost
          of ticking it is invisible three screens later. */}
      <label className="mx-auto mt-10 flex max-w-measure cursor-pointer items-start gap-3 border-t border-rule pt-6">
        <input
          type="checkbox"
          checked={unknown}
          onChange={(e) => setUnknown(e.target.checked)}
          className="mt-1 h-4 w-4 flex-none accent-t1"
        />
        <span>
          <span className="block text-body text-t1">I do not know my birth time</span>
          <span className="mt-1 block text-meta text-t3">
            You still get your planets and your moon sign. Rising and the twelve houses need the
            minute, and stay hidden until you have it.
          </span>
        </span>
      </label>
    </QuestionFrame>
  )
}
