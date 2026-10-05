import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { courses, feed, products } from '../data/mock.js'
import { fetchFeed, fetchReposts, productHref } from '../lib/content.js'
import { shareLink } from '../lib/share.js'
import { TabHeader } from '../components/Chrome.jsx'
import Icon from '../components/Icon.jsx'
import Plate from '../components/Plate.jsx'
import ReportSheet from '../components/ReportSheet.jsx'
import CommentSheet from '../components/CommentSheet.jsx'
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
  product: products,
}

/** `content.kind` in the database → which card renders it. */
const CARD_FOR_KIND = { post: 'post', clip: 'reel', article: 'article' }

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
  const { t } = useStore()

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

  /* The feed is a QUERY, not a table (05-BACKEND-SCHEMA.md §5.3). Newest live
     content from approved consultants, dealt in a random order on each load
     (asked for 16 Sep). Random, not ranked — a rank is still the system that
     section refuses. */
  const [published, setPublished] = useState([])

  useEffect(() => {
    let active = true
    // ponytail: shuffles the newest 200 client-side; a server-side random pick when content outgrows that.
    fetchFeed({ kinds: ['post', 'clip', 'article'], limit: 200, shuffle: true })
      .then((rows) => active && setPublished(rows))
      .catch((err) => console.error('[feed] load failed:', err.message))
    return () => {
      active = false
    }
  }, [])

  /* Reshares: somebody else's post, again, under "X reshared". Woven in one
     after every three posts rather than appended, so they read as part of
     the stream; the stream is already dealt at random, so this is not a
     rank either. */
  const [reshares, setReshares] = useState([])
  useEffect(() => {
    let active = true
    fetchReposts({ limit: 50 }).then((rows) => active && setReshares(rows))
    return () => {
      active = false
    }
  }, [])

  const posts = published.map((c) => ({ id: c.id, kind: CARD_FOR_KIND[c.kind], data: c }))
  const reshared = reshares
    .filter((r) => CARD_FOR_KIND[r.post.kind] !== 'article')
    .map((r) => ({
      id: `rp:${r.id}`,
      kind: CARD_FOR_KIND[r.post.kind],
      data: r.post,
      by: { id: r.byId, name: r.byName },
    }))
  const real = []
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
  const stillMock = feed
    .filter((f) => SOURCES[f.kind])
    .map((f) => {
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

      <section className="px-4 pt-3">
        <Segmented
          items={TABS.map((tb) => ({ ...tb, label: t(tb.label) }))}
          value={tab}
          onChange={(k) => navigate(k === 'feed' ? '/home' : `/home/${k}`)}
        />
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
              {items.map((item) => {
                switch (item.kind) {
                  case 'post':
                    return <PostCard key={item.id} post={item.data} resharedBy={item.by} />
                  case 'reel':
                    return <ReelCard key={item.id} reel={item.data} resharedBy={item.by} />
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
              <p className="caps-sm t-faint">{t('home.end')}</p>
            </div>
          </>
        )}
      </div>

      {/* Clears the floating AI button and the tab bar. */}
      <div className="h-24" />
    </>
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
function RingAvatar({ initials, size = 32, ring = true }) {
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
        <PopAvatar initials={initials} size={size} />
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

function PostHead({ initials, name, to, note, tag, onMore, moreLabel, follow }) {
  const who = (
    <>
      <RingAvatar initials={initials} size={30} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-meta">
          <span className="font-semibold text-t1">{name}</span>
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
function ActIcon({ icon, label, onLabel, on = false, onClick, tone }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={on && onLabel ? onLabel : label}
      aria-pressed={onLabel ? on : undefined}
      className={`-m-1.5 p-1.5 transition-transform active:scale-90 ${
        on && tone ? tone : 'text-t3 hover:text-t2'
      }`}
    >
      <Icon name={icon} size={25} weight={1.7} filled={on} />
    </button>
  )
}

/**
 * Heart, comment, reshare, share — and save on the right. Like, Reshare and
 * Save are durable flags; Comment opens the thread and Share shares. `like`
 * is left out for items that never had one. Reshare needs `authorId` and is
 * hidden on your own post — the server refuses it there anyway.
 */
/** A count beside its icon, Instagram's way (4 Oct 2026; the numbers were a
 *  line of text under the row). Nothing at zero. */
function Count({ n }) {
  return n > 0 ? <span className="-ml-2 text-meta font-semibold tnum text-t1">{n.toLocaleString('en-IN')}</span> : null
}

function ActionRow({ id, like = true, onComment, onShare, authorId, likes = null, comments = 0, reposts = 0 }) {
  const { hasFlag, toggleFlag, session, t } = useStore()
  const me = session?.user?.id
  const canReshare =
    authorId && me && String(authorId).replace(/-/g, '') !== String(me).replace(/-/g, '')
  // The view's aggregate plus your own un-saved tap, so it moves the instant
  // you press and still agrees with the database on reload.
  const likeCount = likes == null ? 0 : likes + (hasFlag(`like:${id}`) ? 1 : 0)
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
          onClick={() =>
            toggleFlag(`repost:${id}`, {
              on: t('home.reshared'),
              off: t('home.reshareRemoved'),
            })
          }
        />
      )}
      {canReshare && <Count n={reposts} />}
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
function Caption({ views, name, to, text, comments = 0, onComments }) {
  const { t } = useStore()
  const [open, setOpen] = useState(false)
  const long = (text || '').length > 110
  /* Views: shown once there are any. The API counts one per signed-in
     viewer; before it was deployed every reel read 0, and "0 views" on
     every reel would have been a statement about the counter, not the
     reel. */
  /* Likes, comments and reshares sit beside their icons now (ActionRow);
     only views stay here, which have no icon. */
  const counts = [
    views > 0 && t(views === 1 ? 'home.view1' : 'home.views', { n: views.toLocaleString('en-IN') }),
  ].filter(Boolean)

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
          <span className="text-t2">{text}</span>
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
function ProductStrip({ tagged = [], shopRef }) {
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
 *  reshared it. Nothing for an ordinary post. */
function ResharedLine({ by }) {
  const { t } = useStore()
  if (!by) return null
  return (
    <Link
      to={`/u/${by.id}`}
      className="flex items-center gap-1.5 px-3 pt-2.5 text-[12px] font-semibold text-t3"
    >
      <Icon name="repost" size={14} weight={2} />
      {t('home.resharedBy', { name: by.name })}
    </Link>
  )
}

function PostCard({ post: p, resharedBy }) {
  const { showToast } = useStore()
  const [reporting, setReporting] = useState(false)
  const [commenting, setCommenting] = useState(false)
  const [comments, setComments] = useState(p.comments ?? 0)
  const text = p.body || p.caption
  /* A plain note has no media. Instagram's answer is a text tile — the words
     set large on colour, square — which keeps the rhythm of the grid of
     pictures. Only for a short note: a long one reads better as a caption. */
  const tile = !p.mediaUrl && text && text.length <= 240

  return (
    <article className="border-b border-rule bg-white">
      <ResharedLine by={resharedBy} />
      {/* Report stays under the ⋯, not in the action row: it is the one action
          nobody looks for until they need it, and beside Like it gets pressed
          by accident — a false report costs a real person an admin's time. */}
      <PostHead
        initials={p.initials}
        name={p.consultant}
        to={authorHref(p)}
        follow={p}
        onMore={() => setReporting(true)}
        moreLabel="Report this post"
      />

      {p.mediaUrl && <img src={p.mediaUrl} alt="" className="max-h-[32rem] w-full object-cover" />}
      {tile && (
        <div
          className="flex aspect-square w-full items-center justify-center px-8 text-center"
          style={{
            background: 'linear-gradient(145deg, #fff4ea 0%, #ffe4cc 55%, #e3f5ec 100%)',
          }}
        >
          <p className="text-lead font-semibold leading-snug text-t1">{text}</p>
        </div>
      )}
      <ProductStrip tagged={p.products} shopRef={p.shopRef} />

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

function ReelCard({ reel: r, resharedBy }) {
  const { showToast } = useStore()
  const [commenting, setCommenting] = useState(false)
  const [comments, setComments] = useState(r.comments ?? 0)
  const isVideo = r.mediaUrl?.match(/\.(mp4|webm|mov)$/i)
  const frame = useRef(null)
  const near = useNearScreen(frame)
  const video = useRef(null)
  const { playing, muted, toggleMute } = useFeedTurn(frame)

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
      <PostHead initials={r.initials} name={r.consultant} to={authorHref(r)} follow={r} />

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
        views={r.views}
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
        {!sign && !mine.loading && <p className="text-meta t-body">{t('a.addBirth')}</p>}
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

function ArticleCard({ read: b }) {
  const { t } = useStore()
  return (
    <article className="border-b border-rule bg-white">
      <PostHead
        initials={b.initials}
        name={b.consultant}
        note={t('home.publishedArticle')}
        to={authorHref(b)}
        follow={b}
      />

      {/* The cover: the plate, with the title set over a scrim at its foot. */}
      <Link to={`/read/${b.id}`} className="relative block">
        <Plate seed={b.id} className="aspect-[16/10] w-full !rounded-none">
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent px-4 pb-4 pt-12">
            <span className="block text-lead font-semibold leading-snug text-white">{b.title}</span>
          </span>
        </Plate>
      </Link>
      {/* Read time is COMPUTED from the body, not stored (§1.5). A stored
          one goes stale the first time the article is edited. */}
      <CtaStrip to={`/read/${b.id}`}>{t('home.readArticle', { n: readMins(b.body) })}</CtaStrip>

      {/* Save only, as before — an article never had a like. */}
      <ActionRow id={b.id} like={false} />
      <div className="h-3" />
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
      <Link to="/shop" className="block">
        <Plate seed={p.id} className="aspect-square w-full !rounded-none" />
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
