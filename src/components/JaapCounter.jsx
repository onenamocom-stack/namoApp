import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon.jsx'

/**
 * Mantra jaap counter (22 Oct 2026, Rahul: "people who are chanting mantra
 * can tap and it increase the number. When the total number of mantra
 * completes it sound complete ... modern design, on full screen"). Opened
 * from the card on Bhakti's Mantra shelf.
 *
 * A tap anywhere below the controls counts one, with a short buzz. At the
 * goal the shrine's ghanta rings, the phone buzzes twice, a mala is added and
 * the count starts again. The mantra, goal, count, malas and today's total
 * stay on this phone (`namo:jaap`), so closing the screen loses nothing. The
 * screen is kept awake while it is open.
 */
const KEY = 'namo:jaap'
const GOALS = [11, 21, 51, 108, 1008]
const MANTRAS = [
  'ॐ नमः शिवाय',
  'ॐ नमो भगवते वासुदेवाय',
  'ॐ गं गणपतये नमः',
  'ॐ हं हनुमते नमः',
  'हरे कृष्ण हरे राम',
  'श्री राम जय राम जय जय राम',
  'ॐ श्री महालक्ष्म्यै नमः',
  'णमो अरिहंताणं',
]
const BELL = `${import.meta.env.BASE_URL}puja/ghanta.mp3`
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)

function recall() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}')
    const fresh = s.day === today()
    return {
      mantra: s.mantra || MANTRAS[0],
      goal: GOALS.includes(s.goal) ? s.goal : 108,
      count: Number(s.count) || 0,
      malas: fresh ? Number(s.malas) || 0 : 0,
      total: fresh ? Number(s.total) || 0 : 0,
      day: today(),
    }
  } catch {
    return { mantra: MANTRAS[0], goal: 108, count: 0, malas: 0, total: 0, day: today() }
  }
}

export function JaapCard({ onOpen, hi }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-4 overflow-hidden rounded-3xl p-4 text-left shadow-md transition active:scale-[.98]"
      style={{ background: 'linear-gradient(120deg,#e8731c 0%,#c2410c 55%,#0f766e 120%)' }}
    >
      <span className="flex h-16 w-16 flex-none items-center justify-center rounded-full bg-white/15 ring-2 ring-white/40">
        <Icon name="mala" size={34} weight={1.8} className="text-white" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lead font-semibold leading-tight text-white">
          {hi ? 'मंत्र जाप काउंटर' : 'Mantra jaap counter'}
        </span>
        <span className="mt-1 block text-meta leading-snug text-white/85">
          {hi ? 'टैप करके गिनें · माला पूरी होने पर घंटी' : 'Tap to count · a bell when the mala is done'}
        </span>
      </span>
      <span className="flex-none rounded-full bg-white px-3.5 py-1.5 caps-sm text-[#c2410c] shadow">
        {hi ? 'शुरू' : 'Start'}
      </span>
    </button>
  )
}

