import { useState } from 'react'

import { BackButton, TopBar } from '../components/Chrome.jsx'
import { useNavigate } from 'react-router-dom'
import { isPro } from '../side.js'
import AddMoneySheet from '../components/AddMoneySheet.jsx'
import { markConsultReturn } from '../lib/consultReturn.js'
import { Kicker, PopButton, PopCard } from '../components/Pop.jsx'
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
  const { balance, ledger, toppingUp, t } = useStore()
  // `?add=1` opens Add money straight away (Paywall, Tarot, a call short of
  // balance link here with it).
  const [sheetOpen, setSheetOpen] = useState(() => new URLSearchParams(window.location.search).get('add') === '1')

  /* Opened from the Consult list (14 Oct 2026): back returns to it, and
     Consult reopens the list (lib/consultReturn.js). */
  const fromConsult = new URLSearchParams(window.location.search).get('from') === 'consult'
  const navigate = useNavigate()
  const backToConsult = () => {
    markConsultReturn()
    navigate('/consult', { replace: true })
  }
  const afterTopUp = () => {
    if (fromConsult) backToConsult()
  }

  /* The main app's page is the Wallet statement (14 Oct 2026, Rahul): the
     balance and Add money live on the Consult page's wallet card. The pro
     app keeps the balance card here, since it has no such card. */
  const title = isPro ? t('a.wallet') : 'Wallet statement'

  return (
    <>
      {fromConsult ? (
        <TopBar title={title} left={<BackButton onClick={backToConsult} />} />
      ) : (
        <TopBar title={title} back backTo="/home" />
      )}

      {isPro && (
        <section className="px-5 py-6">
          <PopCard raised className="p-5">
            <p className="caps-sm t-faint">{t('wal.available')}</p>
            <p className="mt-2 font-display text-huge leading-none tnum t-heading">
              {balance === null ? '—' : `₹${rupees(balance)}`}
            </p>
            <p className="mt-3 text-meta t-body">{t('wal.drawn')}</p>
            <div className="mt-6 flex gap-3">
              <PopButton size="sm" variant="gold" disabled={toppingUp} onClick={() => setSheetOpen(true)}>
                {toppingUp ? t('wal.working') : t('a.addMoney')}
              </PopButton>
            </div>
          </PopCard>
        </section>
      )}

      {/* ── Transactions ──────────────────────────────────────────────── */}
      <section className="border-t border-rule px-5 py-6">
        {/* "All" and "Statement" went on 14 Oct 2026: both only toasted that
            they were not built. */}
        <Kicker>{t('wal.recent')}</Kicker>

        <ul className="mt-4">
          {ledger.map((tx) => (
            <li
              key={tx.id}
              className="flex items-center gap-3 border-b border-rule py-3.5 last:border-b-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-meta t-heading">{tx.label}</span>
                <span className="mt-1 block caps-sm t-faint tnum">
                  {tx.date} · {tx.method}
                </span>
              </span>
              <span
                className={`flex-none text-meta tnum ${tx.kind === 'credit' ? 'text-ok' : 't-sub'}`}
              >
                {tx.kind === 'credit' ? '+' : '−'}₹{rupees(tx.amountPaise)}
              </span>
            </li>
          ))}
          {ledger.length === 0 && (
            <li className="py-4 text-meta t-faint">
              {t('wal.empty')}
            </li>
          )}
        </ul>
      </section>

      <section className="border-t border-rule px-5 py-6">
        <p className="text-center text-meta t-faint">
          {t('wal.serverNote')}
        </p>
      </section>

      <div className="h-8" />

      <AddMoneySheet open={sheetOpen} onClose={() => setSheetOpen(false)} onDone={afterTopUp} />
    </>
  )
}
