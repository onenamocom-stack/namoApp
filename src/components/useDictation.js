import { useCallback, useEffect, useRef, useState } from 'react'

/* The browser's own speech-to-text (Chrome, and so the Android app). Absent
   elsewhere, and then the mic button is not shown. Nothing is uploaded by
   this code; the browser does the listening. */
const Recognition =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined

export const canDictate = Boolean(Recognition)

/**
 * Speak a reply instead of typing it (21 Oct 2026, Rahul: "In pro chat, if
 * pro can reply by speaking which convert to text and than send to
 * seeker"). `start(base)` listens in `lang` ('hi-IN' or 'en-IN') and calls
 * `onText` with `base` plus what has been said so far, words still being
 * heard included; `stop()` ends it. It also ends by itself after a pause.
 * The text lands in the box and is sent only when Send is pressed.
 */
export default function useDictation({ lang, onText, onError }) {
  const [listening, setListening] = useState(false)
  const rec = useRef(null)
  const said = useRef({ base: '', final: '' })
  const cb = useRef({ onText, onError })
  cb.current = { onText, onError }

  const stop = useCallback(() => {
    rec.current?.stop()
  }, [])

  const start = useCallback(
    (base = '') => {
      if (!Recognition || rec.current) return
      const r = new Recognition()
      r.lang = lang
      r.interimResults = true
      r.continuous = true
      said.current = { base: base.trim(), final: '' }
      r.onresult = (e) => {
        let interim = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const words = e.results[i][0].transcript
          if (e.results[i].isFinal) said.current.final += words
          else interim += words
        }
        const text = [said.current.base, (said.current.final + interim).trim()].filter(Boolean).join(' ')
        cb.current.onText(text)
      }
      r.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          cb.current.onError?.('Allow the microphone to speak a reply.')
        } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
          cb.current.onError?.('Could not hear that. Try again.')
        }
      }
      r.onend = () => {
        rec.current = null
        setListening(false)
      }
      rec.current = r
      setListening(true)
      try {
        r.start()
      } catch {
        rec.current = null
        setListening(false)
      }
    },
    [lang],
  )

  // Leaving the chat stops listening.
  useEffect(() => () => rec.current?.abort(), [])

  return { listening, start, stop }
}
