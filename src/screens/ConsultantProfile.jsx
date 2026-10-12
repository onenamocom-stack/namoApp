import { Loader } from '../components/Cosmos.jsx'
import { MilestoneBadge, TierRing } from '../components/Milestones.jsx'
import { useEffect, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { SESSION } from '../data/mock.js'
import { Sheet, TopBar } from '../components/Chrome.jsx'
import useStartSession from '../components/useStartSession.js'
import { PopButton } from '../components/Pop.jsx'
import {
  Avatar,
  Button,
  Field,
  firstName,
  Section,
  Segmented,
  Tag,
  Ticks,
} from '../components/Primitives.jsx'
import { rupees, useStore } from '../store.jsx'
import { getConsultant, istToday, openSlots } from '../lib/consultants.js'
import { fetchByAuthor, fetchReviews, followCounts } from '../lib/content.js'
import { FeedCard } from './Home.jsx'
import VerifiedMark from '../components/VerifiedMark.jsx'
import ProfileHead from '../components/ProfileHead.jsx'
import FollowSheet from '../components/FollowSheet.jsx'
import { shareLink } from '../lib/share.js'
import { PRO_APP_URL } from '../lib/urls.js'
import { profileLink } from '../lib/profile.js'
import { isPro } from '../side.js'

// Posts first and open, then Reviews, then About (10 Oct 2026, Rahul).
const TABS = [
  { key: 'work', label: 'Posts' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'about', label: 'About' },
]

/**
 * Star distribution as a share of all reviews, worked out from the reviews
 * themselves. It used to be five hardcoded percentages that said 92% five-star
 * for everybody, including a consultant with no reviews at all.
 */
function distribution(reviews) {
  const n = reviews.length
  return [5, 4, 3, 2, 1].map((stars) => {
    const count = reviews.filter((r) => r.rating === stars).length
    return [stars, n ? Math.round((count / n) * 100) : 0]
  })
}

/** The next three days, as the sheet offers them. The server's horizon is
 *  fourteen; this is as far ahead as one screen of six slots is useful. */
function nextDays() {
  const today = istToday()
  return [0, 1, 2].map((n) => {
    const d = new Date(`${today}T00:00:00+05:30`)
    d.setUTCDate(d.getUTCDate() + n)
    const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d)
    return {
      key: iso,
      label: n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : new Date(`${iso}T00:00:00+05:30`)
        .toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' }),
    }
  })
}

export default function ConsultantProfile() {
  const { id } = useParams()
  return <ConsultantPage id={id} />
}

/**
 * The page that sells a consultant, and since 10 Oct 2026 also a pro's own
 * Profile tab (Rahul: "if a person becomes pro he should have only one
 * profile page"). `own` is passed only by Profile, in the seeker build:
 * Edit, Share and a new post take the place of Follow, Book, Chat and Call,
 * and ☰ opens the same settings as the seeker profile. ProProfile's preview
 * of /consult/:id is the client's view, on purpose. `fallback` renders when
 * there is no approved consultant row to show.
 */
