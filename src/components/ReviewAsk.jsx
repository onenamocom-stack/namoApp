import { useEffect, useState } from 'react'
import { reviewableSessions } from '../lib/content.js'
import { onReviewAsk } from '../lib/reviewAsk.js'
import { ReviewSheet } from './MySessions.jsx'

/**
 * The review sheet that opens when a call or chat ends (17 Oct 2026). It
 * asks the server which sessions can be reviewed and opens only for the
 * one that just ended, so a call that never connected, the Pro's own side
 * and a session already reviewed open nothing.
 */
export default function ReviewAsk() {
  const [item, setItem] = useState(null)

  useEffect(
    () =>
      onReviewAsk(async (id) => {
        const rows = await reviewableSessions().catch(() => [])
        const row = (rows ?? []).find((r) => r.id === id)
        if (row) setItem({ ...row, kind: 'session' })
      }),
    [],
  )

  return <ReviewSheet item={item} onClose={() => setItem(null)} onDone={() => setItem(null)} />
}
