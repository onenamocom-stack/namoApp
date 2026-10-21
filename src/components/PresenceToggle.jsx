import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { beat } from '../lib/consultants.js'
import { isPro as proBuild } from '../side.js'
import { enablePush, keepPushFresh } from '../lib/push.js'
import { useStore } from '../store.jsx'

/**
 * Online / Offline, in the consultant's header.
 *
 * TWO THINGS, ONE CONTROL. The switch says "I want calls"; the beat says
 * "my app is open". The server calls somebody online only when both are
 * true, because either alone ends the same way — a green dot, a seeker
 * pressing it, and nobody answering:
 *
 *   Switch alone    they flip it on, shut the app, and go to sleep.
 *   Beat alone      the app is open on the earnings screen at dinner.
 *
 * Nothing here ever writes "offline". Going dark is the ABSENCE of a
 * beat, which is the only kind of offline a dead battery can produce —
 * a sweeper that has to arrive in time would be a sweeper that sometimes
 * does not.
 *
 * ALWAYS VISIBLE, never in a menu. A consultant who cannot see whether
 * they are online will sit waiting for calls that were never offered, and
 * that is the single most expensive confusion this app can create.
 */
const BEAT_MS = 30_000

// Where the Desk is: its own path in the main app, the queue in the pro build.
const DESK = proBuild ? '/pro/consult' : '/desk'

/* The Desk's four switches (21 Oct 2026, Rahul: "When pro go live he can
   choose which services he is going live like chat audio or video. Booking
   can be live all the time"). */
const TAKES = [
  { key: 'chat', label: 'Chat', note: 'Clients can start a chat.' },
  { key: 'audio', label: 'Audio call', note: 'Clients can call you, voice only.' },
  { key: 'video', label: 'Video call', note: 'Clients can video call you.' },
  { key: 'booking', label: 'Booking', note: 'Clients can book a slot. Works while you are offline too.' },
]

