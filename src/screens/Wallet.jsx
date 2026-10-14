import { useState } from 'react'

import { BackButton, Sheet, TopBar } from '../components/Chrome.jsx'
import { useNavigate } from 'react-router-dom'
import { markConsultReturn } from '../lib/consultReturn.js'
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
  const { balance, ledger, topup, toppingUp, t } = useStore()
  // `?add=1` opens Add money straight away: the Consult page's wallet card
  // links here (14 Oct 2026).
  const [sheetOpen, setSheetOpen] = useState(() => new URLSearchParams(window.location.search).get('add') === '1')
  const [custom, setCustom] = useState('')

  /* Rupees on this screen because that is what the person is typing. It
     becomes paise once, on the way out, and the server re-checks the band —
     this copy of it only exists so the refusal arrives before the card form. */
  const amount = Number(custom)
  const valid = Number.isFinite(amount) && amount >= 100 && amount <= 100000

  /* Opened from the Consult list (14 Oct 2026): back, and a finished top-up,
     return to it, and Consult reopens the list (lib/consultReturn.js). */
  const fromConsult = new URLSearchParams(window.location.search).get('from') === 'consult'
  const navigate = useNavigate()
  const backToConsult = () => {
    markConsultReturn()
    navigate('/consult', { replace: true })
  }

  const add = async (rupeeAmount) => {
    if (await topup(Math.round(rupeeAmount * 100))) {
      setSheetOpen(false)
      setCustom('')
      if (fromConsult) backToConsult()
    }
  }

  return (
    <>
      {fromConsult ? (
        <TopBar title={t('a.wallet')} left={<BackButton onClick={backToConsult} />} />
      ) : (
        <TopBar title={t('a.wallet')} back backTo="/home" />
      )}

      {/* ── Balance ───────────────────────────────────────────────────── */}
      <section className="px-5 py-6">
        <PopCard raised className="p-5">
          <p className="caps-sm t-faint">{t('wal.available')}</p>
          <p className="mt-2 font-display text-huge leading-none tnum t-heading">
            {balance === null ? '—' : `₹${rupees(balance)}`}
          </p>
          <p className="mt-3 text-meta t-body">
            {t('wal.drawn')}
          </p>

          <div className="mt-6 flex gap-3">
            <PopButton
              size="sm"
              variant="gold"
              disabled={toppingUp}
              onClick={() => setSheetOpen(true)}
            >
              {toppingUp ? t('wal.working') : t('a.addMoney')}
            </PopButton>
          </div>
        </PopCard>
      </section>

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
    </>
  )
}
