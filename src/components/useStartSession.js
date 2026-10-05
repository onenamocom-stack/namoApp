import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'

/**
 * Asking a consultant for a live session — one implementation, every
 * caller.
 *
 * IT EXISTS BECAUSE THE TWO COPIES DRIFTED. The consultant's profile got
 * a real Call button when video shipped; the roster on `/consult` kept a
 * `showToast('Calling … — prototype only')` that had been there since the
 * prototype. Same button, same card, two different behaviours, and the
 * one people actually press was the stub.
 *
 * CALL AND CHAT ARE THE SAME SESSION. One meter, one hold, one settle —
 * `mode` is a label on the row and nothing branches on it. What differs
 * is only where the two of them talk while it runs, which is why this
 * takes a `to` and changes nothing else.
 *
 * NO MONEY MOVES HERE. `request_chat` writes a row and stops: a
 * consultant who never answers has cost the seeker nothing. The hold is
 * taken when they accept, against the balance locked at that moment.
 */
export default function useStartSession() {
  const navigate = useNavigate()
  const { showToast, session } = useStore()
  const [asking, setAsking] = useState(false)

  /**
   * @param consultant a shaped roster/profile row — needs `id`, `name`
   *   and `perMinute`
   * @param to 'call' opens the video screen; 'chat' opens the panel
   */
  const start = useCallback(
    async (consultant, to = 'video') => {
      if (asking) return
      /* 'video' and 'audio' are both calls (5 Oct 2026) — the same metered
         session; an audio one joins with cameras off. 'call' is the old
         name for video and still works. */
      const isCall = to !== 'chat'
      if (!session) return showToast(`Sign in to ${isCall ? 'call' : 'chat'}.`)
      if (!consultant?.perMinute) {
        return showToast(`${consultant?.name ?? 'They'} are not taking ${isCall ? 'call' : 'chat'}s.`)
      }
      if (!consultant.online) {
        return showToast(`${consultant.name} is offline right now.`)
      }

      /* Everything after this — asking, busy and retrying, ringing, the
         chat opening on accept — lives on /connect (5 Oct 2026). A
         consultant who is busy is still pressable: the screen waits and
         asks again instead of failing. */
      setAsking(true)
      try {
        navigate(`/connect/${consultant.id}?via=${to === 'call' ? 'video' : to}`, {
          state: { consultant },
        })
      } finally {
        setAsking(false)
      }
    },
    [asking, navigate, session, showToast],
  )

  return { start, asking }
}
