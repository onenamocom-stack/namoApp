import { Link, Navigate } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import { Loader } from '../components/Cosmos.jsx'
import Icon from '../components/Icon.jsx'
import { Kicker, PopCard } from '../components/Pop.jsx'
import { Field, Row } from '../components/Primitives.jsx'
import { RatesSheet } from '../pro/ProProfile.jsx'
import { RATE_FIELDS } from '../components/RateFields.jsx'
import { useEffect, useState } from 'react'
import { rupees, useStore } from '../store.jsx'
import { earningsSummary } from '../lib/consultants.js'
import { earningsPeriod } from '../lib/market.js'
import { contentEarnings } from '../lib/content.js'
import { myModules } from '../lib/profile.js'
import { CARDS, ContentCard, ModuleCard } from './Earn.jsx'

/**
 * Studio (Rahul, 17 Oct 2026; Dashboard, `/dashboard`, from 14 Oct): the
 * screens of whoever holds a module, inside the main app, at `/studio/...`.
 * Since 16 Oct 2026 (Rahul) it is this month's earnings on top, then a
 * section per module — Content (two steps, 17 Oct), Market (Seller),
 * Consulting (Pro) — and one Payout
 * details last: everything is paid together on the 7th. No Studio (14 Oct 2026, Rahul): posting is
 * Home's +, where a Pro and a Creator also get video. Calls are not here: they ring only in
 * Namo Consult (`/desk`) and in the pro app.
 *
 * Everybody signed in sees all three (16 Oct 2026, Rahul: "Sab ko tino
 * dikha do"): a module not held is its card from Earn on Namo, with the
 * request to hold it. Signed out goes to Profile.
 */
/** The modules this person holds (docs/06 Phase 18, 16 Oct 2026): `pro` a
 *  consultant row (pending shows as under review), `referrer` Content step
 *  1, `creator` Content step 2 (which includes step 1), `seller` the
 *  Seller module. 'loading' while they are read. */
export function useModules() {
  const { session, sessionReady, consultant, consultantLoading, profile, profileLoading } = useStore()
  if (!sessionReady || (session && (consultantLoading || profileLoading))) return 'loading'
  return {
    pro: Boolean(consultant),
    referrer: Boolean(profile?.referrer || profile?.influencer),
    creator: Boolean(profile?.influencer),
    seller: Boolean(profile?.seller),
  }
}

/** 'pro', 'member' (a Creator or a Seller), null (a Seeker), or 'loading'. */
export function useDashboardRole() {
  const m = useModules()
  if (m === 'loading') return 'loading'
  if (m.pro) return 'pro'
  if (m.referrer || m.seller) return 'member'
  return null
}

/** Wraps a Studio route: `need` is a module — 'pro', 'referrer',
 *  'creator', 'seller' — or 'any' (any of them). */
export function DashboardGate({ need = 'any', children }) {
  const m = useModules()
  if (m === 'loading') return <Loader />
  const ok = need === 'any' ? m.pro || m.referrer || m.seller : m[need]
  if (!ok) return <Navigate to="/profile" replace />
  return children
}

