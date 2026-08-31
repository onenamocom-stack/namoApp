import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { clips, liveSessions, mine, posts, pro, reads } from '../data/mock.js'
import { TabHeader } from '../components/Chrome.jsx'
import Plate from '../components/Plate.jsx'
import { Kicker, PopTag } from '../components/Pop.jsx'
import { Avatar, Row, Segmented, Tag, Ticks } from '../components/Primitives.jsx'
import { rupees, useConsultantFields, useStore } from '../store.jsx'
import { listServices } from '../lib/consultants.js'

const TABS = [
  { key: 'content', label: 'Content' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'settings', label: 'Settings' },
]

/**
 * Everything the consultant has published, pulled out of the shared lists
 * rather than stored again. Each item keeps the route its viewer already
 * lives at, so a tile opens the real screen a client would see.
 */
const published = [
  ...mine(clips).map((x) => ({ id: x.id, kind: 'Reel', title: x.caption, meta: `${x.views} views`, to: `/reels/${x.id}` })),
  ...mine(reads).map((x) => ({ id: x.id, kind: 'Article', title: x.title, meta: `${x.views} read`, to: `/read/${x.id}` })),
  ...mine(posts).map((x) => ({ id: x.id, kind: 'Note', title: x.text, meta: `${x.likes} likes`, to: '/home' })),
  ...mine(liveSessions).map((x) => ({ id: x.id, kind: 'Live', title: x.topic, meta: `${x.viewers || '—'} watching`, to: `/live/${x.id}` })),
]

export default function ProProfile() {
  const { tab = 'content' } = useParams()
  const navigate = useNavigate()
  const { consultant } = useStore()
  const [services, setServices] = useState([])

  useEffect(() => {
    if (consultant?.profile_id) listServices(consultant.profile_id).then(setServices)
  }, [consultant])

  /* Real identity from phase 4. `pro` is still spread underneath for the
     fields no table holds yet — followers, rating, published content — but
     never for the name, the price or what you practise. */
  const me = useConsultantFields(services)

  if (!TABS.some((t) => t.key === tab)) return <Navigate to="/pro/profile" replace />

  return (
    <>
      <TabHeader />

      {/* Identity. The same block a client sees on /consult/a1 — same order,
          same inline stats line — so the consultant recognises his own page. */}
      <section className="px-5 pb-6 pt-6">
        <div className="flex items-start gap-4">
          <Avatar initials={me.initials} size={76} />
          <div className="min-w-0 flex-1 pt-1">
            <h1 className="truncate text-lead font-semibold t-heading">{me.name}</h1>
            <p className="mt-0.5 truncate text-meta t-body">{me.specialization}</p>
            <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] t-faint tnum">
              {/* Rating, reviews and followers are phase 9 and still seed —
                  the experience figure beside them is not. */}
              <span className="font-bold t-sub">{me.rating}</span> rating
              <span aria-hidden="true">·</span>
              <span className="font-bold t-sub">{me.reviewCount.toLocaleString('en-IN')}</span> reviews
              <span aria-hidden="true">·</span>
              <span className="font-bold t-sub">
                {me.experienceYrs ? `${me.experienceYrs} yrs` : '—'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-bold t-sub">{me.followers}</span> followers
            </p>
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
        </div>
      </section>

      <Segmented
        items={TABS}
        value={tab}
        onChange={(k) => navigate(k === 'content' ? '/pro/profile' : `/pro/profile/${k}`)}
      />

      <div key={tab} className="animate-fade">
        {tab === 'content' && <Content />}
        {tab === 'reviews' && <Reviews />}
        {tab === 'settings' && <Settings me={me} />}
      </div>

      <div className="h-24" />
    </>
  )
}

function Content() {
  return (
    <section className="px-5 py-6">
      <Kicker action="Post something" to="/pro/studio">
        {`${published.length} published`}
      </Kicker>

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
              <p className="mt-0.5 text-[10px] t-faint tnum">{p.meta}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Reviews() {
  return (
    <section className="px-5 py-6">
      <Kicker>{`${pro.reviewCount.toLocaleString('en-IN')} reviews`}</Kicker>

      <div className="mt-4 flex items-center gap-5 border-b border-rule pb-6">
        <div className="flex-none text-center">
          <p className="font-display text-display tnum t-heading">{pro.rating}</p>
          <Ticks value={Math.round(pro.rating)} className="mt-2 w-16" />
        </div>
        <p className="min-w-0 flex-1 text-meta t-body">
          Clients rate the session, not the news in it. A four is usually a chart you did not
          want to hear read out.
        </p>
      </div>

      <ul>
        {pro.reviews.map((r) => (
          <li key={r.id} className="border-b border-rule py-5 last:border-b-0">
            <div className="flex items-center justify-between gap-4">
              <span className="text-meta t-heading">{r.name}</span>
              <span className="flex items-center gap-3">
                <Ticks value={r.rating} className="w-12" />
                <span className="caps-sm t-faint">{r.ago}</span>
              </span>
            </div>
            <p className="mt-3 text-meta t-sub">{r.text}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Settings({ me }) {
  const { showToast } = useStore()

  return (
    <>
      <section className="border-b border-rule px-5 py-6">
        <Kicker>Practice</Kicker>
        <div className="mt-2">
          {/* Real, and read-only on purpose: the price is a platform band, not
              a number to type. Changing band is an edit to your application
              until there is a screen for it. */}
          <Row
            onClick={() => showToast('Your band is set on your application. Ask us to move it.')}
            title="Session pricing"
            note={
              me.pricePaise == null
                ? 'No sessions priced yet'
                : `${me.fixed.map((s) => `${s.duration_mins} min ₹${rupees(s.price_paise)}`).join(' · ')}${
                    me.perMinute ? ` · ₹${rupees(me.perMinute.price_paise)}/min` : ''
                  }`
            }
          />
          <Row to="/pro/consult" title="Availability" note="Which slots you are open for" />
          <Row
            onClick={() => showToast('Languages — prototype only')}
            title="Languages"
            note={me.languages.join(' · ') || 'Not set'}
          />
          <Row
            onClick={() => showToast('Payout settings — prototype only')}
            title="Payout account"
            note="HDFC ••4412"
          />
        </div>
      </section>

      <section className="px-5 py-6">
        <Kicker>Account</Kicker>
        <div className="mt-2">
          {/* Switching sides is a plain link — the URL is what decides which
              app you are in, so there is no state to flip. */}
          <Row to="/home" title="Switch to seeking" note="Browse Namo as a client" />
          <Row onClick={() => showToast('Help — prototype only')} title="Help & support" />
        </div>
        <p className="mt-6 text-meta t-faint">
          Your practice, your prices and your availability are real. Content, reviews and
          earnings are not yet.
        </p>
      </section>
    </>
  )
}
