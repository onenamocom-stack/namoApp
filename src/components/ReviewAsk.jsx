import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { reviewableSessions } from '../lib/content.js'
import { onReviewAsk } from '../lib/reviewAsk.js'
import { useStore } from '../store.jsx'
import { ReviewSheet } from './MySessions.jsx'

/* A session the seeker closed with Not now is not asked again on this
   device. Browser storage may be missing; then it is asked once per load. */
const DISMISSED = 'namo:review-dismissed'
// Sessions that ended longer ago than this are left to My sessions.
const RECENT_MS = 24 * 60 * 60 * 1000
const THROTTLE_MS = 20_000

function dismissed() {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED) || '[]')
  } catch {
    return []
  }
}

function dismiss(id) {
  try {
    localStorage.setItem(DISMISSED, JSON.stringify([id, ...dismissed()].slice(0, 50)))
  } catch {
    /* asked again next load, no worse */
  }
}

/**
 * The review sheet after a call or chat (17 Oct 2026). It asks the server
 * which sessions can be reviewed, so a call that never connected, the
 * Pro's own side and a session already reviewed open nothing.
 *
 * It opens when the call or chat screen ends the session, and also when
 * the seeker opens the app or moves between screens (20 Oct 2026, Rahul:
 * "Ensure it is asked from seeker. I noticed it was not asked last time" —
 * the seeker had left the call screen and the Pro ended the call, so the
 * screen that asks was gone). Then it offers the newest session that
 * ended in the last day and was not put off with Not now.
 */
export default function ReviewAsk() {
  const { session } = useStore()
  const { pathname } = useLocation()
  const [item, setItem] = useState(null)
  const asked = useRef(new Set())
  const last = useRef(0)
  const signedIn = !!session?.user?.id

  const open = useCallback((row) => {
    asked.current.add(row.id)
    setItem({ ...row, kind: 'session' })
  }, [])

  useEffect(
    () =>
      onReviewAsk(async (id) => {
        const rows = await reviewableSessions().catch(() => [])
        const row = (rows ?? []).find((r) => r.id === id)
        if (row) open(row)
      }),
    [open],
  )

  const sweep = useCallback(async () => {
    if (!signedIn || item || pathname.startsWith('/call/')) return
    if (Date.now() - last.current < THROTTLE_MS) return
    last.current = Date.now()
    const rows = await reviewableSessions().catch(() => [])
    const skip = new Set(dismissed())
    const row = (rows ?? []).find(
      (r) =>
        !asked.current.has(r.id) &&
        !skip.has(r.id) &&
        Date.now() - new Date(r.ended_at).getTime() < RECENT_MS,
    )
    if (row) open(row)
  }, [signedIn, item, pathname, open])

  useEffect(() => {
    sweep()
  }, [sweep])

  useEffect(() => {
    const onShow = () => document.visibilityState === 'visible' && sweep()
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [sweep])

  const close = () => {
    if (item) dismiss(item.id)
    setItem(null)
  }

  return <ReviewSheet item={item} onClose={close} onDone={() => setItem(null)} />
}
