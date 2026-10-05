import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { cancelRequest, listSessions, requestChat } from '../lib/chat.js'
import { getConsultant } from '../lib/consultants.js'
import { BackButton } from '../components/Chrome.jsx'
import { Orbit, Stars } from '../components/Cosmos.jsx'
import { rupees, useStore } from '../store.jsx'

/**
 * Reaching a consultant — one screen for every way of asking (5 Oct 2026).
 *
 * Before this, pressing Chat opened the message panel with nothing in it,
 * and pressing Call on a consultant who was already with somebody failed.
 * What happens instead, in order:
 *
 *   asking   the request goes to the server. Nothing is charged, ever, here.
 *   busy     they are ringing for, or talking to, somebody else. We ask
 *            again every few seconds for three minutes — nothing was written,
 *            so asking again is free — and say so plainly.
 *   ringing  they can see the request. For a call the call screen takes
 *            over (it rings, and the clock waits for both of you to be in).
 *            For a chat we wait here, and open the chat the moment they accept.
 *   answer   declined, unanswered, offline, short of balance — each said in
 *            the server's words, with the one action that helps.
 */
const RETRY_FOR_MS = 3 * 60_000
// How often a waiting chat asks whether it was accepted: the chat should
// open the moment it is (6 Oct 2026: 2.5 s plus the request read as ~4.5 s).
const POLL_MS = 1000

