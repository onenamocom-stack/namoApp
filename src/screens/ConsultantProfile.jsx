import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { consultants as seedConsultants, SESSION } from '../data/mock.js'
import { Sheet, TopBar } from '../components/Chrome.jsx'
import Icon from '../components/Icon.jsx'
import Plate from '../components/Plate.jsx'
import { PopButton } from '../components/Pop.jsx'
import {
  Acts,
  Avatar,
  Button,
  Field,
  firstName,
  Section,
  Segmented,
  Stub,
  Tag,
  Ticks,
} from '../components/Primitives.jsx'
import { rupees, useStore } from '../store.jsx'
import { getConsultant, istToday, openSlots } from '../lib/consultants.js'

const TABS = [
  { key: 'about', label: 'About' },
  { key: 'work', label: 'Work' },
  { key: 'reviews', label: 'Reviews' },
]

/** Star distribution, as a share of all reviews. */
const DISTRIBUTION = [
  [5, 92],
  [4, 6],
  [3, 1],
  [2, 0.6],
  [1, 0.4],
]

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
  const { showToast, hasFlag, toggleFlag, openChat, bookSession, spending } = useStore()
  const [tab, setTab] = useState('about')
  const [sheet, setSheet] = useState(false)
  const [slot, setSlot] = useState(null)
  const [service, setService] = useState(null)
  const [c, setC] = useState(undefined)
  const [days] = useState(nextDays)
  const [day, setDay] = useState(days[0].key)
  const [slots, setSlots] = useState(null)

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
        <TopBar title="Consultant" back backTo="/consult" />
        <p className="p-10 text-center text-meta text-t3">Loading.</p>
      </div>
    )
  }
  if (!c) return <Navigate to="/consult" replace />

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

  return (
    <div className="flex h-full flex-col">
      <TopBar
        title={c.name}
        back
        backTo="/consult"
        sub={c.verified ? 'Verified' : c.category}
        right={
          <button
            type="button"
            onClick={() => showToast('Profile link copied')}
            className="text-label uppercase tracking-label text-t2"
          >
            Share
          </button>
        }
      />

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {/* No banner. A cover image on a profile this dense pushes the name,
            the numbers and the description below the fold, and it carried no
            information — it was a generated plate of the same art as the
            intro clip. The identity block leads instead. */}
        <section className="px-5 pb-6 pt-6">
          <div className="flex items-start gap-4">
            <Avatar initials={c.initials} size={76} />
            <div className="min-w-0 flex-1 pt-1">
              <h1 className="truncate text-lead font-semibold t-heading">{c.name}</h1>
              <p className="mt-0.5 truncate text-meta t-body">{c.specialization}</p>

              {/* Rating, reviews, experience and followers as one small line
                  under the name, the way a social profile reads them. They
                  were a four-column bordered grid taking 90px of height to
                  say four short numbers. */}
              <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] t-faint tnum">
                <span className="font-bold t-sub">{c.rating ?? 'New'}</span> rating
                <span aria-hidden="true">·</span>
                <span className="font-bold t-sub">{(c.reviewCount ?? 0).toLocaleString('en-IN')}</span>{' '}
                reviews
                <span aria-hidden="true">·</span>
                <span className="font-bold t-sub">
                  {c.experienceYrs ? `${c.experienceYrs} yrs` : 'Practising'}
                </span>
              </p>
            </div>
          </div>

          {/* The description. It was buried in the About tab; on a profile it
              is the thing you read right after the name. */}
          <p className="mt-4 text-meta leading-relaxed t-sub">{c.bio}</p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {c.credentials.map((cr) => (
              <Tag key={cr}>{cr}</Tag>
            ))}
          </div>

          {/* Follow takes half the row; schedule, message and call are glyphs
              beside it. Three labelled buttons would take two rows and say less
              than three icons everyone already reads.

              Schedule opens the same sheet as the sticky footer rather than a
              second booking path — one flow, two ways in. */}
          <div className="mt-5 flex items-center gap-2">
            <PopButton
              className="w-1/2 flex-none"
              full={false}
              variant={following ? 'ghost' : 'default'}
              onClick={() =>
                toggleFlag(`follow:${c.id}`, {
                  on: `Following ${firstName(c.name)}`,
                  off: `Unfollowed ${firstName(c.name)}`,
                })
              }
            >
              {following ? 'Following' : 'Follow'}
            </PopButton>
            <button
              type="button"
              aria-label={`Schedule a session with ${firstName(c.name)}`}
              onClick={openSheet}
              className="pill knob !h-10 flex-1 justify-center"
            >
              <Icon name="calendar" size={18} />
            </button>
            <button
              type="button"
              aria-label={`Message ${firstName(c.name)}`}
              onClick={() => openChat('live')}
              className="pill knob !h-10 flex-1 justify-center"
            >
              <Icon name="chat" size={18} />
            </button>
            <button
              type="button"
              aria-label={`Call ${firstName(c.name)}`}
              onClick={() => showToast(`Calling ${firstName(c.name)} — prototype only`)}
              className="pill knob !h-10 flex-1 justify-center"
            >
              <Icon name="phone" size={18} />
            </button>
          </div>

          {/* Intro recording. */}
          <button
            type="button"
            onClick={() => showToast('Intro recording — prototype only')}
            className="mt-5 block w-full text-left transition-opacity hover:opacity-70"
          >
            <Plate seed={`${c.id}-intro`} variant="orbit" className="aspect-video w-full">
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex items-center gap-2 rounded-full bg-surface/90 px-3.5 py-2 shadow-sm caps-sm t-sub">
                  ▶ Meet {firstName(c.name)} · 1:24
                </span>
              </span>
            </Plate>
          </button>
        </section>

        <Segmented items={TABS} value={tab} onChange={setTab} />

        <div key={tab} className="animate-fade">
          {tab === 'about' && <About c={c} />}
          {tab === 'work' && <Work c={c} />}
          {tab === 'reviews' && <Reviews c={c} />}
        </div>

        <Section label="Book" last>
          <Stub className="mb-8" />
          <p className="prose-c mb-8">
            Bring the question you have been rewriting in your head. Not the polite version of it.
          </p>
          <Button onClick={openSheet} variant="solid">
            Book a session · ₹{rupees(c.pricePaise ?? 0)}
          </Button>
        </Section>

        <div className="h-8" />
      </div>

      {/* Sticky footer. The price and the one action follow you down the page,
          which is the difference between a profile and a brochure. */}
      <div className="flex flex-none items-center gap-4 border-t border-rule bg-bg px-6 py-4">
        <div className="min-w-0">
          <p className="text-lead font-light tnum">₹{rupees(c.pricePaise ?? 0)}</p>
          <p className="mt-0.5 text-micro uppercase tracking-caps text-t3">
            {SESSION.label}
            {c.perMinutePaise != null && ` · ₹${rupees(c.perMinutePaise)}/min live`}
          </p>
        </div>
        <Button onClick={openSheet} variant="solid" className="flex-1">
          Book a call
        </Button>
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title={`Book ${firstName(c.name)}`}>
        <p className="label text-left mb-4">Length</p>
        {/* The lengths are this consultant's own service rows, each priced off
            a platform band. They are not `SESSION_LENGTHS` scaled by a rate the
            browser worked out. */}
        <Segmented
          items={c.fixed.map((s) => ({ key: s.id, label: `${s.duration_mins} min` }))}
          value={service?.id}
          onChange={(id) => setService(c.fixed.find((s) => s.id === id) ?? null)}
        />

        <p className="label mt-8 text-left mb-4">Day</p>
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
      <Section label="Practical">
        <Field k="Speaks" v={c.languages.join(' · ') || '—'} />
        <Field k="Category" v={c.category} />
        <Field k="Experience" v={c.experienceYrs ? `${c.experienceYrs} yrs` : '—'} />
        <Field k="Verified" v={c.verified ? 'Yes' : 'Not yet'} />
      </Section>

      <Section label="What a session is">
        {c.fixed.map((s) => (
          <Field key={s.id} k={`${s.duration_mins} min`} v={`₹${rupees(s.price_paise)}`} />
        ))}
        {c.perMinute && (
          <Field k="Instant call" v={`₹${rupees(c.perMinute.price_paise)} a minute`} />
        )}
        <Field k="Questions" v={SESSION.promise} />
        <p className="mt-6 text-center text-meta text-t3">
          Pick the length that fits when you book. Ask as much as you like inside it — if the
          call runs over, it runs over.
        </p>
      </Section>
    </>
  )
}

