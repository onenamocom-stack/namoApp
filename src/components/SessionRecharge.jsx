import { useEffect, useState } from 'react'
import { extendSession } from '../lib/chat.js'
import { rupees, useStore } from '../store.jsx'

/**
 * Recharge without leaving the conversation (7 Oct 2026, owner).
 *
 * The seeker sees it in two moments. In the last minute a bar says how long
 * is left and offers a recharge; the new minutes run straight on. When the
 * money runs out the session PAUSES instead of ending — silent, not billed —
 * for two minutes, and this asks them to recharge. Nothing, and it ends at
 * the moment the money ran out. Either person may end it sooner.
 *
 * The consultant sees only the pause, and that they are waiting.
 *
 * `secondsLeft` and `resumeBy` are the server's; the countdown here is the
 * display of them, and the server settles whether this screen is open or not.
 */
export default function SessionRecharge({
  sessionId, seeker, secondsLeft, resumeBy, rate, other, onExtended, onEnd, dark = false,
}) {
  const { topup, balance, showToast, refreshWallet, session } = useStore()
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  const paused = resumeBy != null && secondsLeft === 0
  useEffect(() => {
    if (!paused) return undefined
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [paused])

  const low = !paused && secondsLeft != null && secondsLeft > 0 && secondsLeft <= 60
  if (!paused && !(seeker && (low || open))) return null

  const pauseLeft = paused ? Math.max(0, Math.round((new Date(resumeBy).getTime() - now) / 1000)) : 0
  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const amounts = choices(rate)
  const amount = amounts[Math.min(pick, amounts.length - 1)]
  const canUseWallet = rate && (balance ?? 0) >= rate

  /* Pay first, then hold. The credit lands by Razorpay's webhook on another
     connection, so the hold is asked for a few times while it arrives. */
  const recharge = async (paise) => {
    if (busy) return
    setBusy(true)
    try {
      if (paise > 0 && !(await topup(paise))) return
      for (let i = 0; i < 6; i++) {
        const res = await extendSession(sessionId)
        if (res?.ok) {
          setOpen(false)
          refreshWallet(session?.user?.id)
          showToast(`${res.minutes_added} min added. Carry on.`)
          onExtended(res)
          return
        }
        if (!/balance/i.test(res?.reason ?? '')) {
          showToast(res?.reason ?? 'Could not add the minutes.')
          return
        }
        await new Promise((r) => setTimeout(r, 2000))
      }
      showToast('The payment is still settling. Tap Continue in a moment.')
    } finally {
      setBusy(false)
    }
  }

  const tone = dark
    ? 'bg-black/80 text-white backdrop-blur-sm'
    : 'border-b border-rule bg-gold-fill/15 text-t1'
  const faint = dark ? 'text-white/65' : 't-faint'

  /* The consultant, paused: they wait, and may end it. */
  if (paused && !seeker) {
    return (
      <div className={`px-4 py-3 ${tone}`}>
        <p className="text-meta font-semibold">Paused. {other || 'They'} ran out of balance.</p>
        <p className={`mt-1 text-micro ${faint}`}>
          Waiting for them to recharge. The session ends in {mmss(pauseLeft)} if they do not.
          This time is not billed.
        </p>
        {onEnd && (
          <button type="button" onClick={onEnd} className="mt-2 caps-sm text-bad">
            End session
          </button>
        )}
      </div>
    )
  }

  /* The seeker's last minute: one line, and the recharge behind a tap. */
  if (low && !open) {
    return (
      <div className={`flex items-center justify-between gap-3 px-4 py-2 ${tone}`}>
        <span className="text-micro font-semibold tnum">
          {mmss(secondsLeft)} left. Recharge to keep talking.
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex-none rounded-full bg-ok px-3 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-white"
        >
          Recharge
        </button>
      </div>
    )
  }

  return (
    <div className={`px-4 py-4 ${tone}`}>
      {paused ? (
        <>
          <p className="text-meta font-semibold">Your balance has run out.</p>
          <p className={`mt-1 text-micro ${faint}`}>
            If you want to continue talking, please recharge your wallet. The session is
            paused and ends in <span className="tnum font-semibold">{mmss(pauseLeft)}</span>.
            The pause is not billed.
          </p>
        </>
      ) : (
        <p className="text-meta font-semibold">Add money and keep talking.</p>
      )}

      <div className="mt-3 flex gap-2">
        {amounts.map((a, i) => (
          <button
            key={a}
            type="button"
            onClick={() => setPick(i)}
            className={`flex-1 rounded-xl border px-2 py-2 text-center ${
              i === pick ? 'border-ok bg-ok/15' : dark ? 'border-white/25' : 'border-rule'
            }`}
          >
            <span className="block text-meta font-semibold tnum">₹{a / 100}</span>
            {rate ? (
              <span className={`block text-[10px] ${faint}`}>{Math.floor(a / rate)} min</span>
            ) : null}
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => recharge(amount)}
        className="mt-3 w-full rounded-full bg-ok py-2.5 text-[12px] font-bold uppercase tracking-[0.06em] text-white disabled:opacity-60"
      >
        {busy ? 'Adding…' : `Recharge ₹${amount / 100}`}
      </button>

      <div className="mt-2 flex items-center justify-between">
        {canUseWallet ? (
          <button type="button" disabled={busy} onClick={() => recharge(0)} className={`caps-sm ${faint} underline`}>
            Continue with wallet ₹{rupees(balance)}
          </button>
        ) : <span />}
        {paused && onEnd ? (
          <button type="button" onClick={onEnd} className="caps-sm text-bad">
            End session
          </button>
        ) : !paused ? (
          <button type="button" onClick={() => setOpen(false)} className={`caps-sm ${faint}`}>
            Not now
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** Three amounts in paise: about 5, 10 and 20 minutes at this rate, rounded
 *  up to ₹50, never under the ₹100 a top-up must be. */
function choices(rate) {
  const out = []
  for (const m of [5, 10, 20]) {
    const paise = rate ? Math.max(10_000, Math.ceil((rate * m) / 5_000) * 5_000) : [10_000, 20_000, 50_000][out.length]
    if (!out.includes(paise)) out.push(Math.min(paise, 10_000_000))
  }
  return out
}
