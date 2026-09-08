import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { fetchFeed } from '../lib/content.js'
import { readMins } from './Home.jsx'
import { TopBar } from '../components/Chrome.jsx'
import Plate from '../components/Plate.jsx'
import { Acts, Avatar, Button, Row, Section, Stub, Tag } from '../components/Primitives.jsx'
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
  const { showToast, hasFlag, toggleFlag } = useStore()

  /* Articles are rows now, so this screen loads rather than looks up. It asks
     for the whole article list and picks its own out of it, because the same
     request also answers "read next" — two round trips for one screen would be
     the expensive kind of tidy. */
  const [articles, setArticles] = useState(null)

  useEffect(() => {
    let active = true
    fetchFeed({ kinds: ['article'] })
      .then((rows) => active && setArticles(rows))
      .catch((err) => {
        console.error('[article] load failed:', err.message)
        if (active) setArticles([])
      })
    return () => {
      active = false
    }
  }, [])

  /* Nothing is rendered against a half-loaded list: `null` means still asking,
     `[]` means asked and got nothing. Without the distinction a slow network
     redirects to /home before the article arrives. */
  if (articles === null) {
    return (
      <>
        <TopBar title="Article" back backTo="/home" />
        <p className="prose-c">Loading.</p>
      </>
    )
  }

  const idx = articles.findIndex((b) => b.id === id)
  if (idx === -1) return <Navigate to="/home" replace />

  const b = articles[idx]
  const next = articles[(idx + 1) % articles.length]
  const saved = hasFlag(`save:${b.id}`)

  /* One text column in the database, paragraphs on screen. Splitting on blank
     lines is what a writer typing into the studio's textarea actually produces,
     and it keeps the stored value the thing they typed (§1.5). */
  const paras = (b.body || '')
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean)
  const mins = `${readMins(b.body)} min`

  return (
    <>
      <TopBar
        title="Article"
        back
        backTo="/home"
        sub={mins}
        right={
          <button
            type="button"
            onClick={() => showToast('Article link copied')}
            className="text-label uppercase tracking-label text-t2"
          >
            Share
          </button>
        }
      />

      <Plate seed={b.id} className="h-44 w-full" />

      <section className="section pt-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Tag>Article</Tag>
          {/* No view count. Nothing server-side increments one yet, and a
              number the client made up is worse than no number. */}
          <span className="text-micro uppercase tracking-caps text-t3 tnum">{mins}</span>
        </div>

        <h1 className="text-title font-light">{b.title}</h1>

        <Link
          to={`/consult/${b.consultantId}`}
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

        <Acts
          className="justify-center"
          items={[
            {
              label: 'Save for later',
              onLabel: 'Saved for later',
              on: saved,
              onClick: () =>
                toggleFlag(`save:${b.id}`, {
                  on: 'Saved to your reading list',
                  off: 'Removed from your reading list',
                }),
            },
            { label: 'Share', onClick: () => showToast('Article link copied') },
          ]}
        />
      </article>

      <Section label="Written by">
        <div className="flex items-center gap-4">
          <Avatar initials={b.initials} size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body text-t1">{b.consultant}</p>
            <p className="mt-1 text-micro uppercase tracking-caps text-t3">
              Reads charts for a living
            </p>
          </div>
        </div>
        <Button to={`/consult/${b.consultantId}`} variant="solid" className="mt-8">
          Book a session
        </Button>
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