export function ConsultantPage({ id, own = false, backTo = '/consult', fallback = null, saved = null }) {
  // `?book=1`: arrived from a card's Book button — open the sheet at once.
  const [params] = useSearchParams()
  const { start, asking } = useStartSession()
  const { showToast, hasFlag, toggleFlag, bookSession, spending, me, profile } = useStore()
  const [tab, setTab] = useState('work')
  const [sheet, setSheet] = useState(params.get('book') === '1')
  const [slot, setSlot] = useState(null)
  const [service, setService] = useState(null)
  const [c, setC] = useState(undefined)
  const [days] = useState(nextDays)
  const [day, setDay] = useState(days[0].key)
  const [slots, setSlots] = useState(null)
  const [followers, setFollowers] = useState(null)
  // Your own page opens your followers or following (12 Oct 2026, Rahul).
  // The server lists only your own, so on anybody else's the numbers stay
  // numbers.
  const [listing, setListing] = useState(null)
  // Their posts, loaded here rather than in the Posts tab, because the
  // header counts them (11 Oct 2026).
  const [items, setItems] = useState(null)

  useEffect(() => {
    let active = true
    setItems(null)
    fetchByAuthor(id)
      .then((rows) => active && setItems(rows))
      .catch((err) => {
        console.error('[work] load failed:', err.message)
        if (active) setItems([])
      })
    return () => {
      active = false
    }
  }, [id])

  useEffect(() => {
    let live = true
    getConsultant(id).then((row) => {
      if (!live) return
      setC(row)
      setService(row?.fixed.find((s) => s.duration_mins === SESSION.mins) ?? row?.fixed[0] ?? null)
    })
    return () => {
      live = false
    }
  }, [id])

  // Presence and busy, kept current while the page is open (5 Oct 2026).
  // Only the two flags are taken, so nothing the person is choosing moves.
  useEffect(() => {
    const timer = setInterval(() => {
      getConsultant(id).then((row) => {
        if (row) setC((prev) => (prev ? { ...prev, online: row.online, busy: row.busy } : prev))
      })
    }, 20_000)
    return () => clearInterval(timer)
  }, [id])

  /* The follower count, which is a COUNT of rows rather than a column — the
     mock said '52.0k' for a consultant nobody had ever followed. Null until it
     arrives, so the line renders a real number or nothing, never a 0 that is
     only a placeholder. */
  useEffect(() => {
    let live = true
    followCounts(id)
      .then((n) => live && setFollowers(n))
      .catch((err) => console.error('[followers] load failed:', err.message))
    return () => {
      live = false
    }
  }, [id])

  /* The one slots call. Both this sheet and the consultant's own grid go
     through it, which is what stops them disagreeing — the subtraction of
     time off and claimed slots happens on the server, once. */
  useEffect(() => {
    if (!c) return
    let live = true
    setSlots(null)
    openSlots(c.id, day).then((rows) => live && setSlots(rows))
    return () => {
      live = false
    }
  }, [c, day])

  // undefined is "still loading", null is "no such consultant, or not
  // approved". They are different answers and only one of them redirects.
  if (c === undefined) {
    return (
      <div className="flex h-full flex-col">
        <TopBar title="Consultant" back backTo={backTo} />
        <Loader />
      </div>
    )
  }
  if (!c) return fallback ?? <Navigate to="/consult" replace />

  const following = hasFlag(`follow:${c.id}`)
  const duration = service?.duration_mins ?? SESSION.mins
  /* The total is a price the server owns, read off the service row. Nothing
     here multiplies anything — backend/INSTRUCTIONS.md rule 3. */
  const total = service?.price_paise ?? 0

  const openSheet = () => {
    setSlot(null)
    setDay(days[0].key)
    setSheet(true)
  }

  /* Ask for a metered chat. This costs NOTHING — no money moves until the
     consultant joins, which is the opposite of booking a slot. The panel opens
     straight away so the seeker can watch for the answer; the meter appears in
     it the moment the session goes live. */
  /* Call and chat are the same per-minute session — one meter, one
     hold, one settle. `useStartSession` is that request, shared with the
     roster on /consult, which kept a "prototype only" toast on its own
     Call button for a week after this screen got a working one. Two
     copies of the same button is how that happens. */
  const askForCall = () => start(c, 'video')
  const askForAudio = () => start(c, 'audio')
  const askForChat = () => start(c, 'chat')

  /* One call, one transaction. The sheet sends the consultant, the service and
     the server's own `startsAt` — and no price (rule 3). A refusal keeps the
     sheet open with the times reloaded, because every refusal this can give is
     one a different choice fixes: the slot went, or the wallet is short. */
  const confirm = async () => {
    if (!slot || !service) return
    const res = await bookSession(c.id, service.id, slot.startsAt)
    if (!res?.ok) {
      showToast(res?.reason ?? 'Could not take that booking.')
      setSlot(null)
      openSlots(c.id, day).then(setSlots)
      return
    }
    setSheet(false)
    setSlot(null)
    /* Reload on SUCCESS too, not only on refusal. The effect that fetches
       slots is keyed on [c, day], and `openSheet` resets the day to today —
       which is a no-op when you were already on today. So the sheet reopened
       still offering the slot you just took, and confirming it came back
       "Someone just took that time", about yourself. */
    openSlots(c.id, day).then(setSlots)
    showToast(`Requested · ${slot.slot} · ${duration} min`)
  }

  // It said "Profile link copied" and copied nothing.
  const share = async () => {
    // 1namo.com/<username> when they have one (11 Oct 2026). Your own
    // comes from your profile, which always has the current name.
    const username = own ? profile?.username : c.username
    const said = await shareLink(profileLink(username, `/consult/${c.id}`), { title: c.name })
    if (said) showToast(said)
  }
  const ownButton =
    'flex-1 rounded-xl border border-rule bg-white py-2.5 text-center text-meta font-semibold t-heading shadow-sm transition-colors hover:border-gold-fill'

  return (
    <div className="flex h-full flex-col">
      <TopBar
        title={c.name}
        back
        backTo={backTo}
        hardBack={own}
        // The category always (11 Oct 2026, Rahul): "Verified" is the mark
        // beside the name now, not a word up here.
        sub={c.category}
        // No Share up here (12 Oct 2026, Rahul): Share profile sits under
        // the bio on every view.
        right={
          own && (
            <Link
              to="/profile/settings"
              aria-label="Settings"
              className="flex h-9 w-9 items-center justify-center rounded-full text-t1 transition-colors hover:bg-surface"
            >
              <span aria-hidden="true" className="text-lead leading-none">☰</span>
            </Link>
          )
        }
      />
      {own && <FollowSheet which={listing} onClose={() => setListing(null)} />}

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {/* No banner. A cover image on a profile this dense pushes the name,
            the numbers and the description below the fold, and it carried no
            information — it was a generated plate of the same art as the
            intro clip. The identity block leads instead. */}
        <section className="px-5 pb-6 pt-6">
          <div className="flex items-center gap-4">
            <TierRing count={c.sessionsDone} size={76}>
              {/* The photo, not the initials (10 Oct 2026). Your own is the
                  store's copy, so a new picture shows without a reload. */}
              <Avatar initials={c.initials} src={(own && me.avatarUrl) || c.avatarUrl} size={76} />
            </TierRing>
            {/* Name over posts, followers and following (11 Oct 2026,
                Rahul: Instagram's layout, the same block as every profile). */}
            <ProfileHead
              name={c.name}
              mark={c.verified && <VerifiedMark size={20} />}
              stats={[
                { n: items?.length ?? null, label: 'posts' },
                { n: followers?.followers ?? null, label: 'followers', onClick: own ? () => setListing('followers') : undefined },
                { n: followers?.following ?? null, label: 'following', onClick: own ? () => setListing('following') : undefined },
              ]}
            />
          </div>

          {/* What they practise, the milestone and the rating and experience,
              under the photo now that the numbers sit beside it. */}
          <p className="mt-4 text-meta font-semibold t-heading">{c.specialization}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <MilestoneBadge count={c.sessionsDone} />
            <p className="text-[11px] t-faint tnum">
              {/* The review count is hidden for now; the rating stays
                  (8 Oct 2026, Rahul). */}
              <span className="font-bold t-sub">{c.rating ?? 'New'}</span> rating
              <span aria-hidden="true"> · </span>
              <span className="font-bold t-sub">
                {c.experienceYrs ? `${c.experienceYrs} yrs` : 'Practising'}
              </span>
            </p>
          </div>

          {/* The description. It was buried in the About tab; on a profile it
              is the thing you read right after the name. */}
          <p className="mt-2 text-meta leading-relaxed t-sub">{c.bio}</p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {c.credentials.map((cr) => (
              <Tag key={cr}>{cr}</Tag>
            ))}
          </div>

          {/* Follow and Share profile, half the row each. The schedule,
              chat, video and call glyphs that sat beside Follow went on 11 Oct
              2026 (Rahul): the footer's Video, Audio, Chat and Book tiles do
              the same and show the rate. Both are the white button, never
              saffron, whether or not you follow (Rahul, 11 Oct); the label
              says which.

              Your own page has Share profile instead: you do not follow or
              book yourself. */}
          {own ? (
            <div className="mt-5 flex gap-2">
              {/* Edit profile went to Settings on 11 Oct 2026 (Rahul): it
                  edits your name and birth details, not this page.
                  Dashboard (11 Oct 2026, Rahul) opens the consultant app:
                  pro.1namo.com from here, its own start inside it. A route
                  Link cannot cross apps, so the seeker side is an <a>. */}
              {isPro ? (
                <Link to="/" className={ownButton}>
                  Dashboard
                </Link>
              ) : (
                <a href={PRO_APP_URL} className={ownButton}>
                  Dashboard
                </a>
              )}
              <button type="button" onClick={share} className={ownButton}>
                Share profile
              </button>
              {/* No + here since 11 Oct 2026 (Rahul): a post is made from
                  Home's +. */}
            </div>
          ) : (
          <div className="mt-5 flex gap-2">
            <PopButton
              className="flex-1"
              full={false}
              variant="ghost"
              onClick={() =>
                toggleFlag(`follow:${c.id}`, {
                  on: `Following ${firstName(c.name)}`,
                  off: `Unfollowed ${firstName(c.name)}`,
                })
              }
            >
              {following ? 'Following' : 'Follow'}
            </PopButton>
            <PopButton
              className="flex-1"
              full={false}
              variant="ghost"
              onClick={share}
            >
              Share profile
            </PopButton>
          </div>
          )}

          {/* Said, not merely implied by the footer's grey tiles. "Nothing
              happens when I tap" is the complaint a disabled control
              produces on its own. Book still works, which is the whole
              point of saying it here. */}
          {!own && !c.online && (
            <p className="mt-3 text-micro t-faint">
              {firstName(c.name)} is offline right now. You can still book a
              session.
            </p>
          )}
          {!own && c.online && c.busy && (
            <p className="mt-3 text-micro font-semibold text-gold">
              Busy — {firstName(c.name)} is with someone right now. Press call or chat and we
              will keep trying until they are free. Nothing is charged while you wait.
            </p>
          )}

          {/* The intro the consultant uploaded (11 Oct 2026, Rahul) — a video
              or a photo, from Settings → Intro video or photo. Nothing when
              there is none; it was a "Meet X · 1:24" placeholder that played
              nothing. */}
          {c.introUrl &&
            (c.introKind === 'video' ? (
              <video
                src={c.introUrl}
                controls
                playsInline
                preload="metadata"
                className="mt-5 aspect-video w-full rounded-xl bg-ink object-cover"
              />
            ) : (
              <img src={c.introUrl} alt={c.name} className="mt-5 aspect-video w-full rounded-xl object-cover" />
            ))}
        </section>

        {/* Your own page has a fourth tab, Saved (11 Oct 2026, Rahul) — what
            you bookmarked, which a client never sees. */}
        <Segmented
          items={own && saved ? [...TABS, { key: 'saved', label: 'Saved' }] : TABS}
          value={tab}
          onChange={setTab}
        />

        <div key={tab} className="animate-fade">
          {tab === 'about' && <About c={c} />}
          {tab === 'work' && <Work c={c} items={items} />}
          {tab === 'reviews' && <Reviews c={c} />}
          {tab === 'saved' && own && saved}
        </div>

        {/* The Book section that sat here went on 11 Oct 2026 (Rahul): the
            footer's Book does the same. */}
        <div className="h-8" />
      </div>

      {/* Sticky footer: all four ways in, each with its own rate (10 Oct
          2026, Rahul) — the Consult card's row. It was the booking price
          with Book and Chat now. Video, audio and chat are dead while the
          consultant is offline; Book works offline. On your own page the
          same four tiles show your rates and press nothing. */}
      <div className="grid flex-none grid-cols-4 gap-1.5 border-t border-rule bg-bg px-4 py-3">
        {[
          ['video', 'Video', askForCall],
          ['audio', 'Audio', askForAudio],
          ['chat', 'Chat', askForChat],
          ['book', 'Book', openSheet],
        ].map(([key, label, onClick]) => {
          const book = key === 'book'
          const row = book ? null : c.channels?.[key]
          const price = book
            ? c.pricePaise != null
              ? `₹${rupees(c.pricePaise)}`
              : '—'
            : !c.online && !own
              ? 'Offline'
              : c.freeFirst && !own
                ? '3 min free'
                : row
                  ? `₹${rupees(row.price_paise)}/min`
                  : '—'
          const dead = !own && (book ? !c.fixed.length : !row || !c.online || asking)
          return (
            <button
              key={key}
              type="button"
              onClick={own ? undefined : onClick}
              disabled={dead}
              aria-label={own ? `${label}: ${price}` : `${label} ${firstName(c.name)}, ${price}`}
              className={`flex flex-col items-center justify-center rounded-xl py-2 leading-tight transition active:scale-[0.98] disabled:pointer-events-none ${
                dead
                  ? 'bg-stroke/70 text-t2'
                  : key === 'chat'
                    ? 'bg-gold-fill text-white'
                    : 'border border-gold text-gold'
              } ${own ? 'pointer-events-none' : ''}`}
            >
              <span className="text-[13px] font-semibold">{label}</span>
              <span className="text-[10px] tnum opacity-90">{price}</span>
            </button>
          )
        })}
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title={`Book ${firstName(c.name)}`}>
        {/* One length since 10 Oct 2026 (Rahul): 20 minutes at the
            consultant's booking rate. The picker shows only if the server
            sends more than one active slot row. */}
        {c.fixed.length > 1 && (
          <>
            <p className="label text-left mb-4">Length</p>
            <Segmented
              items={c.fixed.map((s) => ({ key: s.id, label: `${s.duration_mins} min` }))}
              value={service?.id}
              onChange={(picked) => setService(c.fixed.find((s) => s.id === picked) ?? null)}
            />
          </>
        )}

        <p className={`label text-left mb-4 ${c.fixed.length > 1 ? 'mt-8' : ''}`}>Day</p>
        <Segmented items={days} value={day} onChange={setDay} />

        <p className="label mt-8 text-left mb-4">Open times</p>
        <div className="mb-10 grid grid-cols-3 gap-3">
          {(slots ?? []).map((t) => (
            <Button
              key={t.startsAt}
              variant={slot?.startsAt === t.startsAt ? 'solid' : 'quiet'}
              onClick={() => setSlot(t)}
            >
              {t.slot}
            </Button>
          ))}
        </div>
        {/* A taken slot is absent, not struck through: the server returns what
            is open and never says who took what. The old sheet drew every slot
            and crossed out the booked ones from a list the consultant's own
            screen read differently — which is how the two sides came to
            disagree on every day except Thursday. */}
        {slots === null && <p className="mb-10 -mt-6 text-meta text-t3">Checking the diary.</p>}
        {slots?.length === 0 && (
          <p className="mb-10 -mt-6 text-meta text-t3">
            Nothing open {days.find((d) => d.key === day)?.label.toLowerCase()}. Try another day.
          </p>
        )}

        <Field k="Consultant" v={c.name} />
        <Field
          k="When"
          v={slot ? `${days.find((d) => d.key === day)?.label}, ${slot.slot}` : 'Not picked yet'}
        />
        <Field k="Length" v={`${duration} min`} />
        <Field k="Questions" v={SESSION.promise} />
        <Field k="Total" v={`₹${rupees(total)}`} />

        <Button
          className="mt-10"
          variant="solid"
          disabled={!slot || !service || spending}
          onClick={confirm}
        >
          {spending ? 'Booking' : slot ? `Confirm ${slot.slot}` : 'Pick a time'}
        </Button>
        <p className="mt-5 text-center text-meta text-t3">
          {/* Said before the tap, not in a policy page nobody opens —
              01-PRD.md §5.4. The other half of that policy is on the server:
              a decline reverses in full. */}
          Your wallet is charged now. A session you skip is not refunded; if
          {' '}{firstName(c.name)} declines, every rupee comes straight back.
        </p>
      </Sheet>
    </div>
  )
}

