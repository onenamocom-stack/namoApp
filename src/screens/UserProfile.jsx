import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import { Kicker, PopAvatar, PopButton } from '../components/Pop.jsx'
import { firstName, Row } from '../components/Primitives.jsx'
import ReportSheet from '../components/ReportSheet.jsx'
import { useStore } from '../store.jsx'
import { fetchAuthor, fetchByAuthor, followCounts } from '../lib/content.js'

/**
 * A person who posts, seen by everybody else.
 *
 * This is NOT `/consult/:id`. That screen sells a practitioner: a rate, open
 * slots, reviews, a Book button. This one has none of those, deliberately — the
 * whole `025` split is that publishing a photo does not make you bookable, and
 * a screen that looked like a consultant's would undo that in the one place a
 * reader is deciding what someone is.
 *
 * The name comes from `authors_public`, which lists only people who have
 * published. `profiles` stays own-row-only: no phone, no email, no birth
 * details, and no page at all for someone who has never posted.
 */
export default function UserProfile() {
  const { id } = useParams()
  const { hasFlag, toggleFlag, session } = useStore()
  const [author, setAuthor] = useState(undefined)
  const [posts, setPosts] = useState([])
  const [counts, setCounts] = useState({ followers: 0, following: 0 })
  const [reporting, setReporting] = useState(false)

  const following = hasFlag(`followp:${id}`)

  useEffect(() => {
    let active = true
    fetchAuthor(id)
      .then((row) => active && setAuthor(row ?? null))
      .catch((err) => {
        console.error('[author] load failed:', err.message)
        if (active) setAuthor(null)
      })
    fetchByAuthor(id)
      .then((rows) => active && setPosts(rows))
      .catch((err) => console.error('[author posts] load failed:', err.message))
    return () => {
      active = false
    }
  }, [id])

  /* Re-read after a follow rather than adding 1 in the browser. The number is a
     COUNT of rows, and a client that does its own arithmetic is how a follower
     count starts disagreeing with the follows behind it. */
  useEffect(() => {
    let active = true
    followCounts(id)
      .then((c) => active && setCounts(c))
      .catch((err) => console.error('[author counts] load failed:', err.message))
    return () => {
      active = false
    }
  }, [id, following])

  if (author === undefined) {
    return (
      <>
        <TopBar title="Profile" back backTo="/home" />
        <p className="prose-c">Loading.</p>
      </>
    )
  }

  // Nobody by that id has published anything, so there is nothing to show and
  // no name to print. Not a 404 screen — the feed is where they came from.
  if (author === null) return <Navigate to="/home" replace />

  const mine = session?.user?.id === id
  const initials = (author.name || '')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <>
      {/* Reporting a PERSON, not one of their posts, lives here and only
          here. It is the half that answers "this account keeps doing it"
          when the offender deletes and reposts — a per-post count cannot
          see that, and seeing it is the reason reporting was asked for. */}
      <TopBar
        title="Profile"
        back
        backTo="/home"
        right={
          mine ? null : (
            <button
              type="button"
              onClick={() => setReporting(true)}
              aria-label="Report this person"
              className="text-micro uppercase tracking-label text-t3 transition-colors hover:text-t1"
            >
              Report
            </button>
          )
        }
      />

      <section className="flex items-center gap-4 border-b border-stroke px-5 py-6">
        <PopAvatar initials={initials} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-title leading-none t-heading">{author.name}</h1>
          <p className="mt-2 caps-sm t-faint tnum">
            {posts.length} posts · {counts.followers} followers · {counts.following} following
          </p>
        </div>
      </section>

      {/* Your own page has no Follow button. Following yourself is a row the
          database would happily take and nobody wants. */}
      {!mine && (
        <div className="px-5 pt-5">
          <PopButton
            variant={following ? 'default' : 'gold'}
            onClick={() =>
              toggleFlag(`followp:${id}`, {
                on: `Following ${firstName(author.name)}`,
                off: `Unfollowed ${firstName(author.name)}`,
              })
            }
          >
            {following ? 'Following' : 'Follow'}
          </PopButton>
        </div>
      )}

      <section className="px-5 py-6">
        <Kicker>Posts</Kicker>
        <div className="mt-3">
          {posts.map((c) => (
            <Row
              key={c.id}
              to={c.kind === 'article' ? `/read/${c.id}` : undefined}
              title={c.title || c.caption}
              meta={c.time}
              note={c.kind === 'article' ? 'Blog' : 'Photo'}
            />
          ))}
          {!posts.length && <p className="prose-c">Nothing published yet.</p>}
        </div>

        <Link to="/home" className="act-link mt-6 inline-block text-meta">
          Back to the feed
        </Link>
      </section>

      <div className="h-24" />

      <ReportSheet
        open={reporting}
        onClose={() => setReporting(false)}
        profileId={id}
        name={author.name}
      />
    </>
  )
}
