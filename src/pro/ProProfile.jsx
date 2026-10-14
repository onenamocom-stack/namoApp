import ProFacts from '../components/ProFacts.jsx'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Sheet } from '../components/Chrome.jsx'
import ProHeader from '../components/ProHeader.jsx'
import { proPath } from '../lib/dashboard.js'
import RateFields, { RATE_FIELDS, rateErrors, rateNumbers } from '../components/RateFields.jsx'
import IntroSheet, { introNote } from '../components/IntroSheet.jsx'
import UsernameSheet, { usernameNote } from '../components/UsernameSheet.jsx'
import Plate from '../components/Plate.jsx'
import { Kicker, PopTag } from '../components/Pop.jsx'
import { Avatar, Row, Segmented, Tag, Ticks } from '../components/Primitives.jsx'
import { useConsultantFields, useStore } from '../store.jsx'
import { listServices, saveMyRates } from '../lib/consultants.js'
import { signOut } from '../lib/signout.js'
import { fetchByAuthor, fetchReviews, followerCount } from '../lib/content.js'

const TABS = [
  { key: 'content', label: 'Content' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'settings', label: 'Settings' },
]

/**
 * One published row as a tile. Each keeps the route its viewer already lives
 * at, so a tile opens the real screen a client would see.
 *
 * This was a module-level constant built from four mock lists filtered by
 * `mine()`. It is a query now, which also means it is empty for a consultant
 * who has published nothing — rather than showing them somebody else's work.
 */
function tile(c) {
  if (c.kind === 'clip') {
    return { id: c.id, kind: 'Reel', title: c.caption, meta: c.time, to: `/reels/${c.id}` }
  }
  if (c.kind === 'article') {
    return { id: c.id, kind: 'Article', title: c.title, meta: c.time, to: `/read/${c.id}` }
  }
  return { id: c.id, kind: 'Note', title: c.body || c.caption, meta: c.time, to: '/home' }
}

export default function ProProfile() {
  const { tab = 'content' } = useParams()
  const navigate = useNavigate()
  const { consultant } = useStore()
  const [services, setServices] = useState([])
  const [followers, setFollowers] = useState(null)
  const [pricesAt, setPricesAt] = useState(0)

  useEffect(() => {
    if (consultant?.profile_id) listServices(consultant.profile_id).then(setServices)
  }, [consultant, pricesAt])

  useEffect(() => {
    const id = consultant?.profile_id
    if (!id) return
    let active = true
    followerCount(id)
      .then((n) => active && setFollowers(n))
      .catch((err) => console.error('[pro followers] load failed:', err.message))
    return () => {
      active = false
    }
  }, [consultant])

  /* Real identity from phase 4. `pro` is still spread underneath for the
     fields no table holds yet — followers, rating, published content — but
     never for the name, the price or what you practise. */
  const me = useConsultantFields(services)

  if (!TABS.some((t) => t.key === tab)) return <Navigate to={proPath('/pro/profile')} replace />

  return (
    <>
      <ProHeader title="Your practice" />

      {/* Identity. The same block a client sees on /consult/a1 — same order,
          same inline stats line — so the consultant recognises his own page. */}
      <section className="px-5 pb-6 pt-6">
        <div className="flex items-start gap-4">
          <Avatar initials={me.initials} size={76} />
          <div className="min-w-0 flex-1 pt-1">
            <h1 className="truncate text-lead font-semibold t-heading">{me.name}</h1>
            <p className="mt-0.5 truncate text-meta t-body">{me.specialization}</p>
            {/* Experience, rating and badge — the pills a client sees on
                your page (13 Oct 2026, Rahul). Followers stay a line. */}
            <ProFacts
              className="mt-2"
              experienceYrs={me.experienceYrs}
              rating={me.rating}
              reviewCount={me.reviewCount}
              badge={me.badge}
            />
            {followers !== null && (
              <p className="mt-1.5 text-[11px] t-faint tnum">
                <span className="font-bold t-sub">{followers.toLocaleString('en-IN')}</span>{' '}
                {followers === 1 ? 'follower' : 'followers'}
              </p>
            )}
          </div>
        </div>

        <p className="mt-4 text-meta leading-relaxed t-sub">{me.bio}</p>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {me.credentials.map((cr) => (
            <Tag key={cr}>{cr}</Tag>
          ))}
        </div>

        {/* The whole public surface — About, Work, Reviews, the booking sheet —
            already exists at /consult/:id and stays in sync for free. Linking
            to it beats rebuilding it here and then watching the two drift. */}
        <div className="mt-5">
          <Row
            to={`/consult/${me.id}`}
            title="View your public page"
            note={
              me.status === 'approved'
                ? 'Exactly what a client sees'
                : 'Nobody can reach this until you are approved'
            }
          />
          {/* 13 Oct 2026, Rahul: the same editor as the button on your page. */}
          <Row
            to="/practice/edit"
            title="Edit profile"
            note="Specialization, About, experience, languages. Practice and degree go to review"
          />
        </div>
      </section>

      <Segmented
        items={TABS}
        value={tab}
        onChange={(k) => navigate(proPath(k === 'content' ? '/pro/profile' : `/pro/profile/${k}`))}
      />

      <div key={tab} className="animate-fade">
        {tab === 'content' && <Content />}
        {tab === 'reviews' && <Reviews />}
        {tab === 'settings' && <Settings me={me} onRatesSaved={() => setPricesAt(Date.now())} />}
      </div>

      <div className="h-24" />
    </>
  )
}