function About({ c }) {
  return (
    <>
      {/* The bio and credentials moved up into the identity block — repeating
          them here would be the same paragraph twice on one screen. */}
      {/* No heading (11 Oct 2026, Rahul: "Practical" said nothing). */}
      <Section>
        <Field k="Speaks" v={c.languages.join(' · ') || '—'} />
        <Field k="Category" v={c.category} />
        <Field k="Experience" v={c.experienceYrs ? `${c.experienceYrs} yrs` : '—'} />
        <Field k="Verified" v={c.verified ? 'Yes' : 'Not yet'} />
      </Section>

      {/* The consultant's own rates (10 Oct 2026): one for each way to
          reach them, and a booking that is its rate times 20 minutes. */}
      <Section label="Rates">
        {c.fixed.map((s) => (
          <Field
            key={s.id}
            k={`Booking · ${s.duration_mins} min`}
            v={`₹${rupees(s.price_paise)} · ₹${rupees(Math.round(s.price_paise / s.duration_mins))}/min`}
          />
        ))}
        {[
          ['chat', 'Chat'],
          ['video', 'Video call'],
          ['audio', 'Audio call'],
        ].map(([key, label]) =>
          c.channels?.[key] ? (
            <Field key={key} k={label} v={`₹${rupees(c.channels[key].price_paise)} a minute`} />
          ) : null,
        )}
        {/* "Unlimited questions" and the how-you-pay note went on 11 Oct
            2026 (Rahul). */}
      </Section>
    </>
  )
}

