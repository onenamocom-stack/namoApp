import { useCallback, useEffect, useRef, useState } from 'react'
import { beat } from '../lib/consultants.js'
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

export default function PresenceToggle() {
  const { isPro, session, showToast } = useStore()
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

  async function flip() {
    if (busy) return
    setBusy(true)
    const answer = await send(!on)
    setBusy(false)
    if (!answer) {
      showToast('Could not reach the server. Try again.')
      return
    }
    showToast(
      answer.online
        ? 'You are online. Seekers can call you.'
        : 'You are offline. No new calls will come through.',
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
  const { isPro, session } = useStore()
  const signedIn = !!session?.user?.id
  useEffect(() => {
    if (!isPro || !signedIn) return undefined
    const timer = setInterval(() => beat(undefined), BEAT_MS)
    const onShow = () => document.visibilityState === 'visible' && beat(undefined)
    document.addEventListener('visibilitychange', onShow)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [isPro, signedIn])
  return null
}
