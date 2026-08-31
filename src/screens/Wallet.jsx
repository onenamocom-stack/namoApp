import { useState } from 'react'

import { Sheet, TopBar } from '../components/Chrome.jsx'
import { Kicker, PopButton, PopCard } from '../components/Pop.jsx'
import { topUpAmounts } from '../data/mock.js'
import { rupees, useStore } from '../store.jsx'

/**
 * Wallet.
 *
 * The balance card is the one raised object on the screen — it is the thing
 * the screen is about, so it gets the offset block and everything else stays
 * flat.
 *
 * Since phase 2 the balance and the history are real, read back from the
 * server. Since phase 3 so is adding to it: the sheet below opens a Razorpay
 * order and hands off to their checkout, and the money appears when the
 * webhook lands — not when this screen says so. Nothing here credits anything.
 *
 * The "+2% cashback" label that used to sit on the larger presets is gone and
 * stays gone (docs/01-PRD.md §4.8). It was never applied, and an unimplemented
 * discount promise must not be on screen the day real money starts moving.
 */
export default function Wallet() {
  const { balance, ledger, showToast, topup, toppingUp } = useStore()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [custom, setCustom] = useState('')

  /* Rupees on this screen because that is what the person is typing. It
     becomes paise once, on the way out, and the server re-checks the band —
     this copy of it only exists so the refusal arrives before the card form. */
  const amount = Number(custom)
  const valid = Number.isFinite(amount) && amount >= 100 && amount <= 100000

  const add = async (rupeeAmount) => {
    if (await topup(Math.round(rupeeAmount * 100))) {
      setSheetOpen(false)
      setCustom('')
    }
  }

  return (
    <>
      <TopBar title="Wallet" back backTo="/profile" />

      {/* ── Balance ───────────────────────────────────────────────────── */}
      <section className="px-5 py-6">
        <PopCard raised className="p-5">
          <p className="caps-sm t-faint">Available balance</p>
          <p className="mt-2 font-display text-huge leading-none tnum t-heading">
            {balance === null ? '—' : `₹${rupees(balance)}`}
          </p>
          <p className="mt-3 text-meta t-body">
            Sessions, question packs and course fees are drawn from here.
          </p>

          <div className="mt-6 flex gap-3">
            <PopButton
              size="sm"
              variant="gold"
              disabled={toppingUp}
              onClick={() => setSheetOpen(true)}
            >
              {toppingUp ? 'Working…' : 'Add money'}
            </PopButton>
            <PopButton onClick={() => showToast('Statement — not built yet')}>
              Statement
            </PopButton>
          </div>
        </PopCard>
      </section>

      {/* ── Transactions ──────────────────────────────────────────────── */}
      <section className="border-t border-rule px-5 py-6">
        <Kicker action="All" onAction={() => showToast('Full history — not built yet')}>
          Recent transactions
        </Kicker>

        <ul className="mt-4">
          {ledger.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 border-b border-rule py-3.5 last:border-b-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-meta t-heading">{t.label}</span>
                <span className="mt-1 block caps-sm t-faint tnum">
                  {t.date} · {t.method}
                </span>
              </span>
              <span
                className={`flex-none text-meta tnum ${t.kind === 'credit' ? 'text-ok' : 't-sub'}`}
              >
                {t.kind === 'credit' ? '+' : '−'}₹{rupees(t.amountPaise)}
              </span>
            </li>
          ))}
          {ledger.length === 0 && (
            <li className="py-4 text-meta t-faint">
              Nothing has moved through this wallet yet.
            </li>
          )}
        </ul>
      </section>

      <section className="border-t border-rule px-5 py-6">
        <p className="text-center text-meta t-faint">
          Every figure here is the server's. The balance is a sum of the
          entries below it, and neither can be edited from this device.
        </p>
      </section>

      <div className="h-8" />

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Add money">
        <div className="grid grid-cols-2 gap-3">
          {topUpAmounts.map((a) => (
            <PopButton key={a} disabled={toppingUp} onClick={() => add(a)}>
              ₹{a.toLocaleString('en-IN')}
            </PopButton>
          ))}
        </div>

        <p className="mt-7 caps-sm t-faint">Or another amount</p>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-body t-heading">₹</span>
          <input
            type="number"
            inputMode="numeric"
            min="100"
            max="100000"
            placeholder="100 to 1,00,000"
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
          {toppingUp ? 'Opening checkout…' : 'Continue'}
        </PopButton>

        <p className="mt-5 text-meta t-faint">
          Payment is handled by Razorpay. Your balance updates when they confirm
          it, which is a moment after you pay.
        </p>
      </Sheet>
    </>
  )
}
