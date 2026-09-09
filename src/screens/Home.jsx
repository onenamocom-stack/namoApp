import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { courses, feed, products } from '../data/mock.js'
import { fetchFeed } from '../lib/content.js'
import { TabHeader } from '../components/Chrome.jsx'
import Icon from '../components/Icon.jsx'
import Plate from '../components/Plate.jsx'
import { Kicker, PopAvatar, PopBar, PopButton, PopTag } from '../components/Pop.jsx'
import { Acts } from '../components/Primitives.jsx'
import { useStore } from '../store.jsx'
import { longDate, panchangFrom, readingFrom, useAstro } from '../lib/astro.js'

/**
 * What is still hand-ordered in `mock.js`, and why each one is.
 *
 * `course` / `product` belong to phase 10. Posts, reels and articles are gone
 * from here because they are a query now, and the live room went with live
 * video on 9 Sep 2026.
 */
const SOURCES = {
  course: courses,
  product: products,
}

/** `content.kind` in the database → which card renders it. */
const CARD_FOR_KIND = { post: 'post', clip: 'reel', article: 'article' }

/**
 * Home — one stream, mixed formats.
 *
 * The previous build split this into Feed / Reels / Live behind a switcher.
 * That is gone: reels, notes, articles, courses, products and the
 * daily reading now interleave in a single scroll, and `kind` on each record
 * decides how the card renders. Nothing is duplicated — feed entries carry a
 * `refId` into the existing collections, so a card always resolves to real
 * data and stays in sync with the screen it links to.
 */
export default function Home({ action }) {
  /* The feed is a QUERY, not a table (05-BACKEND-SCHEMA.md §5.3). Newest live
     content from approved consultants, and nothing here re-sorts it — a second
     ordering in the client would be the ranking system that section refuses. */
  const [published, setPublished] = useState([])

  useEffect(() => {
    let active = true
    fetchFeed({ kinds: ['post', 'clip', 'article'] })
      .then((rows) => active && setPublished(rows))
      .catch((err) => console.error('[feed] load failed:', err.message))
    return () => {
      active = false
    }
  }, [])

  /* The reading leads ahead of anything social. Panchang is pushed down after
     3-4 feed items so the daily reading is the immediate follow-up, not both
     product cards back-to-back. */
  const real = published.map((c) => ({ id: c.id, kind: CARD_FOR_KIND[c.kind], data: c }))

  /* What is left of the hand-ordered mock: courses and products.
     They sit AFTER the real content rather than interleaved, because
     interleaving would need a rank to interleave on and there is no ranking
     yet. When phase 10 makes these queries too, this list goes away and
     the sort above is already the right one. */
  const stillMock = feed
    .filter((f) => SOURCES[f.kind])
    .map((f) => {
      const found = SOURCES[f.kind]?.find((x) => x.id === f.refId)
      return found ? { ...f, data: found } : null
    })
    .filter(Boolean)

  const rest = [...real, ...stillMock]

  /* Both cards fetch for themselves rather than being handed data. They are
     rendered once each, they are the only two things on this screen that are
     computed, and threading two loading states through the feed loop to save
     two hooks would be the expensive kind of tidy. */
  const PANCHANG_AFTER = 3
  const items = [
    { id: 'f-reading', kind: 'reading' },
    ...rest.slice(0, PANCHANG_AFTER),
    { id: 'f-panchang', kind: 'panchang' },
    ...rest.slice(PANCHANG_AFTER),
  ]

  return (
    <>
      <Header action={action} />

      {/* The free tools row used to sit here, between the header and the
          stream. It is on Consult now, above the search field — see
          `FreeTools` there for why that reversed. */}

      <div className="space-y-3.5 p-4">
        {items.map((item) => {
          switch (item.kind) {
            case 'post':
              return <PostCard key={item.id} post={item.data} />
            case 'reel':
              return <ReelCard key={item.id} reel={item.data} />
            case 'reading':
              return <ReadingCard key={item.id} />
            case 'panchang':
              return <PanchangCard key={item.id} />
            case 'article':
              return <ArticleCard key={item.id} read={item.data} />
            case 'course':
              return <CourseCard key={item.id} course={item.data} />
            case 'product':
              return <ProductCard key={item.id} product={item.data} />
            default:
              return null
          }
        })}
      </div>

      <div className="px-5 py-10 text-center">
        <p className="caps-sm t-faint">End of today&apos;s feed</p>
      </div>

      {/* Clears the floating AI button and the tab bar. */}
      <div className="h-24" />
    </>
  )
}

