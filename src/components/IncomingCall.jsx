import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  acceptChat,
  declineRequest,
  listSessions,
  subscribeToMySessions,
} from '../lib/chat.js'
import { callPath } from '../lib/dashboard.js'
import { startRinging, stopRinging } from '../lib/ringtone.js'
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
  // On a call already, another request must not cover it or ring over it:
  // it waits as a line at the top.
  const onCall = useLocation().pathname.startsWith('/call/')
  /* The store's side, not the build's (Phase 16): true on the pro app's
     screens, which is where this is mounted there, and on Namo Consult
     (`/desk`) in the main app. */
  const { showToast, session, openChat, isPro, consultant } = useStore()
  // Wherever they are in the app (19 Oct 2026, Rahul): an approved
  // consultant's call rings on Home, Bhakti, the Market, anywhere.
  const pro = isPro || consultant?.status === 'approved'
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
    if (!pro || !myId) return undefined
    load()
    // The same five-second poller the thread list uses. A request is
    // worth knowing about quickly; it is not worth a websocket yet.
    return subscribeToMySessions(myId, load)
  }, [pro, myId, load])

  // Ring while somebody is waiting (6 Oct 2026); stop the moment nobody is.
  useEffect(() => {
    if (pro && pending.length > 0 && !onCall) startRinging()
    else stopRinging()
    return () => stopRinging()
  }, [pro, pending.length, onCall])

  if (!pro || !myId || pending.length === 0) return null

  /* Declining costs nothing and settles nothing — the hold is taken at
     accept, so a request turned down never had money against it. The
     seeker's call screen stops ringing on its own: `join` answers
     DECLINED with retry false. */
  const turnDown = async (row) => {
    if (busy) return
    setBusy(row.id)
    await declineRequest(row.id)
    setBusy(null)
    load()
  }

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
    /* A CHAT opens the chat, on that conversation (5 Oct 2026). Until then
       every answer went to the call screen, and the consultant's camera
       came on for somebody who had asked to type. */
    if ((result.mode ?? row.mode) === 'chat') {
      openChat('live', result.thread_id ?? null)
      return
    }
    navigate(callPath(row.id))
  }

  /* The whole screen, as a phone call is (19 Oct 2026, Rahul: "should
     cover the whole screen like normal call or WhatsApp call"). The oldest
     request rings; any others wait under it as a line each. Decline left
     and red, Answer right and green, far apart: the one that starts a
     meter is never hit while aiming for the other. */
  const [row, ...others] = pending
  if (onCall) {
    return (
      <div className="absolute inset-x-0 top-0 z-[90] flex items-center gap-3 bg-[#2a160c] px-4 py-2.5 text-white">
        <span className="block h-2 w-2 flex-none animate-pulse rounded-full bg-live" />
        <span className="min-w-0 flex-1 truncate text-meta">
          {row.seeker_name || 'Someone'} is calling · ₹{rupees(row.rate_paise)}/min
        </span>
        <button type="button" onClick={() => turnDown(row)} disabled={busy === row.id} className="caps-sm text-white/80">
          Decline
        </button>
      </div>
    )
  }
  const kind = row.mode === 'chat' ? 'Chat' : row.audio_only ? 'Audio call' : 'Video call'
  const name = row.seeker_name || 'Someone'
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={`${kind} from ${name}`}
      className="fixed inset-0 z-[90] flex justify-center"
      style={{ background: 'linear-gradient(180deg, #2a160c 0%, #120a06 100%)' }}
    >
      <div className="flex h-full w-full max-w-[420px] flex-col items-center px-6 pb-14 pt-20 text-white">
        <p className="caps-sm text-white/60">NAMO · Incoming {kind.toLowerCase()}</p>
        <span className="relative mt-10 flex h-32 w-32 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-white/10" />
          <span className="relative flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-b from-[#ff9a3c] to-[#e8590c] text-[44px] font-semibold">
            {(name.trim()[0] || '?').toUpperCase()}
          </span>
        </span>
        <p className="mt-6 max-w-full truncate text-[28px] font-semibold">{name}</p>
        <p className="mt-2 text-meta text-white/70 tnum">
          {kind} · ₹{rupees(row.rate_paise)}/min
        </p>

        {others.length > 0 && (
          <p className="mt-6 rounded-full bg-white/10 px-3 py-1 text-micro text-white/80">
            {others.length === 1
              ? `${others[0].seeker_name || 'Someone'} is also waiting`
              : `${others.length} more waiting`}
          </p>
        )}

        <div className="mt-auto flex w-full items-end justify-between px-6">
          <span className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => turnDown(row)}
              disabled={busy === row.id}
              aria-label="Decline"
              className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#e5484d] shadow-lg transition-transform active:scale-95 disabled:opacity-60"
            >
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 15.5c5-4.7 13-4.7 18 0l-2.2 2.6-3.6-1.4v-2.6c-2.1-.7-4.3-.7-6.4 0v2.6l-3.6 1.4L3 15.5z" fill="#fff" />
              </svg>
            </button>
            <span className="text-micro text-white/80">Decline</span>
          </span>
          <span className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => answer(row)}
              disabled={busy === row.id}
              aria-label={row.mode === 'chat' ? 'Accept' : 'Answer'}
              className="flex h-[72px] w-[72px] animate-pulse items-center justify-center rounded-full bg-[#30a46c] shadow-lg transition-transform active:scale-95 disabled:opacity-60"
            >
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z" fill="#fff" />
              </svg>
            </button>
            <span className="text-micro text-white/80">
              {busy === row.id ? 'Starting…' : row.mode === 'chat' ? 'Accept' : 'Answer'}
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}
