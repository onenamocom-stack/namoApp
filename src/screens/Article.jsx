import { Loader } from '../components/Cosmos.jsx'
import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { fetchByAuthor, fetchFeed, fetchOne, isMine } from '../lib/content.js'
import EditSheet from '../components/EditSheet.jsx'
import { isPro } from '../side.js'
import { ActionRow, Cover, ProductStrip, authorHref, readMins } from './Home.jsx'
import CommentSheet from '../components/CommentSheet.jsx'
import { shareLink } from '../lib/share.js'
import { TopBar } from '../components/Chrome.jsx'
import { Avatar, Button, Row, Section, Stub, Tag } from '../components/Primitives.jsx'
import { useStore } from '../store.jsx'

/**
 * The article reader.
 *
 * The feed promises this — it shows a read time, a view count and a Save
 * button, then the reference app opens the author's profile instead. That is
 * the one broken promise in the whole content layer, so the long-form surface
 * exists here for real.
 *
 * Left-aligned, not centred: centring is reserved for the horoscope and other
 * short editorial moments. Five paragraphs of centred body text is where the
 * printed-page conceit stops helping and starts hurting.
 */
export default function Article() {
  const { id } = useParams()
  const { showToast, session, t } = useStore()
  const home = isPro ? '/pro/studio' : '/home'
  const me = session?.user?.id ?? null

  /* Articles are rows now, so this screen loads rather than looks up. It asks
     for the whole article list and picks its own out of it, because the same
     request also answers "read next" — two round trips for one screen would be
     the expensive kind of tidy. */
  const [articles, setArticles] = useState(null)
  const [commenting, setCommenting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [commentCount, setCommentCount] = useState(null)

  useEffect(() => {
    let active = true
    /* The consultant app reads only the consultant's own blog posts (4 Oct
       2026); the seeker app reads the newest from everyone. Either way, a
       post older than the list is fetched on its own rather than bounced. */
    if (isPro && !me) return undefined
    const load = isPro
      ? fetchByAuthor(me, { limit: 200 }).then((rows) => rows.filter((c) => c.kind === 'article'))
      : fetchFeed({ kinds: ['article'] })
    load
      .then(async (rows) => {
        if (rows.some((r) => r.id === id)) return rows
        const one = await fetchOne(id)
        return one && one.kind === 'article' && (!isPro || one.authorId === me) ? [one, ...rows] : rows
      })
      .then((rows) => active && setArticles(rows))
      .catch((err) => {
        console.error('[article] load failed:', err.message)
        if (active) setArticles([])
      })
    return () => {
      active = false
    }
  }, [id, me])

  /* Nothing is rendered against a half-loaded list: `null` means still asking,
     `[]` means asked and got nothing. Without the distinction a slow network
     redirects to /home before the article arrives. */
  if (articles === null) {
    return (
      <>
        <TopBar title="Article" back backTo={home} />
        <Loader />
      </>
    )
  }

  const idx = articles.findIndex((b) => b.id === id)
  if (idx === -1) return <Navigate to={home} replace />

  const b = articles[idx]
  const next = articles[(idx + 1) % articles.length]
  const comments = commentCount ?? b.comments ?? 0
  const setComments = setCommentCount

  /* One text column in the database, paragraphs on screen. Splitting on blank
     lines is what a writer typing into the studio's textarea actually produces,
     and it keeps the stored value the thing they typed (§1.5). */
  const paras = (b.body || '')
    .split(/\n\s*\n/)
    .map((x) => x.trim())
    .filter(Boolean)
  const mins = `${readMins(b.body)} min`

  return (
    <>
      <TopBar
        title="Article"
        back
        backTo={home}
        sub={mins}
        right={
          <span className="flex items-center gap-3">
            {isMine(b.authorId, session?.user?.id) && (
              <button type="button" onClick={() => setEditing(true)} className="text-label uppercase tracking-label text-t2">
                Edit
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                const said = await shareLink(`/read/${b.id}`, { title: b.title })
                if (said) showToast(said)
              }}
              className="text-label uppercase tracking-label text-t2"
            >
              Share
            </button>
          </span>
        }
      />
      {editing && (
        <EditSheet
          piece={b}
          onClose={() => setEditing(false)}
          onSaved={(f) => setArticles((list) => list.map((x) => (x.id === b.id ? { ...x, ...f } : x)))}
        />
      )}

      {/* The cover the author uploaded, 16:9 as on the feed card. */}
      <Cover src={b.mediaUrl} seed={b.id} className="aspect-video w-full" />
      <ProductStrip tagged={b.products} shopRef={b.shopRef} />

      <section className="section pt-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Tag>Article</Tag>
          {/* No view count. Nothing server-side increments one yet, and a
              number the client made up is worse than no number. */}
          <span className="text-micro uppercase tracking-caps text-t3 tnum">{mins}</span>
        </div>

        <h1 className="text-title font-semibold">{b.title}</h1>

        <Link
          to={authorHref(b)}
          className="mt-8 flex items-center gap-3 border-t border-rule pt-6 transition-opacity hover:opacity-60"
        >
          <Avatar initials={b.initials} size={36} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-meta text-t1">{b.consultant}</span>
            <span className="block text-micro uppercase tracking-caps text-t3">
              Published {b.time}
            </span>
          </span>
          <span className="flex-none text-micro uppercase tracking-caps text-t3">Profile →</span>
        </Link>
      </section>

      {/* The body. Measure is held at 44ch and the type is left-ranged, so
          this reads as an article rather than as a long horoscope. */}
      <article className="section">
        <div className="mx-auto max-w-prose2">
          {paras.map((para, i) => (
            <p key={para} className={`text-read text-t1 ${i > 0 ? 'mt-6' : ''}`}>
              {para}
            </p>
          ))}
        </div>

        <Stub className="my-10" />

        {/* Like, reply, share and save under the text, as on the feed card
            (6 Oct 2026). */}
        <div className="-mx-3">
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
          {comments > 0 && (
            <button type="button" onClick={() => setCommenting(true)} className="mt-2 px-3 text-meta text-t3">
              {comments === 1 ? t('home.comment1') : t('home.comments', { n: comments.toLocaleString('en-IN') })}
            </button>
          )}
        </div>
        <CommentSheet
          open={commenting}
          onClose={() => setCommenting(false)}
          contentId={b.id}
          postAuthorId={b.authorId}
          onCount={setComments}
        />
      </article>

      <Section label="Written by">
        <div className="flex items-center gap-4">
          <Avatar initials={b.initials} size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body text-t1">{b.consultant}</p>
            <p className="mt-1 text-micro uppercase tracking-caps text-t3">
              {b.isConsultant ? 'Reads charts for a living' : 'Writes here'}
            </p>
          </div>
        </div>
        {/* A seeker who wrote a blog post is not bookable, and offering a
            session under their name is the one place this screen could quietly
            turn a person into a practitioner. */}
        {b.isConsultant ? (
          <Button to={`/consult/${b.authorId}`} variant="solid" className="mt-8">
            Book a session
          </Button>
        ) : (
          <Button to={`/u/${b.authorId}`} variant="solid" className="mt-8">
            See their posts
          </Button>
        )}
      </Section>

      <Section label="Read next" last>
        {next && next.id !== b.id && (
          <Row to={`/read/${next.id}`} title={next.title} note={`${readMins(next.body)} min`} />
        )}
        <Row to="/home" title="Back to the feed" />
      </Section>

      <div className="h-8" />
    </>
  )
}
