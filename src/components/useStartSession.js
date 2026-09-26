import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestChat } from '../lib/chat.js'
import { rupees, useStore } from '../store.jsx'

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
  const { showToast, openChat, session } = useStore()
  const [asking, setAsking] = useState(false)

  /**
   * @param consultant a shaped roster/profile row — needs `id`, `name`
   *   and `perMinute`
   * @param to 'call' opens the video screen; 'chat' opens the panel
   */
  const start = useCallback(
    async (consultant, to = 'call') => {
      if (asking) return
      if (!session) return showToast(`Sign in to ${to === 'call' ? 'call' : 'chat'}.`)
      if (!consultant?.perMinute) {
        return showToast(`${consultant?.name ?? 'They'} are not taking ${to}s.`)
      }
      if (!consultant.online) {
        return showToast(`${consultant.name} is offline right now.`)
      }

      setAsking(true)
      try {
        const result = await requestChat(consultant.id, consultant.perMinute.id)
        if (!result?.ok) {
          // The server's sentence. Every refusal it gives names the fix —
          // offline, not priced, not enough balance.
          return showToast(result?.reason ?? 'Could not reach the astrologer.')
        }
        showToast(
          `Asked ${consultant.name} · ₹${rupees(consultant.perMinute.price_paise)}/min once they join`,
        )
        if (to === 'call') {
          /* Straight to the call screen rather than waiting here for the
             accept. An empty room with the countdown on it is a truer
             picture of "waiting for them" than a spinner on a list, and
             that screen already owns the clock the money runs on. */
          navigate(`/call/${result.session_id}`)
        } else {
          openChat('live')
        }
      } finally {
        setAsking(false)
      }
    },
    [asking, navigate, openChat, session, showToast],
  )

  return { start, asking }
}
