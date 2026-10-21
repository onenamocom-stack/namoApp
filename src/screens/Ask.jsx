import { Fragment, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useBirthGate } from '../components/useBirthFirst.js'
import { aiLine, copyFor } from '../data/aiBots.js'
import { fetchBots } from '../lib/ai.js'
import { BackButton } from '../components/Chrome.jsx'
import { Bubble, Composer, DayMark, canDictate, marksAt } from '../components/ChatPanel.jsx'
import { Loader } from '../components/Cosmos.jsx'
import { PopAvatar } from '../components/Pop.jsx'
import useAskAi from '../components/useAskAi.js'
import SubjectForm from '../components/SubjectForm.jsx'
import { rupees, useStore } from '../store.jsx'

/**
 * Namo AI and the AI Pros — the chat a seeker has with a Pro, the same
 * pieces (21 Oct 2026, Rahul: "same in size and design as pro"): the
 * header with the picture and name, the bubbles with their times, the
 * composer. It was its own plain chat since 30 Sep 2026.
 *
 * `?as=` picks the AI Pro (tarot, life_coach, therapist, or a later
 * category's key); none is the astrologer, the original Namo AI. Only the
 * astrologer reads a chart, so only it asks for birth details and offers
 * somebody else's, one tap above the composer.
 *
 * The free count, the price and the send path are the server's, through
 * `useAskAi`. An AI Pro is free questions only: no price, ever.
 */
export default function Ask() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const key = params.get('as') || 'astrologer'
  const astro = key === 'astrologer'
  const bot = copyFor(key)
  // The AI Pro's name, picture and AI line, from the console.
  const [pro, setPro] = useState(null)
  useEffect(() => {
    let live = true
    fetchBots()
      .then((s) => live && setPro((s.bots ?? []).find((b) => b.key === key) ?? null))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [key])
  useBirthGate({ skip: !astro })
  const {
    messages, send, thinking, loading,
    freeLeft, pricePaise, outOfFree, boostFrom,
    subject, asking, setAsking, askAbout,
  } = useAskAi(key)
  const { t, lang } = useStore()
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, thinking])

  const price = astro && pricePaise ? `₹${rupees(pricePaise)}` : ''
  const empty = !loading && messages.length === 0
  const name = pro?.name || t('tool.ai')
  const line = loading || freeLeft == null
    ? ''
    : outOfFree
      ? price
        ? t('ask.each', { price })
        : t('ask.tomorrow')
      : t('ask.free', { n: freeLeft })

  return (
    <div className="cosmic-dawn absolute inset-0 z-10 flex flex-col">
      {/* The Pro chat's header (ChatPanel's Thread). */}
      <div className="flex flex-none items-center gap-3 px-4 py-3">
        <BackButton onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/consult'))} />
        <PopAvatar initials="AI" src={pro?.image_url || null} size={44} online />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-meta t-heading">{name}</span>
          <span className="block truncate caps-sm text-live">{aiLine(pro, lang) || 'AI'}</span>
        </span>
        <span className="flex-none whitespace-nowrap caps-sm t-faint tnum">{line}</span>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {loading && <Loader label={t('ask.opening')} />}

        {!loading && (
          <>
            {empty && <p className="pb-2 pt-2 text-center text-micro t-faint">{t('legal.astro')}</p>}
            {/* The counsellor's help line, always on its screen. */}
            {key === 'therapist' && (
              <p className="mb-3 rounded-2xl bg-white/80 px-3 py-2 text-center text-micro t-sub">{t('bot.therapist.sub')}</p>
            )}
            {/* The welcome, as in Rahul's reference (21 Oct 2026): the AI
                Pro greets on open. Drawn here, never sent or counted. */}
            <Bubble mine={false} heart text={t('bot.hello', { name, intro: t(bot.hello) })} />
            <Bubble mine={false} heart text={t(bot.ask)} />
          </>
        )}

        {messages.map((m, i) => (
          <Fragment key={m.id}>
            {marksAt(messages, i) && <DayMark iso={m.created_at} lang={lang} />}
            <Bubble mine={m.role !== 'model'} heart text={m.text} />
          </Fragment>
        ))}
        {thinking && <Bubble mine={false} text={t(bot.thinking)} state="sending" />}
        <div ref={endRef} />
      </div>

      {astro && (
        <div className="flex-none border-t border-rule bg-white px-4 pt-2">
          {asking ? (
            <SubjectForm onDone={askAbout} onCancel={() => setAsking(false)} />
          ) : (
            <p className="flex items-center justify-between text-micro t-faint">
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
        </div>
      )}
      {boostFrom && <p className="flex-none bg-white px-4 pt-2 text-micro t-sub">{t('ask.boost')}</p>}
      {/* Free only: past the day's question, tomorrow. */}
      {outOfFree && !price && (
        <p className="flex-none bg-white px-4 pt-2 text-center text-micro t-sub">{t('ask.comeBack')}</p>
      )}

      <Composer
        onSend={(text) => send(text)}
        placeholder={t('bot.ph')}
        disabled={thinking || (outOfFree && !price)}
        // The AI Pro's own questions, always there (21 Oct 2026, Rahul).
        suggestions={outOfFree && !price ? null : bot.suggestions[lang === 'hi' ? 'hi' : 'en']}
        // Speak the question; it lands in the box as text (21 Oct 2026).
        voice={canDictate}
      />
    </div>
  )
}