/**
 * Published work and reviews are phase 9 tables and do not exist yet, so both
 * tabs still read mock.js — matched to the real row BY DISPLAY NAME, which is
 * exactly the join the schema document spends a section warning about.
 *
 * It is tolerable here and nowhere else: it decorates two tabs, it touches no
 * money and no identity, and it resolves to nothing for a consultant who
 * applied rather than being seeded — who then correctly shows zero. Phase 9
 * deletes this function.
 */
function seedFor(c) {
  return seedConsultants.find((m) => m.name === c.name) ?? null
}

function Work({ c }) {
  const seed = seedFor(c)
  if (!seed) {
    return (
      <Section label="Nothing published">
        <p className="prose-c">
          {firstName(c.name)} has not published anything yet. What they write will appear here.
        </p>
      </Section>
    )
  }
  c = { ...c, content: seed.content }
  return (
    <Section label={`${c.content.length} pieces`}>
      <ul>
        {c.content.map((p) => (
          <li
            key={p.id}
            className="flex items-baseline justify-between gap-4 border-b border-rule py-3.5"
          >
            <span className="min-w-0 truncate text-body text-t2">{p.title}</span>
            <span className="flex-none text-micro uppercase tracking-caps text-t3 tnum">
              {p.type} · {p.views}
            </span>
          </li>
        ))}
      </ul>
      <Link to="/home" className="act-link mt-6 inline-block text-meta">
        See everything in the feed
      </Link>
    </Section>
  )
}

