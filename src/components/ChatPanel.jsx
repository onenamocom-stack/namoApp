import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { askSuggestions, consultantReplies, notifications } from '../data/mock.js'
import Icon from './Icon.jsx'
import { PopAvatar, PopButton } from './Pop.jsx'
import { rupees, useStore } from '../store.jsx'
import {
  clock,
  endChat,
  heartbeat,
  listMessages,
  listThreads,
  markRead,
  sendMessage,
  subscribeToThread,
} from '../lib/chat.js'

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

/* ── Live consultant ───────────────────────────────────────────────────────
   Real threads, real messages, and a real meter. Phase 6.

   The shape worth holding: a THREAD is the transcript and lives forever; a
   SESSION is the paid window and is the only time anybody can write into it.
   Outside a live session the composer is gone and the server would refuse the
   insert anyway — the policy is the enforcement, this is only the courtesy of
   not offering a button that cannot work.

   The two flip helpers this file used to carry are GONE. `sender_id` is a
   column and the thread knows which side is the consultant, so "mine" is
   `m.sender_id === myId` and cannot be backwards. That was the bug the mock
   made unavoidable. */

function LiveConsultant({ isPro }) {
  const { session } = useStore()
  const myId = session?.user?.id
  const [threads, setThreads] = useState(null)
  const [activeId, setActiveId] = useState(null)

  const load = useCallback(() => {
    listThreads().then(setThreads)
  }, [])

  useEffect(() => {
    if (myId) load()
    else setThreads([])
  }, [myId, load])

  if (!myId) {
    return (
      <div className="px-4 py-6">
        <p className="text-meta t-body">Sign in to see your conversations.</p>
        <PopButton to="/consult" variant="ghost" className="mt-4">
          Find a consultant
        </PopButton>
      </div>
    )
  }

  if (activeId) {
    const t = (threads ?? []).find((x) => x.id === activeId)
    if (t) {
      return (
        <Thread
          thread={t}
          myId={myId}
          onBack={() => {
            setActiveId(null)
            load()
          }}
        />
      )
    }
  }

  return <ThreadList threads={threads} isPro={isPro} onOpen={setActiveId} />
}

