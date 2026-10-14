import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader } from './Cosmos.jsx'
import { Kicker, PopAvatar, PopButton } from './Pop.jsx'
import { findGroups, kindLabel, myGroups } from '../lib/groups.js'
import { ago } from '../lib/notifications.js'

const initialsOf = (name) =>
  (name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

/**
 * Chat's Groups segment (14 Oct 2026, Rahul: option A): your groups, the
 * one with the newest post first; then Find groups (by name or city) and
 * Start a group. `onOpen` lets the chat panel close itself first.
 */
export default function GroupsPane({ onOpen }) {
  const navigate = useNavigate()
  const [mine, setMine] = useState(null)
  const [q, setQ] = useState('')
  const [found, setFound] = useState(null)

  useEffect(() => {
    myGroups().then(setMine).catch(() => setMine([]))
  }, [])

  useEffect(() => {
    let live = true
    const t = setTimeout(() => {
      findGroups(q).then((g) => live && setFound(g)).catch(() => live && setFound([]))
    }, 250)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [q])

  const open = (id) => {
    onOpen?.()
    navigate(`/groups/${id}`)
  }

  const mineIds = new Set((mine ?? []).map((g) => g.id))

  return (
    <div className="pb-10">
      <section className="px-4 pt-4">
        <Kicker>Your groups</Kicker>
        {mine === null && <Loader />}
        {mine && !mine.length && (
          <p className="mt-2 text-meta t-faint">You are in no group yet. Find one below, or start one.</p>
        )}
        <ul className="mt-1">
          {mine?.map((g) => (
            <GroupRow key={g.id} g={g} onOpen={open} />
          ))}
        </ul>
      </section>

      <section className="px-4 pt-5">
        <div className="flex items-center justify-between gap-3">
          <Kicker>Find groups</Kicker>
          <Link to="/groups/new" onClick={() => onOpen?.()} className="text-meta font-semibold gold">
            Start a group
          </Link>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="A mandir, a sampradaya, a city"
          aria-label="Find groups"
          className="mt-2 h-10 w-full rounded-xl border border-stroke bg-surface-2 px-3 text-meta outline-none focus:border-gold"
        />
        {found === null && <Loader />}
        {found && !found.filter((g) => !mineIds.has(g.id)).length && (
          <div className="mt-3">
            <p className="text-meta t-faint">{q ? 'No group by that name yet.' : 'No groups yet.'}</p>
            <PopButton className="mt-3" to="/groups/new" onClick={() => onOpen?.()}>
              Start a group
            </PopButton>
          </div>
        )}
        <ul className="mt-1">
          {found?.filter((g) => !mineIds.has(g.id)).map((g) => (
            <GroupRow key={g.id} g={g} onOpen={open} />
          ))}
        </ul>
      </section>
    </div>
  )
}

function GroupRow({ g, onOpen }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(g.id)}
        className="flex w-full items-center gap-3 border-b border-rule py-3 text-left"
      >
        <PopAvatar initials={initialsOf(g.name)} src={g.avatar_url} size={44} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-meta font-semibold text-t1">{g.name}</span>
          <span className="block truncate text-[12px] text-t3 tnum">
            {kindLabel(g.kind)}
            {g.city ? ` · ${g.city}` : ''} · {g.member_count} {g.member_count === 1 ? 'member' : 'members'}
          </span>
        </span>
        {g.last_post_at && <span className="flex-none text-[11px] tnum text-t3">{ago(g.last_post_at)}</span>}
      </button>
    </li>
  )
}
