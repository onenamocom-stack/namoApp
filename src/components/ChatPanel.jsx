import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { askSuggestions, chatThreads, consultantReplies, notifications } from '../data/mock.js'
import Icon from './Icon.jsx'
import { PopAvatar, PopButton } from './Pop.jsx'
import { useStore } from '../store.jsx'

/** Canned AI replies. Blunt, chart-citing, never reassuring for its own sake. */
const AI_REPLIES = [
  'Your 10th house lord is strong through September. The chart supports the move. It does not promise you will like it.',
  'Venus in your 7th softens the next three weeks. Use them for the repair conversation, not for a new person.',
  'Saturn in the 12th means you are auditing yourself in private and calling the result a personality. It is not.',
  'The chart says timing, not permission. You already know the answer and are shopping for a second opinion.',
]

/**
 * Right-side chat panel.
 *
 * Replaces the old alerts surface. It is an overlay rather than a route, so it
 * opens from any tab and from the floating button without losing the screen
 * underneath — which is the whole point of a side panel over a page.
 *
 * Three tabs: Live Consultant, Ask AI and Alerts. Ask AI opens by default —
 * it is the one that always answers, where a consultant only replies inside a
 * session window. All three are mock flows; nothing leaves the browser.
 */
export default function ChatPanel() {
  const { isPro, chatOpen, setChatOpen, chatTab, setChatTab, questionsLeft, spendQuestion } =
    useStore()

  if (!chatOpen) return null

  return (
    <div className="absolute inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close chat"
        onClick={() => setChatOpen(false)}
        className="absolute inset-0 animate-fade bg-ink opacity-40"
      />

      {/* The panel itself. Full height, hard left edge, no blur — the sheet
          slides on one axis and stops, per the linear-motion rule. */}
      <aside className="glass-panel relative flex h-full w-[88%] max-w-[380px] animate-slide-in flex-col border-l border-stroke">
        <header className="flex-none border-b border-stroke">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="caps t-heading">Messages</p>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              className="caps-sm t-body"
              aria-label="Close"
            >
              Close
            </button>
          </div>

          {/* Ask AI is a seeker product. A consultant is the person being
              asked; putting a chart oracle in her inbox is the app talking to
              itself. Her tabs are clients and alerts, and "Consultant" becomes
              "Clients" because she is not messaging one. */}
          <div className="flex" role="tablist">
            {(isPro
              ? [
                  { key: 'live', label: 'Clients' },
                  { key: 'alerts', label: 'Alerts' },
                ]
              : [
                  { key: 'live', label: 'Consultant' },
                  { key: 'ai', label: 'Ask AI' },
                  { key: 'alerts', label: 'Alerts' },
                ]
            ).map((t) => (
              <button
                key={t.key}
                role="tab"
                type="button"
                aria-selected={chatTab === t.key}
                onClick={() => setChatTab(t.key)}
                className={`caps-sm flex-1 border-b-2 py-3 transition-colors ${
                  chatTab === t.key ? 'border-gold gold' : 'border-transparent t-faint'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </header>

        {chatTab === 'live' && <LiveConsultant isPro={isPro} />}
        {chatTab === 'ai' && (
          <AskAi questionsLeft={questionsLeft} spendQuestion={spendQuestion} />
        )}
        {chatTab === 'alerts' && <Alerts />}
      </aside>
    </div>
  )
}

/* ── Live consultant ─────────────────────────────────────────────────────── */

function LiveConsultant({ isPro }) {
  const [activeId, setActiveId] = useState(null)
  const active = chatThreads.find((t) => t.id === activeId)

  if (!active) return <ThreadList onOpen={setActiveId} isPro={isPro} />
  return <Thread thread={active} isPro={isPro} onBack={() => setActiveId(null)} />
}

/**
 * Whoever is reading is "me".
 *
 * The mock threads are written from the seeker's side — `from: 'me'` is the
 * seeker and the thread is named after the consultant. Read by a consultant
 * that is exactly backwards: her own name at the top and her own replies in
 * the other party's bubbles. These two helpers flip it, and are the only place
 * that knows the threads have a fixed authorial side.
 */
const otherEnd = (t, isPro) => (isPro ? t.seeker : t.name)
const otherInitials = (t, isPro) => (isPro ? t.seekerInitials : t.initials)

function ThreadList({ onOpen, isPro }) {
  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
      <ul>
        {chatThreads.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onOpen(t.id)}
              className="flex w-full items-start gap-3 border-b border-rule px-4 py-4 text-left transition-opacity hover:opacity-70"
            >
              <PopAvatar initials={otherInitials(t, isPro)} size={40} online={t.online} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-body t-heading">{otherEnd(t, isPro)}</span>
                  <span className="ml-auto flex-none caps-sm t-faint tnum">{t.time}</span>
                </span>
                <span className="mt-1 block truncate text-meta t-body">{t.last}</span>
              </span>
              {t.unread > 0 && (
                <span className="caps-sm flex-none rounded-full bg-gold-fill px-2 py-0.5 text-ink tnum">
                  {t.unread}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <div className="px-4 py-6">
        {isPro ? (
          <p className="text-meta t-body">
            Replies inside the session window count toward your response time.
          </p>
        ) : (
          <>
            <p className="text-meta t-body">
              Consultants reply inside their session window. Outside it, use Ask AI.
            </p>
            <PopButton to="/consult" variant="ghost" className="mt-4">
              Find a consultant
            </PopButton>
          </>
        )}
      </div>
    </div>
  )
}

function Thread({ thread, isPro, onBack }) {
  const [messages, setMessages] = useState(thread.messages)
  const [draft, setDraft] = useState('')
  const endRef = useRef(null)
  const replyRef = useRef(0)

  // Reset when switching threads, otherwise the previous conversation leaks in.
  useEffect(() => {
    setMessages(thread.messages)
    setDraft('')
    replyRef.current = 0
  }, [thread.id, thread.messages])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  const send = () => {
    const text = draft.trim()
    if (!text) return
    setMessages((m) => [
      ...m,
      { id: `me${m.length}`, from: isPro ? 'them' : 'me', text, time: 'now' },
    ])
    setDraft('')
    // `consultantReplies` is a consultant answering a seeker. Playing it back
    // to the consultant would have her talking to herself, so the pro side
    // simply sends and waits, which is also what really happens.
    if (isPro) return
    setTimeout(() => {
      const reply = consultantReplies[replyRef.current % consultantReplies.length]
      replyRef.current += 1
      setMessages((m) => [...m, { id: `th${m.length}`, from: 'them', text: reply, time: 'now' }])
    }, 900)
  }

  return (
    <>
      <div className="flex flex-none items-center gap-3 border-b border-rule px-4 py-3">
        <button type="button" onClick={onBack} className="text-body t-body" aria-label="Back">
          ←
        </button>
        <PopAvatar initials={otherInitials(thread, isPro)} size={30} online={thread.online} />
        {/* A consultant tapping the name should not be sent to a consultant
            profile — that is the seeker's route, and on this side it is the
            seeker's name in the header. */}
        {isPro ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-meta t-heading">{otherEnd(thread, isPro)}</span>
            <span className="block caps-sm t-faint">{thread.online ? 'Online' : 'Offline'}</span>
          </span>
        ) : (
          <Link to={`/consult/${thread.consultantId}`} className="min-w-0 flex-1">
            <span className="block truncate text-meta t-heading">{thread.name}</span>
            <span className="block caps-sm t-faint">{thread.online ? 'Online' : 'Offline'}</span>
          </Link>
        )}
        <CallButton name={otherEnd(thread, isPro)} />
      </div>

      <div className="no-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m) => (
          <Bubble
            key={m.id}
            mine={m.from === (isPro ? 'them' : 'me')}
            text={m.text}
            time={m.time}
          />
        ))}
        <div ref={endRef} />
      </div>

      <Composer
        value={draft}
        onChange={setDraft}
        onSend={send}
        placeholder={isPro ? 'Reply to your client' : 'Write a message'}
      />
    </>
  )
}

/* ── Ask AI ──────────────────────────────────────────────────────────────── */

function AskAi({ questionsLeft, spendQuestion }) {
  const [messages, setMessages] = useState([
    {
      id: 'a0',
      from: 'them',
      text: 'Your Moon is in Pisces and Mercury is easing off. A soft, thinking sort of day. Ask.',
      time: '09:02',
    },
  ])
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const endRef = useRef(null)
  const replyRef = useRef(0)

  const locked = questionsLeft === 0

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, thinking])

  const send = (text) => {
    const q = (text ?? draft).trim()
    if (!q || locked || thinking) return
    setMessages((m) => [...m, { id: `u${m.length}`, from: 'me', text: q, time: 'now' }])
    setDraft('')
    spendQuestion()
    setThinking(true)
    setTimeout(() => {
      const reply = AI_REPLIES[replyRef.current % AI_REPLIES.length]
      replyRef.current += 1
      setMessages((m) => [...m, { id: `a${m.length}`, from: 'them', text: reply, time: 'now' }])
      setThinking(false)
    }, 900)
  }

  return (
    <>
      <div className="flex flex-none items-center justify-between gap-3 border-b border-rule px-4 py-3">
        <p className="caps-sm t-body">Namo AI · reads your chart</p>
        <span className={`caps-sm tnum ${locked ? 'text-live' : 'gold'}`}>
          {locked ? 'None left' : `${questionsLeft} free`}
        </span>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m) => (
          <Bubble key={m.id} mine={m.from === 'me'} text={m.text} time={m.time} />
        ))}

        {thinking && (
          <p className="animate-breathe caps-sm t-faint">Reading your chart</p>
        )}

        {locked && (
          <div className="pop-card p-4 text-center">
            <p className="caps t-heading">Out of questions</p>
            <p className="mt-2 text-meta t-body">
              You have used your five. The chart has not changed in the last ten minutes.
            </p>
            <PopButton size="sm" to="/profile/wallet" variant="gold" className="mt-4">
              Buy a pack
            </PopButton>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {!locked && (
        <div className="no-scrollbar flex flex-none gap-2 overflow-x-auto border-t border-rule px-4 py-3">
          {askSuggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => send(s.text)}
              className="pill caps-sm flex-none !px-3.5 !py-2"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <Composer
        value={draft}
        onChange={setDraft}
        onSend={() => send()}
        disabled={locked}
        placeholder={locked ? 'Buy a pack to keep asking' : 'Ask about your chart'}
      />
    </>
  )
}

/* ── Alerts ──────────────────────────────────────────────────────────────── */

/** The old notifications route, folded in as the third tab. */
function Alerts() {
  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
      <ul>
        {notifications.map((n) => (
          <li key={n.id} className="border-b border-rule px-4 py-4">
            <p className="caps-sm t-faint tnum">{n.time}</p>
            <p className="mt-1.5 text-meta t-sub">{n.text}</p>
          </li>
        ))}
      </ul>
      <p className="px-4 py-6 text-meta t-faint">
        Readings arrive at 08:00. Everything else is the sky doing something worth interrupting
        you for.
      </p>
    </div>
  )
}

/* ── Shared pieces ───────────────────────────────────────────────────────── */

/**
 * Call, wherever message appears.
 *
 * Classes are written out rather than built from props — Tailwind scans source
 * text, so a name assembled at runtime (`!h-${size}`) is a class it never
 * generates and a button that silently loses its size.
 */
export function CallButton({ name, className = '' }) {
  const { showToast } = useStore()
  return (
    <button
      type="button"
      aria-label={`Call ${name}`}
      onClick={() => showToast(`Calling ${name} — prototype only`)}
      className={`pill knob !h-9 !w-9 flex-none justify-center ${className}`}
    >
      <Icon name="phone" size={16} />
    </button>
  )
}

function Bubble({ mine, text, time }) {
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[85%]">
        <div
          className={`border px-3 py-2.5 text-meta ${
            mine ? 'rounded-2xl rounded-br-md bg-ink on-ink shadow-sm' : 'rounded-2xl rounded-bl-md bg-surface t-sub shadow-sm'
          }`}
        >
          {text}
        </div>
        <p className={`mt-1 caps-sm t-faint tnum ${mine ? 'text-right' : ''}`}>{time}</p>
      </div>
    </div>
  )
}

function Composer({ value, onChange, onSend, placeholder, disabled = false }) {
  return (
    <div className="flex flex-none items-center gap-3 border-t border-stroke px-4 py-3">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSend()}
        placeholder={placeholder}
        disabled={disabled}
        aria-label="Message"
        className="min-w-0 flex-1 border-b border-rule bg-transparent pb-2 text-body t-heading outline-none transition-colors placeholder:text-t4 focus:border-gold disabled:opacity-40"
      />
      <PopButton
        onClick={onSend}
        variant="gold"
        full={false}
        disabled={disabled || !value.trim()}
        className="px-4 py-2"
      >
        Send
      </PopButton>
    </div>
  )
}
