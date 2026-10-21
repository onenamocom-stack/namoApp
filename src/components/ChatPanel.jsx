import { BackButton } from './Chrome.jsx'
import { Loader } from './Cosmos.jsx'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { markConsultReturn } from '../lib/consultReturn.js'
import AddMoneySheet from './AddMoneySheet.jsx'
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
  suggestReplies,
  subscribeToThread,
} from '../lib/chat.js'
import MySessions, { UpcomingSessions } from './MySessions.jsx'
import { MessagesList } from '../screens/Messages.jsx'
import SessionRecharge from './SessionRecharge.jsx'
import { uploadAsset } from '../lib/media.js'
import ClientKundli from './ClientKundli.jsx'
import { askReview } from '../lib/reviewAsk.js'
import ReportSheet from './ReportSheet.jsx'
import useDictation, { canDictate } from './useDictation.js'
import {
  ago as alertAgo,
  markRead as markAlertsRead,
  subscribeToAlerts,
  alertHref,
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
  /* NAMO Desk opens its chats alone, full screen with a ✕, in smaller text
     and above the keyboard (17 Oct 2026, Rahul). */
  const desk = useLocation().pathname.startsWith('/desk')
  const deskHeight = useKeyboardSafeHeight(desk && chatOpen)
  /* In a live chat on the Desk there is no ✕ and no back: End session is
     the way out, and it closes the panel (17 Oct 2026, Rahul). */
  const [inLive, setInLive] = useState(false)
  const locked = desk && inLive

  if (!chatOpen) return null

  /* The seeker app's bell opens notifications alone, and the Consult page's
     bubble opens Consultant and Sessions (14 Oct 2026, Rahul). Messages
     between people are the Chat tab's. The pro app keeps all its tabs. */
  const alertsOnly = !isPro && chatTab === 'alerts'
  /* And the bubble opens one list, no tabs (14 Oct 2026, Rahul): sessions
     still ahead on top ("remember to attend"), then the people you have
     talked to. */
  const oneList = !isPro && !alertsOnly
  const title = desk ? 'Chats' : isPro ? 'Messages' : alertsOnly ? 'Notifications' : 'Consult'
  const sidePanel = isPro && !desk

  return (
    <div className="absolute inset-x-0 top-0 z-50 flex justify-end" style={{ height: deskHeight ?? '100%' }}>
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
      {/* The seeker app opens it as a full page with a ✕ (14 Oct 2026,
          Rahul: the side panel left a dark strip of the screen behind it).
          The pro app keeps the side panel. */}
      <aside
        className={`relative flex h-full animate-slide-in flex-col bg-white ${
          sidePanel ? 'w-[88%] max-w-[380px] border-l border-stroke shadow-xl' : 'w-full'
        }`}
      >
        <header className="flex-none border-b border-stroke">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="caps t-heading">{title}</p>
            {locked ? null : sidePanel ? (
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                className="caps-sm t-body"
                aria-label="Close"
              >
                Close
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-full text-lead t-heading transition-colors hover:bg-surface"
              >
                ✕
              </button>
            )}
          </div>

          {/* Ask AI is a seeker product. A consultant is the person being
              asked; putting a chart oracle in her inbox is the app talking to
              itself. Her tabs are clients and alerts, and "Consultant" becomes
              "Clients" because she is not messaging one. */}
          {/* Padded and centred (4 Oct 2026): the labels sat flush on the
              panel's left edge. Same row on both sides of the app. */}
          {!alertsOnly && !oneList && !desk && (
          <div className="flex gap-2 px-4" role="tablist">
            {(isPro
              ? [
                  { key: 'live', label: 'Clients' },
                  // Free messages between people (13 Oct 2026, Phase 15b).
                  { key: 'messages', label: 'Messages' },
                  { key: 'alerts', label: 'Alerts' },
                ]
              : [
                  { key: 'live', label: 'Consultant' },
                  // Booked sessions, moved here from Consult (5 Oct 2026).
                  { key: 'sessions', label: 'Sessions' },
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
          )}
        </header>

        {oneList && (
          <LiveConsultant
            isPro={false}
            top={
              <>
                <WalletCard onGo={() => setChatOpen(false)} />
                <UpcomingSessions />
              </>
            }
            // Past bookings, with Review where one is owed: they were the
            // Sessions tab's.
            bottom={<MySessions calls={false} pastOnly />}
          />
        )}
        {desk && <LiveConsultant isPro small onLive={setInLive} onEnded={() => setChatOpen(false)} />}
        {!desk && isPro && chatTab === 'live' && <LiveConsultant isPro={isPro} />}
        {!desk && chatTab === 'messages' && (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <MessagesList onOpen={() => setChatOpen(false)} />
          </div>
        )}
        {!desk && chatTab === 'alerts' && <Alerts />}
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

function LiveConsultant({ isPro, small = false, onLive, onEnded, top = null, bottom = null }) {
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
          small={small}
          onLive={onLive}
          onEnded={onEnded}
          onBack={() => {
            setActiveId(null)
            load()
          }}
        />
      )
    }
  }

  return <ThreadList threads={threads} isPro={isPro} small={small} onOpen={setActiveId} top={top} bottom={bottom} />
}

function ThreadList({ threads, isPro, small = false, onOpen, top = null, bottom = null }) {
  if (threads === null) {
    return <p className="px-4 py-6 text-meta t-faint">Loading your conversations.</p>
  }

  /* The people you have actually spoken to — by chat, video or audio — and
     nobody else (5 Oct 2026). Each row says what you last did together;
     a row with nothing done yet never appears, because a thread only
     exists once a consultant has accepted. */
  if (threads.length === 0) {
    return (
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
      {top}
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
      </div>
      {bottom}
      </div>
    )
  }

  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
      {top}
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
                className={`flex w-full items-start gap-3 border-b border-rule px-4 text-left transition-opacity hover:opacity-70 ${small ? 'py-3' : 'py-4'}`}
              >
                <PopAvatar initials={initialsOf(other)} size={small ? 34 : 40} online={!!t.live_session_id} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className={`truncate t-heading ${small ? 'text-meta font-semibold' : 'text-body'}`}>{other}</span>
                    {t.live_session_id && (
                      <span className="ml-auto flex-none caps-sm text-ok">Live</span>
                    )}
                  </span>
                  {last && (
                    <span className={`mt-1 flex items-center gap-1.5 gold ${small ? 'text-[11px]' : 'text-[12px]'}`}>
                      <Icon name={last.kind === 'chat' ? 'chat' : last.kind === 'audio' ? 'phone' : 'video'} size={13} />
                      {lastLine(last)}
                    </span>
                  )}
                  <span className={`mt-1 block truncate t-body ${small ? 'text-[12px]' : 'text-meta'}`}>
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
      {bottom}
      {/* No "Find a consultant" here since 14 Oct 2026 (Rahul): Consult is
          a tab in the bar. */}
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
function Thread({ thread, myId, small = false, onLive, onEnded, onBack }) {
  const { refreshWallet, session, showToast, lang } = useStore()
  const [messages, setMessages] = useState(() => loadOutbox(thread.id, myId))
  const [live, setLive] = useState(thread.live_session_id ?? null)
  const [left, setLeft] = useState(null)
  const [rate, setRate] = useState(null)
  // When the pause for a recharge ends, if the money runs out (7 Oct 2026).
  const [resumeBy, setResumeBy] = useState(null)
  const [topup, setTopup] = useState(false)
  // The client's kundli, the consultant's only (17 Oct 2026, Rahul).
  const [kundli, setKundli] = useState(false)
  // Report the other person from the chat (19 Oct 2026, Rahul, for Play).
  const [reporting, setReporting] = useState(false)
  const endRef = useRef(null)
  const [openedAt] = useState(() => new Date().toISOString())
  /* The consultant's सुझाव (20 Oct 2026, Rahul): null, {busy} or {replies}.
     Cleared when the seeker writes again, so a suggestion never answers an
     older message than the one on screen. */
  const [ai, setAi] = useState(null)

  useEffect(() => {
    setLive(thread.live_session_id ?? null)
  }, [thread.live_session_id])

  useEffect(() => {
    if (!onLive) return undefined
    onLive(!!live)
    return () => onLive(false)
  }, [live, onLive])

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
          // Ended by the Pro or the clock: the seeker is asked for a review.
          if (thread.seeker_id === myId) askReview(live)
          return
        }
        setLeft(h.seconds_left)
        setRate(h.rate_paise)
        setResumeBy(h.resume_by ?? null)
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
  }, [live, refreshWallet, session, thread.seeker_id, myId])

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

  const iAmPro = thread.seeker_id !== myId
  const seekerLines = messages.filter((m) => m.sender_id === thread.seeker_id)
  const lastSeekerId = seekerLines.length ? seekerLines[seekerLines.length - 1].id : null
  useEffect(() => setAi(null), [lastSeekerId])
  const askSuggest = async () => {
    setAi({ busy: true })
    const res = await suggestReplies(thread.id)
    if (res.ok && res.replies.length) {
      setAi({ replies: res.replies })
      return
    }
    setAi(null)
    showToast(res.reason || 'Suggestions did not come. Try again.')
  }
  const openers = iAmPro && !messages.some((m) => m.sender_id === myId && m.created_at >= openedAt)

  const send = (text) => {
    setAi(null)
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

  /* A photo, the consultant's only (17 Oct 2026, Rahul): on screen at once
     from the phone's own copy, then uploaded and sent. A photo that fails
     is taken off with a toast rather than kept to retry: the outbox keeps
     text, not files. */
  const sendPhoto = async (file) => {
    const key = crypto.randomUUID()
    const local = URL.createObjectURL(file)
    setMessages((prev) => [
      ...prev,
      { id: `local-${key}`, key, body: '', image_url: local, sender_id: myId, created_at: new Date().toISOString(), state: 'sending', photo: true },
    ])
    const drop = (reason) => {
      setMessages((prev) => prev.filter((m) => m.key !== key))
      URL.revokeObjectURL(local)
      showToast(reason || 'The photo did not send. Try again.')
    }
    let asset
    try {
      asset = await uploadAsset(file, 'image')
    } catch (err) {
      return drop(err?.message)
    }
    const res = await sendMessage(thread.id, '', key, asset.assetId)
    if (!res.ok || !res.message) return drop(res.reason)
    setMessages((prev) => settle(prev, res.message, myId, key))
  }

  /* Messages a reload left unsent go out again on their own once the
     session is live; a refusal leaves them marked, to tap and retry. */
  const resumed = useRef(false)
  useEffect(() => {
    if (!live || resumed.current) return
    resumed.current = true
    for (const m of messages) if (m.key && m.state === 'failed' && !m.photo) deliver(m.key, m.body)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, deliver])

  const hangUp = async () => {
    const ending = live
    const res = await endChat(live)
    setLive(null)
    setLeft(0)
    await refreshWallet(session?.user?.id)
    if (res?.ok && !res.already_ended) {
      showToast(`Session ended · ${res.minutes} min · ₹${rupees(res.charged_paise)}`)
    }
    onEnded?.()
    // The seeker is asked for a review (17 Oct 2026, Rahul).
    if (thread.seeker_id === myId) askReview(ending)
  }

  const other = thread.seeker_id === myId ? thread.consultant_name : thread.seeker_name
  const paused = !!live && left === 0 && resumeBy != null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none items-center gap-3 border-b border-rule px-4 py-3">
        {!(onLive && live) && <BackButton onClick={onBack} />}
        <PopAvatar initials={initialsOf(other)} size={30} online={!!live} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-meta t-heading">{other}</span>
          <span className="block caps-sm t-faint">{live ? 'In session' : 'Not in session'}</span>
        </span>
        {/* Up here and red (17 Oct 2026, Rahul): it sat small in the meter
            bar below. */}
        {live && thread.seeker_id !== myId && (
          <button
            type="button"
            onClick={() => setKundli(true)}
            className="flex-none rounded-full border border-gold-fill/50 bg-gold-wash px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] gold"
          >
            Kundli
          </button>
        )}
        {live && (
          <button
            type="button"
            onClick={hangUp}
            className="flex-none rounded-full bg-live px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-white shadow-sm"
          >
            End session
          </button>
        )}
        <button
          type="button"
          onClick={() => setReporting(true)}
          aria-label={`Report ${other || 'this person'}`}
          className="-mr-2 flex-none px-2 text-lead leading-none text-t2"
        >
          ⋮
        </button>
      </div>

      <ReportSheet
        open={reporting}
        onClose={() => setReporting(false)}
        profileId={thread.seeker_id === myId ? thread.consultant_id : thread.seeker_id}
        name={other}
      />

      {/* The meter. A charge nobody can see accruing is a charge that gets
          disputed, so the time left and the rate are on screen the whole time
          rather than in a receipt afterwards. */}
      {live && (
        <div className="flex flex-none items-center justify-between border-b border-rule bg-gold-fill/10 px-4 py-2">
          <span className="caps-sm t-faint tnum">
            {left === null ? 'Starting' : paused ? 'Paused' : `${clock(left)} left`}
            {rate ? ` · ₹${rupees(rate)}/min` : ''}
          </span>
          <span className="flex items-center gap-3">
            {/* The last minute only, the seeker only, and beside the one
                timer — never a second bar repeating it (9 Oct 2026). */}
            {thread.seeker_id === myId && !paused && left != null && left > 0 && left <= 60 && (
              <button
                type="button"
                onClick={() => setTopup(true)}
                className="rounded-full bg-ok px-3 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-white"
              >
                Recharge
              </button>
            )}
          </span>
        </div>
      )}

      {kundli && live && <ClientKundli sessionId={live} onClose={() => setKundli(false)} />}

      {live && (
        <SessionRecharge
          sessionId={live}
          seeker={thread.seeker_id === myId}
          secondsLeft={left}
          resumeBy={resumeBy}
          rate={rate}
          other={other}
          open={topup}
          onClose={() => setTopup(false)}
          onExtended={(r) => {
            setLeft(r.seconds_left)
            setResumeBy(r.resume_by ?? null)
          }}
          onEnd={hangUp}
        />
      )}

      <div className="cosmic-dawn no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.map((m, i) => {
          // The time is a DayMark between messages (21 Oct 2026); a bubble
          // shows only its own Sending or Not sent.
          return (
            <Fragment key={m.key ?? m.id}>
            {marksAt(messages, i) && <DayMark iso={m.created_at} lang={lang} />}
            <Bubble
              mine={m.sender_id === myId}
              text={m.image_url && m.body === 'Photo' ? '' : m.body}
              image={m.image_url}
              small={small}
              time={m.state ? stamp(m.created_at) : null}
              state={m.state}
              onRetry={m.state === 'failed' && live ? () => deliver(m.key, m.body) : undefined}
            />
            </Fragment>
          )
        })}
        <div ref={endRef} />
      </div>

      {live && paused ? (
        <div className="flex-none border-t border-rule px-4 py-4">
          <p className="text-meta t-faint">Paused until the balance is recharged.</p>
        </div>
      ) : live ? (
        <Composer
          onSend={send}
          placeholder="Type a message"
          onPhoto={iAmPro ? sendPhoto : null}
          voice={iAmPro && canDictate}
          /* Openers for the consultant, until they have written in this
             sitting (17 Oct 2026, Rahul); then what सुझाव brought. A tap
             puts one in the box, to edit or send. */
          suggestions={ai?.replies ?? (openers ? OPENERS : null)}
          onSuggest={iAmPro && lastSeekerId ? askSuggest : null}
          suggesting={Boolean(ai?.busy)}
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

export function stamp(iso) {
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
  const { setChatOpen } = useStore()
  const navigate = useNavigate()

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
            <p className="caps-sm gold tnum">{alertAgo(n.created_at)}</p>
            {alertHref(n) ? (
              <button
                type="button"
                onClick={() => {
                  setChatOpen(false)
                  navigate(alertHref(n))
                }}
                className="mt-1.5 block text-left text-meta t-heading"
              >
                {n.title}
              </button>
            ) : (
              <p className="mt-1.5 text-meta t-heading">{n.title}</p>
            )}
            {n.body && <p className="mt-1 text-meta t-sub">{n.body}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── Shared pieces ───────────────────────────────────────────────────────── */

/* The other person's words as plain text on the page, yours in a soft
   saffron bubble on the right (21 Oct 2026, Rahul's reference screenshot).
   The time is a mark between messages (DayMark), not under each one. */
export function Bubble({ mine, text, image, time, state, onRetry, small = false, heart = false }) {
  // Design only (21 Oct 2026, Rahul): fills on a tap, saved nowhere.
  const [liked, setLiked] = useState(false)
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${small ? 'mb-2' : 'mb-4'}`}>
      <div className={mine ? 'max-w-[85%]' : 'max-w-[92%]'}>
        <div
          className={`whitespace-pre-wrap break-words transition-opacity ${
            mine
              ? `rounded-2xl rounded-br-md bg-gold-wash t-heading ring-1 ring-gold-fill/20 ${small ? 'px-3 py-2 text-[12.5px] leading-snug' : 'px-4 py-2.5 text-body'}`
              : `t-heading ${small ? 'text-[13px] leading-snug' : 'text-[17px] leading-relaxed'}`
          } ${state === 'sending' ? 'opacity-60' : ''} ${image ? '!p-1.5' : ''}`}
        >
          {image && (
            <a href={state ? undefined : image} target="_blank" rel="noreferrer" className="block">
              <img src={image} alt="Photo" className="max-h-64 w-full rounded-xl object-cover" />
            </a>
          )}
          {text && <span className={image ? 'block px-1.5 pb-1 pt-1.5' : ''}>{text}</span>}
        </div>
        {heart && !mine && (
          <button
            type="button"
            onClick={() => setLiked((v) => !v)}
            aria-label={liked ? 'Unlike' : 'Like'}
            aria-pressed={liked}
            className={`mt-2 block ${liked ? 'text-live' : 't-faint'}`}
          >
            <Icon name="heart" size={24} filled={liked} />
          </button>
        )}
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
          state === 'sending' &&
          time && <p className={`mt-1 caps-sm t-faint ${mine ? 'text-right' : ''}`}>Sending</p>
        )}
      </div>
    </div>
  )
}

/** "Today, 2:15 pm" between messages, as a messenger does: before the first
 *  one and wherever half an hour has passed (21 Oct 2026). */
export function DayMark({ iso, lang }) {
  const at = new Date(iso)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86_400_000)
  const same = (a, b) => a.toDateString() === b.toDateString()
  const hi = lang === 'hi'
  const day = same(at, today)
    ? hi ? 'आज' : 'Today'
    : same(at, yesterday)
      ? hi ? 'कल' : 'Yesterday'
      : at.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  const time = at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
  return <p className="my-4 text-center text-[13px] t-faint tnum">{`${day}, ${time}`}</p>
}

/** Whether a DayMark goes before message `i`. */
export function marksAt(list, i, at = (m) => m.created_at) {
  if (!at(list[i])) return false
  if (i === 0) return true
  const before = at(list[i - 1])
  return !before || new Date(at(list[i])) - new Date(before) > 30 * 60_000
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
export { canDictate }

export function Composer({ onSend, placeholder, disabled = false, suggestions = null, onPhoto = null, onSuggest = null, suggesting = false, voice = false }) {
  const { lang, showToast } = useStore()
  const [value, setValue] = useState('')
  const box = useRef(null)
  const picker = useRef(null)
  const composing = useRef(false)
  /* The consultant speaks a reply (21 Oct 2026, Rahul): हि listens for
     Hindi, EN for English, starting from the app's language and kept on
     this device. What is heard fills the box; Send still sends it. */
  const [speech, setSpeech] = useState(() => {
    try {
      return localStorage.getItem('namo:dictate-lang') || (lang === 'hi' ? 'hi-IN' : 'en-IN')
    } catch {
      return lang === 'hi' ? 'hi-IN' : 'en-IN'
    }
  })
  const dictation = useDictation({ lang: speech, onText: setValue, onError: showToast })
  const flipSpeech = () => {
    const next = speech === 'hi-IN' ? 'en-IN' : 'hi-IN'
    setSpeech(next)
    try {
      localStorage.setItem('namo:dictate-lang', next)
    } catch {
      /* the app's language next time, no worse */
    }
  }

  const submit = () => {
    dictation.stop()
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
    <div className="flex-none border-t border-stroke bg-white">
    {(suggestions || onSuggest) && (
      <div className="no-scrollbar flex items-start gap-2 overflow-x-auto px-4 pt-3">
        {/* The consultant's सुझाव: three replies to the seeker's last
            message, from their chart (20 Oct 2026, Rahul). */}
        {onSuggest && (
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onClick={onSuggest}
            disabled={suggesting || disabled}
            aria-label="Suggest replies"
            className="flex-none rounded-full bg-gold-fill px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60"
          >
            {suggesting ? 'सुझाव…' : 'सुझाव'}
          </button>
        )}
        {(suggestions || []).map((text) => (
          <button
            key={text}
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => {
              setValue(text)
              box.current?.focus()
            }}
            className="max-w-[240px] flex-none whitespace-normal rounded-2xl bg-gold-wash px-3 py-1.5 text-left text-[12px] leading-snug gold ring-1 ring-gold-fill/30"
          >
            {text}
          </button>
        ))}
      </div>
    )}
    <form
      className="flex items-center gap-3 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      {onPhoto && (
        <>
          <button
            type="button"
            aria-label="Send a photo"
            disabled={disabled}
            onClick={() => picker.current?.click()}
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gold-wash gold disabled:opacity-40"
          >
            <Icon name="image" size={18} />
          </button>
          <input
            ref={picker}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) onPhoto(file)
            }}
          />
        </>
      )}
      {/* A round box and a round saffron Send (21 Oct 2026, Rahul's
          reference screenshot). */}
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
        className="min-w-0 flex-1 rounded-full border border-stroke bg-surface px-5 py-3 text-body t-heading outline-none transition-colors placeholder:text-t4 focus:border-gold disabled:opacity-40"
      />
      {voice && (
        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onClick={flipSpeech}
          disabled={dictation.listening}
          aria-label={speech === 'hi-IN' ? 'Speaking Hindi. Switch to English' : 'Speaking English. Switch to Hindi'}
          className="h-9 flex-none rounded-full px-1 text-[13px] font-semibold t-faint disabled:opacity-40"
        >
          {speech === 'hi-IN' ? 'हि' : 'EN'}
        </button>
      )}
      {/* One round button, as in Rahul's reference (21 Oct 2026): the mic
          while the box is empty or it is listening — what is heard lands in
          the box as text — and Send once there is something to send. */}
      {voice && (!value.trim() || dictation.listening) ? (
        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          aria-label={dictation.listening ? 'Stop listening' : 'Speak'}
          aria-pressed={dictation.listening}
          disabled={disabled}
          onClick={() => (dictation.listening ? dictation.stop() : dictation.start(box.current?.value ?? value))}
          className={`flex h-12 w-12 flex-none items-center justify-center rounded-full bg-gold-fill text-white shadow-md transition active:scale-95 disabled:opacity-50 ${
            dictation.listening ? 'animate-pulse' : ''
          }`}
        >
          <Icon name="mic" size={22} />
        </button>
      ) : (
        <button
          type="submit"
          onPointerDown={(e) => e.preventDefault()}
          disabled={disabled || !value.trim()}
          aria-label="Send"
          className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-gold-fill text-white shadow-md transition active:scale-95 disabled:opacity-50"
        >
          <Icon name="send" size={22} />
        </button>
      )}
    </form>
    </div>
  )
}

/** A consultant's openers (17 Oct 2026, Rahul). */
const OPENERS = [
  'Namaste. Welcome to your session.',
  'Please tell me your question.',
  'Share your date, time and place of birth.',
  'Give me a moment to look at your chart.',
]

/**
 * The height the screen has above the on-screen keyboard. Chrome on Android
 * lays the page out at full height and lets the keyboard cover its bottom,
 * the composer with it; the visual viewport is what is left. Null when off.
 */
function useKeyboardSafeHeight(on) {
  const [h, setH] = useState(null)
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!on || !vv) {
      setH(null)
      return undefined
    }
    const fit = () => setH(vv.height)
    fit()
    vv.addEventListener('resize', fit)
    return () => vv.removeEventListener('resize', fit)
  }, [on])
  return h
}

/** The wallet at the top of the Consult page (14 Oct 2026, Rahul): the
 *  balance, Add money, and Details (the wallet page's history). It moved here
 *  from Profile's icons and the header. */
function WalletCard({ onGo }) {
  const { balance } = useStore()
  const [adding, setAdding] = useState(false)
  return (
    <>
    <section className="px-4 pt-4">
      <div className="rounded-2xl bg-gradient-to-br from-[#fff4ea] to-white p-4 ring-1 ring-gold-fill/25">
        <p className="caps-sm t-faint">Wallet balance</p>
        <p className="mt-1 font-display text-[30px] font-bold leading-none tnum t-heading">
          {balance === null ? '—' : `₹${rupees(balance)}`}
        </p>
        <div className="mt-3 flex gap-2">
          {/* In place (14 Oct 2026, Rahul): after a recharge you stay here,
              with the new balance. */}
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex-1 rounded-xl bg-gold-fill py-2.5 text-center text-meta font-semibold text-white shadow-sm"
          >
            Add money
          </button>
          <Link
            to="/wallet?from=consult"
            onClick={() => {
              markConsultReturn()
              onGo()
            }}
            className="flex-1 rounded-xl bg-white py-2.5 text-center text-meta font-semibold t-heading ring-1 ring-rule"
          >
            Details
          </Link>
        </div>
      </div>
    </section>
    <AddMoneySheet open={adding} onClose={() => setAdding(false)} />
    </>
  )
}