export default function Dashboard() {
  const m = useModules()
  const { consultant, session, showToast, refreshProfile } = useStore()
  const [rating, setRating] = useState(false)
  // The modules' requests and questions, for the cards of those not held.
  const [asks, setAsks] = useState(null)
  const [open, setOpen] = useState(null)
  const signedIn = Boolean(session)

  const loadAsks = () => {
    myModules()
      .then(setAsks)
      .catch(() => setAsks(false))
  }
  useEffect(() => {
    if (signedIn) loadAsks()
  }, [signedIn])

  if (m === 'loading') return <Loader />
  if (!signedIn) return <Navigate to="/profile" replace />
  const pro = m.pro
  const any = m.pro || m.referrer || m.seller

  /** A held module's card, its links inside (16 Oct 2026, Rahul: the same
   *  design as the cards to ask for one). */
  const held = (key, rows) => (
    <ul>
      <ModuleCard card={CARDS.find((c) => c.key === key)} state={{ held: true, request: null }} inDashboard>
        {rows}
      </ModuleCard>
    </ul>
  )

  /** The card for a module not held: ask for it, or where the ask stands. */
  const ask = (key) => {
    if (asks === null) return <Loader className="py-4" />
    if (asks === false) return <p className="text-meta t-faint">Could not load this. Open Studio again.</p>
    const card = CARDS.find((c) => c.key === key)
    return (
      <ul>
        <ModuleCard
          card={card}
          state={asks.modules[key]}
          questions={asks.questions[key]}
          open={open === key}
          onOpen={() => setOpen(open === key ? null : key)}
          onSent={() => {
            setOpen(null)
            showToast('Sent. The team will look at it.')
            loadAsks()
          }}
          inDashboard
        />
      </ul>
    )
  }

  return (
    <>
      {/* Always Profile (17 Oct 2026, Rahul): a history back went to the
          Desk, whose button came here, a loop. */}
      <TopBar title="Studio" back backTo="/profile" hardBack />

      {pro && consultant.status !== 'approved' && (
        <p className="mx-5 mt-4 rounded-lg border border-rule px-4 py-3 text-meta t-body">
          Your application is under review. Nobody can book you until it is approved.
        </p>
      )}

      {any && <ThisMonth modules={m} consultantId={consultant?.profile_id} />}
      {!any && (
        <p className="px-5 pt-5 text-meta t-body">
          Three ways to earn on Namo. Ask for any of them; the team approves each.
        </p>
      )}

      {/* A section per module held (docs/06 Phase 18); a card to ask for
          each one not held (16 Oct 2026, Rahul). */}
      {/* Content, two steps (17 Oct 2026, Rahul): the bars, step 1's
          start, step 2's request, and the links once step 1 is held. */}
      <section className="px-5 py-5">
        <Kicker>Content &amp; Referrals</Kicker>
        <div className="mt-3">
          {asks === null ? (
            <Loader className="py-4" />
          ) : asks === false ? (
            <p className="text-meta t-faint">Could not load this. Open Studio again.</p>
          ) : (
            <ul>
              <ContentCard asks={asks} onChanged={() => {
                loadAsks()
                refreshProfile(session.user.id)
              }}>
                <Row to="/studio/content" title="Earnings and insights" note="Commission from your links and code, and who saw your posts" />
                <Row to="/studio/affiliate" title="Your product referral link" note="Share a product and earn" />
                <Row to="/profile/influencer" title="Your app download referral code" note="Who joined with your code, and who paid" />
              </ContentCard>
            </ul>
          )}
        </div>
      </section>

      {!m.seller && (
        <section className="px-5 py-5">
          <Kicker>Market</Kicker>
          <div className="mt-3">{ask('seller')}</div>
        </section>
      )}
      {m.seller && (
      <section className="px-5 py-5">
        <Kicker>Market</Kicker>
        <div className="mt-3">
          {held('seller', <>
            <Row to="/studio/market/earnings" title="Earnings and insights" note="By month and year, and what sold" />
            <Row to="/studio/market" title="Your listings" note="Add, edit or remove downloads, courses, events and products" />
          </>)}
        </div>
      </section>
      )}

      {!pro && (
        <section className="px-5 py-5">
          <Kicker>Consulting</Kicker>
          <div className="mt-3">{ask('pro')}</div>
        </section>
      )}
      {pro && (
        <section className="px-5 py-5">
          <Kicker>Consulting</Kicker>
          <div className="mt-3">
            {held('pro', <>
            <Row to="/studio/consulting" title="Earnings" note="What chat, calls and bookings earned" />
            <Row to="/studio/report" title="Daily report" note="Online time, calls answered and your score, each day" />
            {/* Rates open here (14 Oct 2026, Rahul): the "Practice and
                reviews" page went — reviews are on your page, the intro
                and username in Edit profile, the slots in Namo Consult. */}
            <Row
              onClick={() => setRating(true)}
              title="Your consulting price"
              note={
                consultant.rates
                  ? RATE_FIELDS.map(([k, label]) => `${label} ₹${consultant.rates[k] ?? '—'}`).join(' · ') + ' /min'
                  : 'Not set yet'
              }
            />
            {/* The week as windows, 20-minute bookings (15 Oct 2026, Rahul). */}
            <Row to="/studio/calendar" title="Booking calendar" note="Your hours each day, 20-minute bookings" />
            {/* The one row that earns, made to stand out (16 Oct 2026, Rahul):
                the main-action green, a phone and a live dot. */}
            <Link
              to="/desk"
              className="pop-tap mt-3 flex items-center gap-4 rounded-2xl bg-gradient-to-br from-btn to-btn-deep px-4 py-4 text-white shadow-lg"
            >
              <span className="relative flex h-12 w-12 flex-none items-center justify-center rounded-full bg-white/20">
                <Icon name="phone" size={22} />
                <span className="absolute right-0.5 top-0.5 block h-3 w-3 animate-pulse rounded-full border-2 border-white bg-[#ffd27a]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lead font-semibold">Go online</span>
                <span className="mt-0.5 block text-meta text-white/85">Take calls and chats, and start earning</span>
              </span>
              <span aria-hidden="true" className="text-lead">→</span>
            </Link>
            <div className="h-3" />
            </>)}
          </div>
        </section>
      )}

      {/* One row for all three (16 Oct 2026, Rahul). A Pro's is payout
          details; a Creator's is still the Market's bank form. */}
      {any && (
      <section className="px-5 pb-8">
        <Kicker>Payout details</Kicker>
        <div className="mt-2">
          <Row
            to={pro ? '/studio/payout-details' : '/studio/market/bank'}
            title="Payout details"
            note="Where we pay everything you earn, on the 7th"
          />
        </div>
      </section>
      )}

      <div className="h-16" />
      {rating && (
        <RatesSheet current={consultant?.rates} onClose={() => setRating(false)} onSaved={() => setRating(false)} />
      )}
    </>
  )
}