function ThreadList({ threads, isPro, onOpen }) {
  if (threads === null) {
    return <p className="px-4 py-6 text-meta t-faint">Loading your conversations.</p>
  }

  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
      <ul>
        {threads.map((t) => {
          const other = isPro ? t.seeker_name : t.consultant_name
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onOpen(t.id)}
                className="flex w-full items-start gap-3 border-b border-rule px-4 py-4 text-left transition-opacity hover:opacity-70"
              >
                <PopAvatar initials={initialsOf(other)} size={40} online={!!t.live_session_id} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-body t-heading">{other}</span>
                    {t.live_session_id && (
                      <span className="ml-auto flex-none caps-sm text-ok">Live</span>
                    )}
                  </span>
                  <span className="mt-1 block truncate text-meta t-body">
                    {t.last_preview ?? 'No messages yet.'}
                  </span>
                </span>
                {t.unread > 0 && (
                  <span className="caps-sm flex-none rounded-full bg-gold-fill px-2 py-0.5 text-ink tnum">
                    {t.unread}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="px-4 py-6">
        {threads.length === 0 && (
          <p className="text-meta t-body">
            {isPro
              ? 'No conversations yet. They start when you accept a chat request.'
              : 'No conversations yet. Chat is charged by the minute and starts when the consultant joins.'}
          </p>
        )}
        {!isPro && (
          <PopButton to="/consult" variant="ghost" className="mt-4">
            Find a consultant
          </PopButton>
        )}
      </div>
    </div>
  )
}

/**
 * One conversation, and the meter over it.
 *
 * The countdown is cosmetic. `expires_at` on the server is what actually ends
 * the session, and `session_sweep` settles it whether or not this tab is still
 * open — so a paused tab, a dead battery or a lying clock changes the display
 * and nothing else. The heartbeat says "still here" and asks how long is left;
 * it cannot extend anything.
 */
function Thread({ thread, myId, onBack }) {
  const { refreshWallet, session, showToast } = useStore()
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [live, setLive] = useState(thread.live_session_id ?? null)
  const [left, setLeft] = useState(null)
  const [rate, setRate] = useState(null)
  const endRef = useRef(null)

  useEffect(() => {
    listMessages(thread.id).then(setMessages)
    markRead(thread.id, myId)
    return subscribeToThread(thread.id, (m) =>
      setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m])),
    )
  }, [thread.id, myId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  /* One beat a second: it ticks the display down locally and asks the server
     for the truth every tenth beat. The server's number always wins — a client
     that drifts must not be able to drift in its own favour. */
  useEffect(() => {
    if (!live) return
    let n = 0
    let alive = true
    const tick = async () => {
      if (!alive) return
      if (n % 10 === 0) {
        const h = await heartbeat(live)
        if (!alive) return
        if (!h?.live) {
          setLive(null)
          setLeft(0)
          refreshWallet(session?.user?.id)
          return
        }
        setLeft(h.seconds_left)
        setRate(h.rate_paise)
      } else {
        setLeft((s) => (s === null ? null : Math.max(0, s - 1)))
      }
      n += 1
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [live, refreshWallet, session])

  const send = async () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    const res = await sendMessage(thread.id, text)
    if (!res.ok) {
      if (res.reason) showToast(res.reason)
      setDraft(text)                       // give it back rather than eat it
      return
    }
    /* Show my own message straight away rather than waiting for Realtime to
       echo it back. The echo usually arrives — but the sender watching their
       own words fail to appear is the worst possible way to discover that a
       table was never added to the publication, which is exactly how this was
       found. The de-dupe in the subscription handles the echo when it lands. */
    if (res.message) {
      setMessages((prev) => (prev.some((p) => p.id === res.message.id) ? prev : [...prev, res.message]))
    } else {
      listMessages(thread.id).then(setMessages)
    }
  }

  const hangUp = async () => {
    const res = await endChat(live)
    setLive(null)
    setLeft(0)
    await refreshWallet(session?.user?.id)
    if (res?.ok && !res.already_ended) {
      showToast(`Session ended · ${res.minutes} min · ₹${rupees(res.charged_paise)}`)
    }
  }

  const other = thread.seeker_id === myId ? thread.consultant_name : thread.seeker_name

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none items-center gap-3 border-b border-rule px-4 py-3">
        <button type="button" onClick={onBack} className="caps-sm t-body" aria-label="Back">
          Back
        </button>
        <PopAvatar initials={initialsOf(other)} size={30} online={!!live} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-meta t-heading">{other}</span>
          <span className="block caps-sm t-faint">{live ? 'In session' : 'Not in session'}</span>
        </span>
      </div>

      {/* The meter. A charge nobody can see accruing is a charge that gets
          disputed, so the time left and the rate are on screen the whole time
          rather than in a receipt afterwards. */}
      {live && (
        <div className="flex flex-none items-center justify-between border-b border-rule bg-gold-fill/10 px-4 py-2">
          <span className="caps-sm t-faint tnum">
            {left === null ? 'Starting' : `${clock(left)} left`}
            {rate ? ` · ₹${rupees(rate)}/min` : ''}
          </span>
          <button type="button" onClick={hangUp} className="caps-sm text-bad">
            End session
          </button>
        </div>
      )}

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.map((m) => (
          <Bubble
            key={m.id}
            mine={m.sender_id === myId}
            text={m.body}
            time={new Date(m.created_at).toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          />
        ))}
        <div ref={endRef} />
      </div>

      {live ? (
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={send}
          placeholder="Type a message"
        />
      ) : (
        <div className="flex-none border-t border-rule px-4 py-4">
          <p className="text-meta t-faint">
            This session has ended. The conversation stays here; starting another
            begins the meter again.
          </p>
        </div>
      )}
    </div>
  )
}

/** Initials from a name. Derived, never stored — a column holding this is a
 *  second thing to keep in step with the name it came from. */
function initialsOf(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
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
