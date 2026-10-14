import { Loader } from '../components/Cosmos.jsx'
import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import { Kicker, PopAvatar, PopButton } from '../components/Pop.jsx'
import { firstName } from '../components/Primitives.jsx'
import ReportSheet from '../components/ReportSheet.jsx'
import ProfileHead from '../components/ProfileHead.jsx'
import SadhanaStreak from '../components/SadhanaStreak.jsx'
import VerifiedMark from '../components/VerifiedMark.jsx'
import { FeedCard } from './Home.jsx'
import { useStore } from '../store.jsx'
import { fetchAuthor, fetchByAuthor, followCounts } from '../lib/content.js'
import { startDm } from '../lib/dms.js'

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
 * details, and no page for someone who has never posted — unless a follow
 * joins them to you, either way, so your follow list opens (12 Oct 2026).
 */
export default function UserProfile() {
  const { id } = useParams()
  const { hasFlag, toggleFlag, session, showToast } = useStore()
  const navigate = useNavigate()
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
        <Loader />
      </>
    )
  }

  // Nobody by that id has published anything, so there is nothing to show and
  // no name to print. Not a 404 screen — the feed is where they came from.
  if (author === null) return <Navigate to="/home" replace />
  // One page per consultant (6 Oct 2026): their posts, followers and
  // bookings all live on /consult/:id; this page is for everyone else.
  if (author?.is_consultant) return <Navigate to={`/consult/${id}`} replace />

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
        <PopAvatar initials={initials} size={72} />
        {/* Name over the three numbers (11 Oct 2026, Rahul). */}
        <ProfileHead
          name={author.name}
          mark={author.is_creator && <VerifiedMark size={20} tone="creator" />}
          stats={[
            { n: posts.length, label: 'posts' },
            { n: counts.followers, label: 'followers' },
            { n: counts.following, label: 'following' },
          ]}
        />
      </section>
      {/* Their sadhana streak, while it runs (14 Oct 2026, Phase 15c). */}
      <SadhanaStreak profileId={id} className="px-5 pt-3" />

      {/* Your own page has no Follow button. Following yourself is a row the
          database would happily take and nobody wants. */}
      {!mine && (
        <div className="flex gap-2.5 px-5 pt-5">
          <PopButton
            className="flex-1"
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
          {/* Free messages between people (13 Oct 2026, Phase 15b). */}
          {session && (
            <PopButton
              className="flex-1"
              variant="default"
              onClick={() =>
                startDm(id)
                  .then((c) => navigate(`/messages/${c.id}`))
                  .catch((e) => showToast(e.message))
              }
            >
              Message
            </PopButton>
          )}
        </div>
      )}

      <section className="py-6">
        <Kicker className="px-5">Posts</Kicker>
        {/* Each post in full, newest first, as the feed draws it (11 Oct
            2026, Rahul) — it was a list of titles. */}
        <div className="mt-3 bg-white">
          {posts.map((c) => (
            <FeedCard key={c.id} piece={c} />
          ))}
        </div>
        {!posts.length && <p className="prose-c px-5">Nothing published yet.</p>}
      </section>

      <section className="px-5 pb-6">
        {/* No Reshared list here (13 Oct 2026, Rahul): what you reshared is
            yours to see, on your own Profile's Reshared tab. */}
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
