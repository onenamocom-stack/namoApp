import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { acceptChat, listSessions, subscribeToMySessions } from '../lib/chat.js'
import { isPro } from '../side.js'
import { rupees, useStore } from '../store.jsx'

/**
 * Somebody is calling. The consultant's half of a live session.
 *
 * THIS DID NOT EXIST. `acceptChat` shipped with the chat meter and
 * nothing in the consultant app ever called it — a seeker could request
 * a session and there was no screen anywhere that showed the request,
 * so nobody could answer one. The money side was complete and the door
 * was missing.
 *
 * ON EVERY SCREEN, not on one. It is mounted in the consultant shell
 * rather than on a calls page, because a request that can only be seen
 * by being on the right tab is a request that gets missed — and the
 * seeker is watching a countdown while it is.
 *
 * ACCEPT IS WHERE THE MONEY MOVES, and it is the server's call: the hold
 * is taken against the seeker's locked balance, the minutes are what
 * that balance buys, and this only renders whatever comes back. A
 * refusal is shown verbatim — "Not enough balance" is the seeker's
 * problem to fix and the consultant's to be told about plainly.
 */
export default function IncomingCall() {
  const navigate = useNavigate()
  const { showToast, session } = useStore()
  const myId = session?.user?.id
  const [pending, setPending] = useState([])
  const [busy, setBusy] = useState(null)

  const load = useCallback(() => {
    listSessions().then((rows) => {
      setPending(
        (rows ?? []).filter(
          (s) =>
            s.status === 'requested' &&
            String(s.consultant_id).replace(/-/g, '') ===
              String(myId ?? '').replace(/-/g, ''),
        ),
      )
    })
  }, [myId])

  useEffect(() => {
    if (!isPro || !myId) return undefined
    load()
    // The same five-second poller the thread list uses. A request is
    // worth knowing about quickly; it is not worth a websocket yet.
    return subscribeToMySessions(myId, load)
  }, [myId, load])

  if (!isPro || !myId || pending.length === 0) return null

  const answer = async (row) => {
    if (busy) return
    setBusy(row.id)
    const result = await acceptChat(row.id)
    setBusy(null)
    if (!result?.ok) {
      // The server's sentence. Every refusal it gives names the reason,
      // and most of them are about the seeker's wallet rather than
      // anything the consultant did.
      showToast(result?.reason ?? 'Could not start that session.')
      load()
      return
    }
    navigate(`/call/${row.id}`)
  }

  return (
    <div className="border-b border-rule bg-surface-2">
      {pending.map((row) => (
        <div key={row.id} className="flex items-center gap-3 px-4 py-3">
          <span className="block h-2 w-2 flex-none animate-pulse rounded-full bg-live" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body text-t1">
              {row.seeker_name || 'Someone'} is calling
            </span>
            <span className="mt-0.5 block caps-sm t-faint tnum">
              ₹{rupees(row.rate_paise)}/min · {row.mode}
            </span>
          </span>
          <button
            type="button"
            onClick={() => answer(row)}
            disabled={busy === row.id}
            className="flex-none rounded-full bg-live px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-white shadow-sm transition-transform active:scale-95 disabled:opacity-60"
          >
            {busy === row.id ? 'Starting…' : 'Answer'}
          </button>
        </div>
      ))}
    </div>
  )
}
