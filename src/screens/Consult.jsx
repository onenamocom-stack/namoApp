import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { categories, liveSessions, SESSION } from '../data/mock.js'
import { Sheet, TabHeader } from '../components/Chrome.jsx'
import Icon from '../components/Icon.jsx'
import Plate from '../components/Plate.jsx'
import { Kicker, PopAvatar, PopButton } from '../components/Pop.jsx'
import { firstName, Search } from '../components/Primitives.jsx'
import { rupees, useStore } from '../store.jsx'
import { listConsultants, listMyBookings } from '../lib/consultants.js'
import { leaveReview, reviewableBookings } from '../lib/content.js'

/**
 * The free tools, as circles above the search field.
 *
 * They started here, moved to the top of Home on the argument that free
 * belongs on the first screen before anything asks for money, and are back.
 * **That reversed on 7 Sep 2026.** Home is a stream, and a row of circles
 * pinned above a stream is furniture the scroll immediately buries. Consult is
 * where somebody arrives already asking a question, and the honest answer to
 * most of them is one of these four rather than a paid session — so they sit
 * above the search field, in front of the thing that costs money.
 *
 * They render in the empty-roster branch too. With nobody approved there is
 * nothing to consult and these are the only working answers on the screen;
 * dropping them there would take the free half of the app off production
 * entirely, because production's roster is empty by decision (`01-PRD.md` §7).
 *
 * Each is a route or an overlay; none of them opens a dead end.
 */
const FREE_TOOLS = [
  {
    key: 'horoscope',
    label: 'tool.horoscope',
    icon: 'horoscope',
    act: ({ setHoroscopeOpen }) => setHoroscopeOpen(true),
  },
  { key: 'ai', label: 'tool.ai', icon: 'ai', act: ({ openChat }) => openChat('ai') },
  { key: 'tarot', label: 'tool.tarot', icon: 'tarot', to: '/tarot' },
  { key: 'match', label: 'tool.match', icon: 'consult', to: '/people' },
]