/**
 * `action` lets the pro side reuse this whole screen — same stream, same seven
 * card types, one different button. Undefined means the seeker's horoscope
 * button, so /home is unchanged.
 */
function Header({ action }) {
  const { setHoroscopeOpen } = useStore()

  return (
    <TabHeader
      action={
        action ?? (
        /* A focused action, not a redirect. This used to navigate to
           Profile > Horoscope, which took you out of the tab you were on. */
        <button
          type="button"
          onClick={() => setHoroscopeOpen(true)}
          aria-label="Today's horoscope"
          className="pill knob !h-9 !w-9 justify-center"
        >
          <Icon name="horoscope" size={18} />
          </button>
        )
      }
    />
  )
}

/** Shared byline. Keeps every card's attribution identical. */
function Byline({ initials, name, meta, to, note }) {
  const inner = (
    <>
      <PopAvatar initials={initials} size={32} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-meta t-heading">{name}</span>
        {note && <span className="block caps-sm t-faint">{note}</span>}
      </span>
      {meta && <span className="flex-none caps-sm t-faint tnum">{meta}</span>}
    </>
  )
  if (to) {
    return (
      <Link to={to} className="flex items-center gap-3 transition-opacity hover:opacity-70">
        {inner}
      </Link>
    )
  }
  return <div className="flex items-center gap-3">{inner}</div>
}

function PostCard({ post: p }) {
  const { showToast, hasFlag, toggleFlag } = useStore()
  const liked = hasFlag(`like:${p.id}`)

  /* The like count is the view's aggregate plus your own un-saved tap, so the
     number moves the instant you press it and still agrees with the database
     on the next load. Reply and Share carry NO count: there is no comments
     table and no share to count, and the mock's 96 replies against zero rows
     is the lie this phase is here to stop telling. */
  return (
    <article className="pop-card p-4">
      <Byline
        initials={p.initials}
        name={p.consultant}
        meta={p.time}
        to={`/consult/${p.consultantId}`}
      />
      <p className="mt-4 text-body t-sub">{p.body || p.caption}</p>
      {/* A photo post carries an image; a plain note does not. Both are
          kind 'post' — the media is what separates them, not a fourth kind. */}
      {p.mediaUrl && (
        <img
          src={p.mediaUrl}
          alt=""
          className="mt-4 max-h-[26rem] w-full rounded-lg object-cover"
        />
      )}

      <Acts
        className="mt-5"
        items={[
          {
            label: 'Like',
            onLabel: 'Liked',
            on: liked,
            count: (p.likes + (liked ? 1 : 0)).toLocaleString('en-IN'),
            onClick: () => toggleFlag(`like:${p.id}`),
          },
          { label: 'Reply', onClick: () => showToast('Replies — prototype only') },
          { label: 'Share', onClick: () => showToast('Note copied') },
          {
            label: 'Save',
            onLabel: 'Saved',
            on: hasFlag(`save:${p.id}`),
            onClick: () =>
              toggleFlag(`save:${p.id}`, {
                on: 'Saved to your reading list',
                off: 'Removed from your reading list',
              }),
          },
        ]}
      />
    </article>
  )
}

function ReelCard({ reel: r }) {
  return (
    <article className="pop-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Byline initials={r.initials} name={r.consultant} to={`/consult/${r.consultantId}`} />
        <PopTag>Reel</PopTag>
      </div>

      <Link to={`/reels/${r.id}`} className="group block">
        <Plate seed={r.id} className="aspect-[4/5] w-full">
          {r.mediaUrl && !r.mediaUrl.match(/\.(mp4|webm|mov)$/i) && (
            <img
              src={r.mediaUrl}
              alt=""
              className="absolute inset-0 h-full w-full rounded-[inherit] object-cover"
            />
          )}
          <span className="absolute inset-0 flex items-center justify-center">
            <span
              className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-white shadow-lg transition-transform duration-200 group-hover:scale-105"
            >
              <span className="caps-sm leading-none">▶</span>
            </span>
          </span>
        </Plate>
        <p className="mt-3 text-body t-heading">{r.caption}</p>
      </Link>
      {/* No duration and no audio credit. Both were mock strings on a Plate
          that plays nothing; there is no upload path yet, so there is nothing
          to state a length for. The view count is real, which is why it is
          usually 0 — nothing server-side increments it (020's `view_count`). */}
      <p className="mt-1.5 caps-sm t-faint tnum">{r.time}</p>
    </article>
  )
}

