import { BackButton } from './Chrome.jsx'
import { Loader } from './Cosmos.jsx'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import MySessions from './MySessions.jsx'
import {
  ago as alertAgo,
  markRead as markAlertsRead,
  subscribeToAlerts,
} from '../lib/notifications.js'


/**
 * Right-side chat panel.
 *
 * Replaces the old alerts surface. It is an overlay rather than a route, so it
 * opens from any tab and from the floating button without losing the screen
 * underneath — which is the whole point of a side panel over a page.
 *
 * Two tabs: Consultant and Alerts. Ask AI was a third until 30 Sep 2026 and
 * is its own page now (`/ask`, Namo AI) — a chart oracle in the same inbox
 * as the people you pay read as one more person to message.
 */
export default function ChatPanel() {
  const unreadAlerts = useUnreadAlerts()
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
      {/* Solid white since 3 Oct 2026: `glass-panel` over the dark scrim read
          as grey, the same failure the Tarot dialog had. */}
      <aside className="relative flex h-full w-[88%] max-w-[380px] animate-slide-in flex-col border-l border-stroke bg-white shadow-xl">
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
          {/* Padded and centred (4 Oct 2026): the labels sat flush on the
              panel's left edge. Same row on both sides of the app. */}
          <div className="flex gap-2 px-4" role="tablist">
            {(isPro
              ? [
                  { key: 'live', label: 'Clients' },
                  { key: 'alerts', label: 'Alerts' },
                ]
              : [
                  { key: 'live', label: 'Consultant' },
                  // Booked sessions, moved here from Consult (5 Oct 2026).
                  { key: 'sessions', label: 'Sessions' },
                  { key: 'alerts', label: 'Alerts' },
                ]
            ).map((t) => (
              <button
                key={t.key}
                role="tab"
                type="button"
                aria-selected={chatTab === t.key}
                onClick={() => setChatTab(t.key)}
                className={`caps-sm flex-1 border-b-2 py-3 text-center transition-colors ${
                  chatTab === t.key ? 'border-gold gold' : 'border-transparent t-faint'
                }`}
              >
                {t.label}
                {t.key === 'alerts' && unreadAlerts > 0 && chatTab !== 'alerts' && (
                  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-live px-1 text-[10px] font-bold text-white tnum">
                    {unreadAlerts > 9 ? '9+' : unreadAlerts}
                  </span>
                )}
              </button>
            ))}
          </div>
        </header>

        {chatTab === 'live' && <LiveConsultant isPro={isPro} />}
        {chatTab === 'sessions' && !isPro && (
          <div className="flex-1 overflow-y-auto">
            <MySessions />
          </div>
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
  const { session, chatFocus, setChatFocus } = useStore()
  const myId = session?.user?.id
  const [threads, setThreads] = useState(null)
  const [activeId, setActiveId] = useState(null)

  /* Opened on one conversation — a chat just accepted, from either side
     (5 Oct 2026). A brand-new thread may not be in the list yet, so this
     waits for a load that contains it, then clears the request. */
  useEffect(() => {
    if (!chatFocus) return
    if ((threads ?? []).some((x) => x.id === chatFocus)) {
      setActiveId(chatFocus)
      setChatFocus(null)
    } else {
      listThreads().then(setThreads)
    }
  }, [chatFocus, threads, setChatFocus])

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
        <FindConsultant />
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

  /* The people you have actually spoken to — by chat, video or audio — and
     nobody else (5 Oct 2026). Each row says what you last did together;
     a row with nothing done yet never appears, because a thread only
     exists once a consultant has accepted. */
  if (threads.length === 0) {
    return (
      <div className="px-5 py-10 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface t-faint">
          <Icon name="chat" size={24} />
        </span>
        <p className="mt-4 text-body t-heading">
          {isPro ? 'No conversations yet' : 'You have not spoken to anyone yet'}
        </p>
        <p className="mt-1 text-meta t-faint">
          {isPro
            ? 'They appear here when you accept a chat or a call.'
            : 'Chat, video or audio with an astrologer — everyone you talk to stays here.'}
        </p>
        {!isPro && <FindConsultant />}
      </div>
    )
  }

  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
      <p className="px-4 pb-1 pt-3 caps-sm t-faint">Recently connected</p>
      <ul>
        {threads.map((t) => {
          const other = isPro ? t.seeker_name : t.consultant_name
          const last = t.last_session
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
                  {last && (
                    <span className="mt-1 flex items-center gap-1.5 text-[12px] t-faint">
                      <Icon name={last.kind === 'chat' ? 'chat' : last.kind === 'audio' ? 'phone' : 'video'} size={13} />
                      {lastLine(last)}
                    </span>
                  )}
                  <span className="mt-1 block truncate text-meta t-body">
                    {t.last_preview ?? (last && last.kind !== 'chat' ? 'No messages — calls only.' : 'No messages yet.')}
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
      {!isPro && (
        <div className="px-4 py-6">
          <FindConsultant />
        </div>
      )}
    </div>
  )
}

/** "Video call · 3 min · 5 Oct" — what you last did together. */
function lastLine(last) {
  const what = last.kind === 'chat' ? 'Chat' : last.kind === 'audio' ? 'Audio call' : 'Video call'
  const parts = [what]
  if (last.status === 'live') parts.push('now')
  else if (last.seconds != null) parts.push(`${Math.max(1, Math.round(last.seconds / 60))} min`)
  else parts.push('did not connect')
  if (last.at) {
    parts.push(new Date(last.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }))
  }
  return parts.join(' · ')
}

/** Goes to Consult AND closes the panel — it used to be a link under an
 *  overlay that stayed open, so pressing it appeared to do nothing. */
function FindConsultant() {
  const { setChatOpen } = useStore()
  const navigate = useNavigate()
  return (
    <PopButton
      variant="gold"
      className="mt-5"
      onClick={() => {
        setChatOpen(false)
        navigate('/consult')
      }}
    >
      Find a consultant
    </PopButton>
  )
}

/** Unread alerts, for the Alerts tab's badge. Polls with the alerts list. */
function useUnreadAlerts() {
  const { session } = useStore()
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!session) return undefined
    return subscribeToAlerts((payload) =>
      setN(payload?.unread ?? (payload?.items ?? []).filter((x) => !x.read).length),
    )
  }, [session])
  return n
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
  const [messages, setMessages] = useState(() => loadOutbox(thread.id, myId))
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
        /* The transcript, then whatever the poll added meanwhile, then my
           own unsent messages. A pending one that in fact saved is settled
           when its retry replays the same key. */
        const seen = new Set(rows.map((r) => r.id))
        const polled = prev.filter((m) => !m.state && !seen.has(m.id))
        return [...rows, ...polled, ...prev.filter((m) => m.state)]
      }),
    )
    markRead(thread.id, myId)
    return subscribeToThread(thread.id, (m) => setMessages((prev) => settle(prev, m, myId)))
  }, [thread.id, myId])

  /* What has not reached the server lives in this phone's storage until it
     does, so a reload, a dead tab or a lost signal never loses a message
     (6 Oct 2026). */
  useEffect(() => {
    saveOutbox(thread.id, messages)
  }, [thread.id, messages])

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

  /* A message is on screen the instant it is sent, marked as sending, and
     carries its own idempotency key from then on: every retry, even after a
     reload, replays the same write, so it lands once and only once. The
     server's row replaces it when it arrives — from the send's answer or
     from the poll, whichever is first. Nothing is ever handed back to the
     box to be typed again (6 Oct 2026). */
  const deliver = useCallback(
    async (key, text) => {
      setMessages((prev) => prev.map((m) => (m.key === key && m.state ? { ...m, state: 'sending' } : m)))
      const res = await sendMessage(thread.id, text, key)
      if (res.ok && res.message) {
        setMessages((prev) => settle(prev, res.message, myId, key))
        return
      }
      setMessages((prev) => prev.map((m) => (m.key === key && m.state ? { ...m, state: 'failed' } : m)))
      if (res.reason) showToast(res.reason)
    },
    [thread.id, myId, showToast],
  )

  const send = (text) => {
    const key = crypto.randomUUID()
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${key}`,
        key,
        body: text,
        sender_id: myId,
        created_at: new Date().toISOString(),
        state: 'sending',
      },
    ])
    deliver(key, text)
  }

  /* Messages a reload left unsent go out again on their own once the
     session is live; a refusal leaves them marked, to tap and retry. */
  const resumed = useRef(false)
  useEffect(() => {
    if (!live || resumed.current) return
    resumed.current = true
    for (const m of messages) if (m.key && m.state === 'failed') deliver(m.key, m.body)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, deliver])

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
        <BackButton onClick={onBack} />
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

      <div className="cosmic-dawn no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.map((m, i) => {
          const next = messages[i + 1]
          const time = stamp(m.created_at)
          /* One time under a run of messages from the same person in the
             same minute, as a messenger does, not one under every line. */
          const last = !next || next.sender_id !== m.sender_id || stamp(next.created_at) !== time
          return (
            <Bubble
              key={m.key ?? m.id}
              mine={m.sender_id === myId}
              text={m.body}
              time={last || m.state ? time : null}
              state={m.state}
              onRetry={m.state === 'failed' && live ? () => deliver(m.key, m.body) : undefined}
            />
          )
        })}
        <div ref={endRef} />
      </div>

      {live ? (
        <Composer onSend={send} placeholder="Type a message" />
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

/* ── the outbox ──────────────────────────────────────────────────────────── */

/** Put a server row into the list: it replaces my own pending bubble for it
 *  (matched by key when the send answered, by body when the poll got there
 *  first), and is never added twice. */
function settle(list, row, myId, key) {
  if (list.some((m) => m.id === row.id)) {
    return key ? list.filter((m) => m.key !== key || m.id === row.id) : list
  }
  let at = key ? list.findIndex((m) => m.key === key && m.state) : -1
  if (at < 0 && row.sender_id === myId) {
    at = list.findIndex((m) => m.state === 'sending' && m.body === row.body)
  }
  const done = { ...row, key: at >= 0 ? list[at].key : undefined }
  if (at < 0) return [...list, done]
  const next = list.slice()
  next[at] = done
  return next
}

const OUTBOX = 'namo.outbox.'

function loadOutbox(threadId, myId) {
  try {
    const rows = JSON.parse(localStorage.getItem(OUTBOX + threadId) || '[]')
    return rows
      .filter((m) => m.sender_id === myId && m.key && m.body)
      .map((m) => ({ ...m, state: 'failed' }))
  } catch {
    return []
  }
}

function saveOutbox(threadId, messages) {
  try {
    const unsent = messages.filter((m) => m.key && m.state)
    if (unsent.length) localStorage.setItem(OUTBOX + threadId, JSON.stringify(unsent))
    else localStorage.removeItem(OUTBOX + threadId)
  } catch {
    /* private window or full storage: the bubble on screen still holds it */
  }
}

function stamp(iso) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
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


/* ── Alerts ──────────────────────────────────────────────────────────────── */

/**
 * The alerts tab. Real rows since 25 Sep 2026.
 *
 * It read seven hard-coded strings out of `mock.js` until then — the same
 * seven for every account, forever, including the one about readings
 * arriving at 08:00 that nothing ever sent.
 *
 * Polling, not push: `lib/chat.js` explains why at the top of the file,
 * and alerts poll slower than messages because an alert is something you
 * find when you look rather than something you are interrupted by.
 *
 * Opening the tab marks everything read. That is the honest reading of
 * the gesture — a badge that survives you looking at the list is a badge
 * you learn to ignore.
 */
function Alerts() {
  const [items, setItems] = useState(null)

  useEffect(() => subscribeToAlerts((payload) => setItems(payload.items)), [])

  useEffect(() => {
    if (items && items.some((n) => !n.read)) markAlertsRead()
  }, [items])

  if (items === null) {
    return <Loader />
  }

  if (!items.length) {
    return (
      <p className="px-4 py-6 text-meta t-faint">
        Nothing yet. Cashback, referrals and anything the sky does worth
        interrupting you for will land here.
      </p>
    )
  }

  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
      <ul>
        {items.map((n) => (
          <li
            key={n.id}
            className={`border-b border-rule px-4 py-4 ${n.read ? '' : 'bg-surface-2'}`}
          >
            <p className="caps-sm t-faint tnum">{alertAgo(n.created_at)}</p>
            <p className="mt-1.5 text-meta t-heading">{n.title}</p>
            {n.body && <p className="mt-1 text-meta t-sub">{n.body}</p>}
          </li>
        ))}
      </ul>
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

function Bubble({ mine, text, time, state, onRetry }) {
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${time ? 'mb-3' : 'mb-1'}`}>
      <div className="max-w-[85%]">
        <div
          className={`whitespace-pre-wrap break-words px-3 py-2.5 text-meta transition-opacity ${
            mine ? 'bubble-mine rounded-2xl rounded-br-md' : 'bubble-theirs rounded-2xl rounded-bl-md'
          } ${state === 'sending' ? 'opacity-70' : ''}`}
        >
          {text}
        </div>
        {state === 'failed' ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={!onRetry}
            className="mt-1 block w-full text-right caps-sm text-bad"
          >
            {onRetry ? 'Not sent · Tap to retry' : 'Not sent'}
          </button>
        ) : (
          time && (
            <p className={`mt-1 caps-sm t-faint tnum ${mine ? 'text-right' : ''}`}>
              {state === 'sending' ? 'Sending' : time}
            </p>
          )
        )}
      </div>
    </div>
  )
}

