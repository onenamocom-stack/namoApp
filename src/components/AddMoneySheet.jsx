import { useState } from 'react'
import { Sheet } from './Chrome.jsx'
import { PopButton } from './Pop.jsx'
import { topUpAmounts } from '../data/mock.js'
import { useStore } from '../store.jsx'

/**
 * Add money: the amounts, your own amount, and PhonePe (lifted out of the
 * wallet page on 14 Oct 2026 so the Consult page's wallet card opens it in
 * place — Rahul: after a recharge you stay where you were). `onDone` runs
 * after a payment that went through.
 */
export default function AddMoneySheet({ open, onClose, onDone }) {
  const { topup, toppingUp, t } = useStore()
  const [custom, setCustom] = useState('')
  const sheetOpen = open
  const setSheetOpen = (v) => !v && onClose()

  /* Rupees here because that is what the person is typing. It becomes paise
     once, on the way out, and the server re-checks the band. */
  const amount = Number(custom)
  const valid = Number.isFinite(amount) && amount >= 100 && amount <= 100000

  const add = async (rupeeAmount) => {
    if (await topup(Math.round(rupeeAmount * 100))) {
      setCustom('')
      onClose()
      onDone?.()
    }
  }

  return (
    <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={t('a.addMoney')}>
      <div className="grid grid-cols-2 gap-3">
        {topUpAmounts.map((a) => (
          <PopButton key={a} disabled={toppingUp} onClick={() => add(a)}>
            ₹{a.toLocaleString('en-IN')}
          </PopButton>
        ))}
      </div>

      <p className="mt-7 caps-sm t-faint">{t('wal.other')}</p>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-body t-heading">₹</span>
        <input
          type="number"
          inputMode="numeric"
          min="100"
          max="100000"
          placeholder={t('wal.range')}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          className="w-full rounded-lg border border-stroke bg-surface px-3 py-2 text-body tnum placeholder-t-faint focus:border-ink focus:outline-none"
        />
      </div>

      <PopButton
        variant="gold"
        className="mt-4 w-full"
        disabled={!valid || toppingUp}
        onClick={() => add(amount)}
      >
        {toppingUp ? t('wal.opening') : t('wal.continue')}
      </PopButton>

      <p className="mt-5 text-meta t-faint">
        {t('wal.razorpay')}
      </p>
    </Sheet>
  )
}