export default function JaapCounter({ onClose, hi }) {
  const [s, setS] = useState(recall)
  const [done, setDone] = useState(false)
  const [pulse, setPulse] = useState(0)
  const bell = useRef(null)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
    } catch {
      /* private window: the count lives for this visit */
    }
  }, [s])

  // Keep the screen on while counting; let it go on close.
  useEffect(() => {
    let lock = null
    navigator.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {})
    return () => lock?.release().catch(() => {})
  }, [])

  const tap = useCallback(() => {
    navigator.vibrate?.(12)
    setPulse((p) => p + 1)
    setS((v) => {
      const count = v.count + 1
      if (count < v.goal) return { ...v, count, total: v.total + 1 }
      // The mala is complete: the bell, two buzzes, and the next mala begins.
      const el = bell.current
      if (el) {
        el.currentTime = 0
        el.play().catch(() => {})
      }
      navigator.vibrate?.([90, 70, 90])
      setDone(true)
      setTimeout(() => setDone(false), 2200)
      return { ...v, count: 0, malas: v.malas + 1, total: v.total + 1 }
    })
  }, [])

  const reset = () => {
    if (window.confirm(hi ? 'गिनती शून्य करें?' : 'Reset the count?')) setS((v) => ({ ...v, count: 0 }))
  }

  const R = 132
  const C = 2 * Math.PI * R
  const part = s.count / s.goal

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex select-none flex-col"
      style={{
        background:
          'repeating-linear-gradient(0deg,rgba(120,90,50,.035) 0 2px,transparent 2px 5px),radial-gradient(120% 80% at 50% 30%,#fffaf0 0%,#f6eedf 60%,#ecdfc8 100%)',
        touchAction: 'manipulation',
      }}
    >
      <audio ref={bell} src={BELL} preload="auto" />
      {/* Controls: none of them counts. */}
      <div className="flex items-center justify-between px-4 pt-[max(14px,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} aria-label="Close"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#0f5f58] shadow">
          <Icon name="close" size={20} weight={2.4} />
        </button>
        <span className="text-[17px] font-bold text-[#0f5f58]">{hi ? 'मंत्र जाप' : 'Mantra jaap'}</span>
        <button type="button" onClick={reset} aria-label="Reset"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#c2410c] shadow">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" />
          </svg>
        </button>
      </div>

      <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto px-4">
        {MANTRAS.map((m) => (
          <button key={m} type="button" onClick={() => setS((v) => ({ ...v, mantra: m, count: 0 }))}
            className={`flex-none rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${
              s.mantra === m ? 'bg-[#0f766e] text-white' : 'border border-[#0f766e]/30 bg-white/70 text-[#0f5f58]'
            }`}>
            {m}
          </button>
        ))}
      </div>
      <div className="mt-2.5 flex justify-center gap-2 px-4">
        {GOALS.map((g) => (
          <button key={g} type="button" onClick={() => setS((v) => ({ ...v, goal: g, count: Math.min(v.count, g - 1) }))}
            className={`rounded-full px-3 py-1 text-[13px] font-bold ${
              s.goal === g ? 'bg-[#e8731c] text-white' : 'bg-white/70 text-[#c2410c]'
            }`}>
            {g}
          </button>
        ))}
      </div>

      {/* Everything from here down counts. */}
      <button type="button" onClick={tap} aria-label={hi ? 'एक जाप' : 'Count one'}
        className="relative flex flex-1 flex-col items-center justify-center outline-none">
        <span className="px-6 text-center text-[26px] font-bold leading-snug text-[#c2410c]">{s.mantra}</span>
        <span key={pulse} className="relative mt-6 block h-[300px] w-[300px] animate-[jaap_.18s_ease-out]">
          <svg viewBox="0 0 300 300" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="150" cy="150" r={R} fill="none" stroke="rgba(15,118,110,.15)" strokeWidth="16" />
            <circle cx="150" cy="150" r={R} fill="none" stroke="url(#jg)" strokeWidth="16" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - part)} style={{ transition: 'stroke-dashoffset .2s' }} />
            <defs>
              <linearGradient id="jg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#ff9a3c" />
                <stop offset="1" stopColor="#e8731c" />
              </linearGradient>
            </defs>
          </svg>
          <span className="absolute inset-[30px] flex flex-col items-center justify-center rounded-full bg-white shadow-[0_14px_40px_rgba(194,65,12,.18),inset_0_0_0_2px_rgba(232,115,28,.25)]">
            <span className="text-[86px] font-bold leading-none tabular-nums text-[#3a2412]">{s.count}</span>
            <span className="mt-1 text-[18px] font-semibold text-[#0f5f58]">/ {s.goal}</span>
          </span>
        </span>
        <span className="mt-7 flex gap-6 text-[15px] font-semibold">
          <span className="rounded-full bg-[#3f8f3a]/10 px-4 py-1.5 text-[#2f6f2b]">
            {hi ? 'माला' : 'Malas'}: {s.malas}
          </span>
          <span className="rounded-full bg-[#0f766e]/10 px-4 py-1.5 text-[#0f5f58]">
            {hi ? 'आज कुल' : 'Today'}: {s.total}
          </span>
        </span>
        <span className="mt-5 text-[13px] text-[#7a5a3a]">{hi ? 'स्क्रीन पर कहीं भी टैप करें' : 'Tap anywhere on the screen'}</span>
        {done && (
          <span className="pointer-events-none absolute inset-x-6 top-1/3 animate-pop-in rounded-3xl bg-[#0f766e] px-6 py-5 text-center text-white shadow-xl">
            <span className="block text-[30px] font-bold">{hi ? 'माला पूर्ण' : 'Mala complete'}</span>
            <span className="mt-1 block text-[15px] opacity-90">{s.goal} {hi ? 'जाप पूरे हुए' : 'chants done'}</span>
          </span>
        )}
      </button>
      <style>{'@keyframes jaap{0%{transform:scale(.96)}100%{transform:scale(1)}}'}</style>
    </div>,
    document.body,
  )
}
