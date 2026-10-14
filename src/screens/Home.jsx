import { Fragment, useEffect, useRef, useState } from 'react'
import { birthHref } from '../lib/birth.js'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { courses, feed } from '../data/mock.js'
import { fetchProducts, productHref as pageOf } from '../lib/shop.js'
import ProductArt from '../components/ProductArt.jsx'
import { fetchFeed, fetchReposts, fetchSuggestions, isMine, productHref, recordView, reshareToLead } from '../lib/content.js'
import { fetchBhaktiReposts } from '../lib/bhakti.js'
import { shareLink } from '../lib/share.js'
import { TabHeader } from '../components/Chrome.jsx'
import { joinGroup, kindLabel, suggestGroups } from '../lib/groups.js'
import Icon from '../components/Icon.jsx'
import { ActIcon, Count } from '../components/ActIcon.jsx'
import BhaktiActions from '../components/BhaktiActions.jsx'
import { useReshare } from '../components/ReshareSheet.jsx'
import Plate from '../components/Plate.jsx'
import ReportSheet from '../components/ReportSheet.jsx'
import CommentSheet from '../components/CommentSheet.jsx'
import EditSheet from '../components/EditSheet.jsx'
import Composer from '../components/Composer.jsx'
import Hashtags from '../components/Hashtags.jsx'
import VerifiedMark from '../components/VerifiedMark.jsx'
import { BackButton } from '../components/Chrome.jsx'
import { Kicker, PopAvatar, PopBar, PopTag } from '../components/Pop.jsx'
import { Segmented } from '../components/Primitives.jsx'
import { useStore } from '../store.jsx'
import { longDate, panchangFrom, readingFrom, useAstro, useMyChart } from '../lib/astro.js'

/**
 * Where an author's name links to.
 *
 * A consultant's byline goes to the screen that sells them; a seeker's goes to
 * `/u/:id`, which has no rate, no slots and no Book button. Since `025` an
 * author is a person who may or may not also be a practitioner, and `content_public`
 * says which — so nothing here has to guess from the shape of the row.
 */
export function authorHref(c) {
  return c.isConsultant ? `/consult/${c.authorId}` : `/u/${c.authorId}`
}

/**
 * What is still hand-ordered in `mock.js`, and why each one is.
 *
 * `course` / `product` belong to phase 10. Posts, reels and articles are gone
 * from here because they are a query now, and the live room went with live
 * video on 9 Sep 2026.
 */
const SOURCES = {
  course: courses,
  product: [], // filled from the live catalogue, below
}

/** `content.kind` in the database → which card renders it. */
const CARD_FOR_KIND = { post: 'post', clip: 'reel', article: 'article' }

/**
 * One piece of content as the feed draws it — full width, with likes,
 * comments and share. A profile's Posts tab is a column of these, newest
 * first (11 Oct 2026, Rahul: "like the profile page of Facebook").
 */
export function FeedCard({ piece }) {
  switch (CARD_FOR_KIND[piece.kind]) {
    case 'post':
      return <PostCard post={piece} />
    case 'reel':
      return <ReelCard reel={piece} />
    case 'article':
      return <ArticleCard read={piece} />
    default:
      return null
  }
}

/**
 * One of your reshares as the feed draws it — under "↻ You reshared" with
 * your words — for your Profile's Reshared tab (13 Oct 2026, Rahul). `r` is
 * a row from fetchReposts or fetchBhaktiReposts (`picture` for the latter).
 */
export function ReshareCard({ r }) {
  const by = { id: r.byId, name: r.byName, avatar: r.byAvatar, others: 0, note: r.note }
  if (r.picture) return <PictureCard asset={r.asset} resharedBy={by} />
  switch (CARD_FOR_KIND[r.post.kind]) {
    case 'post':
      return <PostCard post={r.post} resharedBy={by} />
    case 'reel':
      return <ReelCard reel={r.post} resharedBy={by} />
    case 'article':
      return (
        <>
          <div className="bg-white"><ResharedLine by={by} /></div>
          <Quoted on={!!by.note}><ArticleCard read={r.post} /></Quoted>
        </>
      )
    default:
      return null
  }
}

/**
 * Somebody else's post or a Bhakti item, with your latest comment on it
 * above — your Profile's Commented tab (13 Oct 2026, Rahul). `r` is a row
 * from fetchCommented.
 */
export function CommentedCard({ r }) {
  const { t } = useStore()
  const card = r.picture ? <PictureCard asset={r.asset} /> : <FeedCard piece={r.post} />
  return (
    <>
      <div className="bg-white px-3 pt-2.5">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-t3">
          <Icon name="chat" size={14} weight={2} />
          {t('prof.youCommented')}
        </p>
        <p className="mt-1 whitespace-pre-line text-body text-t1">{r.body}</p>
      </div>
      {card}
    </>
  )
}

/* Hindi names since 30 Sep, on the owner's call — the first audience reads
   Hindi. The keys, and so the URLs, are unchanged. "Reels" stays English
   because that is the word Hindi speakers use for them. */
const TABS = [
  { key: 'feed', label: 'home.tab.feed' },
  { key: 'today', label: 'home.tab.today' },
  { key: 'darshan', label: 'home.tab.darshan' },
]

/**
 * Home — three tabs as of 9 Sep 2026: the stream, today's reading, the shrine.
 *
 * An older build split this into Feed / Reels / Live, which was a switcher
 * over three views of the same content and was rightly deleted. This is not
 * that. These are three different questions — what's new, what does today say,
 * and let me sit in front of a murti — and the middle one used to be answered
 * by hoisting two cards to the top of the stream and hoping they were seen
 * before the scroll buried them.
 *
 * The stream itself is unchanged and still mixes formats: reels, notes,
 * articles, courses, products, with `kind` on each record picking the card and
 * `refId` resolving into the existing collections, so nothing is duplicated.
 *
 * Tabs live in the URL (`/home/:tab`) rather than in state, for the same
 * reason Profile's do: a tab worth switching to is worth linking to, and the
 * back button should undo a tab change. `feed` maps to the bare `/home` so the
 * default has one address and not two.
 *
 * Darshan is a LINK, not a panel. It navigates to `/darshan`, which is the
 * shrine full screen with no tab bar — it needs the whole frame, and it is
 * the one screen in the app that does not scroll.
 */
