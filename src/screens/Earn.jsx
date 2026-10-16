import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import { Loader } from '../components/Cosmos.jsx'
import Icon from '../components/Icon.jsx'
import { PopButton } from '../components/Pop.jsx'
import VerifiedMark from '../components/VerifiedMark.jsx'
import { askModule, myModules } from '../lib/profile.js'
import { useStore } from '../store.jsx'

/**
 * The three modules' cards (docs/06 Phase 18, Rahul 16 Oct 2026). Since the
 * same day they live on the Dashboard (Rahul: "Is page ko dashboard me he
 * merge kar do"), which shows a section for each module held and this card,
 * with its request, for each one not held; `/earn` redirects there.
 *
 * Earn on Namo (docs/06 Phase 18, Rahul 16 Oct 2026): the three modules —
 * Creator, Pro, Seller — which you hold, and a request for the others. Each
 * is approved by the team; anybody holding any module carries the blue
 * tick. Creator and Seller ask a few questions here; Pro is the consultant
 * application (`/earn/pro`).
 */
export const CARDS = [
  {
    key: 'creator',
    title: 'Creator',
    icon: 'play',
    line: 'Post reels and videos, tag products, and earn on your views and on what sells through your tags.',
  },
  {
    key: 'pro',
    title: 'Pro',
    icon: 'phone',
    line: 'Give readings and advice on chat and calls, and take bookings. You set your price.',
  },
  {
    key: 'seller',
    title: 'Seller',
    icon: 'cart',
    line: 'Sell downloads, courses, events and products on the Market.',
  },
]

export default function Earn() {
  const { showToast } = useStore()
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(null)

  const load = () => {
    setFailed(false)
    myModules()
      .then(setData)
      .catch(() => setFailed(true))
  }
  useEffect(load, [])

  return (
    <>
      <TopBar title="Earn on Namo" back backTo="/profile/settings" />
      <p className="px-5 pt-5 text-meta t-body">
        Three ways to earn. Ask for any of them; the team approves each. Anybody holding one carries the blue tick{' '}
        <VerifiedMark size={14} className="align-[-2px]" />.
      </p>

      {failed ? (
        <p className="px-5 py-10 text-meta t-body">Could not load this. Open the page again.</p>
      ) : !data ? (
        <Loader />
      ) : (
        <ul className="space-y-3 px-5 pb-16 pt-5">
          {CARDS.map((c) => (
            <ModuleCard
              key={c.key}
              card={c}
              state={data.modules[c.key]}
              questions={data.questions[c.key]}
              open={open === c.key}
              onOpen={() => setOpen(open === c.key ? null : c.key)}
              onSent={() => {
                setOpen(null)
                showToast('Sent. The team will look at it.')
                load()
              }}
            />
          ))}
        </ul>
      )}
    </>
  )
}

export function ModuleCard({ card, state, questions, open, onOpen, onSent, inDashboard = false }) {
  const req = state.request
  const badge = state.held
    ? ['You have this', 'bg-ok text-white']
    : req?.status === 'pending'
      ? ['Waiting for approval', 'bg-surface2 t-sub']
      : req?.status === 'rejected'
        ? ['Not approved', 'bg-live/10 text-live']
        : null

  return (
    <li className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-rule">
      <div className="flex gap-3.5 p-4">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-gradient-to-br from-[var(--orange-hi)] to-[var(--orange-lo)] text-white shadow">
          <Icon name={card.icon} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lead font-semibold t-heading">{card.title}</p>
            {badge && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge[1]}`}>{badge[0]}</span>}
          </div>
          <p className="mt-1 text-meta t-body">{card.line}</p>
          {req?.status === 'rejected' && req.note && (
            <p className="mt-2 rounded-xl bg-surface2 px-3 py-2 text-micro t-body">
              <span className="font-semibold text-live">Team: </span>
              {req.note}
            </p>
          )}
        </div>
      </div>

      {!state.held && req?.status !== 'pending' && (
        <div className="border-t border-rule px-4 py-3">
          {card.key === 'pro' ? (
            <PopButton size="sm" to="/earn/pro">
              {req ? 'Apply again' : 'Apply to be a Pro'}
            </PopButton>
          ) : open ? (
            <AskForm module={card.key} questions={questions} onSent={onSent} />
          ) : (
            <PopButton size="sm" onClick={onOpen}>
              {req ? 'Ask again' : `Ask to be a ${card.title}`}
            </PopButton>
          )}
        </div>
      )}
      {state.held && !inDashboard && (
        <Link to="/dashboard" className="block border-t border-rule px-4 py-3 text-center text-micro font-semibold t-heading">
          Open Dashboard →
        </Link>
      )}
    </li>
  )
}

function AskForm({ module, questions, onSent }) {
  const [answers, setAnswers] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ready = questions.every((q) => !q.required || (answers[q.key] || '').trim())

  const send = async () => {
    setBusy(true)
    setError('')
    try {
      await askModule(module, answers)
      onSent()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {questions.map((q) => (
        <label key={q.key} className="block">
          <span className="text-micro font-semibold t-sub">
            {q.label}
            {q.required && <span className="text-live"> *</span>}
          </span>
          <input
            value={answers[q.key] ?? ''}
            onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
            maxLength={300}
            className="mt-1 w-full rounded-xl border border-rule bg-white px-3 py-2.5 text-meta t-heading outline-none focus:border-[var(--orange-lo)]"
          />
        </label>
      ))}
      {error && <p className="text-micro text-live">{error}</p>}
      <PopButton size="sm" disabled={!ready || busy} onClick={send}>
        {busy ? 'Sending…' : 'Send for approval'}
      </PopButton>
    </div>
  )
}
