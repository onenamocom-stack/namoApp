import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { endChat, heartbeat, listSessions } from '../lib/chat.js'
import { askReview } from '../lib/reviewAsk.js'
import { useStore } from '../store.jsx'

const THROTTLE_MS = 15_000
const BEAT_MS = 20_000

/**
 * A live call you are not on (20 Oct 2026, Rahul: "seeker pressed button
 * while call. He went back. But wasn't able to join the call again. While
 * call was live from pro side"). Leaving the call screen never ended the
 * call, but nothing led back to it, so the seeker paid for a call they
 * could not reach. Off `/call/`, both apps ask for the caller's live call
 * on load, on return to the app and on leaving a screen; while there is
 * one, a bar over every screen offers Return (the call screen joins the
 * same room) and End.
 */
export default function LiveCallBar() {
  const { session, refreshWallet, showToast } = useStore()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [live, setLive] = useState(null) // the session row, or null
  const last = useRef(0)
  const uid = session?.user?.id
  const onCall = pathname.startsWith('/call/')

  const look = useCallback(
    async (force = false) => {
      if (!uid || onCall) return
      if (!force && Date.now() - last.current < THROTTLE_MS) return
      last.current = Date.now()
      const rows = await listSessions()
      setLive((rows || []).find((s) => s.status === 'live' && s.mode === 'call') ?? null)
    },
    [uid, onCall],
  )

  // Leaving the call screen looks at once; any other screen change is throttled.
  const wasOnCall = useRef(onCall)
  useEffect(() => {
    look(wasOnCall.current && !onCall)
    wasOnCall.current = onCall
  }, [pathname, look, onCall])

  useEffect(() => {
    const onShow = () => document.visibilityState === 'visible' && look(true)
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [look])

  // While the bar shows, the heartbeat says when the call ends elsewhere.
  useEffect(() => {
    if (!live || onCall) return undefined
    const timer = setInterval(async () => {
      const h = await heartbeat(live.id)
      if (h && !h.unreachable && h.live === false) {
        setLive(null)
        refreshWallet(uid)
        if (live.seeker_id === uid) askReview(live.id)
      }
    }, BEAT_MS)
    return () => clearInterval(timer)
  }, [live, onCall, refreshWallet, uid])

  if (!live || onCall) return null

  const other = live.seeker_id === uid ? live.consultant_name : live.seeker_name

  const end = async () => {
    const row = live
    setLive(null)
    await endChat(row.id)
    await refreshWallet(uid)
    showToast('The call has ended.')
    if (row.seeker_id === uid) askReview(row.id)
  }

  return (
    <div className="absolute inset-x-0 top-0 z-50 px-3 pt-3">
      <div className="flex items-center gap-3 rounded-full bg-ink py-2 pl-4 pr-2 shadow-lg">
        <span className="block h-2 w-2 flex-none animate-pulse rounded-full bg-gold-fill" />
        <span className="min-w-0 flex-1 truncate caps-sm on-ink">
          {other ? `Call with ${other} is on` : 'Your call is on'}
        </span>
        <button type="button" onClick={end} className="flex-none px-2 caps-sm on-ink opacity-70">
          End
        </button>
        <button
          type="button"
          onClick={() => navigate(`/call/${live.id}`)}
          className="flex-none rounded-full bg-gold-fill px-4 py-2 caps-sm text-white"
        >
          Return
        </button>
      </div>
    </div>
  )
}