export default function PresenceToggle({ big = false, floating = false }) {
  const { isPro: proSide, session, showToast, consultant } = useStore()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const onDesk = pathname === DESK || pathname.startsWith(`${DESK}/`)
  // The floating pill shows on the main app's pages too, to an approved
  // consultant only (19 Oct 2026, Rahul).
  const isPro = proSide || (floating && consultant?.status === 'approved')
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)
  // The last state we rendered, so the interval can beat with the current
  // switch without the effect re-subscribing every time it changes.
  const accepting = useRef(false)

  const signedIn = !!session?.user?.id

  const send = useCallback(async (next) => {
    const answer = await beat(next)
    if (answer) {
      setState(answer)
      accepting.current = answer.accepting_now
    }
    return answer
  }, [])

  /* One beat on mount to learn where the switch is. The regular beat is
     PresenceKeeper's (below), mounted in the consultant's shell — this
     control lives in the tab header, which the call screen does not have,
     so a consultant on a call stopped beating and showed OFFLINE to every
     seeker until the call ended (the 5 Oct "offline, then online after a
     refresh"). The keeper beats on every screen. */
  useEffect(() => {
    if (!isPro || !signedIn) return undefined
    send(undefined)
    return undefined
  }, [isPro, signedIn, send])

  // The seeker app has no use for this, and neither does a signed-out
  // consultant or an account with no approved practice (the server answers
  // 403 and `beat` returns null, so `state` stays empty).
  if (!isPro || !signedIn || !state) return null

  const on = state.accepting_now
  const takes = state.takes ?? { chat: true, audio: true, video: true, booking: true }

  async function setTake(key) {
    if (busy) return
    setBusy(true)
    const answer = await beat(undefined, { [key]: !takes[key] })
    setBusy(false)
    if (!answer) return showToast('Could not reach the server. Try again.')
    setState(answer)
  }

  async function flip() {
    if (busy) return
    /* Going live starts on the Desk (21 Oct 2026, Rahul: "When he press the
       button. It takes to namo desk"), where the four switches are. Going
       offline is one tap from anywhere. */
    if (!on && !onDesk) {
      navigate(DESK)
      return
    }
    setBusy(true)
    const answer = await send(!on)
    setBusy(false)
    if (!answer) {
      showToast('Could not reach the server. Try again.')
      return
    }
    if (!answer.online) {
      showToast('You are offline. No new calls will come through.')
      return
    }
    /* Going online is the tap that may ask for notifications: a call must
       ring this phone with the app closed (6 Oct 2026), and a browser only
       shows its permission prompt in answer to a tap. */
    const ring = await enablePush()
    showToast(
      ring === 'granted'
        ? 'You are online. Calls will ring this phone, even with the app closed.'
        : ring === 'denied'
          ? 'You are online, but notifications are blocked — calls ring only while the app is open. Allow notifications for this site in your browser settings.'
          : 'You are online. Calls ring while the app is open.',
    )
  }

  /* Over every tab page of the main app, above Home's + (19 Oct 2026,
     Rahul): a Pro stays online anywhere in the app now, so the switch has to
     be in sight anywhere too. */
  if (floating) {
    return (
      <button
        type="button"
        onClick={flip}
        disabled={busy}
        aria-pressed={on}
        aria-label={on ? 'You are online. Go offline.' : 'You are offline. Go online.'}
        // A tall slim capsule, the word running up it, clear above the +
        // (19 Oct 2026, Rahul: "lamba with rounder corner, vertical"; it sat
        // over the +).
        className={`pointer-events-auto flex h-[74px] w-9 flex-col items-center gap-1.5 rounded-full pb-2.5 pt-2.5 shadow-[0_5px_14px_rgba(0,0,0,0.22)] transition-transform active:scale-95 disabled:opacity-70 ${
          on ? 'bg-[#30a46c] text-white' : 'bg-white text-t2 ring-1 ring-rule'
        }`}
      >
        <span aria-hidden="true" className={`block h-2 w-2 flex-none rounded-full ${on ? 'animate-pulse bg-white' : 'bg-t4'}`} />
        <span
          className="text-[9px] font-bold uppercase leading-none tracking-[0.08em]"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          {on ? 'Online' : 'Offline'}
        </span>
      </button>
    )
  }

  // NAMO Desk's big button (16 Oct 2026, Rahul): Go live, green once live,
  // and under it what you take (21 Oct 2026).
  if (big) {
    return (
      <>
      <button
        type="button"
        onClick={flip}
        disabled={busy}
        aria-pressed={on}
        className={`pop-tap flex w-full items-center gap-4 rounded-3xl px-5 py-5 text-left shadow-lg transition-colors disabled:opacity-70 ${
          on ? 'bg-gradient-to-br from-btn to-btn-deep text-white' : 'bg-gradient-to-br from-gold-fill to-gold-dim text-white'
        }`}
      >
        <span
          className="relative flex h-12 w-12 flex-none items-center justify-center rounded-full bg-white/20"
          aria-hidden="true"
        >
          {on && <span className="absolute inset-0 animate-ping rounded-full bg-white/30" />}
          <span className={`block h-4 w-4 rounded-full ${on ? 'bg-white' : 'bg-white/60'}`} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lead font-semibold">{on ? 'You are live' : 'Go live'}</span>
          <span className="mt-0.5 block text-meta text-white/85">
            {on ? 'Visible to clients. Calls and chats ring here. Tap to go offline.' : 'Tap to take calls and chats. Clients see you as live.'}
          </span>
        </span>
      </button>
      <section className="mt-4 overflow-hidden rounded-3xl bg-white ring-1 ring-stroke">
        <p className="px-5 pt-4 text-meta font-semibold t-heading">What you take</p>
        <ul>
          {TAKES.map((x) => (
            <li key={x.key} className="flex items-center gap-3 border-b border-rule px-5 py-3 last:border-b-0">
              <span className="min-w-0 flex-1">
                <span className="block text-body font-semibold t-heading">{x.label}</span>
                <span className="block text-micro t-faint">{x.note}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={takes[x.key]}
                aria-label={x.label}
                disabled={busy}
                onClick={() => setTake(x.key)}
                className={`relative h-7 w-12 flex-none rounded-full transition-colors disabled:opacity-60 ${
                  takes[x.key] ? 'bg-ok' : 'bg-stroke'
                }`}
              >
                <span
                  className={`absolute top-0.5 block h-6 w-6 rounded-full bg-white shadow transition-all ${
                    takes[x.key] ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </button>
            </li>
          ))}
        </ul>
        {on && !takes.chat && !takes.audio && !takes.video && (
          <p className="px-5 pb-4 text-micro font-semibold text-live">
            Chat, audio and video are all off, so no client can reach you live.
          </p>
        )}
      </section>
      </>
    )
  }

  return (
    <button
      type="button"
      onClick={flip}
      disabled={busy}
      aria-pressed={on}
      aria-label={on ? 'You are online. Go offline.' : 'You are offline. Go online.'}
      className="pill knob !h-9 items-center gap-1.5 !px-3"
    >
      {/* The dot is the whole message; the word is there for anybody who
          cannot tell the colours apart, which is why both are present and
          neither is decorative. */}
      <span
        aria-hidden="true"
        className={`block h-2 w-2 rounded-full ${on ? 'bg-ok' : 'bg-t4'}`}
      />
      <span className="caps-sm t-body">{on ? 'Online' : 'Offline'}</span>
    </button>
  )
}


/**
 * The beat, on every screen of the consultant app — the call screen
 * included (5 Oct 2026). It never changes the switch: an empty beat keeps
 * whatever the consultant chose and only says "the app is open". It also
 * beats the moment the app comes back to the foreground, so a phone that
 * slept does not wait half a minute to be seen again.
 */
export function PresenceKeeper() {
  const { isPro, session, consultant } = useStore()
  const signedIn = !!session?.user?.id
  // An approved consultant anywhere in the app, not only on the Desk (19 Oct
  // 2026, Rahul). Online still needs their own Online switch on.
  const on = isPro || consultant?.status === 'approved'
  useEffect(() => {
    if (!on || !signedIn) return undefined
    // A phone that already allowed notifications re-registers on launch,
    // so a subscription the browser rotated never goes quietly dead.
    keepPushFresh()
    const timer = setInterval(() => beat(undefined), BEAT_MS)
    const onShow = () => document.visibilityState === 'visible' && beat(undefined)
    document.addEventListener('visibilitychange', onShow)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [on, signedIn])
  return null
}
