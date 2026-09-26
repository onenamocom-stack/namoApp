import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { embedUrl, joinCall, timeLeft } from '../lib/video.js'
import { endChat, heartbeat } from '../lib/chat.js'
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

  useEffect(() => {
    let alive = true
    joinCall(id).then((answer) => alive && setCall(answer))
    return () => {
      alive = false
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
        <button
          type="button"
          onClick={() => navigate('/consult', { replace: true })}
          className="mt-10 text-micro uppercase tracking-caps text-t3 underline"
        >
          Back to astrologers
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
