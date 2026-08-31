import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { liveChat, liveSessions } from '../data/mock.js'
import { TabHeader } from '../components/Chrome.jsx'
import { PopButton } from '../components/Pop.jsx'
import { useStore } from '../store.jsx'

/** The consultant's own live room. One room, same assumption ProConsult and
    the old Studio card already made — nothing in this prototype supports
    more than one at a time. */
const MY_ROOM = 'l1'

/**
 * Go Live — the host side of a room. `/live/:id` (LiveRoom.jsx) is the
 * viewer's screen: Follow, Remind me, a bordered chat list on a white
 * sheet. None of that applies to the person holding the camera, so this is
 * a new screen rather than a mode of that one — full-bleed video, an
 * Instagram-style scrolling comment overlay, and the one control a host
 * needs that a viewer never does: End.
 */
export default function ProGoLive() {
  const navigate = useNavigate()
  const { hasFlag, toggleFlag } = useStore()
  const room = liveSessions.find((l) => l.id === MY_ROOM)

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [status, setStatus] = useState('requesting') // requesting | live | denied | unavailable
  const [attempt, setAttempt] = useState(0)

  // The first real device API call in the app — everything else is a Plate
  // placeholder, per HANDOFF. Deliberate, not an oversight.
  useEffect(() => {
    let cancelled = false

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable')
      return
    }

    setStatus('requesting')
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user' }, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        setStatus('live')
      })
      .catch((err) => {
        if (cancelled) return
        setStatus(err.name === 'NotFoundError' ? 'unavailable' : 'denied')
      })

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [attempt])

  // Comments arrive on their own, the same spirit as Pooja's petals: state
  // that adds itself and trims its own tail, cleaned up on the way out.
  const [messages, setMessages] = useState(() => liveChat.slice(0, 2))
  const next = useRef(2)

  useEffect(() => {
    if (status !== 'live') return
    const id = setInterval(() => {
      const seed = liveChat[next.current % liveChat.length]
      next.current += 1
      setMessages((m) => [...m, { ...seed, id: `${seed.id}-${next.current}` }].slice(-6))
    }, 3200)
    return () => clearInterval(id)
  }, [status])

  const end = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    if (!hasFlag(`offair:${MY_ROOM}`)) {
      toggleFlag(`offair:${MY_ROOM}`, { on: 'You ended the live room', off: '' })
    }
    navigate('/pro/studio')
  }

  if (status !== 'live') {
    return (
      <>
        <TabHeader />
        <section className="flex min-h-[70vh] flex-col items-center justify-center px-8 text-center">
          {status === 'requesting' && (
            <p className="text-meta t-faint">Opening the camera…</p>
          )}
          {status === 'denied' && (
            <>
              <p className="text-lead t-heading">Camera access is needed to go live</p>
              <p className="mt-2 text-meta t-faint">
                Allow camera and microphone access for this site, then try again.
              </p>
              <PopButton className="mt-6" variant="gold" full={false} onClick={() => setAttempt((a) => a + 1)}>
                Try again
              </PopButton>
            </>
          )}
          {status === 'unavailable' && (
            <>
              <p className="text-lead t-heading">No camera found</p>
              <p className="mt-2 text-meta t-faint">
                Going live needs a working camera on this device.
              </p>
              <PopButton className="mt-6" variant="ghost" full={false} onClick={() => setAttempt((a) => a + 1)}>
                Retry
              </PopButton>
            </>
          )}
        </section>
      </>
    )
  }

  return (
    <div className="relative h-full bg-ink">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
        style={{ transform: 'scaleX(-1)' }}
      />

      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/55 to-transparent"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/80 via-black/25 to-transparent"
      />

      {/* Top: on-air state, who's watching, the one exit a host needs. */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 p-4">
        <span className="badge-live">● Live</span>
        <span className="rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white backdrop-blur-sm tnum">
          {room?.viewers ?? '—'} watching
        </span>
        <button
          type="button"
          onClick={end}
          className="ml-auto rounded-full bg-white px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink shadow-md transition-transform active:scale-95"
        >
          End
        </button>
      </div>

      {/* Bottom: the live comment stream — what the consultant is actually
          here to see. Newest at the bottom, capped tail, translucent over
          the feed rather than a bordered list on white. */}
      <ul className="absolute inset-x-0 bottom-0 z-10 max-h-[38vh] overflow-hidden px-4 pb-5">
        {messages.map((m) => (
          <li key={m.id} className="animate-fade mt-2 flex items-start gap-2.5">
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-white/15 text-[10px] font-bold text-white ring-1 ring-white/30">
              {m.initials}
            </span>
            <span className="min-w-0 rounded-2xl bg-black/35 px-3 py-1.5 text-[12.5px] leading-snug text-white backdrop-blur-sm">
              <span className="font-semibold">{m.name}</span> {m.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
