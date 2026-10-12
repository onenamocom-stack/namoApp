import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Loader } from '../components/Cosmos.jsx'
import { resolveUsername } from '../lib/profile.js'

/**
 * 1namo.com/<username> (11 Oct 2026, Rahul): the readable profile link.
 * Asks the server whose name it is and forwards to the page that already
 * exists — /consult/:id for a consultant, /u/:id for anybody else. Nothing
 * is drawn here but the wait and a miss.
 *
 * The server answers only for somebody the public pages already show, so
 * a seeker who has never posted is a miss by name exactly as by id.
 */

// Any one-segment path the router has no page for comes here. These are
// the seeker app's one-segment pages long enough to look like a username;
// SessionGate must not treat them as one. A new page of 8+ letters goes
// here, in the server's RESERVED list (apps/profiles/username_rules.py),
// and as its own rewrite in firebase.json above the username regex, which
// otherwise sends it to the API for a link preview (12 Oct 2026).
const PAGES = new Set(['onboarding', 'horoscope', 'notifications'])
const SHAPE = /^\/[a-z0-9.-]{8,30}$/i

export function isHandlePath(pathname) {
  return SHAPE.test(pathname) && !PAGES.has(pathname.slice(1).toLowerCase())
}

export default function Handle() {
  const { handle } = useParams()
  const [found, setFound] = useState(undefined)
  const shaped = isHandlePath(`/${handle}`)

  useEffect(() => {
    if (!shaped) return
    let live = true
    resolveUsername(handle.toLowerCase())
      .then((row) => live && setFound(row))
      .catch(() => live && setFound(null))
    return () => {
      live = false
    }
  }, [handle, shaped])

  if (!shaped) return <Navigate to="/home" replace />
  if (found === undefined) return <Loader />
  if (found) {
    return <Navigate to={found.is_consultant ? `/consult/${found.id}` : `/u/${found.id}`} replace />
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
      <p className="text-lead font-semibold t-heading">Nobody by that name</p>
      <p className="mt-2 text-meta t-sub">
        1namo.com/{handle} is not anybody's profile. They may have changed their username.
      </p>
      <Link to="/home" className="mt-6 text-meta font-semibold text-gold">
        Go to Home
      </Link>
    </div>
  )
}
