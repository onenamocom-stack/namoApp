import { useEffect, useRef, useState } from 'react'
import { askConversation, askSuggestions, questionPacks } from '../data/mock.js'
import { Sheet, TopBar } from '../components/Chrome.jsx'
import { Button, Field, Section, Stub } from '../components/Primitives.jsx'
import { useStore } from '../store.jsx'

/** Canned replies. Blunt, chart-citing, never reassuring for its own sake. */
const REPLIES = [
  'Your 10th house lord is strong through September. The chart supports the move. It does not promise you will like it.',
  'Venus in your 7th softens the next three weeks. Use them for the repair conversation, not for a new person.',
  'Saturn in the 12th means you are auditing yourself in private and calling the result a personality. It is not.',
  'The chart says timing, not permission. You already know the answer and are shopping for a second opinion.',
]

export default function Ask() {
  const { questionsLeft, spendQuestion, addQuestions, showToast } = useStore()
  const [messages, setMessages] = useState(askConversation)
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const [sheet, setSheet] = useState(false)
  const endRef = useRef(null)
  const replyRef = useRef(0)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, thinking])

  const locked = questionsLeft === 0

  const send = (text) => {
    const q = (text ?? draft).trim()
    if (!q || locked || thinking) return

    setMessages((m) => [...m, { id: `u${m.length}`, role: 'user', text: q, time: 'now' }])
    setDraft('')
    spendQuestion()
    setThinking(true)

    setTimeout(() => {
      const reply = REPLIES[replyRef.current % REPLIES.length]
      replyRef.current += 1
      setMessages((m) => [...m, { id: `a${m.length}`, role: 'ai', text: reply, time: 'now' }])
      setThinking(false)
    }, 900)
  }

  return (
    <>
      {/* A tab, so no back arrow. The quota lives in the right slot where the
          reference app puts its "5 free left" pill. */}
      <TopBar
        title="Ask AI"
        sub="Reads your chart"
        right={
          <span
            className={`whitespace-nowrap text-micro uppercase tracking-label tnum ${
              locked ? 'text-t1' : 'text-t2'
            }`}
          >
            {locked ? 'None' : `${questionsLeft} free`}
          </span>
        }
      />

      <div className="section-tight">
        {messages.map((m) => (
          <div key={m.id} className="border-b border-rule py-5 last:border-b-0">
            <p className="label text-left mb-2">{m.role === 'ai' ? 'Namo' : 'You'}</p>
            <p className={`text-read ${m.role === 'ai' ? 'text-t1' : 'text-t2'}`}>{m.text}</p>
          </div>
        ))}

        {thinking && (
          <div className="animate-breathe py-5">
            <p className="label text-left">Reading your chart</p>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {locked ? (
        <Section label="Out of questions" last>
          <p className="horoscope">
            You have used your five. The chart has not changed in the last ten minutes, but you can
            buy more anyway.
          </p>
          <Button className="mt-10" variant="solid" onClick={() => setSheet(true)}>
            Get more questions
          </Button>
          <Button
            className="mt-3"
            variant="quiet"
            onClick={() => showToast('We will tell you when they reset')}
          >
            Remind me when they reset
          </Button>
          <Button to="/consult" variant="quiet" className="mt-3">
            Or ask a person instead
          </Button>
        </Section>
      ) : (
        <>
          <Section label="If you cannot phrase it" tight>
            <ul>
              {askSuggestions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => send(s.text)}
                    className="act-row"
                  >
                    <span className="min-w-0">
                      <span className="block text-body text-t1">{s.text}</span>
                      <span className="mt-1 block text-micro uppercase tracking-caps text-t3">
                        {s.label}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>

          <Section label="Your question" last>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              placeholder="Ask plainly. Vague questions get vague charts."
              aria-label="Your question"
              className="w-full resize-none border border-rule bg-transparent p-4 text-body text-t1 outline-none transition-colors placeholder:text-t4 focus:border-t1"
            />
            <Button
              className="mt-5"
              variant="solid"
              onClick={() => send()}
              disabled={!draft.trim() || thinking}
            >
              Send · uses one
            </Button>
            <Stub className="my-8" />
            <p className="text-center text-meta text-t3">
              Answers are generated for this prototype. They cite your placements because the copy
              says so, not because anything was computed.
            </p>
          </Section>
        </>
      )}

      <div className="h-8" />

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Question packs">
        {questionPacks.map((p) => (
          <div key={p.id} className="border-b border-rule py-5">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-lead font-light">{p.questions} questions</span>
              <span className="text-body text-t1 tnum">₹{p.price}</span>
            </div>
            {p.tag && <p className="mt-1 text-micro uppercase tracking-caps text-t3">{p.tag}</p>}
            <Button
              className="mt-4"
              onClick={() => {
                addQuestions(p.questions)
                setSheet(false)
              }}
            >
              Add
            </Button>
          </div>
        ))}
        <Field k="Wallet" v="₹1,240" />
        <p className="mt-6 text-center text-meta text-t3">Prototype — no payment is taken.</p>
      </Sheet>
    </>
  )
}