function Content() {
  const { consultant } = useStore()
  const [published, setPublished] = useState([])

  const me = consultant?.profile_id
  useEffect(() => {
    if (!me) return
    let active = true
    fetchByAuthor(me)
      .then((rows) => active && setPublished(rows.map(tile)))
      .catch((err) => console.error('[pro profile] load failed:', err.message))
    return () => {
      active = false
    }
  }, [me])

  return (
    <section className="px-5 py-6">
      <Kicker action="Post something" to={proPath('/pro/studio')}>
        {`${published.length} published`}
      </Kicker>

      {!published.length && (
        <p className="prose-c mt-4">Nothing yet. What you post in the studio appears here.</p>
      )}

      <ul className="mt-4 grid grid-cols-3 gap-2">
        {published.map((p) => (
          <li key={`${p.kind}-${p.id}`}>
            <Link to={p.to} className="block">
              <Plate seed={p.id} className="aspect-square w-full">
                <span className="absolute left-1.5 top-1.5">
                  <PopTag tone={p.kind === 'Live' ? 'live' : 'default'}>{p.kind}</PopTag>
                </span>
              </Plate>
              <p className="mt-1.5 line-clamp-2 text-[11px] leading-tight t-sub">{p.title}</p>
              <p className="mt-0.5 text-[11px] t-faint tnum">{p.meta}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Reviews() {
  const { consultant } = useStore()
  const [reviews, setReviews] = useState([])

  const me = consultant?.profile_id
  useEffect(() => {
    if (!me) return
    let active = true
    fetchReviews(me)
      .then((rows) => active && setReviews(rows))
      .catch((err) => console.error('[pro reviews] load failed:', err.message))
    return () => {
      active = false
    }
  }, [me])

  /* Your own reviews, not the seed person's. An empty list is the honest
     answer for a consultant nobody has completed a session with — and it is
     the only answer the table can give, since a review needs a booking. */
  if (!reviews.length) {
    return (
      <section className="px-5 py-6">
        <Kicker>No reviews yet</Kicker>
        <p className="prose-c mt-4">
          A client can review you once a session with them is completed.
        </p>
      </section>
    )
  }

  const avg = (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)

  return (
    <section className="px-5 py-6">
      <Kicker>{`${reviews.length} ${reviews.length === 1 ? 'review' : 'reviews'}`}</Kicker>

      <div className="mt-4 flex items-center gap-5 border-b border-rule pb-6">
        <div className="flex-none text-center">
          <p className="font-display text-display tnum t-heading">{avg}</p>
          <Ticks value={Math.round(avg)} className="mt-2 w-16" />
        </div>
        <p className="min-w-0 flex-1 text-meta t-body">
          Clients rate the session, not the news in it. A four is usually a chart you did not
          want to hear read out.
        </p>
      </div>

      <ul>
        {reviews.map((r) => (
          <li key={r.id} className="border-b border-rule py-5 last:border-b-0">
            <div className="flex items-center justify-between gap-4">
              <span className="text-meta t-heading">{r.name}</span>
              <span className="flex items-center gap-3">
                <Ticks value={r.rating} className="w-12" />
                <span className="caps-sm t-faint">{r.ago}</span>
              </span>
            </div>
            {r.text && <p className="mt-3 text-meta t-sub">{r.text}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Settings({ me, onRatesSaved }) {
  const { showToast, consultant, profile } = useStore()
  const [leaving, setLeaving] = useState(false)
  const [editingRates, setEditingRates] = useState(false)
  const [intro, setIntro] = useState(false)
  const [naming, setNaming] = useState(false)

  const leave = async () => {
    if (leaving) return
    setLeaving(true)
    try {
      await signOut()
    } catch (err) {
      showToast(err.message)
      setLeaving(false)
    }
  }

  return (
    <>
      <section className="border-b border-rule px-5 py-6">
        <Kicker>Practice</Kicker>
        <div className="mt-2">
          {/* Your own four rates since 10 Oct 2026 (Rahul) — it was a
              read-only platform band. Tap to change them. */}
          <Row
            onClick={() => setEditingRates(true)}
            title="Your rates"
            note={
              me.rates
                ? RATE_FIELDS.map(([k, label]) => `${label} ₹${me.rates[k] ?? '—'}`).join(' · ') + ' /min'
                : 'Not set yet'
            }
          />
          <Row onClick={() => setIntro(true)} title="Intro video or photo" note={introNote(consultant)} />
          {/* Your profile link, 1namo.com/<username> (11 Oct 2026, Rahul). */}
          <Row onClick={() => setNaming(true)} title="Username" note={usernameNote(profile)} />
          {/* In the main app the slots are in Namo Consult (Phase 16). */}
          <Row to={proPath('/pro/consult')} title="Availability" note="Which slots you are open for" />
          <Row
            onClick={() => showToast('Languages — prototype only')}
            title="Languages"
            note={me.languages.join(' · ') || 'Not set'}
          />
          {/* Real since 3 Oct 2026 (payouts P2). It said "HDFC ••4412" to
              everyone and toasted "prototype only". */}
          <Row to={proPath('/pro/payout-details')} title="Payout details" note="PAN and bank account" />
        </div>
      </section>
      {intro && <IntroSheet onClose={() => setIntro(false)} />}
      {naming && <UsernameSheet onClose={() => setNaming(false)} />}
      {editingRates && (
        <RatesSheet
          current={me.rates}
          onClose={() => setEditingRates(false)}
          onSaved={() => {
            setEditingRates(false)
            onRatesSaved()
          }}
        />
      )}

      <section className="px-5 py-6">
        <Kicker>Account</Kicker>
        <div className="mt-2">
          {/* "Switch to seeking" was here until 4 Oct 2026, removed with its
              twin in the client app (owner's call). It also went nowhere: the
              consultant build has no /home, so it bounced back to Studio. */}
          <Row to="/support" title="Help & support" note="+91 99580 40508 · support@1namo.com" />
        </div>

        {/* Last, alone, and it takes the green dot down on the way out.
            `signOut` goes offline before it drops the token — a logout
            that left `accepting_now` true would put a dot on somebody who
            has gone home, and seekers would press it. */}
        <button
          type="button"
          onClick={leave}
          disabled={leaving}
          className="mt-8 w-full rounded-lg border border-rule py-3.5 text-center caps-sm text-live transition-colors hover:border-live disabled:opacity-40"
        >
          {leaving ? 'Signing out…' : 'Sign out'}
        </button>
        <p className="mt-3 text-center text-micro t-faint">
          You go offline, and seekers stop seeing you as available.
        </p>

        <p className="mt-6 text-meta t-faint">
          Your practice, your prices and your availability are real. Content, reviews and
          earnings are not yet.
        </p>
      </section>
    </>
  )
}

/**
 * Your four rates, typed (10 Oct 2026). All four go up together; the new
 * prices apply to what is asked or booked after the save. A booking or a
 * session already made keeps the price it was made at.
 */
/** Exported for the main app's Dashboard, where "Your rates" opens it
 *  directly (14 Oct 2026, Rahul). */
export function RatesSheet({ current, onClose, onSaved }) {
  const { showToast, refreshConsultant, session } = useStore()
  const [rates, setRates] = useState(() =>
    Object.fromEntries(RATE_FIELDS.map(([k]) => [k, current?.[k] != null ? String(current[k]) : ''])),
  )
  const [saving, setSaving] = useState(false)
  const ok = !Object.keys(rateErrors(rates)).length

  const save = async () => {
    if (!ok || saving) return
    setSaving(true)
    try {
      await saveMyRates(rateNumbers(rates))
      await refreshConsultant(session?.user?.id)
      showToast('Rates saved.')
      onSaved()
    } catch (err) {
      showToast(err.message || 'Could not save your rates.')
      setSaving(false)
    }
  }

  // On the page, in the phone-width frame — Profile's FollowSheet does the
  // same; inside the settings tab a sheet opened mid-page.
  return createPortal(
    <div className="fixed inset-y-0 left-1/2 z-[60] w-full max-w-[420px] -translate-x-1/2">
    <Sheet open onClose={onClose} title="Your rates">
      <p className="text-meta t-sub">
        Rupees a minute, ₹5 to ₹110. New prices apply to what is asked or booked from now on.
      </p>
      <RateFields value={rates} onChange={setRates} />
      <button
        type="button"
        onClick={save}
        disabled={!ok || saving}
        className="mt-6 block w-full rounded-xl bg-gold-fill py-3 text-center text-meta font-semibold text-white disabled:opacity-40"
      >
        {saving ? 'Saving' : 'Save rates'}
      </button>
    </Sheet>
    </div>,
    document.body,
  )
}
