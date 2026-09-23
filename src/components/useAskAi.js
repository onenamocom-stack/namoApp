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

import { useCallback, useEffect, useState } from 'react'
import { ask, fetchState } from '../lib/ai.js'
import { useStore } from '../store.jsx'
import { track } from '../lib/analytics.js'

export default function useAskAi() {
  const { showToast, refreshWallet, session } = useStore()

  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const [loading, setLoading] = useState(true)
  const [freeLeft, setFreeLeft] = useState(null)
  const [pricePaise, setPricePaise] = useState(null)
  /* Whose chart the conversation is about. null is the seeker's own.
     Held HERE and nowhere else — the server computes a chart from it and
     writes none of it down, so a reload loses it, deliberately. */
  const [subject, setSubject] = useState(null)
  /* null = not chosen yet, 'self' | 'other'. The choice is asked once per
     conversation rather than on every open: a question is a thought, and
     a modal in front of every one of them is a tax on thinking. */
  const [who, setWho] = useState(null)
  const [asking, setAsking] = useState(false) // the form is open

  /* Nothing to settle on the way out any more. The per-minute meter kept
     a clock running that a closed tab would have left spending, so it had
     to be ended with a keepalive fetch. Per question, a closed tab owes
     nothing. */

  useEffect(() => {
    let active = true
    fetchState()
      .then((state) => {
        if (!active) return
        setMessages(state.messages ?? [])
        setFreeLeft(state.free_left)
        setPricePaise(state.price_paise)
      })
      .catch((err) => console.error('[ai] state failed:', err.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const send = useCallback(
    async (text) => {
      const question = (text ?? draft).trim()
      if (!question || thinking) return

      const asked = { id: `u${Date.now()}`, role: 'user', text: question }
      setMessages((m) => [...m, asked])
      setDraft('')
      setThinking(true)
      try {
        const result = await ask(question, subject)
        if (!result.ok) {
          /* The question goes back in the box rather than staying in the
             transcript: it was not asked, and leaving it on screen above a
             refusal reads as "answered, badly". */
          setMessages((m) => m.filter((x) => x.id !== asked.id))
          setDraft(question)
          if (typeof result.free_left === 'number') setFreeLeft(result.free_left)
          if (result.price_paise) setPricePaise(result.price_paise)
          showToast(result.reason)
          return
        }
        setMessages((m) => [...m, { id: result.id, role: 'model', text: result.text }])
        setFreeLeft(result.free_left)
        /* The debit happened server-side. Refresh so the wallet figure on
           screen is not one question behind. */
        if (result.charged_paise) refreshWallet(session?.user?.id)
        /* Whether it was free or paid, and whether it was about somebody
           else — three flags, no question text. What people ASK is theirs;
           how often the feature is used is ours to know. */
        track('ai_question', { paid: Boolean(result.charged_paise), about_other: Boolean(subject) })
      } catch (err) {
        setMessages((m) => m.filter((x) => x.id !== asked.id))
        setDraft(question)
        showToast(err.message)
      } finally {
        setThinking(false)
      }
    },
    [draft, thinking, showToast, subject, refreshWallet, session],
  )

  /* Switching subject mid-conversation. The transcript stays — it is the
     same conversation, and the model is told whose chart each question is
     about every time rather than once. */
  const askAbout = useCallback((next) => {
    track('ai_subject_chosen', { about_other: Boolean(next) })
    setSubject(next)
    setWho(next ? 'other' : 'self')
    setAsking(false)
  }, [])

  return {
    who,
    setWho,
    subject,
    asking,
    setAsking,
    askAbout,
    messages,
    draft,
    setDraft,
    send,
    thinking,
    loading,
    freeLeft,
    pricePaise,
    /* Out of free ones. Both renderings branch on this, computed here so
       they cannot disagree about it. Asking still works — it just costs
       now — so this is a PRICE notice, not a lock. */
    outOfFree: freeLeft === 0,
  }
}