export default function Connect() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const via = ['video', 'audio', 'chat'].includes(params.get('via')) ? params.get('via') : 'video'
  const { state } = useLocation()
  const navigate = useNavigate()
  const { openChat, refreshWallet, session } = useStore()

  const [who, setWho] = useState(state?.consultant ?? null)
  const [phase, setPhase] = useState('asking') // asking | busy | ringing | done
  const [message, setMessage] = useState(null)
  const [retryIn, setRetryIn] = useState(0)
  const sessionId = useRef(null)
  const ringStart = useRef(null)
  const startedAt = useRef(Date.now())
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // A link or a refresh lands here without the consultant in hand.
  useEffect(() => {
    if (who) return
    getConsultant(id).then((c) => alive.current && setWho(c ?? false))
  }, [id, who])

  const finish = useCallback((text) => {
    setPhase('done')
    setMessage(text)
  }, [])

  const ask = useCallback(async () => {
    if (!who?.perMinute) return
    setPhase('asking')
    const result = await requestChat(who.id, who.perMinute.id, {
      audioOnly: via === 'audio',
      channel: via,
    })
    if (!alive.current) return
    if (result?.ok) {
      sessionId.current = result.session_id
      if (via !== 'chat') {
        navigate(`/call/${result.session_id}`, { replace: true })
        return
      }
      ringStart.current = Date.now()
      setPhase('ringing')
      return
    }
    if (result?.busy && Date.now() - startedAt.current < RETRY_FOR_MS) {
      setPhase('busy')
      setRetryIn(result.retry_after ?? 5)
      return
    }
    finish(
      result?.busy
        ? `${who.name} is still with somebody. Try again in a few minutes — nothing was charged.`
        : result?.reason ?? 'Could not reach them. Try again.',
    )
  }, [finish, navigate, via, who])

  // First ask, once the consultant is known.
  useEffect(() => {
    if (!who || !session) return
    ask()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who, session])

  // Busy: count down and ask again.
  useEffect(() => {
    if (phase !== 'busy') return undefined
    if (retryIn <= 0) {
      ask()
      return undefined
    }
    const t = setTimeout(() => setRetryIn((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, retryIn, ask])

  // Ringing a chat: watch the request until it is answered.
  useEffect(() => {
    if (phase !== 'ringing') return undefined
    let asking = false
    const timer = setInterval(async () => {
      if (asking) return // one question at a time; a slow answer is not asked twice
      asking = true
      const rows = await listSessions().finally(() => (asking = false))
      if (!alive.current) return
      const row = (rows ?? []).find((r) => r.id === sessionId.current)
      if (!row) return
      if (row.status === 'live') {
        clearInterval(timer)
        refreshWallet(session?.user?.id)
        openChat('live', row.thread_id)
        navigate(-1)
      } else if (row.status === 'declined') {
        clearInterval(timer)
        finish(`${who?.name ?? 'They'} could not take the chat. Nothing was charged.`)
      } else if (row.status === 'expired') {
        clearInterval(timer)
        finish(`${who?.name ?? 'They'} did not answer. Nothing was charged.`)
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [phase, finish, navigate, openChat, refreshWallet, session, who])

  async function cancel() {
    if (sessionId.current) await cancelRequest(sessionId.current)
    navigate(-1)
  }

  if (!session) {
    return <Shell onBack={() => navigate(-1)} title="Sign in to continue" />
  }
  if (who === false) {
    return <Shell onBack={() => navigate(-1)} title="That consultant is not available." />
  }

  const name = who?.name ?? ''
  if (via === 'chat' && phase !== 'done') {
    return (
      <ChatWaiting
        name={name}
        rate={who?.perMinute ? `₹${rupees(who.perMinute.price_paise)}/min` : ''}
        phase={phase}
        retryIn={retryIn}
        ringStart={ringStart.current}
        onCancel={phase === 'ringing' ? cancel : () => navigate(-1)}
      />
    )
  }
  const what = via === 'chat' ? 'chat' : via === 'audio' ? 'audio call' : 'video call'
  const rate = who?.perMinute ? `₹${rupees(who.perMinute.price_paise)}/min` : ''

  return (
    <div className="full-bleed flex min-h-full flex-col bg-ink text-white">
      <div className="px-4 pt-4">
        <BackButton dark onClick={phase === 'ringing' ? cancel : () => navigate(-1)} />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <span
          className={`flex h-24 w-24 items-center justify-center rounded-full bg-white/10 text-title font-semibold ${
            phase === 'ringing' || phase === 'asking' ? 'animate-pulse' : ''
          }`}
        >
          {initials(name)}
        </span>
        <p className="mt-6 text-lead font-semibold">{name}</p>
        <p className="mt-1 text-meta text-white/60">
          {what}
          {rate ? ` · ${rate}` : ''}
        </p>

        {phase === 'asking' && <p className="mt-8 text-meta text-white/80">Reaching them…</p>}

        {phase === 'busy' && (
          <>
            <p className="mt-8 text-body font-semibold text-gold-fill">Busy with another seeker</p>
            <p className="mt-2 max-w-measure text-meta text-white/70">
              We will keep trying for you{retryIn > 0 ? ` — next try in ${retryIn}s` : '…'}.
              Nothing is charged.
            </p>
          </>
        )}

        {phase === 'ringing' && (
          <>
            <p className="mt-8 text-body font-semibold">Ringing</p>
            <p className="mt-2 max-w-measure text-meta text-white/70">
              The chat opens when they accept. Nothing is charged until then.
            </p>
          </>
        )}

        {phase === 'done' && (
          <>
            <p className="mt-8 max-w-measure text-meta text-white/85">{message}</p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  startedAt.current = Date.now()
                  ask()
                }}
                className="rounded-full bg-white px-5 py-2.5 text-meta font-semibold text-ink"
              >
                Try again
              </button>
              {/balance/i.test(message ?? '') && (
                <button
                  type="button"
                  onClick={() => navigate('/wallet')}
                  className="rounded-full bg-gold-fill px-5 py-2.5 text-meta font-semibold text-white"
                >
                  Add money
                </button>
              )}
            </div>
          </>
        )}

        {(phase === 'busy' || phase === 'ringing' || phase === 'asking') && (
          <button
            type="button"
            onClick={cancel}
            className="mt-12 text-micro uppercase tracking-caps text-white/50 underline"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

function Shell({ onBack, title }) {
  return (
    <div className="full-bleed flex min-h-full flex-col bg-ink px-4 pt-4 text-white">
      <BackButton dark onClick={onBack} />
      <p className="mt-24 text-center text-body">{title}</p>
    </div>
  )
}

function initials(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}


/* ── A chat request, waiting (6 Oct 2026) ─────────────────────────────────
   A chat is not a phone call, so nothing here says "ringing". The seeker
   sees the request travel to the astrologer under the app's own sky: the
   saffron dusk of the kundli reveal, its stars, and the orbit turning
   round the astrologer's initials, with the time they have left to accept
   drawn as a ring. The chat opens by itself the moment they do. */
const RING_FOR = 45 // seconds; apps/chat/services.py RING_SECONDS
const TIPS = [
  'Keep your question to one line — the clearest readings start from one.',
  'Have your birth time ready if you know it.',
  'Ask about one area at a time: career, marriage, health or money.',
  'You pay only for the minutes you chat, from when they accept.',
]

function ChatWaiting({ name, rate, phase, retryIn, ringStart, onCancel }) {
  const [now, setNow] = useState(Date.now())
  const [tip, setTip] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250)
    const u = setInterval(() => setTip((i) => (i + 1) % TIPS.length), 4500)
    return () => {
      clearInterval(t)
      clearInterval(u)
    }
  }, [])

  const waited = ringStart ? (now - ringStart) / 1000 : 0
  const left = Math.max(0, Math.ceil(RING_FOR - waited))
  const share = phase === 'ringing' ? Math.min(1, waited / RING_FOR) : 0
  const R = 92
  const C = 2 * Math.PI * R

  const title =
    phase === 'busy'
      ? `${name} is guiding another seeker`
      : phase === 'ringing'
        ? `Request sent to ${name}`
        : `Reaching ${name}`
  const sub =
    phase === 'busy'
      ? `We will send your request the moment they are free${retryIn > 0 ? ` — next try in ${retryIn}s` : '…'}`
      : phase === 'ringing'
        ? 'The chat opens by itself as soon as they accept.'
        : 'One moment…'

  return (
    <div className="full-bleed cosmic-night relative flex min-h-full flex-col overflow-hidden">
      <Stars />
      <div className="relative z-10 px-4 pt-4">
        <BackButton dark onClick={onCancel} />
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="relative flex h-[220px] w-[220px] items-center justify-center">
          {/* The time they have to accept, as a ring that fills. */}
          <svg viewBox="0 0 220 220" className="absolute inset-0 -rotate-90" aria-hidden="true">
            <circle cx="110" cy="110" r={R} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="4" />
            {phase === 'ringing' && (
              <circle
                cx="110"
                cy="110"
                r={R}
                fill="none"
                stroke="#ffe0c2"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * share}
                style={{ transition: 'stroke-dashoffset .25s linear' }}
              />
            )}
          </svg>
          {/* Orbit sets its own `relative`, so it is centred by a layer of
              its own rather than by an `absolute` class it would override. */}
          <span className="absolute inset-0 flex items-center justify-center opacity-90">
            <Orbit size={168} />
          </span>
          <span className="relative flex h-24 w-24 flex-none items-center justify-center rounded-full bg-white/15 text-title font-semibold text-white shadow-[0_0_40px_rgba(255,190,140,.45)] backdrop-blur-sm">
            {initialsOf(name)}
          </span>
        </div>

        <p className="mt-8 max-w-[22ch] text-lead font-semibold leading-snug text-white">{title}</p>
        <p className="mt-2 max-w-measure text-meta text-white/80">{sub}</p>
        <p className="mt-3 caps-sm text-white/60">
          Chat{rate ? ` · ${rate}` : ''}
          {phase === 'ringing' ? ` · ${left}s` : ''}
        </p>

        <p key={tip} className="mt-10 max-w-measure animate-fade text-meta italic text-white/85">
          {TIPS[tip]}
        </p>

        <button
          type="button"
          onClick={onCancel}
          className="mt-10 rounded-full border border-white/40 px-6 py-2.5 text-meta font-semibold text-white transition-colors hover:bg-white/10"
        >
          Cancel request
        </button>
        <p className="mt-3 text-micro text-white/60">Nothing is charged until they accept.</p>
      </div>
    </div>
  )
}

function initialsOf(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
