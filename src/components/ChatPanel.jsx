import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { askSuggestions, notifications } from '../data/mock.js'
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
  subscribeToMySessions,
  subscribeToThread,
} from '../lib/chat.js'
import useAskAi from './useAskAi.js'
import SubjectForm from './SubjectForm.jsx'


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
  const { isPro, chatOpen, setChatOpen, chatTab, setChatTab } =
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
          <AskAi />
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
    if (!myId) return setThreads([])
    load()
    /* The thread does not exist until the consultant accepts, so without this
       the seeker who just asked sits on an empty list watching nothing happen
       while the meter runs. Any change to a session of mine reloads the list. */
    return subscribeToMySessions(myId, load)
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
    setLive(thread.live_session_id ?? null)
  }, [thread.live_session_id])

  useEffect(() => {
    /* MERGE rather than replace. The subscription is registered in this same
       effect, so a message arriving between subscribe and this fetch resolving
       would be appended by the handler and then wiped by the fetch result. */
    listMessages(thread.id).then((rows) =>
      setMessages((prev) => {
        const seen = new Set(rows.map((r) => r.id))
        return [...rows, ...prev.filter((p) => !seen.has(p.id))]
      }),
    )
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
    /* The hold is taken at accept, so the wallet has already moved by the time
       this room opens. Without this the seeker reads their pre-hold balance
       for the whole session and gets refused against a number still on screen
       — and with no cap (017) that number is their entire wallet. */
    refreshWallet(session?.user?.id)
    let n = 0
    let alive = true
    const tick = async () => {
      if (!alive) return
      if (n % 10 === 0) {
        const h = await heartbeat(live)
        if (!alive) return
        /* Could not ask. Keep the room exactly as it is and try again next
           beat — the server is still billing, so tearing the meter down here
           would hide a charge that is still running. */
        if (h?.unreachable) {
          n += 1
          return
        }
        if (!h.live) {
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

/**
 * Namo AI, against the real model.
 *
 * Everything that costs anything is the server's answer, not this
 * component's: how many questions are still free, what a minute costs,
 * whether a clock is running and how much of it is left. The panel renders
 * what it is told. The previous build kept `questionsLeft` in React state,
 * which meant a page reload handed out five more — that number is gone from
 * the client entirely, and `free_left` from the server replaces it.
 *
 * THE LADDER
 *   five free on arrival, once per account
 *   then one free message a day, from the NEXT day
 *   then a metered session at the server's rate, ended by the seeker or by
 *   the wallet running out
 *
 * THE CLOCK IS VISIBLE ON PURPOSE. Per-minute billing is the loudest
 * complaint against every app in this category — "the timer never stops"
 * while you think and type. It still runs while you think here; what it
 * does not do is run where you cannot see it.
 */
function AskAi() {
  const {
    messages, draft, setDraft, send, thinking, loading,
    freeLeft, pricePaise, outOfFree,
    who, subject, asking, setAsking, askAbout,
  } = useAskAi()
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, thinking])

  return (
    <>
      <div className="flex flex-none items-center justify-between gap-3 border-b border-rule px-4 py-3">
        <p className="caps-sm t-body">Namo AI · reads your chart</p>
        {/* What the NEXT question costs, said before anybody is charged.
            A debit nobody was warned about is a support ticket. */}
        <span className="caps-sm tnum gold">
          {loading
            ? '—'
            : outOfFree
              ? pricePaise ? `₹${rupees(pricePaise)} each` : ''
              : `${freeLeft} free`}
        </span>
      </div>

      {/* Said once, pinned, and never repeated per message — a warning on
          every bubble is a warning nobody reads. It names the real limit
          rather than only the legal one: a chart is not a life, and the
          model does not know one. The link is the honest next step and
          the business's, which is why it sits inside the sentence rather
          than under a separate heading. */}
      <p className="flex-none border-b border-rule px-4 py-2.5 text-micro t-faint">
        An AI expert reads your chart here. It might be wrong, and it does not know your
        life. For anything that matters,{' '}
        <Link to="/consult" className="underline hover:text-t1">
          ask our pros
        </Link>
        .
      </p>

      <div className="no-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {loading ? (
          <p className="animate-breathe caps-sm t-faint">Opening</p>
        ) : messages.length === 0 ? (
          <Bubble
            mine={false}
            text="Ask about your chart. A real question gets a better answer than a general one."
          />
        ) : (
          messages.map((m) => <Bubble key={m.id} mine={m.role === 'user'} text={m.text} />)
        )}

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

        {thinking && <p className="animate-breathe caps-sm t-faint">Reading your chart</p>}

        {outOfFree && (
          /* Not a wall. The free ones are gone and the next answer costs
             ₹9 — asking still works, so this is a price, not a lock. The
             card the meter needed had a BUTTON because a session had to
             be started; nothing has to be started now. */
          <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-micro t-sub">
            Your free questions are used. The next answer costs{' '}
            <b>{pricePaise ? `₹${rupees(pricePaise)}` : '—'}</b> from your wallet, and
            one more free one arrives tomorrow.{' '}
            <Link to="/consult" className="underline">
              A consultant
            </Link>{' '}
            reads the same chart and argues back.
          </p>
        )}
        <div ref={endRef} />
      </div>

      {/* Always shown. It used to vanish behind the meter's wall, which
          hid the one thing that helps somebody who cannot phrase a
          question — and hid it exactly when they were being asked to pay. */}
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

      <Composer
        value={draft}
        onChange={setDraft}
        onSend={() => send()}
        disabled={thinking || (who === null && messages.length === 0)}
        placeholder="Ask about your chart"
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
