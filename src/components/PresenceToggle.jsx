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

  /* One beat on mount to learn where the switch is, then every thirty
     seconds. The grace window is ninety, so two dropped beats — a
     wifi-to-mobile handover mid-tap — do not blink the dot. */
  useEffect(() => {
    if (!isPro || !signedIn) return undefined
    let alive = true

    send(undefined).then((answer) => {
      if (!alive || !answer) return
    })

    const timer = setInterval(() => {
      // Every beat carries the switch, so a toggle whose request failed
      // corrects itself within thirty seconds instead of leaving the
      // consultant visible and absent until they notice.
      send(accepting.current)
    }, BEAT_MS)

    return () => {
      alive = false
      clearInterval(timer)
    }
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
      className="pill knob !h-9 items-center gap-1.5 px-2.5"
    >
      {/* The dot is the whole message; the word is there for anybody who
          cannot tell the colours apart, which is why both are present and
          neither is decorative. */}
      <span
        aria-hidden="true"
        className={`block h-2 w-2 rounded-full ${on ? 'bg-live' : 'bg-t4'}`}
      />
      <span className="caps-sm t-body">{on ? 'Online' : 'Offline'}</span>
    </button>
  )
}