export default function Home() {
  const { tab = 'feed' } = useParams()
  const navigate = useNavigate()
  const { t, session } = useStore()
  // `?compose=1` opens the composer: Dashboard's "Post more" and Studio's
  // old address land here (14 Oct 2026, Rahul: posting is Home's +).
  const [posting, setPosting] = useState(() => new URLSearchParams(window.location.search).get('compose') === '1')
  // Bumped after a publish, so the feed reloads with the new post in it.
  const [fresh, setFresh] = useState(0)

  /* Guard against a hand-typed segment, same as Profile. `darshan` is not in
     here: it is a destination, and the effect below leaves before this runs. */
  const known = TABS.some((tb) => tb.key === tab)

  /* The third tab is a doorway. Redirecting in an effect rather than
     rendering `<Navigate>` keeps `/home/darshan` out of the history stack, so
     Back from the shrine returns to the feed rather than bouncing through a
     tab that immediately forwards again. */
  useEffect(() => {
    if (tab === 'darshan') navigate('/darshan', { replace: true })
  }, [tab, navigate])

  /* The feed is a QUERY, not a table (05-BACKEND-SCHEMA.md §5.3). Ordered
     for the reader since 13 Oct 2026 (Rahul: "personalise the feeds"; it was
     dealt at random from 16 Sep): `fetchFeed` with `shuffle` asks the
     server's ranking, and deals at random only if that fails. */
  const [published, setPublished] = useState([])

  useEffect(() => {
    let active = true
    fetchFeed({ kinds: ['post', 'clip', 'article'], limit: 200, shuffle: true })
      .then((rows) => active && setPublished(rows))
      .catch((err) => console.error('[feed] load failed:', err.message))
    return () => {
      active = false
    }
  }, [fresh])

  /* Reshares: somebody else's post, again, under "X reshared". Woven in one
     after every three posts rather than appended, so they read as part of
     the stream; the stream is already dealt at random, so this is not a
     rank either. */
  const [reshares, setReshares] = useState([])
  const [lead, setLead] = useState(null)
  useEffect(() => {
    let active = true
    let wait
    // A post's reshares and a Bhakti picture's (12 Oct 2026), newest first.
    const load = () =>
      Promise.all([fetchReposts({ limit: 50 }), fetchBhaktiReposts({ limit: 50 })]).then(([posts, pictures]) => {
        if (!active) return
        setReshares(
          [...posts, ...pictures.map((r) => ({ ...r, picture: true }))].sort((a, b) =>
            String(b.at).localeCompare(String(a.at)),
          ),
        )
        setLead(reshareToLead())
      })
    load()
    // A reshare made while Home is open: read the list again once the write
    // has had a moment to land, so it can lead (13 Oct 2026).
    const again = () => {
      clearTimeout(wait)
      wait = setTimeout(load, 1200)
    }
    window.addEventListener('namo:reshared', again)
    return () => {
      active = false
      clearTimeout(wait)
      window.removeEventListener('namo:reshared', again)
    }
  }, [])
  // It leads for five seconds, as a new post does, then is dealt as usual.
  useEffect(() => {
    if (!lead) return undefined
    const timer = setTimeout(() => setLead(null), 5000)
    return () => clearTimeout(timer)
  }, [lead])

  /* The feed's shop cards are the real catalogue (6 Oct 2026; they were
     mock.js's products — invented names, a drawn plate, and an Add that put
     a product that does not exist in the cart). Featured and in stock
     first; each product slot in the hand-ordered list takes the next one. */
  const [catalogue, setCatalogue] = useState([])
  useEffect(() => {
    let active = true
    fetchProducts()
      .then((rows) => active && setCatalogue(rows.filter((r) => !r.soldOut).sort((a, b) => b.featured - a.featured)))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const posts = published.map((c) => ({ id: c.id, kind: CARD_FOR_KIND[c.kind], data: c }))
  /* One card per thing reshared, however many reshared it (12 Oct 2026,
     Rahul): ten reshares of one picture were ten copies in the feed. The
     newest resharer is named, the rest counted — "Tara and 9 others". */
  const grouped = new Map()
  for (const r of reshares) {
    if (!r.picture && CARD_FOR_KIND[r.post.kind] === 'article') continue
    // A reshare with words is that person's own card (13 Oct 2026): the
    // words are theirs, not the group's.
    const key = `${r.note ? `${r.byId}:` : ''}${r.picture ? `b:${r.asset.id}` : `p:${r.post.id}`}`
    const seen = r.note ? null : grouped.get(key)
    if (seen) seen.by.others += 1
    else
      grouped.set(key, {
        id: `rp:${key}`,
        kind: r.picture ? 'bhakti' : CARD_FOR_KIND[r.post.kind],
        data: r.picture ? r.asset : r.post,
        by: { id: r.byId, name: r.byName, avatar: r.byAvatar, others: 0, note: r.note },
      })
  }
  const reshared = [...grouped.values()]
  /* Your own reshare of `lead`, first. Yours is the card with your words,
     or the group your plain reshare is in. */
  const me = session?.user?.id
  const leading = lead
    ? reshared.findIndex(
        (g) => String(g.data.id) === lead && (!g.by.note || String(g.by.id) === String(me)),
      )
    : -1
  const first = leading >= 0 ? reshared.splice(leading, 1) : []
  const real = [...first]
  posts.forEach((p, i) => {
    real.push(p)
    if ((i + 1) % 3 === 0 && reshared.length) real.push(reshared.shift())
  })
  real.push(...reshared)

  /* What is left of the hand-ordered mock: courses and products.
     They sit AFTER the real content rather than interleaved, because
     interleaving would need a rank to interleave on and there is no ranking
     yet. When phase 10 makes these queries too, this list goes away and
     the sort above is already the right one. */
  let nextProduct = 0
  const stillMock = feed
    .filter((f) => SOURCES[f.kind])
    .map((f) => {
      if (f.kind === 'product') {
        const live = catalogue[nextProduct++]
        return live ? { ...f, id: `shop:${live.id}`, data: live } : null
      }
      const found = SOURCES[f.kind]?.find((x) => x.id === f.refId)
      return found ? { ...f, data: found } : null
    })
    .filter(Boolean)

  /* No longer hoisted into the stream. The reading and the panchang were
     spliced in at positions 1 and 4 so they would be seen before the scroll
     buried them; they have their own tab now, which is what that splice was
     approximating. */
  const items = [...real, ...stillMock]

  if (!known) return <Navigate to="/home" replace />
  if (tab === 'darshan') return null // the effect above is already leaving

  return (
    <>
      {/* Was a local `Header` wrapping this to inject a horoscope knob, and
          taking an `action` prop for a pro-side reuse that never happened.
          The knob opened the reading as a slide-over; the Today tab is that
          content with an address. Both are gone and this is the bare header.

          The free tools row used to sit here too. It is on Consult now, above
          the search field — see `FreeTools` there for why that reversed. */}
      <TabHeader />

      {/* The three tabs, and Groups beside them as a round button (14 Oct
          2026, Rahul): white people on saffron, a small + on its corner. */}
      <section className="flex items-center gap-2 px-4 pt-3">
        <div className="min-w-0 flex-1">
          <Segmented
            items={TABS.map((tb) => ({ ...tb, label: t(tb.label) }))}
            value={tab}
            onChange={(k) => navigate(k === 'feed' ? '/home' : `/home/${k}`)}
          />
        </div>
        <Link
          to="/groups"
          aria-label="Groups"
          title="Groups"
          className="relative flex h-11 w-11 flex-none items-center justify-center rounded-full bg-gold-fill text-white shadow-sm transition-transform active:scale-95"
        >
          <Icon name="groups" size={22} weight={1.9} />
          <span
            aria-hidden="true"
            className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white text-[14px] font-bold leading-none text-gold-fill ring-1 ring-gold-fill/40"
          >
            +
          </span>
        </Link>
      </section>

      {/* `key` re-runs the fade on every switch, so the tabs feel like they
          moved rather than repainted. Same trick as Profile. */}
      <div key={tab} className="animate-fade">
        {tab === 'today' ? (
          <div className="space-y-3.5 p-4">
            {/* Both fetch for themselves rather than being handed data, and
                both memoise through `cachedAstro`, so mounting them here costs
                nothing a hoisted card was not already costing. */}
            {/* Panchang first, the day's reading and windows under it
                (30 Sep, owner's call). */}
            <PanchangCard />
            <ReadingCard />
          </div>
        ) : (
          <>
            {/* White, full bleed, no gutters — the feed is a column of posts
                edge to edge, as Instagram's is. The stories strip of authors
                that sat on top was removed on 30 Sep (owner's call). */}
            <div className="mt-3 bg-white">
              {items.map((item, i) => {
                const card = (() => { switch (item.kind) {
                  case 'post':
                    return <PostCard key={item.id} post={item.data} resharedBy={item.by} />
                  case 'reel':
                    return <ReelCard key={item.id} reel={item.data} resharedBy={item.by} />
                  case 'article':
                    return <ArticleCard key={item.id} read={item.data} />
                  case 'bhakti':
                    return <PictureCard key={item.id} asset={item.data} resharedBy={item.by} />
                  case 'course':
                    return <CourseCard key={item.id} course={item.data} />
                  case 'product':
                    return <ProductCard key={item.id} product={item.data} />
                  default:
                    return null
                } })()
                // People to follow, once, after the fifth card (Phase 15a);
                // Groups for you after the twelfth (14 Oct 2026, Rahul).
                return i === 4 || i === 11 ? (
                  <Fragment key={item.id}>
                    {card}
                    {i === 4 ? <FollowSuggestions /> : <GroupSuggestions />}
                  </Fragment>
                ) : (
                  card
                )
              })}
            </div>

            <div className="px-5 py-10 text-center">
              <p className="caps-sm t-faint">{t('home.end')}</p>
            </div>
          </>
        )}
      </div>

      {/* Clears the tab bar and the + button. */}
      <div className="h-24" />

      <NewPostButton onOpen={() => setPosting(true)} />
      {posting && (
        <NewPostSheet
          onClose={() => {
            setPosting(false)
            if (window.location.search.includes('compose=')) navigate('/home', { replace: true })
          }}
          onPublished={() => {
            setPosting(false)
            if (window.location.search.includes('compose=')) navigate('/home', { replace: true })
            setFresh((n) => n + 1)
          }}
        />
      )}
    </>
  )
}

/**
 * New post, from Home only (10 Oct 2026, Rahul). A round + at the bottom
 * right, over the feed. Sticky inside the scroll rather than fixed, so it
 * sits above the tab bar without knowing how tall the bar is; it is the last
 * thing on the page, so it sticks for the whole scroll.
 */
function NewPostButton({ onOpen }) {
  const { session, showToast } = useStore()
  return (
    <div className="pointer-events-none sticky bottom-4 z-20 -mt-12 flex justify-end px-4">
      {/* 48px, 15% under the 56 it was, and the plus cut out of the disc so
          the feed shows through it (12 Oct 2026, Rahul: "transparent", not
          black). A mask, not a white stroke: it is a hole. */}
      <button
        type="button"
        aria-label="New post"
        onClick={() => (session ? onOpen() : showToast('Sign in to post.'))}
        className="pointer-events-auto h-12 w-12 rounded-full text-gold-fill drop-shadow-[0_5px_12px_rgba(0,0,0,0.25)] active:scale-95"
      >
        <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
          <defs>
            <mask id="new-post-plus">
              <rect width="48" height="48" fill="white" />
              <path d="M24 13.5v21M13.5 24h21" stroke="black" strokeWidth="4" strokeLinecap="round" />
            </mask>
          </defs>
          <circle cx="24" cy="24" r="24" fill="currentColor" mask="url(#new-post-plus)" />
        </svg>
      </button>
    </div>
  )
}

/** The profile's composer, full screen over Home. Photo and Blog for
 *  everyone; Reel only where the server's video flag is on — the tab grants
 *  nothing, the server decides what may be published. */
function NewPostSheet({ onClose, onPublished }) {
  const { profile, consultant, t } = useStore()
  /* A Pro and a Creator post video and tag products (14 Oct 2026, Rahul:
     Studio went from Dashboard; posting is this sheet; a Creator's tag
     earns as a Pro's, owner's yes). A Seeker gets photo, text and blog.
     The server keeps the same rules. */
  const sharer = consultant?.status === 'approved' || Boolean(profile?.influencer)
  const video = sharer || profile?.video_enabled
  return (
    <div role="dialog" aria-modal="true" aria-label="New post" className="fixed inset-0 z-50 flex justify-center bg-black/40">
      <div className="no-scrollbar h-full w-full max-w-[420px] overflow-y-auto bg-white">
        {profile?.blocked ? (
          <>
            <div className="flex items-center gap-3 border-b border-rule px-4 py-3">
              <BackButton onClick={onClose} />
              <span className="text-meta t-heading">Create post</span>
            </div>
            <p className="mx-5 mt-4 rounded-lg bg-surface-2 px-3 py-2.5 text-micro t-sub">{t('prof.blocked')}</p>
          </>
        ) : (
          /* The composer draws its own header — Back, Create post, Post —
             and its toolbar (12 Oct 2026, Rahul: Facebook's shape). */
          <Composer
            kinds={video ? ['clip', 'post', 'article'] : ['post', 'article']}
            tagProducts={sharer}
            onPublished={onPublished}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  )
}

/* ── The Instagram-shaped feed (30 Sep 2026) ────────────────────────────────
   Every item is one full-bleed post on white, separated by a hairline rather
   than boxed in a card: header row, media edge to edge, an icon action row,
   the like count, then "name caption". The colours stay the app's own —
   saffron for a liked heart and the story ring, green in the ring and on
   the call-to-action strips. What each action DOES is unchanged: likes and
   saves are the same durable `like:`/`save:` flags and Report the same sheet;
   comments open CommentSheet and Share is a real share (both since 30 Sep). */

/** The story-ring avatar: saffron into green, a white gap, then the face. */
function RingAvatar({ initials, src = null, size = 32, ring = true }) {
  return (
    <span
      className="inline-flex flex-none rounded-full"
      style={{
        padding: ring ? (size >= 48 ? 3 : 2) : 0,
        background: ring
          ? 'linear-gradient(45deg, #ffb347, var(--gold-fill) 40%, #ef5d3a 60%, var(--btn))'
          : 'transparent',
      }}
    >
      <span className="inline-flex rounded-full bg-white" style={{ padding: ring ? 2 : 0 }}>
        <PopAvatar initials={initials} src={src} size={size} />
      </span>
    </span>
  )
}

/** Post header: ringed avatar, bold name, an optional tag, and ⋯. No date —
 *  removed 30 Sep on the owner's call; a reel reads as current. */
/**
 * Follow, beside the author's name, as on Instagram (owner's request, 5 Oct
 * 2026). The same saved follow the profile pages use — `follow:` for a
 * consultant, `followp:` for anybody else — so following here shows there.
 * Not on your own posts, and not for a signed-out visitor.
 */
function FollowButton({ item }) {
  const { hasFlag, toggleFlag, session } = useStore()
  const me = session?.user?.id
  if (!item?.authorId || !me || item.authorId === me) return null
  const key = `${item.isConsultant ? 'follow' : 'followp'}:${item.authorId}`
  const on = hasFlag(key)
  const first = (item.consultant || '').split(' ')[0]
  return (
    <button
      type="button"
      onClick={() => toggleFlag(key, { on: `Following ${first}`, off: `Unfollowed ${first}` })}
      aria-pressed={on}
      className={`flex-none rounded-lg px-3 py-1.5 text-meta font-semibold transition-colors ${
        on ? 'bg-ink/5 text-t3' : 'bg-ink/[0.07] text-t1 hover:bg-ink/10'
      }`}
    >
      {on ? 'Following' : 'Follow'}
    </button>
  )
}

/**
 * People to follow, a sideways strip in the feed after the fifth card (13 Oct
 * 2026, docs/06 Phase 15a): people followed by the people you follow, then
 * authors active this week. Follow is the same saved follow as everywhere
 * else. Signed out, or with nobody to suggest, it is not drawn.
 */
function FollowSuggestions() {
  const { session, hasFlag, toggleFlag } = useStore()
  const [people, setPeople] = useState([])
  const me = session?.user?.id
  useEffect(() => {
    let alive = true
    if (me) fetchSuggestions().then((rows) => alive && setPeople(rows))
    return () => {
      alive = false
    }
  }, [me])
  if (!me || !people.length) return null
  return (
    <section className="border-b border-rule bg-white py-3">
      <p className="px-3 text-meta font-semibold text-t1">People to follow</p>
      <div className="no-scrollbar mt-2.5 flex gap-2.5 overflow-x-auto px-3">
        {people.map((p) => {
          const key = `${p.is_consultant ? 'follow' : 'followp'}:${p.id}`
          const on = hasFlag(key)
          const first = (p.name || '').split(' ')[0]
          const initials = (p.name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
          return (
            <div key={p.id} className="flex w-36 flex-none flex-col items-center rounded-xl border border-stroke px-2 py-3 text-center">
              <Link to={p.is_consultant ? `/consult/${p.id}` : `/u/${p.id}`} className="flex flex-col items-center">
                <PopAvatar initials={initials} src={p.avatar_url} size={56} />
                <span className="mt-2 block w-full truncate text-meta font-semibold text-t1">{p.name}</span>
                <span className="block w-full truncate text-[11px] text-t3">{p.reason}</span>
              </Link>
              <button
                type="button"
                onClick={() => toggleFlag(key, { on: `Following ${first}`, off: `Unfollowed ${first}` })}
                aria-pressed={on}
                className={`mt-2.5 w-full rounded-lg py-1.5 text-meta font-semibold transition-colors ${
                  on ? 'bg-ink/5 text-t3' : 'bg-btn text-white'
                }`}
              >
                {on ? 'Following' : 'Follow'}
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** "Groups for you" (14 Oct 2026, Rahul): the same strip as People to
 *  follow, of live groups you are not in, busiest first, each with Join.
 *  Joining opens nothing; the card itself opens the group. */
function GroupSuggestions() {
  const { session, showToast } = useStore()
  const [groups, setGroups] = useState([])
  const [joined, setJoined] = useState({})
  const me = session?.user?.id
  useEffect(() => {
    let alive = true
    if (me) suggestGroups().then((rows) => alive && setGroups(rows)).catch(() => {})
    return () => {
      alive = false
    }
  }, [me])
  if (!me || !groups.length) return null
  async function join(g) {
    try {
      await joinGroup(g.id)
      setJoined((j) => ({ ...j, [g.id]: true }))
      showToast(`Joined ${g.name}`)
    } catch (err) {
      showToast(err.message)
    }
  }
  return (
    <section className="border-b border-rule bg-white py-3">
      <p className="px-3 text-meta font-semibold text-t1">Groups for you</p>
      <div className="no-scrollbar mt-2.5 flex gap-2.5 overflow-x-auto px-3">
        {groups.map((g) => {
          const initials = (g.name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
          const on = joined[g.id]
          return (
            <div key={g.id} className="flex w-36 flex-none flex-col items-center rounded-xl border border-stroke px-2 py-3 text-center">
              <Link to={`/groups/${g.id}`} className="flex w-full flex-col items-center">
                <PopAvatar initials={initials} src={g.avatar_url} size={56} />
                <span className="mt-2 block w-full truncate text-meta font-semibold text-t1">{g.name}</span>
                <span className="block w-full truncate text-[11px] text-t3">
                  {kindLabel(g.kind)}
                  {g.city ? ` · ${g.city}` : ''}
                </span>
                <span className="block w-full truncate text-[11px] text-t3 tnum">
                  {g.member_count} {g.member_count === 1 ? 'member' : 'members'}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => !on && join(g)}
                aria-pressed={!!on}
                className={`mt-2.5 w-full rounded-lg py-1.5 text-meta font-semibold transition-colors ${
                  on ? 'bg-ink/5 text-t3' : 'bg-btn text-white'
                }`}
              >
                {on ? 'Joined' : 'Join'}
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** The tick after an author's name (13 Oct 2026): orange for a Pro, blue
 *  for a Creator, nothing for anyone else. */
function AuthorMark({ item }) {
  if (item?.isConsultant) return <VerifiedMark size={14} tone="pro" className="ml-1 align-[-2px]" />
  if (item?.isCreator) return <VerifiedMark size={14} tone="creator" className="ml-1 align-[-2px]" />
  return null
}

function PostHead({ initials, avatar, name, to, note, tag, onMore, moreLabel, follow, onEdit }) {
  const who = (
    <>
      <RingAvatar initials={initials} src={avatar} size={30} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-meta">
          <span className="font-semibold text-t1">{name}</span>
          <AuthorMark item={follow} />
        </span>
        {note && <span className="block truncate text-[11px] text-t3">{note}</span>}
      </span>
    </>
  )
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5">
      {to ? (
        <Link to={to} className="flex min-w-0 flex-1 items-center gap-2.5">
          {who}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2.5">{who}</div>
      )}
      {follow && <FollowButton item={follow} />}
      {tag && <PopTag>{tag}</PopTag>}
      {/* Your own post: Edit, where somebody else's has Report. */}
      {onEdit && (
        <button type="button" onClick={onEdit} className="flex-none rounded-full border border-stroke px-3 py-1 caps-sm t-sub">
          Edit
        </button>
      )}
      {onMore && (
        <button
          type="button"
          onClick={onMore}
          aria-label={moreLabel}
          className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-t1 transition-colors hover:bg-surface"
        >
          <span aria-hidden="true" className="text-lead leading-none">⋯</span>
        </button>
      )}
    </div>
  )
}

/** One icon in the action row. `on` fills it; the heart goes saffron. At
 *  rest the icons are the light slate (`--text-3`), not black — asked for
 *  on 30 Sep; the row should sit back behind the picture. */
/**
 * Heart, comment, reshare, share — and save on the right. Like, Reshare and
 * Save are durable flags; Comment opens the thread and Share shares. `like`
 * is left out for items that never had one. Reshare needs `authorId` and is
 * hidden on your own post — the server refuses it there anyway.
 */
export function ActionRow({ id, like = true, onComment, onShare, authorId, likes = null, comments = 0, reposts = 0 }) {
  const { hasFlag, toggleFlag, session, t } = useStore()
  const me = session?.user?.id
  const canReshare =
    authorId && me && String(authorId).replace(/-/g, '') !== String(me).replace(/-/g, '')
  // The view's aggregate plus your own un-saved tap, so it moves the instant
  // you press and still agrees with the database on reload.
  const likeCount = likes == null ? 0 : likes + (hasFlag(`like:${id}`) ? 1 : 0)
  const reshare = useReshare(`repost:${id}`)
  return (
    <div className="flex items-center gap-4 px-3 pt-2.5">
      {like && (
        <ActIcon
          icon="heart"
          label="Like"
          onLabel="Liked"
          on={hasFlag(`like:${id}`)}
          tone="text-gold-fill"
          onClick={() => toggleFlag(`like:${id}`)}
        />
      )}
      {like && <Count n={likeCount} />}
      {onComment && <ActIcon icon="chat" label="Reply" onClick={onComment} />}
      {onComment && <Count n={comments} />}
      {canReshare && (
        <ActIcon
          icon="repost"
          label="Reshare"
          onLabel="Reshared"
          on={hasFlag(`repost:${id}`)}
          tone="text-[#1f7a4d]"
          onClick={reshare.tap}
        />
      )}
      {canReshare && <Count n={reposts} />}
      {canReshare && reshare.sheet}
      {onShare && <ActIcon icon="share" label="Share" onClick={onShare} />}
      <span className="flex-1" />
      <ActIcon
        icon="bookmark"
        label="Save"
        onLabel="Saved"
        on={hasFlag(`save:${id}`)}
        tone="text-t2"
        onClick={() =>
          toggleFlag(`save:${id}`, {
            on: t('home.saved'),
            off: t('home.unsaved'),
          })
        }
      />
    </div>
  )
}

/**
 * The like count, then "name caption", clamped to two lines with Instagram's
 * "more". The count is the view's aggregate plus your own un-saved tap, so it
 * moves the instant you press and still agrees with the database on reload.
 */
function Caption({ name, to, text, comments = 0, onComments }) {
  const { t } = useStore()
  const [open, setOpen] = useState(false)
  const long = (text || '').length > 110
  /* Views are counted and not shown (12 Oct 2026, Rahul): the API still
     counts one per signed-in viewer, for the author's Insights. Likes,
     comments and reshares sit beside their icons (ActionRow). */
  const counts = []

  return (
    <div className="px-3 pb-4 pt-2">
      {counts.length > 0 && (
        <p className="text-meta font-semibold text-t1 tnum">{counts.join(' · ')}</p>
      )}
      {text && (
        <p className={`mt-1 text-meta text-t1 ${long && !open ? 'line-clamp-2' : ''}`}>
          <Link to={to} className="mr-1.5 font-semibold">
            {name}
          </Link>
          <span className="whitespace-pre-line text-t2">
            <Hashtags text={text} />
          </span>
        </p>
      )}
      {long && !open && (
        <button type="button" onClick={() => setOpen(true)} className="mt-0.5 text-meta text-t3">
          {t('home.more')}
        </button>
      )}
      {comments > 0 && onComments && (
        <button type="button" onClick={onComments} className="mt-1 block text-meta text-t3">
          {comments === 1
            ? t('home.comment1')
            : t('home.comments', { n: comments.toLocaleString('en-IN') })}
        </button>
      )}
    </div>
  )
}

/**
 * The Instagram "Shop now" strip under a suggested post: full width, tinted,
 * label left and a chevron right. Green for a commitment, saffron for a read.
 */
function CtaStrip({ to, onClick, children, tone = 'orange' }) {
  const cls = `flex w-full items-center justify-between px-3 py-2.5 text-meta font-semibold transition-colors ${
    // The green text is a step darker than the button: #1f7a4d holds 5:1 on
    // the tint, where the button's own green would not.
    tone === 'green' ? 'bg-btn/10 text-[#1f7a4d]' : 'bg-gold-wash text-gold'
  }`
  const inner = (
    <>
      <span>{children}</span>
      <span aria-hidden="true">›</span>
    </>
  )
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  )
}

/**
 * The products the author tagged, under the media: a row of small cards,
 * each opening that product in the shop with the author's code attached
 * (`productHref`). Nothing renders for an untagged post.
 */
/** An image with the plate behind it: the plate shows while there is no
 *  image or when it fails to load. Children sit over both. */
export function Cover({ src, seed, className = '', children }) {
  const [broken, setBroken] = useState(false)
  if (!src || broken) {
    return (
      <Plate seed={seed} className={`${className} !rounded-none`}>
        {children}
      </Plate>
    )
  }
  return (
    <div className={`relative overflow-hidden bg-surface-2 ${className}`}>
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {children}
    </div>
  )
}

export function ProductStrip({ tagged = [], shopRef }) {
  const { t } = useStore()
  if (!tagged.length) return null
  return (
    <div className="border-t border-rule bg-surface/60 px-3 py-2.5">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gold">
        <Icon name="cart" size={14} weight={2} />
        {tagged.length === 1 ? t('home.product1') : t('home.products', { n: tagged.length })}
      </p>
      <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3">
        {tagged.map((pr) => {
          const off = pr.mrp ? Math.round((1 - pr.price / pr.mrp) * 100) : null
          return (
            <Link
              key={pr.id}
              to={productHref(pr, shopRef)}
              className="flex w-[210px] flex-none items-center gap-2.5 rounded-xl border border-stroke bg-white p-2 shadow-sm transition-transform active:scale-[0.98]"
            >
              {pr.image ? (
                <img src={pr.image} alt="" className="h-12 w-12 flex-none rounded-lg object-cover" />
              ) : (
                <Plate seed={pr.id} className="h-12 w-12 flex-none !rounded-lg" />
              )}
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-meta font-semibold text-t1">{pr.name}</span>
                <span className="mt-0.5 block text-meta tnum">
                  <span className="font-semibold text-gold">₹{pr.price.toLocaleString('en-IN')}</span>
                  {off > 0 && <span className="ml-1.5 text-[11px] text-t3">{t('home.off', { n: off })}</span>}
                </span>
              </span>
              <span aria-hidden="true" className="flex-none text-lead text-t3">›</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

/** "↻ Tara reshared" above a post that is in the feed because somebody
 *  reshared it, and their words when they wrote some. Nothing for an
 *  ordinary post. */
/** "In Shirdi Sai Bhakt" above a post made in a group, opening the group
 *  (14 Oct 2026, Phase 15c). */
function GroupLine({ group }) {
  if (!group) return null
  return (
    <Link
      to={`/groups/${group.id}`}
      className="flex items-center gap-1.5 px-3 pt-2.5 text-[12px] font-semibold text-t3 hover:text-t1"
    >
      <Icon name="namaste" size={13} />
      <span className="truncate">In {group.name}</span>
    </Link>
  )
}

function ResharedLine({ by }) {
  const { t } = useStore()
  if (!by) return null
  /* With words (13 Oct 2026, Rahul: "we can do better", LinkedIn's layout):
     the resharer heads the card with their photo and name, their words
     follow at full size, and what they reshared sits below in a box
     (`Quoted`). Without words, the one grey line as before. */
  if (by.note && !by.others) {
    const initials = (by.name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    return (
      <>
        <Link to={`/u/${by.id}`} className="flex items-center gap-2.5 px-3 pt-3">
          <PopAvatar initials={initials} src={by.avatar} size={36} />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-meta font-semibold text-t1">{by.name}</span>
            <span className="flex items-center gap-1 text-[11px] text-t3">
              <Icon name="repost" size={12} weight={2} />
              {t('home.resharedTag')}
            </span>
          </span>
        </Link>
        <p className="whitespace-pre-line px-3 pt-2 text-body text-t1">{by.note}</p>
      </>
    )
  }
  return (
    <>
      <Link
        to={`/u/${by.id}`}
        className="flex items-center gap-1.5 px-3 pt-2.5 text-[12px] font-semibold text-t3"
      >
        <Icon name="repost" size={14} weight={2} />
        {by.others
          ? t('home.resharedByMany', { name: by.name, n: by.others.toLocaleString('en-IN') })
          : t('home.resharedBy', { name: by.name })}
      </Link>
      {/* "Reshare with your thoughts" (13 Oct 2026): their words, above
          what they reshared. */}
      {by.note && <p className="whitespace-pre-line px-3 pt-1.5 text-body text-t1">{by.note}</p>}
    </>
  )
}

/** What was reshared, in a rounded box under the resharer's words; only
 *  when they wrote some. The like and comment row stays outside the box
 *  and still acts on the original, as a reshare has no post of its own. */
function Quoted({ on, children }) {
  if (!on) return children
  return <div className="mx-3 mt-3 overflow-hidden rounded-xl border border-stroke">{children}</div>
}

/**
 * A Bhakti picture somebody reshared (12 Oct 2026, Rahul: option B): the
 * plain picture under "X reshared", with its own like, comment and reshare —
 * the same rows as on the Status shelf. A tap on the picture opens its shelf.
 */
function PictureCard({ asset, resharedBy }) {
  return (
    <article className="border-b border-rule bg-white">
      <ResharedLine by={resharedBy} />
      <Quoted on={!!resharedBy?.note}>
      <Link to={`/bhakti/s/${asset.id}`} className={`${resharedBy?.note ? '' : 'mt-2.5 '}block`}>
        {/* A bhajan or mantra is a sound and a book a PDF; their cover
            picture stands in. */}
        <img
          src={['bhajan', 'mantra', 'ebook'].includes(asset.kind) ? asset.previewUrl : asset.url}
          alt={asset.title}
          loading="lazy"
          // A book's cover whole, at its own shape, as the Academy draws it
          // (12 Oct 2026, Rahul: a 4:5 crop cut its title off).
          className={
            asset.kind === 'ebook'
              ? 'block h-auto w-full bg-surface2'
              : `${asset.kind === 'bhajan' || asset.kind === 'mantra' ? 'aspect-video' : 'aspect-[4/5]'} w-full bg-surface2 object-cover`
          }
        />
      </Link>
      </Quoted>
      <div className="flex items-center gap-4 px-3 pt-2.5">
        <BhaktiActions asset={asset} share />
      </div>
      <p className="px-3 pb-4 pt-2 text-meta text-t2">
        <Link to={`/bhakti/s/${asset.id}`} className="mr-1.5 font-semibold text-t1">
          {asset.kind === 'ebook' ? 'E-book' : 'Bhakti'}
        </Link>
        {asset.title}
      </p>
    </article>
  )
}

function PostCard({ post, resharedBy }) {
  const { showToast, session } = useStore()
  const [edited, setEdited] = useState(null)
  const p = edited ? { ...post, ...edited } : post
  const [editing, setEditing] = useState(false)
  const mine = !resharedBy && isMine(p.authorId, session?.user?.id)
  const [reporting, setReporting] = useState(false)
  const [commenting, setCommenting] = useState(false)
  const [comments, setComments] = useState(p.comments ?? 0)
  const text = p.body || p.caption
  /* A plain note has no media. Instagram's answer is a text tile — the words
     set large on colour, square — which keeps the rhythm of the grid of
     pictures. Only for a short note: a long one reads better as a caption. */
  const tile = !p.mediaUrl && text && text.length <= 240
  const frame = useRef(null)
  useCountView(frame, p.id) // counted, not shown (12 Oct 2026)

  return (
    <article ref={frame} className="border-b border-rule bg-white">
      <ResharedLine by={resharedBy} />
      <GroupLine group={p.group} />
      <Quoted on={!!resharedBy?.note}>
      {/* Report stays under the ⋯, not in the action row: it is the one action
          nobody looks for until they need it, and beside Like it gets pressed
          by accident — a false report costs a real person an admin's time. */}
      <PostHead
        initials={p.initials}
        avatar={p.avatarUrl}
        name={p.consultant}
        to={authorHref(p)}
        follow={p}
        onMore={mine ? undefined : () => setReporting(true)}
        moreLabel="Report this post"
        onEdit={mine ? () => setEditing(true) : undefined}
      />

      {p.mediaUrl && <img src={p.mediaUrl} alt="" className="max-h-[32rem] w-full object-cover" />}
      {tile && (
        <div
          className="flex aspect-square w-full items-center justify-center px-8 text-center"
          style={{
            background: 'linear-gradient(145deg, #fff4ea 0%, #ffe4cc 55%, #e3f5ec 100%)',
          }}
        >
          <p className="whitespace-pre-line text-lead font-semibold leading-snug text-t1">
            <Hashtags text={text} />
          </p>
        </div>
      )}
      <ProductStrip tagged={p.products} shopRef={p.shopRef} />
      </Quoted>

      <ActionRow
        id={p.id}
        authorId={p.authorId}
        likes={p.likes}
        comments={comments}
        reposts={p.reposts}
        onComment={() => setCommenting(true)}
        // A post has no page of its own, so Share sends the author's —
        // until 30 Sep this toasted "Note copied" and copied nothing.
        onShare={async () => {
          const said = await shareLink(authorHref(p), { title: p.consultant })
          if (said) showToast(said)
        }}
      />
      <Caption
        name={p.consultant}
        to={authorHref(p)}
        text={tile ? null : text}
        comments={comments}
        onComments={() => setCommenting(true)}
      />

      <ReportSheet open={reporting} onClose={() => setReporting(false)} contentId={p.id} />
      {editing && <EditSheet piece={p} onClose={() => setEditing(false)} onSaved={(f) => setEdited((e) => ({ ...e, ...f }))} />}
      <CommentSheet
        open={commenting}
        onClose={() => setCommenting(false)}
        contentId={p.id}
        postAuthorId={p.authorId}
        onCount={setComments}
      />
    </article>
  )
}

/**
 * True once `ref` comes within `margin` of the screen, and stays true. A reel
 * card loads its video only then (4 Oct 2026): every card used to request
 * its video's first frame on page load, so twenty slow requests raced the
 * one on screen.
 */
/* Posts already counted on this page load. The server counts a person once
   per post per IST day anyway; this saves the repeat requests. */
const countedViews = new Set()

/**
 * A feed card counts a view after two seconds with most of it on screen
 * (11 Oct 2026, Rahul): photo and text posts, and a reel playing in the feed
 * — the reel viewer's rule. Scrolling past does not count. Returns the count the server sends back, or null until then.
 */
function useCountView(ref, id) {
  const [views, setViews] = useState(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !id || countedViews.has(id) || !('IntersectionObserver' in window)) return undefined
    let timer = null
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.intersectionRatio >= 0.6) {
          if (timer) return
          timer = setTimeout(() => {
            if (countedViews.has(id)) return
            countedViews.add(id)
            io.disconnect()
            recordView(id).then((n) => n != null && setViews(n))
          }, 2000)
        } else {
          clearTimeout(timer)
          timer = null
        }
      },
      { threshold: [0, 0.6] },
    )
    io.observe(el)
    return () => {
      clearTimeout(timer)
      io.disconnect()
    }
  }, [ref, id])
  return views
}

function useNearScreen(ref, margin = '800px') {
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || near) return undefined
    if (!('IntersectionObserver' in window)) {
      setNear(true)
      return undefined
    }
    const io = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && setNear(true),
      { rootMargin: margin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref, near, margin])
  return near
}

/**
 * Instagram's feed rule (owner's request, 5 Oct 2026): the reel that is
 * mostly on screen plays by itself, muted and looping, and every other one
 * is paused — so exactly one plays, and scrolling hands it to the next.
 *
 * One module-level "who is playing" rather than state in a parent: the cards
 * are spread through a mixed feed, and a card claiming the turn is simpler
 * than a feed counting which of its children is where. Sound is one switch
 * for the whole feed, as on Instagram — unmute one and the next plays aloud.
 */
const feedPlayer = { current: null, muted: true, listeners: new Set() }
function announce() {
  feedPlayer.listeners.forEach((fn) => fn())
}

function useFeedTurn(ref) {
  // Per CARD, not per reel: the same reel can sit in the feed twice (once
  // as a repost), and an off-screen copy must not cancel the visible one.
  const [id] = useState(() => Symbol('reel-card'))
  const [, rerender] = useState(0)
  useEffect(() => {
    const fn = () => rerender((n) => n + 1)
    feedPlayer.listeners.add(fn)
    return () => {
      feedPlayer.listeners.delete(fn)
      if (feedPlayer.current === id) {
        feedPlayer.current = null
        announce()
      }
    }
  }, [id])
  useEffect(() => {
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) return undefined
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.intersectionRatio >= 0.6) {
          if (feedPlayer.current !== id) {
            feedPlayer.current = id
            announce()
          }
        } else if (feedPlayer.current === id) {
          feedPlayer.current = null
          announce()
        }
      },
      { threshold: [0, 0.6, 1] },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref, id])
  return {
    playing: feedPlayer.current === id,
    muted: feedPlayer.muted,
    toggleMute: () => {
      feedPlayer.muted = !feedPlayer.muted
      announce()
    },
  }
}

function ReelCard({ reel, resharedBy }) {
  const { showToast, session } = useStore()
  const [edited, setEdited] = useState(null)
  const r = edited ? { ...reel, ...edited } : reel
  const [editing, setEditing] = useState(false)
  const mine = !resharedBy && isMine(r.authorId, session?.user?.id)
  const [commenting, setCommenting] = useState(false)
  const [comments, setComments] = useState(r.comments ?? 0)
  const isVideo = r.mediaUrl?.match(/\.(mp4|webm|mov)$/i)
  const frame = useRef(null)
  const near = useNearScreen(frame)
  const video = useRef(null)
  const { playing, muted, toggleMute } = useFeedTurn(frame)
  // Two seconds playing in the feed is a view too (11 Oct 2026, Rahul), as
  // two seconds in the reel viewer is.
  useCountView(frame, r.id) // counted, not shown (12 Oct 2026)

  useEffect(() => {
    const v = video.current
    if (!v) return
    v.muted = muted
    if (playing) {
      // A browser may still refuse (battery saver, data saver); the first
      // frame stays on screen and a tap opens the reel, as before.
      v.play().catch(() => {})
    } else {
      v.pause()
    }
  }, [playing, muted, near])

  return (
    <article className="border-b border-rule bg-white">
      <ResharedLine by={resharedBy} />
      <GroupLine group={r.group} />
      <Quoted on={!!resharedBy?.note}>
      <PostHead
        initials={r.initials}
        avatar={r.avatarUrl}
        name={r.consultant}
        to={authorHref(r)}
        follow={r}
        onEdit={mine ? () => setEditing(true) : undefined}
      />
      {editing && <EditSheet piece={r} onClose={() => setEditing(false)} onSaved={(f) => setEdited((e) => ({ ...e, ...f }))} />}

      <Link ref={frame} to={`/reels/${r.id}`} className="group relative block">
        <Plate seed={r.id} className="aspect-[4/5] w-full !rounded-none">
          {/* A video's cover is its own frame at half a second: the `#t=` fragment
              seeks there and `preload="metadata"` fetches just enough to paint it.
              ponytail: no stored thumbnails; add a poster column if this is slow on mobile data. */}
          {isVideo && near && (
            <video
              ref={video}
              src={`${r.mediaUrl}#t=0.5`}
              preload={playing ? 'auto' : 'metadata'}
              muted
              loop
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          {r.mediaUrl && !isVideo && (
            <img src={r.mediaUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
          {/* Instagram marks a reel with a glyph in the corner, not a badge. */}
          <span className="absolute right-3 top-3 text-white drop-shadow">
            <Icon name="play" size={22} filled />
          </span>
          {/* The big play circle in the middle was removed on 4 Oct 2026
              (owner's call); the corner glyph still says it is a reel. */}
        </Plate>
        {isVideo && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              toggleMute()
            }}
            aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
            className="absolute bottom-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink/60 text-white"
          >
            <Icon name={muted ? 'muted' : 'sound'} size={18} />
          </button>
        )}
      </Link>
      <ProductStrip tagged={r.products} shopRef={r.shopRef} />
      </Quoted>

      {/* No duration and no audio credit: both were mock strings on a Plate
          that plays nothing. */}
      <ActionRow
        id={r.id}
        authorId={r.authorId}
        likes={r.likes}
        comments={comments}
        reposts={r.reposts}
        onComment={() => setCommenting(true)}
        onShare={async () => {
          const said = await shareLink(`/reels/${r.id}`, { title: r.consultant })
          if (said) showToast(said)
        }}
      />
      <Caption
        name={r.consultant}
        to={authorHref(r)}
        text={r.caption}
        comments={comments}
        onComments={() => setCommenting(true)}
      />
      <CommentSheet
        open={commenting}
        onClose={() => setCommenting(false)}
        contentId={r.id}
        postAuthorId={r.authorId}
        onCount={setComments}
      />
    </article>
  )
}

/**
 * The day's reading for a sign — free, the same for everybody with the Moon
 * there (30 Sep 2026). Opens on the reader's own moon sign, off their chart;
 * the other eleven are one tap. The reader's OWN reading is paid and lives on
 * /chart's Prediction tab, which the last line names.
 *
 * It was the reader's own from 22 to 30 Sep, and between 9 and 22 Sep a
 * canonical-birth reading cut down to its mood line because a sign was not
 * named on it. The sign IS named now, which is what makes showing the whole
 * reading honest: it says whose it is.
 */
function ReadingCard() {
  const { session, sessionReady, t } = useStore()
  const mine = useMyChart({ ready: sessionReady, who: session?.user?.id ?? null })
  /* Only your own sign since 4 Oct 2026 (owner's call): the twelve-sign
     picker is gone from Home; the other signs are still on /horoscope. */
  const sign = mine.rashi
  const reading = useAstro('rashifal', {
    sign: sign ?? 'Aries',
    ready: Boolean(sessionReady && !mine.loading && sign),
  })
  const day = readingFrom(reading.payload, 'today', null)

  return (
    <article className="pop-card p-4">
      <Kicker>{t('home.yourRashifal')}</Kicker>
      <div className="pop-inset mt-3 p-4">
        {!sign && !mine.loading && (
          <Link to={birthHref()} className="text-meta t-body underline">{t('a.addBirth')}</Link>
        )}
        {reading.loading && <p className="text-meta t-faint">{t('home.readingSky')}</p>}
        {reading.refusal && <p className="text-meta t-body">{reading.refusal.reason}</p>}

        {day && !reading.loading && (
          <>
            <p className="caps-sm gold">
              {t(`sign.${sign}`)} · {longDate(day.date)}
            </p>
            {day.headline && <p className="mt-3 text-body font-semibold t-heading">{day.headline}</p>}
            <p className="mt-2 text-body t-body">{day.body || day.dayMood}</p>

            {day.windows.length > 0 && (
              <div className="mt-5 border-t border-stroke pt-4">
                <span className="caps-sm t-faint">{t('home.windowsUjjain')}</span>
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
      <Link to="/chart?tab=prediction" className="mt-3 block text-center text-meta t-body underline">
        {t('home.ownPredictions')}
      </Link>
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
  const { session, sessionReady, t } = useStore()
  const got = useAstro('panchang', { ready: sessionReady, who: session?.user?.id ?? null })
  const p = panchangFrom(got.payload)

  return (
    <article className="pop-card p-4">
      {/* No "Full chart" link since 30 Sep (owner's call); the chart is on
          Profile and Consult. */}
      <Kicker>{t('home.panchang')}</Kicker>

      {got.loading && <p className="mt-3 text-meta t-faint">{t('home.workingDay')}</p>}
      {got.refusal && <p className="mt-3 text-meta t-body">{got.refusal.reason}</p>}

      {p && (
        <>
          <p className="mt-2 caps-sm t-faint tnum">
            {longDate(p.date)}
            {p.lunarMonth && ` · ${p.lunarMonth}`}
            {p.samvat && ` · ${t('home.samvat', { n: p.samvat })}`}
          </p>
          {/* Named, not implied. One almanac serves every user and it is
              computed at Ujjain — the classical meridian of Indian astronomy —
              so a reader in Chennai is looking at a sunrise about forty minutes
              from their own. Saying so is the difference between a simplifying
              choice and a quiet inaccuracy. */}
          {/* "Computed at Ujjain" was a line here until 4 Oct 2026 (owner's
              call). The almanac is still Ujjain's; the Windows heading below
              still names it. */}

          <dl className="mt-4 grid grid-cols-3 gap-y-4">
            {[
              ['pc.tithi', p.tithi],
              ['pc.nakshatra', p.nakshatra],
              ['pc.yoga', p.yoga],
              ['pc.karana', p.karana],
              ['pc.moon', p.moonSign],
              ['pc.paksha', p.paksha],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="caps-sm t-faint">{t(k)}</dt>
                <dd className="mt-1 text-meta t-heading">{v || '—'}</dd>
              </div>
            ))}
          </dl>

          {p.rahuKaal && (
            <div className="pop-inset mt-4 p-3">
              <p className="caps-sm text-live">{t('pc.rahuKaal')}</p>
              <p className="mt-1 text-meta tnum t-heading">{p.rahuKaal}</p>
            </div>
          )}

          <div className="mt-3 flex items-center gap-3 caps-sm t-faint tnum">
            <span>{t('pc.sunrise', { time: p.sunrise })}</span>
            <span aria-hidden="true">·</span>
            <span>{t('pc.sunset', { time: p.sunset })}</span>
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

function ArticleCard({ read }) {
  const { t, showToast, session } = useStore()
  const [edited, setEdited] = useState(null)
  const b = edited ? { ...read, ...edited } : read
  const [editing, setEditing] = useState(false)
  const mine = isMine(b.authorId, session?.user?.id)
  const [commenting, setCommenting] = useState(false)
  const [comments, setComments] = useState(b.comments ?? 0)
  return (
    <article className="border-b border-rule bg-white">
      <GroupLine group={b.group} />
      <PostHead
        initials={b.initials}
        avatar={b.avatarUrl}
        name={b.consultant}
        note={t('home.publishedArticle')}
        to={authorHref(b)}
        follow={b}
        onEdit={mine ? () => setEditing(true) : undefined}
      />
      {editing && <EditSheet piece={b} onClose={() => setEditing(false)} onSaved={(f) => setEdited((e) => ({ ...e, ...f }))} />}

      {/* The cover — the uploaded image, or the plate when there is none —
          with the title over a scrim at its foot. 16:9, the shape the
          composer and the reader use too (6 Oct 2026: the image was saved
          and never shown). */}
      {/* The banner whole, the title under it, as YouTube lays a video out
          (7 Oct 2026, Rahul): a title over the picture hid the banner's own
          lettering. */}
      <Link to={`/read/${b.id}`} className="block">
        <Cover src={b.mediaUrl} seed={b.id} className="aspect-video w-full" />
        <span className="block px-3 pt-2.5 text-lead font-semibold leading-snug t-heading">{b.title}</span>
      </Link>
      {/* Read time is COMPUTED from the body, not stored (§1.5). A stored
          one goes stale the first time the article is edited. */}
      <ProductStrip tagged={b.products} shopRef={b.shopRef} />
      <CtaStrip to={`/read/${b.id}`}>{t('home.readArticle', { n: readMins(b.body) })}</CtaStrip>

      {/* Like, reply, share and save, as a post has (6 Oct 2026: a blog had
          Save only). No reshare: a reshared blog has no card in the feed's
          reshare weave. Share sends the blog's own page. */}
      <ActionRow
        id={b.id}
        likes={b.likes}
        comments={comments}
        onComment={() => setCommenting(true)}
        onShare={async () => {
          const said = await shareLink(`/read/${b.id}`, { title: b.title })
          if (said) showToast(said)
        }}
      />
      <div className="h-3" />
      <CommentSheet
        open={commenting}
        onClose={() => setCommenting(false)}
        contentId={b.id}
        postAuthorId={b.authorId}
        onCount={setComments}
      />
    </article>
  )
}

/** Header for the house's own suggestions: the Namo mark instead of a person. */
function HouseHead({ name, note, to }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5">
      <Link to={to} className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-gold-fill text-meta font-bold text-white">
          N
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-meta font-semibold text-t1">{name}</span>
          <span className="block text-[11px] text-t3">{note}</span>
        </span>
      </Link>
    </div>
  )
}

function CourseCard({ course: c }) {
  const { t } = useStore()
  return (
    <article className="border-b border-rule bg-white">
      <HouseHead name={t('home.namoAcademy')} note={t('home.continueLearning')} to="/academy" />
      <Link to="/academy" className="block">
        <Plate seed={c.id} className="aspect-[16/10] w-full !rounded-none" />
      </Link>
      {c.progress > 0 && (
        <div className="px-3 pt-3">
          <PopBar value={c.progress} />
        </div>
      )}
      <CtaStrip to="/academy" tone="green">
        {c.progress > 0 ? t('home.resume', { n: c.progress }) : t('home.startCourse')}
      </CtaStrip>
      <div className="px-3 pb-4 pt-2">
        <p className="text-meta font-semibold text-t1">{c.title}</p>
        <p className="mt-0.5 text-meta text-t2 tnum">
          {c.tutor} · {t('home.lessons', { n: c.lessons })}
        </p>
      </div>
    </article>
  )
}

function ProductCard({ product: p }) {
  const { addToCart, t } = useStore()
  const off = p.mrp ? Math.round((1 - p.price / p.mrp) * 100) : null

  return (
    <article className="border-b border-rule bg-white">
      <HouseHead name={t('home.namoShop')} note={t('home.forChart')} to="/shop" />
      {/* Square, as on the shop's grid and the product page. */}
      <Link to={pageOf(p)} className="block">
        <ProductArt product={p} className="aspect-square w-full" />
      </Link>
      <CtaStrip onClick={() => addToCart(p)} tone="green">
        {t('home.addToCart', { price: p.price.toLocaleString('en-IN') })}
      </CtaStrip>
      <div className="px-3 pb-4 pt-2">
        <p className="text-meta">
          <span className="font-semibold text-t1">{p.name}</span>
          {off > 0 && <span className="ml-2 font-semibold text-gold tnum">{t('home.off', { n: off })}</span>}
        </p>
        <p className="mt-0.5 text-meta text-t2">{p.subtitle}</p>
      </div>
    </article>
  )
}