/**
 * This month so far, by section (16 Oct 2026, Rahul: "Top table me sirf
 * earning due this month till date"). Content & Referrals is the content
 * earnings figure (qualified views plus link and tag commission); Market is
 * the seller's; Consulting is the Pro's earnings book less that commission.
 * A part that fails to load shows a dash; the total counts what arrived.
 */
function ThisMonth({ modules, consultantId }) {
  const [parts, setParts] = useState(null)
  const { pro, referrer, seller } = modules

  useEffect(() => {
    let live = true
    Promise.allSettled([
      referrer ? contentEarnings('this_month') : Promise.resolve(null),
      seller ? earningsPeriod('this_month') : Promise.resolve(null),
      pro ? earningsSummary(consultantId, 'this_month') : Promise.resolve(null),
    ]).then(([c, m, s]) => {
      if (!live) return
      const out = {
        content: c.status === 'fulfilled' && c.value ? c.value.earnings_paise : null,
        market: m.status === 'fulfilled' && m.value ? m.value.net_paise : null,
      }
      if (pro) {
        const book = s.status === 'fulfilled' ? s.value : null
        const shop = book?.by_source.find((x) => x.source === 'shop')?.net_paise ?? 0
        out.consulting = book ? book.net_paise - shop : null
      }
      setParts(out)
    })
    return () => {
      live = false
    }
  }, [pro, referrer, seller, consultantId])

  // A row per module held (docs/06 Phase 18).
  const rows = [
    ...(referrer ? [['Content & Referrals', parts?.content]] : []),
    ...(seller ? [['Market', parts?.market]] : []),
    ...(pro ? [['Consulting', parts?.consulting]] : []),
  ]
  const total = rows.reduce((s, [, v]) => s + (v ?? 0), 0)

  return (
    <section className="px-5 pt-5">
      <PopCard raised className="p-5">
        <p className="caps-sm t-faint">Earned this month so far</p>
        {!parts ? (
          <Loader label="Adding it up" className="py-4" />
        ) : (
          <>
            <p className="mt-2 font-display text-huge leading-none tnum t-heading">₹{rupees(total)}</p>
            <div className="mt-3">
              {rows.map(([k, v]) => (
                <Field key={k} k={k} v={v == null ? '—' : `₹${rupees(v)}`} />
              ))}
            </div>
            <p className="mt-3 text-meta t-body">After Namo's share. Paid together on the 7th of next month.</p>
          </>
        )}
      </PopCard>
    </section>
  )
}