/** Circles, because a circle reads as a tool and a card reads as content. */
function FreeTools() {
  const { openChat, setHoroscopeOpen, t } = useStore()
  const bag = { openChat, setHoroscopeOpen }

  return (
    <section className="px-2 pb-1 pt-3">
      <ul className="flex items-start justify-around">
        {FREE_TOOLS.map((f) => (
          <li key={f.key}>
            {f.to ? (
              <Link to={f.to} className="tile w-[76px]">
                <span className="tile-face">
                  <Icon name={f.icon} size={23} />
                </span>
                <span className="caps-sm leading-tight t-body">{t(f.label)}</span>
              </Link>
            ) : (
              <button type="button" onClick={() => f.act(bag)} className="tile w-[76px]">
                <span className="tile-face">
                  <Icon name={f.icon} size={23} />
                </span>
                <span className="caps-sm leading-tight t-body">{t(f.label)}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-center caps-sm t-faint">{t('a.free')}</p>
    </section>
  )
}

/**
 * The three promo banners at the top of Consult — same object as Shop's, a
 * gradient block with one CTA, just themed for this roster. Kept as a local
 * const rather than a mock.js export: Shop.jsx set that precedent (its own
 * BANNERS array lives in the screen file), and there is no banner data
 * anywhere in mock.js to be consistent with instead.
 */
const BANNERS = [
  {
    id: 'bn-verified',
    kicker: 'Verified',
    title: 'Astrologers you can trust',
    note: 'Every expert screened and credential-checked. No exceptions.',
    cta: 'See astrologers',
    art: 'orbit',
    from: '#4338ca',
    to: '#818cf8',
  },
  {
    id: 'bn-first',
    kicker: 'Today only',
    title: `First session at ${SESSION.label}`,
    note: `${SESSION.promise}, any astrologer online.`,
    cta: 'Claim offer',
    art: 'halftone',
    from: '#14532d',
    to: '#4d9463',
  },
  {
    id: 'bn-refer',
    kicker: 'Refer a friend',
    title: 'Earn credit per referral',
    note: 'They get a discount. You get credit toward your next call.',
    cta: 'Refer now',
    art: 'contour',
    from: '#92660f',
    to: '#d29a2b',
  },
]

/**
 * Leaving a review.
 *
 * The rating is required and the words are not — a star with no sentence is
 * still a signal, and demanding prose is how review counts stay at three.
 *
 * There is no client-side check that the booking is completed and unreviewed.
 * The RLS policy is the enforcement (`020_content_reviews.sql`), and a second
 * copy of the rule here would be a second thing to keep in step. What this does
 * instead is show the server's refusal in the app's voice.
 */
function ReviewSheet({ booking, onClose, onDone }) {
  const { showToast } = useStore()
  const [rating, setRating] = useState(0)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  /* Reset when a different booking opens the sheet, so last time's four stars
     are not sitting there waiting to be submitted against somebody else. */
  useEffect(() => {
    setRating(0)
    setBody('')
  }, [booking?.id])

  if (!booking) return null

  async function submit() {
    setBusy(true)
    try {
      await leaveReview({
        bookingId: booking.id,
        consultantId: booking.consultant_id,
        rating,
        body: body.trim() || null,
      })
      showToast('Review posted')
      onDone()
    } catch (err) {
      showToast(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title={`Review ${firstName(booking.consultant_name)}`}>
      <div className="px-5 pb-6">
        <p className="prose-c">Rate the session, not the news in it.</p>

        <div className="mt-5 flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} out of 5`}
              aria-pressed={rating === n}
              onClick={() => setRating(n)}
              className={`h-11 w-11 rounded-full border text-body tnum transition-colors ${
                n <= rating ? 'border-gold bg-gold/10 t-heading' : 'border-rule t-faint'
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder="What did they actually help you decide? Optional."
          aria-label="Your review"
          className="mt-5 w-full resize-none border-b border-rule bg-transparent pb-2 text-body outline-none transition-colors placeholder:text-t4 focus:border-gold t-sub"
        />

        <PopButton
          variant="gold"
          className="mt-6"
          disabled={!rating || busy}
          onClick={submit}
        >
          {busy ? 'Posting' : rating ? 'Post review' : 'Pick a rating first'}
        </PopButton>
      </div>
    </Sheet>
  )
}

/**
 * The seven booking statuses as a seeker reads them, and what colour each one
 * is. Rendering `b.status` raw printed the enum — `no_show` came out as
 * "NO_SHOW" under `caps-sm` — and colouring everything except `declined` with
 * `text-ok` painted a cancelled or missed session as a green success row.
 * `03-APP-FLOW.md` §8.1 is the machine; this is its vocabulary.
 */
const STATUS = {
  pending: { label: 'Awaiting reply', tone: 't-faint' },
  confirmed: { label: 'Confirmed', tone: 'text-ok' },
  completed: { label: 'Done', tone: 'text-ok' },
  declined: { label: 'Declined · refunded', tone: 't-faint' },
  cancelled: { label: 'Cancelled', tone: 't-faint' },
  rescheduled: { label: 'Moved', tone: 't-faint' },
  no_show: { label: 'Missed', tone: 't-faint' },
}

/** How each channel is actually delivered. */
const CHANNELS = {
  call: { icon: 'phone', label: 'Call' },
  chat: { icon: 'chat', label: 'Chat' },
  live: { icon: 'live', label: 'Live' },
}

export default function Consult() {
  const { showToast, openChat, session } = useStore()
  /* Real consultants from phase 4, read through `consultants_public` — the
     view is the access control, so an unapproved practice is missing from
     this list because the server never sent it, not because a filter here
     dropped it. */
  const [consultants, setConsultants] = useState(null)
  const [cat, setCat] = useState('All')
  const [query, setQuery] = useState('')
  const [slide, setSlide] = useState(0)
  const rail = useRef(null)
  const listRef = useRef(null)

  /* The seeker's own bookings, from `bookings_view` — the same view the
     consultant's queue reads, restricting itself by the same predicate. This
     is the half of a booking that survives a reload: the toast does not, and
     before phase 5 there was nothing else to survive. */
  const [mine, setMine] = useState([])

  useEffect(() => {
    let live = true
    listConsultants().then((rows) => live && setConsultants(rows))
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    let live = true
    const uid = session?.user?.id
    if (uid) listMyBookings(uid).then((rows) => live && setMine(rows))
    else setMine([])
    return () => {
      live = false
    }
  }, [session])

  /* Which completed bookings have no review yet. The list is asked for rather
     than worked out from `mine`, because "already reviewed" lives in a table
     this screen does not otherwise read. */
  const [reviewable, setReviewable] = useState([])
  const [reviewing, setReviewing] = useState(null)

  const reloadReviewable = useCallback(() => {
    reviewableBookings()
      .then(setReviewable)
      .catch((err) => console.error('[reviews] load failed:', err.message))
  }, [])

  useEffect(() => {
    if (!session) return setReviewable([])
    reloadReviewable()
  }, [session, reloadReviewable])

  const step = (el) =>
    el.children[1] ? el.children[1].offsetLeft - el.children[0].offsetLeft : el.clientWidth

  const onRailScroll = (e) => {
    const i = Math.round(e.currentTarget.scrollLeft / step(e.currentTarget))
    if (i !== slide) setSlide(Math.min(Math.max(i, 0), BANNERS.length - 1))
  }

  const goTo = (i) => {
    const el = rail.current
    if (el) el.scrollTo({ left: i * step(el), behavior: 'smooth' })
  }

  const scrollToList = () => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const filters = ['All', ...categories]
  const q = query.trim().toLowerCase()
  const roster = consultants ?? []
  const list = roster.filter((c) => {
    const inCat = cat === 'All' || c.category === cat
    const inQuery =
      !q ||
      [c.name, c.specialization, c.category, ...c.languages].some((f) =>
        f.toLowerCase().includes(q),
      )
    return inCat && inQuery
  })

  /* There is no `online` column and no presence yet — that is phase 6, and a
     dot that is always green is worse than no dot. `verified` is a real column
     on a real row, and it is the claim this rail was always making.

     Filtered from `list`, not from `roster`. Taken off the whole roster it
     disagreed with the count beside it — filter to a category holding one
     person and the line read "1 person · 4 verified", more verified than
     people — and the rail went on offering verified astrologers to somebody
     who had just asked for tarot. */
  const featured = list.filter((c) => c.verified)

  /* Nobody approved: the empty state IS the screen, not a line of grey text
     under the furniture. Everything above it — three banners promising
     screened experts, category chips reading `· 0`, a "0 verified" rail, a
     line insisting every session is twenty minutes — describes a roster that
     does not exist, and a page that advertises supply above an empty list
     contradicts itself twice before you finish scrolling.

     Search goes too. There is nothing to search. */
  if (consultants !== null && roster.length === 0) {
    return (
      <>
        <TabHeader />
        <FreeTools />
        <section className="px-5 pt-6">
          <NobodyYet />
        </section>
        <div className="h-24" />
      </>
    )
  }

  return (
    <>
      <TabHeader />

      <FreeTools />

      <Search value={query} onChange={setQuery} placeholder="Search by name, concern or language" />

      {/* ── Banners ─────────────────────────────────────────────────────── */}
      <div className="pt-4">
        <div ref={rail} onScroll={onRailScroll} className="rail gap-3 px-4">
          {BANNERS.map((b, i) => (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                if (b.id === 'bn-verified') scrollToList()
                else if (b.id === 'bn-refer') showToast('Opening invite — prototype only')
                else showToast('Offer — prototype only')
              }}
              className="banner w-[86%] p-3 text-left"
              style={{
                backgroundImage: `linear-gradient(135deg, ${b.from} 0%, ${b.to} 100%)`,
                animation: `pop-in .5s cubic-bezier(.2,.7,.3,1) ${i * 80}ms backwards`,
              }}
            >
              <Plate
                seed={b.id}
                variant={b.art}
                className="pointer-events-none absolute -right-8 -top-6 h-[150%] w-2/3 animate-float bg-transparent opacity-25 mix-blend-overlay"
              />
              <span className="sheen animate-sweep" style={{ animationDelay: `${i * 2}s` }} />

              {/* Half height, 7 Sep 2026 — 197px to ~98px. Padding, type step
                  and CTA all come down, and `note` is dropped rather than
                  shrunk: two lines of 13px is most of the height being cut,
                  and a banner is a kicker, a claim and a way in. The note is
                  still on the object, so restoring it is one line. */}
              {/* `flex flex-col`, not `block`. As a block the children are
                  inline and the last one carries a line-box descender — 11px
                  of dead space under the CTA that no padding rule explains. */}
              <span className="relative flex flex-col items-start">
                <span className="caps-sm text-white/70">{b.kicker}</span>
                <span className="mt-1 block max-w-[22ch] text-lead font-medium leading-tight text-white">
                  {b.title}
                </span>
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1 caps-sm text-ink shadow-md">
                  {b.cta} <span aria-hidden="true">→</span>
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="mt-3.5 flex justify-center gap-1.5">
          {BANNERS.map((b, i) => (
            <button
              key={b.id}
              type="button"
              aria-label={`Banner ${i + 1}`}
              aria-current={slide === i}
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                slide === i ? 'w-6 bg-ink' : 'w-1.5 bg-black/20'
              }`}
            />
          ))}
        </div>
      </div>

      {/* ── Your sessions ─────────────────────────────────────────────────
          Real rows, so a booking survives a reload — which the toast never
          did. Hidden when there are none: a heading over an empty list
          advertises a history that does not exist. Declined rows stay
          visible, because the money came back and the seeker should be able
          to see where it went. */}
      {mine.length > 0 && (
        <section className="px-5 pt-6">
          <Kicker>Your sessions</Kicker>
          <ul className="mt-3 space-y-2">
            {mine.slice(0, 4).map((b) => (
              <li key={b.id} className="pop-inset flex items-center gap-3 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-meta t-heading">{b.consultant_name}</span>
                  <span className="mt-0.5 block caps-sm t-faint tnum">
                    {new Date(b.starts_at).toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Asia/Kolkata',
                    })}{' '}
                    · {b.duration_mins} min
                  </span>
                </span>
                <span className="flex-none text-right">
                  <span className="block caps-sm tnum t-heading">₹{rupees(b.amount_paise)}</span>
                  {/* A review is offered only where one can actually be left:
                      a completed booking of yours that has none yet. That is
                      the same condition the RLS policy enforces, so the button
                      never appears on something the server would refuse. */}
                  {reviewable.some((r) => r.id === b.id) ? (
                    <button
                      type="button"
                      onClick={() => setReviewing(b)}
                      className="act-link mt-0.5 block caps-sm"
                    >
                      Review
                    </button>
                  ) : (
                    <span className={`mt-0.5 block caps-sm ${STATUS[b.status]?.tone ?? 't-faint'}`}>
                      {STATUS[b.status]?.label ?? b.status}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ReviewSheet
        booking={reviewing}
        onClose={() => setReviewing(null)}
        onDone={() => {
          setReviewing(null)
          reloadReviewable()
        }}
      />

      {/* ── Category chips ─────────────────────────────────────────────── */}
      <div className="relative mt-4">
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-1">
          {filters.map((f) => {
            const count = f === 'All' ? roster.length : roster.filter((c) => c.category === f).length
            return (
              <button
                key={f}
                type="button"
                aria-pressed={cat === f}
                onClick={() => setCat(f)}
                className="pill caps-sm tnum"
              >
                {f} · {count}
              </button>
            )
          })}
        </div>
        <span className="scroll-fade" aria-hidden="true" />
      </div>

      {/* ── The verified rail ─────────────────────────────────────────────
          Hidden when nobody is verified, which is the normal state early on:
          approval and verification are different claims, and a heading over an
          empty rail advertises a shortlist that does not exist. */}
      {featured.length > 0 && (
      <section className="pt-6">
        <div className="mb-3 flex items-baseline justify-between px-4">
          <p className="font-display text-lead t-heading">
            {SESSION.promise} in {SESSION.label}
          </p>
          <span className="flex-none caps-sm text-ok">{featured.length} verified</span>
        </div>
        <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-1">
          {featured.map((c) => (
            <div key={c.id} className="pop-card w-36 flex-none p-3.5 text-center">
              <PopAvatar initials={c.initials} size={64} online={c.verified} className="mx-auto" />
              <p className="mt-2.5 truncate text-meta t-heading">{c.name}</p>
              <p className="mt-0.5 truncate caps-sm t-faint">{c.specialization.split(' · ')[0]}</p>
              <div className="mt-2 flex items-center justify-between">
                <span className="caps-sm gold tnum">{c.rating}</span>
                <span className="text-meta t-heading tnum">₹{rupees(c.pricePaise)}</span>
              </div>
              <PopButton variant="gold" size="sm" className="mt-2.5" to={`/consult/${c.id}`}>
                Book
              </PopButton>
            </div>
          ))}
        </div>
      </section>
      )}

      {/* ── Available now — the full roster ───────────────────────────── */}
      <section ref={listRef} className="px-5 pt-8">
        <p className="mb-3 caps-sm t-faint">
          Every session is {SESSION.label} · {SESSION.promise.toLowerCase()}
        </p>

        <Kicker>
          {`${list.length} ${list.length === 1 ? 'person' : 'people'}${
            featured.length > 0 ? ` · ${featured.length} verified` : ''
          }`}
        </Kicker>

        <ul className="mt-4 space-y-3">
          {list.map((c) => (
            <li key={c.id} className="pop-card p-4">
              <Link
                to={`/consult/${c.id}`}
                className="flex items-start gap-4 transition-opacity hover:opacity-60"
              >
                <PopAvatar initials={c.initials} size={56} online={c.verified} />

                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-body text-t1">{c.name}</span>
                    <span className="flex-none text-body text-t1 tnum">
                      {/* The per-minute rate is its own service row, priced off
                          the same band. It is not `price / SESSION.mins` any
                          more — that division was the browser inventing a
                          price, which is the shape rule 3 exists to stop. */}
                      ₹{c.perMinutePaise != null ? rupees(c.perMinutePaise) : '—'}
                      <span className="text-meta text-t3">/min</span>
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-meta text-t3">{c.specialization}</span>
                  <span className="mt-1.5 flex items-center gap-2 text-micro uppercase tracking-caps text-t3 tnum">
                    <span className="gold">{c.rating ?? 'New'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{c.experienceYrs ? `${c.experienceYrs} yrs` : 'Practising'}</span>
                  </span>
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {c.languages.map((lang) => (
                      <span key={lang} className="rounded-md border border-stroke bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-t2">
                        {lang}
                      </span>
                    ))}
                  </span>
                </span>
              </Link>

              {/* Call is a permanent stub — no calling infra exists. Chat opens
                  the real panel. Live goes straight to the real room when the
                  consultant actually has one running; online does not mean
                  broadcasting, so when they don't, it's the same honest toast
                  as Call rather than a fake destination. */}
              <div className="mt-4 flex items-center gap-2 border-t border-rule pt-4">
                {['call', 'chat', 'live'].map((kind) => {
                  /* Live rooms are still mock and keyed on mock ids, so this
                     never matches a real consultant and every Live tap is the
                     honest toast below. Phase 9 gives `content` real rows. */
                  const liveSession =
                    kind === 'live' && liveSessions.find((l) => l.consultantId === c.id && l.live)
                  const onClick = liveSession
                    ? undefined
                    : kind === 'call'
                      ? () => showToast(`Calling ${firstName(c.name)} — prototype only`)
                      : kind === 'chat'
                        ? () => openChat('live')
                        : () => showToast(`${firstName(c.name)} isn't live right now — prototype only`)

                  return (
                    <PopButton
                      key={kind}
                      size="sm"
                      variant={kind === 'live' ? 'gold' : 'ghost'}
                      full={false}
                      className="flex-1"
                      to={liveSession ? `/live/${liveSession.id}` : undefined}
                      onClick={onClick}
                    >
                      <Icon name={CHANNELS[kind].icon} size={15} />
                      <span className="ml-1.5">{CHANNELS[kind].label}</span>
                    </PopButton>
                  )
                })}
              </div>
            </li>
          ))}
        </ul>

        {consultants === null && (
          <p className="py-10 text-center text-meta text-t3">Reading the roster.</p>
        )}

        {/* `consultants !== null` matters: while the fetch is in flight both
            `roster` and `list` are empty, and without it this rendered
            directly under "Reading the roster." — a load in progress reading
            as a search that found nobody. */}
        {consultants !== null && list.length === 0 && (
          <p className="py-10 text-center text-meta text-t3">
            Nobody matches that. Clear the search or pick another category.
          </p>
        )}
      </section>

      <div className="h-24" />
    </>
  )
}

/**
 * What `/consult` is before there is a marketplace.
 *
 * An empty list is the truthful state of a marketplace with no approved
 * consultants, and it is worth saying plainly rather than dressing up: the
 * alternative considered was seeding six invented astrologers with invented
 * credentials so the page looked busy, which stops being decoration and starts
 * being fraud the day phase 5 can take money for a session.
 *
 * It offers the one action that changes the situation. It does NOT offer to
 * take your number and tell you when readings open: everybody standing here is
 * already signed in, so their number is on file, and nothing in this app can
 * send that message. An unimplemented promise on screen is the same mistake as
 * the cashback label, and that one got deleted rather than deferred.
 */
function NobodyYet() {
  return (
    <div className="pop-card mt-4 overflow-hidden">
      <Plate seed="consult-empty" variant="orbit" className="!rounded-none h-32 w-full !shadow-none" />
      <div className="p-5">
        <Kicker>Nobody is reading yet</Kicker>
        <p className="mt-3 text-meta t-sub">
          No astrologer has been approved. Nothing is hidden from you and no filter is on — the
          list is empty because the practice is new.
        </p>
        <p className="mt-3 text-meta t-sub">
          We approve one at a time and read every application. Until somebody clears that, there
          is nothing here to book.
        </p>
        <PopButton variant="gold" className="mt-5" to="/pro/apply">
          Apply to take sessions
        </PopButton>
        <p className="mt-3 caps-sm t-faint">For astrologers, tarot readers and coaches</p>
      </div>
    </div>
  )
}
