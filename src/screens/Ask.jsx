import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useBirthGate } from '../components/useBirthFirst.js'
import { aiLine, copyFor } from '../data/aiBots.js'
import { fetchBots } from '../lib/ai.js'
import { BackButton } from '../components/Chrome.jsx'
import { Bubble, Composer, stamp } from '../components/ChatPanel.jsx'
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
    <div className="flex h-full flex-col bg-white">
      {/* The Pro chat's header (ChatPanel's Thread). */}
      <div className="flex flex-none items-center gap-3 border-b border-rule px-4 py-3">
        <BackButton onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/consult'))} />
        <PopAvatar initials="AI" src={pro?.image_url || null} size={30} online />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-meta t-heading">{name}</span>
          <span className="block truncate caps-sm text-live">{aiLine(pro, lang) || 'AI'}</span>
        </span>
        <span className="flex-none whitespace-nowrap caps-sm t-faint tnum">{line}</span>
      </div>

      <div className="cosmic-dawn no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {loading && <Loader label={t('ask.opening')} />}

        {empty && (
          <div className="pb-4 pt-6 text-center">
            <p className="text-lead font-semibold t-heading">{t(bot.title)}</p>
            <p className="mt-1.5 text-meta t-faint">{t(bot.sub)}</p>
            <p className="mt-2 text-micro t-faint">{t('legal.astro')}</p>
          </div>
        )}

        {messages.map((m, i) => {
          const next = messages[i + 1]
          const time = m.created_at ? stamp(m.created_at) : null
          const last = !next || next.role !== m.role
          return (
            <Bubble key={m.id} mine={m.role !== 'model'} text={m.text} time={last ? time : null} />
          )
        })}
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
        placeholder="Type a message"
        disabled={thinking || (outOfFree && !price)}
        suggestions={empty ? bot.suggestions : null}
      />
    </div>
  )
}
