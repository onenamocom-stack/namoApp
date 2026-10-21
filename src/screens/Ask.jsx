import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useBirthGate } from '../components/useBirthFirst.js'
import { aiLine, copyFor } from '../data/aiBots.js'
import { fetchBots } from '../lib/ai.js'
import { TopBar } from '../components/Chrome.jsx'
import Icon from '../components/Icon.jsx'
import { Loader, Orbit, Stars } from '../components/Cosmos.jsx'
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
  /* `?as=` picks the Consult chat (21 Oct 2026): tarot, life_coach,
     therapist; none is the astrologer. Only the astrologer reads a chart,
     so only it asks for birth details and offers somebody else's. */
  const [params] = useSearchParams()
  const key = params.get('as') || 'astrologer'
  const astro = key === 'astrologer'
  const bot = copyFor(key)
  // The AI Pro's name and AI line, from the console.
  const [pro, setPro] = useState(null)
  useEffect(() => {
    if (astro) return undefined
    let live = true
    fetchBots()
      .then((s) => live && setPro((s.bots ?? []).find((b) => b.key === key) ?? null))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [astro, key])
  useBirthGate({ skip: !astro })
  const {
    messages, draft, setDraft, send, thinking, loading,
    freeLeft, pricePaise, outOfFree, boostFrom,
    subject, asking, setAsking, askAbout,
  } = useAskAi(key)
  const { t, lang } = useStore()
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, thinking])

  // An AI Pro is free questions only (21 Oct 2026): no price, ever.
  const price = astro && pricePaise ? `₹${rupees(pricePaise)}` : ''
  const empty = !loading && messages.length === 0

  /* The dawn wash and a few stars behind the conversation, and your own
     messages in saffron: the sign-up reveal's palette, softened (3 Oct). */
  return (
    <div className="cosmic-dawn relative flex min-h-full flex-col">
      <Stars />
      <TopBar
        title={astro ? t('tool.ai') : pro?.name ?? ''}
        back
        backTo="/consult"
        right={
          <span className="whitespace-nowrap text-micro uppercase tracking-label tnum text-t2">
            {loading ? '' : outOfFree ? (price ? t('ask.each', { price }) : t('ask.tomorrow')) : t('ask.free', { n: freeLeft })}
          </span>
        }
      />

      <div className="relative flex-1 px-4 pt-4">
        {loading && <Loader label={t('ask.opening')} />}

        {empty && (
          <div className="flex flex-col items-center pt-12 text-center">
            <Orbit size={72} className="mb-6" />
            <p className="text-title font-semibold t-heading">{t(bot.title)}</p>
            <p className="mt-2 text-meta t-faint">{t(bot.sub)}</p>
            {!astro && pro && <p className="mt-3 text-micro font-semibold text-live">{aiLine(pro, lang)}</p>}
            <p className="mt-3 text-micro t-faint">{t('legal.astro')}</p>
            <div className="mt-8 flex w-full flex-col gap-2">
              {bot.suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="bubble-theirs rounded-2xl px-4 py-3 text-left text-meta transition-colors hover:bg-surface"
                >
                  {s}
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
                  m.role === 'model' ? 'bubble-theirs rounded-bl-md' : 'bubble-mine rounded-br-md'
                }`}
              >
                {m.text}
              </p>
            </li>
          ))}
          {thinking && (
            <li className="flex justify-start">
              <p className="bubble-theirs flex items-center gap-2.5 rounded-2xl rounded-bl-md px-4 py-2.5 text-meta t-faint">
                <Orbit size={22} />
                {t(bot.thinking)}
              </p>
            </li>
          )}
        </ul>
        {/* Scrolled to with room for the composer pinned over the bottom
            (14 Oct 2026): it hid the newest message under it. */}
        <div ref={endRef} className="h-4 scroll-mb-40" />
      </div>

      {/* Pinned to the bottom of the scroll, like every chat. */}
      <div className="sticky bottom-0 border-t border-rule bg-bg px-4 pb-4 pt-3">
        {!astro ? null : asking ? (
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

        {/* Free only for now (19 Oct 2026, Rahul): no price, no wallet —
            past the free ones it is tomorrow. */}
        {outOfFree && !price && (
          <p className="mb-2 rounded-2xl bg-white/80 px-3 py-2 text-center text-micro t-sub">{t('ask.comeBack')}</p>
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
            aria-label="Message NAMO AI"
            className="max-h-32 min-h-[2.25rem] flex-1 resize-none bg-transparent py-1.5 text-body text-t1 outline-none placeholder:text-t4"
          />
          <button
            type="submit"
            disabled={!draft.trim() || thinking || (outOfFree && !price)}
            aria-label={outOfFree && price ? `Send, ${price}` : 'Send'}
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gold-fill text-ink transition-opacity disabled:opacity-40"
          >
            <Icon name="send" size={16} />
          </button>
        </form>

        {/* No line under the box (9 Oct 2026, owner): the free count and
            price are in the header, and "NAMO AI can be wrong — ask our
            pros" is gone. */}
      </div>
    </div>
  )
}