function Reviews({ c }) {
  const { showToast } = useStore()
  const seed = seedFor(c)

  /* Honest and small beats large and invented: a consultant with no completed
     sessions has no reviews, and phase 9 is where a review becomes a row that
     can only be written against one. */
  if (!seed) {
    return (
      <Section label="No reviews yet">
        <p className="prose-c">
          A review can only be left after a session that actually happened. There have not been
          any.
        </p>
      </Section>
    )
  }
  c = { ...c, rating: seed.rating, reviewCount: seed.reviewCount, reviews: seed.reviews }

  return (
    <Section label={`${c.reviewCount.toLocaleString('en-IN')} reviews`}>
      {/* The distribution, drawn as rules. A single average hides whether the
          rating is a consensus or a fight. */}
      <div className="flex items-center gap-6 border-b border-rule pb-8">
        <div className="flex-none text-center">
          <p className="text-display font-light tnum">{c.rating}</p>
          <Ticks value={Math.round(c.rating)} className="mt-2 w-16" />
        </div>
        <ul className="min-w-0 flex-1">
          {DISTRIBUTION.map(([stars, pct]) => (
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
        {c.reviews.map((r) => (
          <li key={r.id} className="border-b border-rule py-5">
            <div className="flex items-center justify-between gap-4">
              <span className="text-meta text-t1">{r.name}</span>
              <span className="flex items-center gap-3">
                <Ticks value={r.rating} className="w-12" />
                <span className="text-micro uppercase tracking-caps text-t3">{r.ago}</span>
              </span>
            </div>
            <p className="mt-3 text-body text-t2">{r.text}</p>
          </li>
        ))}
      </ul>

      <Acts
        className="mt-6 justify-center"
        items={[
          {
            label: `All ${c.reviewCount.toLocaleString('en-IN')} reviews`,
            onClick: () => showToast('Full review list — prototype only'),
          },
        ]}
      />
    </Section>
  )
}
