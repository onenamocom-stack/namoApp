/**
 * The Namo AI conversation, once.
 *
 * Two screens render it — the floating panel's Ask AI tab and the /ask
 * route — and they look nothing alike: one is chat bubbles, the other is a
 * reading column. What they must not have two of is the money: the quota
 * ladder, the meter and the clock. A second copy of that logic is a second
 * place for it to drift, and the thing it would drift about is what people
 * are charged.
 *
 * So this owns the state and the calls, and returns what either rendering
 * needs. It decides nothing itself — every number here arrived from the
 * server (backend/INSTRUCTIONS.md rule 3).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ask, endSession, fetchState, startSession, ticker } from '../lib/ai.js'
import { useStore } from '../store.jsx'

export default function useAskAi() {
  const { showToast, refreshWallet, session } = useStore()

  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const [loading, setLoading] = useState(true)
  const [freeLeft, setFreeLeft] = useState(null)
  const [ratePaise, setRatePaise] = useState(null)
  const [live, setLive] = useState(null) // { id, secondsLeft }
  const [starting, setStarting] = useState(false)
  const stopRef = useRef(null)

  /* The clock. `ticker` counts down locally for smoothness and takes the
     server's seconds_left as truth on every heartbeat; when the server says
     the session is over it fires once and stops itself. The wallet refresh
     is there because the settle wrote a refund the seeker should see. */
  const watch = useCallback(
    (sessionId, seconds) => {
      stopRef.current?.()
      stopRef.current = ticker(sessionId, {
        seconds,
        onTick: (secondsLeft) => setLive({ id: sessionId, secondsLeft }),
        onEnd: () => {
          setLive(null)
          refreshWallet(session?.user?.id)
          showToast('Session ended. Unused minutes are back in your wallet.')
        },
      })
    },
    [refreshWallet, session, showToast],
  )

  useEffect(() => {
    let active = true
    fetchState()
      .then((state) => {
        if (!active) return
        setMessages(state.messages ?? [])
        setFreeLeft(state.free_left)
        setRatePaise(state.rate_paise)
        /* A tab reopened mid-session finds its own meter rather than
           starting a second one — which is why the live session comes back
           with the transcript rather than being asked for separately. */
        if (state.session) {
          const secondsLeft = Math.max(
            0,
            Math.round((new Date(state.session.expires_at) - Date.now()) / 1000),
          )
          watch(state.session.id, secondsLeft)
        }
      })
      .catch((err) => console.error('[ai] state failed:', err.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
      stopRef.current?.()
    }
  }, [watch])

  const startMeter = useCallback(async () => {
    if (starting) return
    setStarting(true)
    try {
      const result = await startSession()
      if (!result.ok) return showToast(result.reason)
      watch(result.session_id, result.seconds_left)
      refreshWallet(session?.user?.id)
    } catch (err) {
      showToast(err.message)
    } finally {
      setStarting(false)
    }
  }, [starting, watch, showToast, refreshWallet, session])

  const stopMeter = useCallback(async () => {
    if (!live) return
    /* Stop the local clock first. The settle is the server's and it is
       idempotent, but a ticker still counting while the request is in
       flight shows seconds nobody is being charged for. */
    stopRef.current?.()
    setLive(null)
    try {
      await endSession(live.id)
    } finally {
      refreshWallet(session?.user?.id)
    }
  }, [live, refreshWallet, session])

  const send = useCallback(
    async (text) => {
      const question = (text ?? draft).trim()
      if (!question || thinking) return

      const asked = { id: `u${Date.now()}`, role: 'user', text: question }
      setMessages((m) => [...m, asked])
      setDraft('')
      setThinking(true)
      try {
        const result = await ask(question)
        if (!result.ok) {
          /* The question goes back in the box rather than staying in the
             transcript: it was not asked, and leaving it on screen above a
             refusal reads as "answered, badly". */
          setMessages((m) => m.filter((x) => x.id !== asked.id))
          setDraft(question)
          if (typeof result.free_left === 'number') setFreeLeft(result.free_left)
          if (result.rate_paise) setRatePaise(result.rate_paise)
          showToast(result.reason)
          return
        }
        setMessages((m) => [...m, { id: result.id, role: 'model', text: result.text }])
        setFreeLeft(result.free_left)
      } catch (err) {
        setMessages((m) => m.filter((x) => x.id !== asked.id))
        setDraft(question)
        showToast(err.message)
      } finally {
        setThinking(false)
      }
    },
    [draft, thinking, showToast],
  )

  return {
    messages,
    draft,
    setDraft,
    send,
    thinking,
    loading,
    freeLeft,
    ratePaise,
    live,
    starting,
    startMeter,
    stopMeter,
    /* "Out of free, and no clock running" — the one state both renderings
       branch on, computed here so they cannot disagree about it. */
    needsMeter: freeLeft === 0 && !live,
  }
}