/**
 * Published work and reviews, both read from the tables phase 9 built.
 *
 * This replaces a function called `seedFor` that matched the real consultant
 * row to a mock one BY DISPLAY NAME — the join the schema document spends a
 * section warning about. It was tolerable while it decorated two tabs and
 * touched no money; it is gone now, and with it the last place in this screen
 * where a number came from somewhere other than a row.
 */
function Work({ c, items }) {
  if (items === null) {
    return (
      <Section label="Work">
        <Loader />
      </Section>
    )
  }

  if (!items.length) {
    return (
      <Section label="Nothing published">
        <p className="prose-c">
          {firstName(c.name)} has not published anything yet. What they write will appear here.
        </p>
      </Section>
    )
  }

  /* Each post in full, newest first, as the feed draws it (11 Oct 2026,
     Rahul: the same as a user's profile, like Facebook's). It was a row per
     piece with a thumbnail. */
  return (
    <div className="mt-2 bg-white">
      {items.map((p) => (
        <FeedCard key={p.id} piece={p} />
      ))}
    </div>
  )
}

function Reviews({ c }) {
  const [reviews, setReviews] = useState(null)

  useEffect(() => {
    let active = true
    fetchReviews(c.id)
      .then((rows) => active && setReviews(rows))
      .catch((err) => {
        console.error('[reviews] load failed:', err.message)
        if (active) setReviews([])
      })
    return () => {
      active = false
    }
  }, [c.id])

  if (reviews === null) {
    return (
      <Section label="Reviews">
        <Loader />
      </Section>
    )
  }

  /* Honest and small beats large and invented: a consultant with no completed
     sessions has no reviews, and a review is a row that can only be written
     against one. */
  if (!reviews.length) {
    return (
      <Section label="No reviews yet">
        <p className="prose-c">
          A review can only be left after a session that actually happened. There have not been
          any.
        </p>
      </Section>
    )
  }

  const avg = (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)

  return (
    <Section label={`${reviews.length} ${reviews.length === 1 ? 'review' : 'reviews'}`}>
      {/* The distribution, drawn as rules. A single average hides whether the
          rating is a consensus or a fight. */}
      <div className="flex items-center gap-6 border-b border-rule pb-8">
        <div className="flex-none text-center">
          <p className="text-display font-semibold tnum">{avg}</p>
          <Ticks value={Math.round(avg)} className="mt-2 w-16" />
        </div>
        <ul className="min-w-0 flex-1">
          {distribution(reviews).map(([stars, pct]) => (
            <li key={stars} className="flex items-center gap-3 py-1">
              <span className="w-2 flex-none text-micro text-t3 tnum">{stars}</span>
              <span className="h-[2px] flex-1 bg-rule">
                <span className="block h-full bg-t1" style={{ width: `${pct}%` }} />
              </span>
              <span className="w-8 flex-none text-right text-micro text-t3 tnum">{pct}%</span>
            </li>
          ))}
        </ul>
      </div>

      <ul>
        {reviews.map((r) => (
          <li key={r.id} className="border-b border-rule py-5">
            <div className="flex items-center justify-between gap-4">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-meta text-t1">{r.name}</span>
                {/* Unverified reviews are visibly distinguished — the phase's
                    third done-condition. `verified` is derived from whether a
                    booking sits behind the row, so it cannot be set by hand. */}
                {r.verified ? (
                  <span className="flex-none text-micro uppercase tracking-caps gold">Verified</span>
                ) : (
                  <span className="flex-none text-micro uppercase tracking-caps t-faint">
                    Unverified
                  </span>
                )}
              </span>
              <span className="flex flex-none items-center gap-3">
                <Ticks value={r.rating} className="w-12" />
                <span className="text-micro uppercase tracking-caps text-t3">{r.ago}</span>
              </span>
            </div>
            {r.text && <p className="mt-3 text-body text-t2">{r.text}</p>}
          </li>
        ))}
      </ul>
    </Section>
  )
}