/** The daily reading, inline. The product's core content, in the stream. */
function ReadingCard() {
  const { setHoroscopeOpen: setOpen, session, sessionReady } = useStore()
  const horoscope = useAstro('horoscope', {
    ready: sessionReady,
    who: session?.user?.id ?? null,
  })
  const day = readingFrom(horoscope.payload, 'today', null)

  return (
    <article className="pop-card p-4">
      <Kicker action="Read all" onAction={() => setOpen(true)}>
        Today&apos;s reading
      </Kicker>
      <div className="pop-inset mt-4 p-4">
        {horoscope.loading && <p className="text-meta t-faint">Reading the sky.</p>}

        {/* Signed out, or with no birth details, this says which. It does not
            show somebody else's reading and it does not go blank — a card that
            is empty for no stated reason is the same bug as a card that is
            confidently wrong. */}
        {horoscope.refusal && <p className="text-meta t-body">{horoscope.refusal.reason}</p>}

        {day && (
          <>
            <p className="caps-sm gold">
              {longDate(day.date)}
              {/* NO RASHI LABEL HERE ANY MORE, 9 Sep, and removing it is the
                honest move rather than a retreat. What is left of this reading
                after the canonical-birth fields came out is the panchang mood
                and the day's clock windows — and those are byte-identical
                across all twelve signs, checked. Naming a sign beside content
                that does not vary by sign claims a personalisation that is not
                there, which is the same failure as the fields we just removed.
                The reader's own moon sign still appears where it is true: in
                the header, off their own chart. */}
            </p>
            {/* THE HEADLINE, THE SUMMARY AND THE 0-100 SCORE ARE GONE, 9 Sep.
                All three were computed from the canonical birth this reading
                comes from rather than from the reader — the score is weighted
                by that invented person's dasha, and the headline named it out
                loud. What is left is the day itself, which is the same day for
                everybody and true for all of them. `readingFrom()` has the
                field-by-field reasoning. */}
            <p className="mt-3 text-body t-body">{day.dayMood}</p>

            {day.windows.length > 0 && (
              <div className="mt-5 border-t border-stroke pt-4">
                <span className="caps-sm t-faint">Windows</span>
                <ul className="mt-2">
                  {day.windows.map((w) => (
                    <li key={w.key} className="flex items-baseline justify-between py-1">
                      <span className="text-meta t-body">{w.label}</span>
                      <span className="text-meta t-faint tnum">
                        {w.start} – {w.end}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </article>
  )
}

/**
 * Today's panchang, as the second card.
 *
 * Six figures in a grid and the window anyone actually checks. Rahu kaal gets
 * the warning colour because it is the only line here that tells you not to do
 * something. Abhijit used to sit beside it and has moved to the reading's own
 * Windows section, which is where the API computes it.
 *
 * **This is the one computed thing on the screen that works signed out**, and
 * it should: a panchang is a function of a date and a place, not of a person.
 * The server anchors it on the birth place when there is one and on Pune when
 * there is not. Anchoring it the same way the reading is anchored is what stops
 * the two cards naming different tithis — which is exactly what the mock they
 * replace did, a week apart.
 */
function PanchangCard() {
  const { session, sessionReady } = useStore()
  const got = useAstro('panchang', { ready: sessionReady, who: session?.user?.id ?? null })
  const p = panchangFrom(got.payload)

  return (
    <article className="pop-card p-4">
      <Kicker action="Full chart" to="/chart">
        Today&apos;s panchang
      </Kicker>

      {got.loading && <p className="mt-3 text-meta t-faint">Working out the day.</p>}
      {got.refusal && <p className="mt-3 text-meta t-body">{got.refusal.reason}</p>}

      {p && (
        <>
          <p className="mt-2 caps-sm t-faint tnum">
            {longDate(p.date)}
            {p.lunarMonth && ` · ${p.lunarMonth}`}
            {p.samvat && ` · VS ${p.samvat}`}
          </p>
          {/* Named, not implied. One almanac serves every user and it is
              computed at Ujjain — the classical meridian of Indian astronomy —
              so a reader in Chennai is looking at a sunrise about forty minutes
              from their own. Saying so is the difference between a simplifying
              choice and a quiet inaccuracy. */}
          {got.city && (
            <p className="mt-1 caps-sm t-faint">Computed at {got.city}</p>
          )}

          <dl className="mt-4 grid grid-cols-3 gap-y-4">
            {[
              ['Tithi', p.tithi],
              ['Nakshatra', p.nakshatra],
              ['Yoga', p.yoga],
              ['Karana', p.karana],
              ['Moon', p.moonSign],
              ['Paksha', p.paksha],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="caps-sm t-faint">{k}</dt>
                <dd className="mt-1 text-meta t-heading">{v || '—'}</dd>
              </div>
            ))}
          </dl>

          {p.rahuKaal && (
            <div className="pop-inset mt-4 p-3">
              <p className="caps-sm text-live">Rahu kaal</p>
              <p className="mt-1 text-meta tnum t-heading">{p.rahuKaal}</p>
            </div>
          )}

          <div className="mt-3 flex items-center gap-3 caps-sm t-faint tnum">
            <span>Sunrise {p.sunrise}</span>
            <span aria-hidden="true">·</span>
            <span>Sunset {p.sunset}</span>
          </div>
        </>
      )}
    </article>
  )
}

/** 200 words a minute, the same arithmetic the studio shows while writing. */
export function readMins(body) {
  const words = (body || '').trim() ? body.trim().split(/\s+/).length : 0
  return Math.max(1, Math.ceil(words / 200))
}

function ArticleCard({ read: b }) {
  const { hasFlag, toggleFlag } = useStore()

  return (
    <article className="pop-card p-4">
      <Byline
        initials={b.initials}
        name={b.consultant}
        note="published an article"
        meta={b.time}
        to={`/consult/${b.consultantId}`}
      />

      <Link to={`/read/${b.id}`} className="mt-4 block transition-opacity hover:opacity-80">
        <div className="pop-inset flex gap-4 p-3">
          <Plate seed={b.id} className="h-[72px] w-[72px] flex-none" />
          <span className="min-w-0 flex-1">
            <span className="mt-1 block text-body t-heading">{b.title}</span>
            {/* Read time is COMPUTED from the body, not stored (§1.5). A stored
                one goes stale the first time the article is edited. */}
            <span className="mt-1.5 block caps-sm t-faint tnum">{readMins(b.body)} min</span>
          </span>
        </div>
      </Link>

      <Acts
        className="mt-4"
        items={[
          {
            label: 'Save for later',
            onLabel: 'Saved for later',
            on: hasFlag(`save:${b.id}`),
            onClick: () =>
              toggleFlag(`save:${b.id}`, {
                on: 'Saved to your reading list',
                off: 'Removed from your reading list',
              }),
          },
        ]}
      />
    </article>
  )
}

function CourseCard({ course: c }) {
  return (
    <article className="pop-card p-4">
      <Kicker action="Academy" to="/academy">
        Continue learning
      </Kicker>
      <div className="pop-inset mt-4 p-4">
        <div className="flex items-start gap-3">
          <Plate seed={c.id} className="h-16 w-16 flex-none" />
          <div className="min-w-0 flex-1">
            <p className="text-body t-heading">{c.title}</p>
            <p className="mt-1 caps-sm t-faint tnum">
              {c.tutor} · {c.lessons} lessons
            </p>
          </div>
        </div>
        {c.progress > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="caps-sm t-faint">Progress</span>
              <span className="caps-sm gold tnum">{c.progress}%</span>
            </div>
            <PopBar value={c.progress} />
          </div>
        )}
        <PopButton size="sm" to="/academy" variant="gold" className="mt-4">
          {c.progress > 0 ? 'Resume' : 'Start course'}
        </PopButton>
      </div>
    </article>
  )
}

function ProductCard({ product: p }) {
  const { addToCart } = useStore()
  const off = p.mrp ? Math.round((1 - p.price / p.mrp) * 100) : null

  return (
    <article className="pop-card p-4">
      <Kicker action="Shop" to="/shop">
        For your chart
      </Kicker>
      <div className="pop-inset mt-4 flex gap-4 p-3">
        <Plate seed={p.id} className="h-24 w-24 flex-none" />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-body t-heading">{p.name}</p>
          <p className="mt-1 text-meta t-faint">{p.subtitle}</p>
          <p className="mt-2 flex items-baseline gap-2 tnum">
            <span className="text-lead gold">₹{p.price.toLocaleString('en-IN')}</span>
            {off > 0 && <span className="caps-sm t-faint">{off}% off</span>}
          </p>
          <PopButton onClick={() => addToCart(p)} full={false} className="mt-auto self-start px-4">
            Add
          </PopButton>
        </div>
      </div>
    </article>
  )
}
