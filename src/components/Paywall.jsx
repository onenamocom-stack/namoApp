import { useState } from 'react'
import { PopButton, PopCard } from './Pop.jsx'
import { buy } from '../lib/wallet.js'
import { rupees, useStore } from '../store.jsx'

/**
 * Something the wallet can unlock, offered in place of it (30 Sep 2026):
 * a month of predictions, a muhurat judged against your chart, an e-book.
 *
 * The price arrives from the server — on the 402 refusal, or from
 * `entitlement()` — and this never states one of its own. `onBought` runs
 * after the wallet has been charged and the thing granted, so the caller
 * refetches whatever was refused.
 */
export default function Paywall({ title, note, sku, refKey = '', pricePaise, onBought, className = '' }) {
  const { session, showToast, refreshWallet } = useStore()
  const [busy, setBusy] = useState(false)
  const [short, setShort] = useState(false)

  const unlock = async () => {
    setBusy(true)
    const res = await buy(sku, refKey)
    setBusy(false)
    if (!res.ok) {
      showToast(res.reason)
      setShort(res.balance_paise !== undefined)
      return
    }
    refreshWallet(session?.user?.id)
    showToast(res.already ? 'Already yours' : 'Unlocked')
    onBought?.()
  }

  return (
    <PopCard raised className={`p-5 text-center ${className}`}>
      <p className="caps t-heading">{title}</p>
      {note && <p className="mt-2 text-meta t-body">{note}</p>}
      <PopButton variant="gold" className="mt-5" disabled={busy || !pricePaise} onClick={unlock}>
        {busy ? '…' : pricePaise ? `Unlock · ₹${rupees(pricePaise)}` : 'Unlock'}
      </PopButton>
      {short && (
        <PopButton variant="ghost" to="/wallet" className="mt-3">
          Add money
        </PopButton>
      )}
    </PopCard>
  )
}
