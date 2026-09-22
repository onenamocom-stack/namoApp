import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { askSuggestions } from '../data/mock.js'
import { TopBar } from '../components/Chrome.jsx'
import { Button, Section } from '../components/Primitives.jsx'
import useAskAi from '../components/useAskAi.js'
import { clock } from '../lib/ai.js'
import { rupees } from '../store.jsx'

/**
 * Namo AI as a full screen — the reading column, not the chat bubble.
 *
 * Shares every number with the panel through `useAskAi`: the quota, the
 * meter, the clock and the send path are one implementation, because two
 * copies of the money would be two places for it to drift. What differs is
 * only how it is drawn.
 *
 * The question packs are gone. They granted questions while displaying a
 * price and were replaced (21 Sep 2026) by five free on arrival, one a day
 * after that, and a metered session at the server's rate — docs/01-PRD.md
 * §4.4. Nothing here prices anything: `ratePaise` is the server's.
 */
export default function Ask() {
  const {
    messages, draft, setDraft, send, thinking, loading,
    freeLeft, ratePaise, live, starting, startMeter, stopMeter, needsMeter,
  } = useAskAi()
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, thinking])

  return (
    <>
      {/* A tab, so no back arrow. The right slot carries the quota — or, once
          a session is running, the clock, because a per-minute meter the
          seeker cannot see is the complaint every app in this category
          already has. */}
      <TopBar
        title="Ask AI"
        sub="Reads your chart"
        right={
          live ? (
            <span className="flex items-center gap-2 whitespace-nowrap">
              <span className="text-micro uppercase tracking-label tnum text-live">
                {clock(live.secondsLeft)}
              </span>
              <button
                type="button"
                onClick={stopMeter}
                className="text-micro uppercase tracking-label underline gold"
              >
                End
              </button>
            </span>
          ) : (
            <span
              className={`whitespace-nowrap text-micro uppercase tracking-label tnum ${
                freeLeft === 0 ? 'text-t1' : 'text-t2'
              }`}
            >
              {loading ? '—' : freeLeft === 0 ? 'None' : `${freeLeft} free`}
            </span>
          )
        }
      />

      {/* Said once, pinned, and never repeated per message — a warning on
          every bubble is a warning nobody reads. It names the real limit
          rather than only the legal one: a chart is not a life, and the
          model does not know one. The link is the honest next step and
          the business's, which is why it sits inside the sentence rather
          than under a separate heading. */}
      <p className="border-b border-rule px-5 py-3 text-micro t-faint">
        An AI expert reads your chart here. It might be wrong, and it does not know your
        life. For anything that matters,{' '}
        <Link to="/consult" className="underline hover:text-t1">
          ask our pros
        </Link>
        .
      </p>

      <div className="section-tight">
        {messages.map((m) => (
          <div key={m.id} className="border-b border-rule py-5 last:border-b-0">
            <p className="label text-left mb-2">{m.role === 'model' ? 'Namo' : 'You'}</p>
            <p className={`text-read ${m.role === 'model' ? 'text-t1' : 'text-t2'}`}>{m.text}</p>
          </div>
        ))}

        {(loading || thinking) && (
          <div className="animate-breathe py-5">
            <p className="label text-left">{loading ? 'Opening' : 'Reading your chart'}</p>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {needsMeter ? (
        <Section label="Out of free questions" last>
          <p className="horoscope">
            One free message arrives tomorrow. Until then a session runs at{' '}
            {ratePaise ? `₹${rupees(ratePaise)}` : '—'} a minute, charged from your wallet while
            it is open. Unused minutes come back when you end it.
          </p>
          <Button className="mt-10" variant="solid" onClick={startMeter} disabled={starting}>
            {starting ? 'Starting…' : 'Start a session'}
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
                  <button type="button" onClick={() => send(s.text)} className="act-row">
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
              {live ? 'Send' : 'Send · uses one'}
            </Button>
          </Section>
        </>
      )}

      <div className="h-8" />
    </>
  )
}
