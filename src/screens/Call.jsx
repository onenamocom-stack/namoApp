import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { embedUrl, joinCall, timeLeft } from '../lib/video.js'
import { cancelRequest, endChat, heartbeat } from '../lib/chat.js'
import { useStore } from '../store.jsx'

/**
 * The call. Both sides land here; the URL carries the session.
 *
 * FULL-BLEED, NO CHROME. A top bar here would eat the video and carry
 * one control that already exists inside the frame. What sits over it is
 * the one thing the frame cannot know: **how much time the money bought.**
 *
 * THE CLOCK READS THE SESSION, NOT THE ROOM. Daily is told to expire the
 * room at the same instant, but that is a copy — and a countdown
 * disagreeing with what was charged is the complaint per-minute billing
 * always gets. One number, from the row the money is settled against.
 *
 * ENDING IS THE SESSION'S JOB, NOT THE FRAME'S. Leaving the Daily call
 * closes a window; it does not settle anything. `endChat` is what stops
 * the meter, so Leave calls it and only then goes back. A tab closed
 * without leaving is handled by the sweeper, which is why the meter has
 * never depended on this screen.
 */
export default function Call() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast, refreshWallet, session } = useStore()

  const [call, setCall] = useState(null)      // null | {ok} | {ok:false}
  const [left, setLeft] = useState(null)
  const [leaving, setLeaving] = useState(false)
  const ended = useRef(false)

  /* ASK UNTIL THERE IS A DOOR, not once.
  
     The seeker lands here the moment they press Call, which is before
     the consultant has accepted — so the first join is always refused.
     That refusal used to be final: the screen showed "that session is
     not live" and never asked again. The consultant answered seven
     seconds later, the meter started, and the seeker sat looking at an
     error until the money ran out. It cost a real ₹35.
  
     Only `retry` refusals loop. Declined, ended and expired are answers,
     and waiting for something that will not happen is worse than being
     told. */
  useEffect(() => {
    let alive = true
    let timer = null

    const ask = async () => {
      const answer = await joinCall(id)
      if (!alive) return
      setCall(answer)
      if (!answer.ok && answer.retry) timer = setTimeout(ask, 2500)
    }
    ask()

    /* AND KEEP ASKING WHILE THE MONEY RUNS. A refusal that arrives once
       the session is live is transient by definition — Daily hiccuping,
       a token that did not mint — and treating it as final left a seeker
       on an error screen watching their balance drain. This second loop
       is slower and exists only for that: once every eight seconds, and
       only while the screen is showing a failure. */
    const insist = setInterval(() => {
      setCall((current) => {
        if (current && !current.ok) ask()
        return current
      })
    }, 8000)

    return () => {
      alive = false
      if (timer) clearTimeout(timer)
      clearInterval(insist)
    }
  }, [id])

  /* The countdown, and the thing that ends the call when it runs out.
     Driven off the session's expiry rather than a decrementing number:
     a tab that was backgrounded for two minutes comes back with the
     right answer instead of one two minutes stale. */
  useEffect(() => {
    if (!call?.ok) return undefined
    const tick = () => {
      const remaining = timeLeft(call.expiresAt)
      setLeft(remaining)
      if (remaining === '0:00' && !ended.current) {
        ended.current = true
        showToast('Time is up. The call has ended.')
        finish()
      }
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call])

  /* The same heartbeat the chat meter uses. It is advisory — the money
     is bounded by `expires_at` either way — but it is what lets the
     sweeper tell a closed tab from a quiet one. */
  useEffect(() => {
    if (!call?.ok) return undefined
    const beat = setInterval(() => heartbeat(id), 20_000)
    return () => clearInterval(beat)
  }, [call, id])

  const finish = useCallback(async () => {
    if (leaving) return
    setLeaving(true)
    try {
      await endChat(id)
      await refreshWallet(session?.user?.id)
    } catch {
      /* The sweeper settles it within the minute regardless. Leaving is
         not the thing that must not fail. */
    }
    navigate('/consult', { replace: true })
  }, [id, leaving, navigate, refreshWallet, session])

  if (call === null) {
    return (
      <div className="flex min-h-full animate-breathe items-center justify-center bg-ink">
        <p className="caps-sm on-ink">Opening the call</p>
      </div>
    )
  }

  /* Waiting is not failing, and must not look like it. Their name is not
     here — this screen only has a session id — so it says what is true
     without pretending to know more. */
  if (!call.ok && call.retry) {
    return (
      <div className="flex min-h-full animate-fade flex-col items-center justify-center bg-ink px-6 text-center">
        <span className="block h-2.5 w-2.5 animate-pulse rounded-full bg-live" />
        <p className="mt-6 text-lead font-light on-ink">Ringing</p>
        <p className="mt-3 max-w-measure text-meta text-white/60">
          Waiting for them to answer. Nothing is charged until they do.
        </p>
        {/* Cancel takes the request OFF THE TABLE, it does not just
            leave the screen. Navigating away used to leave it sitting
            there for the sweeper's fifteen minutes, and a consultant
            answering inside that window would have started the meter for
            somebody who had already gone. */}
        <button
          type="button"
          onClick={async () => {
            await cancelRequest(id)
            navigate('/consult', { replace: true })
          }}
          className="mt-12 text-micro uppercase tracking-caps text-white/50 underline"
        >
          Cancel
        </button>
      </div>
    )
  }

  if (!call.ok) {
    return (
      <div className="flex min-h-full flex-col justify-center px-6 pb-10 text-center">
        <p className="text-micro uppercase tracking-caps text-t3">Not connected</p>
        <h1 className="mx-auto mt-5 max-w-[16ch] text-display font-light">
          The call did not open.
        </h1>
        {/* The server's sentence. Every refusal it gives names the
            reason — not live, not yours, time is up, or not switched
            on — so there is nothing to translate here. */}
        <p className="mx-auto mt-6 max-w-measure text-meta text-live">{call.reason}</p>
        {/* It IS still trying. A screen that has given up and a screen
            that is retrying look identical unless one of them says so,
            and the difference matters when a meter is running. */}
        <p className="mx-auto mt-3 max-w-measure text-micro t-faint">
          Still trying. If it does not open, end the call — you are only charged
          for the time it was open.
        </p>
        {/* END, not "back". Walking away from this screen used to leave
            the session live and the meter running until the sweeper got
            to it. */}
        <button
          type="button"
          onClick={finish}
          disabled={leaving}
          className="mx-auto mt-10 block rounded-full bg-live px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white disabled:opacity-60"
        >
          {leaving ? 'Ending…' : 'End the call'}
        </button>
      </div>
    )
  }

  return (
    <div className="relative h-full bg-ink">
      <iframe
        title="Call"
        src={embedUrl(call)}
        allow="camera; microphone; fullscreen; speaker; display-capture; autoplay"
        className="h-full w-full border-0"
      />

      {/* Over the video, top-left, out of the way of Daily's own
          controls on the right. The number is the whole reason this
          overlay exists. */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 backdrop-blur-sm">
        <span className="block h-1.5 w-1.5 animate-pulse rounded-full bg-live" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white tnum">
          {left ?? '—'} left
        </span>
      </div>

      {/* Leave is ours, not the frame's. Daily's own leave button closes
          a window; it does not stop a meter. */}
      <button
        type="button"
        onClick={finish}
        disabled={leaving}
        className="absolute right-3 top-3 z-10 rounded-full bg-live px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white shadow-lg transition-transform active:scale-95 disabled:opacity-60"
      >
        {leaving ? 'Ending…' : 'End call'}
      </button>
    </div>
  )
}
