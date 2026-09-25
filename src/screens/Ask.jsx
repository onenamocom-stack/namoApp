import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { askSuggestions } from '../data/mock.js'
import { TopBar } from '../components/Chrome.jsx'
import { Button, Section } from '../components/Primitives.jsx'
import useAskAi from '../components/useAskAi.js'
import SubjectForm from '../components/SubjectForm.jsx'
import { rupees } from '../store.jsx'

/**
 * Namo AI as a full screen — the reading column, not the chat bubble.
 *
 * Shares every number with the panel through `useAskAi`: the quota, the
 * price and the send path are one implementation, because two copies of
 * the money would be two places for it to drift. What differs is only how
 * it is drawn.
 *
 * Priced per QUESTION since 23 Sep 2026 — five free on arrival, one a day
 * after that, then ₹9 an answer (docs/01-PRD.md §4.4). Before that it was
 * a per-minute meter with a clock in this header, and before that question
 * packs. Nothing here prices anything: `pricePaise` is the server's.
 */
export default function Ask() {
  const {
    messages, draft, setDraft, send, thinking, loading,
    freeLeft, pricePaise, outOfFree, boostFrom,
    who, subject, asking, setAsking, askAbout,
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
          <span
            className={`whitespace-nowrap text-micro uppercase tracking-label tnum ${
              outOfFree ? 'text-t1' : 'text-t2'
            }`}
          >
            {loading
              ? '—'
              : outOfFree
                ? pricePaise ? `₹${rupees(pricePaise)} each` : ''
                : `${freeLeft} free`}
          </span>
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

        {/* Asked once, before the first question. A chart answers about one
            person, and which person is the thing the model cannot guess —
            "will I get the job" and "will she get the job" are the same
            sentence to it if nobody says whose chart is loaded. */}
        {who === null && messages.length === 0 && !loading && (
          <div className="pop-card p-4 text-center">
            <p className="caps t-heading">Who is this about?</p>
            <p className="mt-2 text-meta t-body">
              A chart reads one person. Say whose.
            </p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => askAbout(null)} className="pop-btn flex-1 caps-sm">
                Myself
              </button>
              <button type="button" onClick={() => setAsking(true)} className="pill flex-1 caps-sm justify-center">
                Someone else
              </button>
            </div>
          </div>
        )}

        {asking && <SubjectForm onDone={askAbout} onCancel={() => setAsking(false)} />}

        {/* Whose chart is loaded, and the way out of it. Shown while a
            subject is set because the alternative is a seeker forgetting
            and reading an answer about their mother as one about them. */}
        {subject && !asking && (
          <p className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2 text-micro t-sub">
            <span>Reading {subject.name}&apos;s chart</span>
            <span className="flex gap-3">
              <button type="button" onClick={() => setAsking(true)} className="underline">
                someone else
              </button>
              <button type="button" onClick={() => askAbout(null)} className="underline">
                back to mine
              </button>
            </span>
          </p>
        )}

        {(loading || thinking) && (
          <div className="animate-breathe py-5">
            <p className="label text-left">{loading ? 'Opening' : 'Reading your chart'}</p>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* A boost that is earned but not yet open. Without this the
          seeker sees the same number as before and reads their reward as
          nothing having happened — which is the complaint that moved the
          window to start tomorrow in the first place. */}
      {boostFrom && (
        <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-micro t-sub">
          Your referral is in. <b>3 free questions a day</b> start tomorrow.
        </p>
      )}

      {outOfFree && (
        /* A price, not a wall. Asking still works. */
        <Section label="Free questions used" tight>
          <p className="horoscope">
            The next answer costs {pricePaise ? `₹${rupees(pricePaise)}` : '—'} from your
            wallet, and one more free one arrives tomorrow.
          </p>
          <Button to="/consult" variant="quiet" className="mt-5">
            Or ask a person instead
          </Button>
        </Section>
      )}

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
              disabled={!draft.trim() || thinking || (who === null && messages.length === 0)}
            >
              {outOfFree
                ? `Send · ${pricePaise ? `₹${rupees(pricePaise)}` : ''}`
                : 'Send · uses one free'}
            </Button>
          </Section>
      </>

      <div className="h-8" />
    </>
  )
}
