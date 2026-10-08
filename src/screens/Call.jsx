import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { embedUrl, joinCall, timeLeft } from '../lib/video.js'
import { cancelRequest, endChat, heartbeat } from '../lib/chat.js'
import { useStore } from '../store.jsx'
import SessionRecharge from '../components/SessionRecharge.jsx'

/**
 * The call. Both sides land here; the URL carries the session.
 *
 * FULL-BLEED, ONE BAR. Over the video sits one row, the same for both
 * people: the time left, Recharge (the seeker's last minute only) and End
 * call. Daily's own Leave button is hidden (9 Oct 2026, Rahul: the call
 * showed three timers and two end buttons).
 *
 * ONE CLOCK: THE SESSION'S. The room's own expiry is a far backstop —
 * Daily fixes a meeting's end when it starts and ignores later changes,
 * which hung up a call the seeker had just recharged (8 Oct). The server
 * closes the room when the session settles, and this screen hears it from
 * the frame ('left-meeting') and from the heartbeat.
 *
 * ENDING IS THE SESSION'S JOB, NOT THE FRAME'S. `endChat` is what stops
 * the meter, so End calls it and only then goes back. A tab closed
 * without ending is handled by the sweeper, which is why the meter has
 * never depended on this screen.
 */
export default function Call() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast, refreshWallet, session } = useStore()

  const [call, setCall] = useState(null)      // null | {ok} | {ok:false}
  const [left, setLeft] = useState(null)
  const [secs, setSecs] = useState(null)
  // When the pause for a recharge ends (7 Oct 2026): set by the heartbeat.
  const [resumeBy, setResumeBy] = useState(null)
  const [leaving, setLeaving] = useState(false)
  // The recharge panel, opened from the bar in the last minute.
  const [topup, setTopup] = useState(false)
  // Out of the meeting while the session is still live: a rejoin offer.
  const [dropped, setDropped] = useState(false)
  const ended = useRef(false)
  const frameEl = useRef(null)
  const daily = useRef(null)

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

  /* The countdown. Driven off the session's expiry rather than a
     decrementing number: a tab that was backgrounded for two minutes comes
     back with the right answer instead of one two minutes stale.

     At 0:00 the call no longer ends here (7 Oct 2026): it PAUSES, silent,
     for two minutes while the seeker is asked to recharge. The server ends
     it when the pause runs out, and the heartbeat below says so. */
  useEffect(() => {
    // Nothing to count while the call connects — the clock has not started.
    // `connecting`, not an empty end: the server sends a provisional end
    // then, so a phone still on an older build cannot read it as 0:00.
    if (!call?.ok || call.connecting || !call.expiresAt) return undefined
    const tick = () => {
      const remaining = timeLeft(call.expiresAt)
      setLeft(remaining)
      setSecs(Math.max(0, Math.round((new Date(call.expiresAt).getTime() - Date.now()) / 1000)))
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [call])

  /* The same heartbeat the chat meter uses. It is advisory — the money
     is bounded by `expires_at` either way — but it is what lets the
     sweeper tell a closed tab from a quiet one. It also carries the end
     moving on when the seeker recharges, and the end of a pause nobody
     recharged in — every five seconds once the clock reads zero, so both
     screens hear either at once. */
  const outOfTime = secs === 0
  useEffect(() => {
    if (!call?.ok || call.connecting) return undefined
    let alive = true
    const beat = async () => {
      const h = await heartbeat(id)
      if (!alive || !h || h.unreachable) return
      if (h.live === false) {
        if (ended.current) return
        ended.current = true
        showToast('The call has ended.')
        await refreshWallet(session?.user?.id)
        navigate('/consult', { replace: true })
        return
      }
      setResumeBy(h.resume_by ?? null)
      if (h.expires_at && h.expires_at !== call.expiresAt) {
        setCall((c) => ({ ...c, expiresAt: h.expires_at }))
      }
    }
    if (outOfTime) beat()
    const timer = setInterval(beat, outOfTime ? 5_000 : 20_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [call, id, outOfTime, navigate, refreshWallet, session, showToast])

  /* CONNECTING (5 Oct 2026). The money is held but the clock waits for
     both of you to be in the room — the server checks the room's own list
     of who is there on each of these beats, and starts the paid minutes
     the moment both are. A call that does not connect in time ends here,
     at ₹0, and says so. */
  useEffect(() => {
    if (!call?.ok || !call.connecting) return undefined
    let alive = true
    const check = async () => {
      const h = await heartbeat(id)
      if (!alive || h?.unreachable) return
      if (h?.live === false) {
        alive = false
        showToast(
          h.never_connected
            ? 'The call did not connect. Nothing was charged.'
            : 'The call has ended.',
        )
        await refreshWallet(session?.user?.id)
        navigate('/consult', { replace: true })
        return
      }
      if (h?.connecting === false && h.expires_at) {
        setCall((c) => ({ ...c, expiresAt: h.expires_at, connecting: false }))
      }
    }
    check()
    const timer = setInterval(check, 3000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [call, id, navigate, refreshWallet, session, showToast])

  /* THE FRAME, driven by Daily's library over our own iframe (9 Oct 2026),
     so our `allow` stays (a voice call asks for the microphone only),
     Daily's Leave button is hidden, and we hear when the meeting ends.
     If the library cannot load, the plain embed takes over, as before. */
  const callUrl = call?.ok ? call.url : null
  const callToken = call?.ok ? call.token : null
  const audioOnly = !!call?.audioOnly
  useEffect(() => {
    const el = frameEl.current
    if (!callUrl || !el) return undefined
    let gone = false
    let frame = null
    const plain = (err) => {
      console.error('[call] daily-js:', err?.message)
      if (!gone && !el.getAttribute('src')) el.setAttribute('src', embedUrl({ url: callUrl, token: callToken }))
    }
    import('@daily-co/daily-js')
      .then(({ default: Daily }) => {
        if (gone) return undefined
        frame = Daily.wrap(el, { showLeaveButton: false, showFullscreenButton: !audioOnly })
        daily.current = frame
        // Put out of the meeting: by the server closing the room when the
        // session settled, or by something else. The heartbeat decides.
        frame.on('left-meeting', () => !gone && !ended.current && setDropped(true))
        return frame.join({ url: callUrl, token: callToken, ...(audioOnly ? { videoSource: false } : {}) })
      })
      .catch(plain)
    return () => {
      gone = true
      daily.current = null
      frame?.destroy().catch(() => {})
    }
  }, [callUrl, callToken, audioOnly])

  /* Out of the meeting: over, or a drop. Over leaves; a drop offers Rejoin
     beside End. */
  useEffect(() => {
    if (!dropped) return
    heartbeat(id).then(async (h) => {
      if (h?.live === false && !ended.current) {
        ended.current = true
        showToast('The call has ended.')
        await refreshWallet(session?.user?.id)
        navigate('/consult', { replace: true })
      }
    })
  }, [dropped, id, navigate, refreshWallet, session, showToast])

  const rejoin = () => {
    setDropped(false)
    daily.current
      ?.join({ url: callUrl, token: callToken, ...(audioOnly ? { videoSource: false } : {}) })
      .catch(() => setDropped(true))
  }

  const finish = useCallback(async () => {
    if (leaving) return
    ended.current = true
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
      <div className="full-bleed flex min-h-full animate-breathe items-center justify-center bg-ink">
        <p className="caps-sm on-ink">Opening the call</p>
      </div>
    )
  }

  /* Waiting is not failing, and must not look like it. Their name is not
     here — this screen only has a session id — so it says what is true
     without pretending to know more. */
  if (!call.ok && call.retry) {
    return (
      <div className="full-bleed flex min-h-full animate-fade flex-col items-center justify-center bg-ink px-6 text-center">
        <span className="block h-2.5 w-2.5 animate-pulse rounded-full bg-live" />
        <p className="mt-6 text-lead font-semibold on-ink">Ringing</p>
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
      <div className="full-bleed flex min-h-full flex-col justify-center px-6 pb-10 text-center">
        <p className="text-micro uppercase tracking-caps text-t3">Not connected</p>
        <h1 className="mx-auto mt-5 max-w-[16ch] text-display font-semibold">
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

  const extended = (r) => {
    setResumeBy(r.resume_by ?? null)
    setCall((c) => ({ ...c, expiresAt: r.expires_at }))
  }
  const paused = secs === 0 && !!resumeBy
  const lastMinute = !call.isOwner && !call.connecting && secs != null && secs > 0 && secs <= 60

  return (
    <div className="full-bleed relative h-full bg-ink">
      {/* No src: Daily's library loads it (the effect above); the plain
          embed is set only if the library fails. */}
      <iframe
        ref={frameEl}
        title="Call"
        // A voice call asks for the microphone only — the browser never
        // offers the camera (7 Oct 2026; the token also refuses video).
        allow={call.audioOnly ? 'microphone; speaker; autoplay' : 'camera; microphone; fullscreen; speaker; display-capture; autoplay'}
        className="h-full w-full border-0"
      />

      {/* THE BAR: one timer, one End, for both people. */}
      <div className="absolute inset-x-3 top-3 z-30 flex items-center gap-2">
        <div className="pointer-events-none flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 backdrop-blur-sm">
          <span className="block h-1.5 w-1.5 animate-pulse rounded-full bg-live" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white tnum">
            {call.connecting ? 'Connecting' : paused ? 'Paused' : `${left ?? '—'} left`}
          </span>
        </div>
        <span className="flex-1" />
        {lastMinute && (
          <button
            type="button"
            onClick={() => setTopup(true)}
            className="rounded-full bg-ok px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white shadow-lg active:scale-95"
          >
            Recharge
          </button>
        )}
        <button
          type="button"
          onClick={finish}
          disabled={leaving}
          className="rounded-full bg-live px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white shadow-lg transition-transform active:scale-95 disabled:opacity-60"
        >
          {leaving ? 'Ending…' : 'End call'}
        </button>
      </div>

      {/* The amounts, under the bar, when Recharge is pressed. */}
      {topup && !paused && (
        <div className="absolute inset-x-3 top-14 z-20 overflow-hidden rounded-2xl">
          <SessionRecharge
            dark
            open
            onClose={() => setTopup(false)}
            sessionId={id}
            seeker
            secondsLeft={secs}
            resumeBy={resumeBy}
            rate={call.ratePaise}
            onExtended={extended}
          />
        </div>
      )}

      {/* Out of money (7 Oct 2026): paused and silent, Daily's controls
          covered, the recharge (or the waiting) in the middle. */}
      {paused && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 px-4">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl">
            <SessionRecharge
              dark
              sessionId={id}
              seeker={!call.isOwner}
              secondsLeft={0}
              resumeBy={resumeBy}
              rate={call.ratePaise}
              onExtended={extended}
              // No End here: the bar's End call is the one.
            />
          </div>
        </div>
      )}

      {/* Out of the meeting while the session is live: a dropped line. */}
      {dropped && !paused && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/80 px-6 text-center">
          <p className="text-meta font-semibold text-white">You are out of the call.</p>
          <button
            type="button"
            onClick={rejoin}
            className="rounded-full bg-ok px-5 py-2.5 text-[12px] font-bold uppercase tracking-[0.06em] text-white"
          >
            Rejoin
          </button>
        </div>
      )}

      {/* Said once, while the call connects: the clock waits for both of
          you, so nobody pays for a ringing screen. */}
      {call.connecting && (
        <p className="pointer-events-none absolute inset-x-4 bottom-24 z-10 mx-auto max-w-xs rounded-full bg-black/55 px-4 py-2 text-center text-[12px] text-white backdrop-blur-sm">
          Billing starts when you are both in the call.
        </p>
      )}
    </div>
  )
}
