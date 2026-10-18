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
 * The modules' cards (docs/06 Phase 18, Rahul 16 Oct 2026). Since the same
 * day they live in Studio (the Dashboard until 17 Oct; Rahul: "Is page ko
 * dashboard me he merge kar do"), which shows a section for each module and
 * this card, with its request, for each one not held; `/earn` redirects
 * there. Content has its own card with two steps (`ContentCard`, 17 Oct
 * 2026); Pro and Seller use `ModuleCard`. Seller asks a few questions here;
 * Pro is the consultant application (`/earn/pro`). The blue tick is a Pro's
 * and Content step 2's only (17 Oct 2026, Rahul).
 */
export const CARDS = [
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
        Ways to earn. Ask for any of them; the team approves each. A Pro carries the blue tick{' '}
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

/** A module's card. On the Dashboard a held module's links go inside it
 *  (`children`), so held and not held look the same (16 Oct 2026, Rahul). */
export function ModuleCard({ card, state, questions, open, onOpen, onSent, inDashboard = false, children = null }) {
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
      {state.held && children && <div className="border-t border-rule px-4 pb-1">{children}</div>}
      {state.held && !inDashboard && (
        <Link to="/studio" className="block border-t border-rule px-4 py-3 text-center text-micro font-semibold t-heading">
          Open Studio →
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

/** One condition's bar (Rahul, 17 Oct 2026: "completion bar, like YT"):
 *  what it needs, what you have. */
function ConditionBar({ row }) {
  const share = Math.min(1, row.need ? row.have / row.need : 0)
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-micro">
        <span className="t-body">{row.label}</span>
        <span className="tabular-nums font-semibold t-heading">
          {row.have.toLocaleString('en-IN')} / {row.need.toLocaleString('en-IN')}
        </span>
      </div>
      {/* One quiet colour, full when met (17 Oct 2026, Rahul: orange and
          green were too much). */}
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface2">
        <div className="h-full rounded-full bg-ink/70" style={{ width: `${share * 100}%` }} />
      </div>
    </li>
  )
}

/** A step's conditions as bars. */
export function StepBars({ step }) {
  if (!step) return null
  return <ul className="mt-3 space-y-2.5">{step.conditions.map((r) => <ConditionBar key={r.key} row={r} />)}</ul>
}

/**
 * The Content card (Rahul, 17 Oct 2026; docs/01 §12): two steps.
 * Step 1 (100 followers, 10 videos, 30 days) is yours the moment you ask
 * with all three met: tags, product links and your invite code earn.
 * Step 2 (500 followers, and 3 videos and 1,00,000 views in 90 days)
 * opens the request; the team approves it, and your views earn too.
 * `asks` is `myModules()`: modules, progress, questions. `children` are
 * the links once step 1 is held.
 */
export function ContentCard({ asks, onChanged, children = null }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [asking, setAsking] = useState(false)
  const { showToast } = useStore()
  const one = asks.modules.referrer
  const two = asks.modules.creator
  const progress = asks.progress
  const req = two.request

  const startOne = async () => {
    setBusy(true)
    setError('')
    try {
      await askModule('referrer', {})
      showToast('Step 1 is yours. Tag products and share your links.')
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const badge = two.held ? 'Step 2' : one.held ? 'Step 1' : null

  return (
    <li className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-rule">
      <div className="flex gap-3.5 p-4">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-gradient-to-br from-[var(--orange-hi)] to-[var(--orange-lo)] text-white shadow">
          <Icon name="play" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lead font-semibold t-heading">Content</p>
            {badge && <span className="rounded-full bg-surface2 px-2 py-0.5 text-[11px] font-semibold t-heading">{badge}</span>}
          </div>
          <p className="mt-1 text-meta t-body">
            Post, tag products and share your invite code. Step 1 earns on referrals. Step 2 earns on your views too.
          </p>
        </div>
      </div>

      {!one.held && (
        <div className="border-t border-rule px-4 py-3">
          <p className="text-meta font-semibold t-heading">Step 1 · Earn on referrals</p>
          <StepBars step={progress.step1} />
          {error && <p className="mt-3 text-micro text-live">{error}</p>}
          {progress.step1.met ? (
            <PopButton size="sm" className="mt-3" disabled={busy} onClick={startOne}>
              {busy ? 'Starting…' : 'Start step 1'}
            </PopButton>
          ) : (
            <p className="mt-3 text-micro t-sub">Meet all three and step 1 opens at once. No approval needed.</p>
          )}
        </div>
      )}

      {one.held && children && <div className="border-t border-rule px-4 pb-1">{children}</div>}

      {!two.held && (
        <div className={`border-t border-rule px-4 py-3 ${one.held ? '' : 'opacity-60'}`}>
          <p className="text-meta font-semibold t-heading">Step 2 · Earn on your views</p>
          <StepBars step={progress.step2} />
          {!one.held ? (
            <p className="mt-3 text-micro t-sub">Opens after step 1.</p>
          ) : req?.status === 'pending' ? (
            <p className="mt-3 rounded-xl bg-surface2 px-3 py-2 text-micro t-body">Sent. The team is looking at it.</p>
          ) : !progress.step2.met ? (
            <p className="mt-3 text-micro t-sub">Meet all three, then apply. The team approves it.</p>
          ) : asking ? (
            <div className="mt-3">
              <AskForm module="creator" questions={asks.questions.creator} onSent={() => {
                setAsking(false)
                showToast('Sent. The team will look at it.')
                onChanged()
              }} />
            </div>
          ) : (
            <>
              {req?.status === 'rejected' && req.note && (
                <p className="mt-3 rounded-xl bg-surface2 px-3 py-2 text-micro t-body">
                  <span className="font-semibold text-live">Team: </span>
                  {req.note}
                </p>
              )}
              <PopButton size="sm" className="mt-3" onClick={() => setAsking(true)}>
                {req ? 'Apply again' : 'Apply for step 2'}
              </PopButton>
            </>
          )}
        </div>
      )}
    </li>
  )
}