/**
 * The box. It owns its own text and empties itself the moment Send is
 * pressed — the message belongs to the thread from then on and is never
 * given back.
 *
 * Android keyboards hold the word being typed in a composition; emptying
 * the box under it lets the keyboard write the word back on the next key
 * (6 Oct 2026: "press backspace, then type again"). So a send made during a
 * composition ends it first — blur, then focus — and the Send button never
 * takes focus from the box, so the keyboard stays up between messages.
 */
function Composer({ onSend, placeholder, disabled = false }) {
  const [value, setValue] = useState('')
  const box = useRef(null)
  const composing = useRef(false)

  const submit = () => {
    const el = box.current
    const text = (el?.value ?? value).trim()
    if (!text || disabled) return
    if (el && composing.current) {
      el.blur()
      composing.current = false
    }
    setValue('')
    if (el) el.value = ''
    onSend(text)
    el?.focus()
  }

  return (
    <form
      className="flex flex-none items-center gap-3 border-t border-stroke px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <input
        ref={box}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onCompositionStart={() => (composing.current = true)}
        onCompositionEnd={() => (composing.current = false)}
        enterKeyHint="send"
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        aria-label="Message"
        className="min-w-0 flex-1 border-b border-rule bg-transparent pb-2 text-body t-heading outline-none transition-colors placeholder:text-t4 focus:border-gold disabled:opacity-40"
      />
      <span onPointerDown={(e) => e.preventDefault()} className="flex-none">
        <PopButton
          type="submit"
          variant="gold"
          full={false}
          disabled={disabled || !value.trim()}
          className="px-4 py-2"
        >
          Send
        </PopButton>
      </span>
    </form>
  )
}
