import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { askSuggestions } from '../data/mock.js'
import { TopBar } from '../components/Chrome.jsx'
import Icon from '../components/Icon.jsx'
import useAskAi from '../components/useAskAi.js'
import SubjectForm from '../components/SubjectForm.jsx'
import { rupees, useStore } from '../store.jsx'

/**
 * Namo AI — a plain chat, like every chat assistant (30 Sep 2026, owner's
 * call). Messages in bubbles, the composer pinned to the bottom, Enter sends.
 * It was a reading column with section labels; that read as a form.
 *
 * The chart is the seeker's own by default — no "who is this about?" step
 * before the first message. Somebody else's is one tap above the composer.
 *
 * Priced per question (docs/01-PRD.md §4.4): the free count, the price and
 * the send path are the server's, through `useAskAi`.
 */
export default function Ask() {
  const {
    messages, draft, setDraft, send, thinking, loading,
    freeLeft, pricePaise, outOfFree, boostFrom,
    subject, asking, setAsking, askAbout,
  } = useAskAi()
  const { t } = useStore()
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, thinking])

  const price = pricePaise ? `₹${rupees(pricePaise)}` : ''
  const empty = !loading && messages.length === 0

  return (
    <div className="flex min-h-full flex-col">
      <TopBar
        title={t('tool.ai')}
        back
        backTo="/consult"
        right={
          <span className="whitespace-nowrap text-micro uppercase tracking-label tnum text-t2">
            {loading ? '' : outOfFree ? t('ask.each', { price }) : t('ask.free', { n: freeLeft })}
          </span>
        }
      />

      <div className="flex-1 px-4 pt-4">
        {loading && <p className="py-10 text-center text-meta t-faint">{t('ask.opening')}</p>}

        {empty && (
          <div className="flex flex-col items-center pt-16 text-center">
            <p className="text-title font-semibold t-heading">{t('ask.title')}</p>
            <p className="mt-2 text-meta t-faint">{t('ask.sub')}</p>
            <div className="mt-8 flex w-full flex-col gap-2">
              {askSuggestions.slice(0, 4).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => send(s.text)}
                  className="rounded-2xl border border-rule px-4 py-3 text-left text-meta t-body transition-colors hover:bg-surface2"
                >
                  {s.text}
                </button>
              ))}
            </div>
          </div>
        )}

        <ul className="space-y-3">
          {messages.map((m) => (
            <li key={m.id} className={`flex ${m.role === 'model' ? 'justify-start' : 'justify-end'}`}>
              <p
                className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-body ${
                  m.role === 'model'
                    ? 'rounded-bl-md bg-surface2 t-body'
                    : 'rounded-br-md bg-gold-fill text-ink'
                }`}
              >
                {m.text}
              </p>
            </li>
          ))}
          {thinking && (
            <li className="flex justify-start">
              <p className="animate-breathe rounded-2xl rounded-bl-md bg-surface2 px-4 py-2.5 text-body t-faint">
                …
              </p>
            </li>
          )}
        </ul>
        <div ref={endRef} className="h-4" />
      </div>

      {/* Pinned to the bottom of the scroll, like every chat. */}
      <div className="sticky bottom-0 border-t border-rule bg-bg px-4 pb-4 pt-3">
        {asking ? (
          <SubjectForm onDone={askAbout} onCancel={() => setAsking(false)} />
        ) : (
          <p className="mb-2 flex items-center justify-between text-micro t-faint">
            <span>{subject ? t('ask.readingTheirs', { name: subject.name }) : t('ask.readingMine')}</span>
            <button
              type="button"
              onClick={() => (subject ? askAbout(null) : setAsking(true))}
              className="underline"
            >
              {subject ? t('ask.backToMine') : t('ask.someoneElse')}
            </button>
          </p>
        )}

        {boostFrom && (
          <p className="mb-2 text-micro t-sub">
            {t('ask.boost')}
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
          className="flex items-end gap-2 rounded-3xl border border-rule bg-white px-3 py-2"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            rows={1}
            placeholder={t('ask.ph')}
            aria-label="Message Namo AI"
            className="max-h-32 min-h-[2.25rem] flex-1 resize-none bg-transparent py-1.5 text-body text-t1 outline-none placeholder:text-t4"
          />
          <button
            type="submit"
            disabled={!draft.trim() || thinking}
            aria-label={outOfFree ? `Send, ${price}` : 'Send'}
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gold-fill text-ink transition-opacity disabled:opacity-40"
          >
            <Icon name="send" size={16} />
          </button>
        </form>

        <p className="mt-2 text-center text-micro t-faint">
          {outOfFree
            ? `${t('ask.perQuestion', { price })} `
            : `${t('ask.freeLeft', { n: freeLeft ?? '—' })} `}
          {t('ask.canBeWrong')}{' '}
          <Link to="/consult" className="underline">
            {t('ask.pros')}
          </Link>
          {t('ask.end')}
        </p>
      </div>
    </div>
  )
}
