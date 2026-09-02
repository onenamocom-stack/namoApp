import { Link } from 'react-router-dom'
import {
  clips,
  courses,
  feed,
  liveSessions,
  posts,
  products,
  reads,
} from '../data/mock.js'
import { TabHeader } from '../components/Chrome.jsx'
import Icon from '../components/Icon.jsx'
import Plate from '../components/Plate.jsx'
import { Kicker, PopAvatar, PopBar, PopButton, PopTag } from '../components/Pop.jsx'
import { Acts, firstName } from '../components/Primitives.jsx'
import { useStore } from '../store.jsx'
import { longDate, panchangFrom, readingFrom, useAstro } from '../lib/astro.js'

/**
 * The free tools, as circles across the top of the feed.
 *
 * They were on Consult, mixed in with paid things — which is the wrong place
 * for the parts of the app that cost nothing. Free belongs at the top of the
 * first screen, where a new user meets it before being asked for money.
 *
 * Each is a route or an action on this screen; none of them opens a dead end.
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

/** Every feed record resolves against one of these by `refId`. */
const SOURCES = {
  post: posts,
  reel: clips,
  article: reads,
  live: liveSessions,
  course: courses,
  product: products,
}

/**
 * Home — one stream, mixed formats.
 *
 * The previous build split this into Feed / Reels / Live behind a switcher.
 * That is gone: reels, notes, articles, live rooms, courses, products and the
 * daily reading now interleave in a single scroll, and `kind` on each record
 * decides how the card renders. Nothing is duplicated — feed entries carry a
 * `refId` into the existing collections, so a card always resolves to real
 * data and stays in sync with the screen it links to.
 */
export default function Home({ action }) {
  /* The reading leads ahead of anything social. Panchang is pushed down after
     3-4 feed items so the daily reading is the immediate follow-up, not both
     product cards back-to-back. */
  const rest = feed
    .filter((f) => f.kind !== 'reading')
    .map((f) => {
      const found = SOURCES[f.kind]?.find((x) => x.id === f.refId)
      return found ? { ...f, data: found } : null
    })
    .filter(Boolean)

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

      <FreeTools />

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
            case 'live':
              return <LiveCard key={item.id} room={item.data} />
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
/** The free row. Circles, because a circle reads as a tool and a card reads as
    content — and everything below this line is content. */
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

  return (
    <article className="pop-card p-4">
      <Byline
        initials={p.initials}
        name={p.consultant}
        note={p.role}
        meta={p.time}
        to={`/consult/${p.consultantId}`}
      />
      <p className="mt-4 text-body t-sub">{p.text}</p>
      {p.plate && <Plate seed={p.id} className="mt-4 h-44 w-full" label={p.plate} />}

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
          { label: 'Reply', count: p.comments, onClick: () => showToast('Replies — prototype only') },
          { label: 'Share', count: p.shares, onClick: () => showToast('Note copied') },
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
          <span className="absolute inset-0 flex items-center justify-center">
            <span
              className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-white shadow-lg transition-transform duration-200 group-hover:scale-105"
            >
              <span className="caps-sm leading-none">▶</span>
            </span>
          </span>
          <span className="caps-sm absolute bottom-3 left-3 rounded-full bg-surface/90 px-2.5 py-1 shadow-sm t-sub tnum">
            {r.views} · {r.duration}
          </span>
        </Plate>
        <p className="mt-3 text-body t-heading">{r.caption}</p>
      </Link>
      <p className="mt-1.5 caps-sm t-faint">{r.audio}</p>
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
            <p className="caps-sm gold">{longDate(day.date)}</p>
            <h2 className="mt-3 font-display text-title leading-tight t-heading">{day.headline}</h2>
            <p className="mt-3 text-body t-body">{day.body}</p>

            {day.intensity !== null && (
              <div className="mt-5 border-t border-stroke pt-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="caps-sm t-faint">Overall</span>
                  <span className="caps-sm gold tnum">{day.intensity}/100</span>
                </div>
                <PopBar value={day.intensity} />
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

function ArticleCard({ read: b }) {
  const { hasFlag, toggleFlag } = useStore()

  return (
    <article className="pop-card p-4">
      <Byline
        initials={b.initials}
        name={b.consultant}
        note="published an article"
        meta={b.date}
        to={`/consult/${b.consultantId}`}
      />

      <Link to={`/read/${b.id}`} className="mt-4 block transition-opacity hover:opacity-80">
        <div className="pop-inset flex gap-4 p-3">
          <Plate seed={b.id} className="h-[72px] w-[72px] flex-none" />
          <span className="min-w-0 flex-1">
            <span className="caps-sm gold">{b.tag}</span>
            <span className="mt-1 block text-body t-heading">{b.title}</span>
            <span className="mt-1.5 block caps-sm t-faint tnum">
              {b.readTime} · {b.views} read
            </span>
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

function LiveCard({ room: l }) {
  // The host's own End control (ProGoLive.jsx) sets `offair:{id}` when she
  // stops broadcasting — the mock's `live: true` on l1 never flips back on
  // its own, and nothing here should keep showing her as live after that.
  const { hasFlag } = useStore()
  const live = l.live && !hasFlag(`offair:${l.id}`)

  return (
    <article className="pop-card p-4">
      <Link to={`/live/${l.id}`} className="block transition-opacity hover:opacity-80">
        <Plate seed={l.id} variant="orbit" className="aspect-video w-full">
          <span className="absolute left-3 top-3">
            {live ? (
              <span className="badge-live">● Live</span>
            ) : (
              <span className="caps-sm rounded-full bg-surface/90 px-2.5 py-1 shadow-sm t-sub">Soon</span>
            )}
          </span>
          {l.viewers && (
            <span className="caps-sm absolute right-3 top-3 rounded-full bg-surface/90 px-2.5 py-1 shadow-sm t-sub tnum">
              {l.viewers}
            </span>
          )}
        </Plate>

        <div className="mt-4 flex items-start gap-3">
          <PopAvatar initials={l.initials} size={32} online={live} />
          <span className="min-w-0 flex-1">
            <span className="block text-body t-heading">{l.topic}</span>
            <span className="mt-1 block caps-sm t-faint tnum">
              {firstName(l.consultant)} · {live ? `${l.startedAgo} ago` : l.startsIn ?? 'Ended'}
            </span>
          </span>
          <PopTag tone={live ? 'live' : 'default'}>{l.tag}</PopTag>
        </div>
      </Link>
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
