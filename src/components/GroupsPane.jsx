import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader } from './Cosmos.jsx'
import { Kicker, PopAvatar } from './Pop.jsx'
import { findGroups, kindLabel, myGroups, suggestGroups } from '../lib/groups.js'
import { ago } from '../lib/notifications.js'

const initialsOf = (name) =>
  (name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

/**
 * The groups list on `/groups` (14 Oct 2026, Rahul; it began as Chat's
 * Groups segment): the groups you created, the ones you are in, each with
 * the newest post first, then Find groups (by name or city). `onOpen` runs
 * before a group opens.
 */
export default function GroupsPane({ onOpen }) {
  const navigate = useNavigate()
  const [mine, setMine] = useState(null)
  const [q, setQ] = useState('')
  const [found, setFound] = useState(null)

  // Third on the page, Suggested groups (14 Oct 2026, Rahul): live groups you
  // are not in, busiest first, as Home's strip.
  const [suggested, setSuggested] = useState([])
  useEffect(() => {
    myGroups().then(setMine).catch(() => setMine([]))
    suggestGroups().then(setSuggested).catch(() => setSuggested([]))
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


  /* Two lists since 14 Oct 2026 (Rahul): the groups you started, and the
     ones you joined. Starting one is the + at the top of the page. */
  const created = (mine ?? []).filter((g) => g.created_by_me)
  const joined = (mine ?? []).filter((g) => !g.created_by_me)

  const searching = q.trim().length > 0

  return (
    <div className="pb-10">
      {/* Search on top (14 Oct 2026, Rahul). Typing shows what it finds,
          your own groups included; empty, the page is your groups, then
          the rest. */}
      <div className="px-4 pt-3">
        <label className="flex h-11 items-center gap-2 rounded-xl border border-stroke bg-white px-3 text-meta focus-within:border-gold">
          <span aria-hidden="true" className="flex-none t-faint">⌕</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find group: a mandir, deity, sampradaya or city"
            aria-label="Find group"
            className="min-w-0 flex-1 bg-transparent t-heading outline-none placeholder:text-t4"
          />
          {q && (
            <button type="button" aria-label="Clear" onClick={() => setQ('')} className="flex-none t-faint">
              ✕
            </button>
          )}
        </label>
      </div>

      {searching ? (
        <section className="px-4 pt-3">
          {found === null && <Loader />}
          {found && !found.length && <p className="mt-3 text-meta t-faint">No group by that name yet.</p>}
          <ul className="mt-1">
            {(found ?? []).map((g) => (
              <GroupRow key={g.id} g={g} onOpen={open} />
            ))}
          </ul>
        </section>
      ) : (
      <>
      {mine === null && <Loader />}
      {mine && !mine.length && (
        <p className="px-4 pt-4 text-meta t-faint">You are in no group yet. Find one above, or start one with +.</p>
      )}
      {created.length > 0 && (
        <section className="px-4 pt-4">
          <Kicker>Groups you created</Kicker>
          <ul className="mt-1">
            {created.map((g) => (
              <GroupRow key={g.id} g={g} onOpen={open} />
            ))}
          </ul>
        </section>
      )}
      {joined.length > 0 && (
        <section className="px-4 pt-4">
          <Kicker>Groups you&apos;re in</Kicker>
          <ul className="mt-1">
            {joined.map((g) => (
              <GroupRow key={g.id} g={g} onOpen={open} />
            ))}
          </ul>
        </section>
      )}

      {suggested.length > 0 && (
        <section className="px-4 pt-5">
          <Kicker>Suggested groups</Kicker>
          <ul className="mt-1">
            {suggested.map((g) => (
              <GroupRow key={g.id} g={g} onOpen={open} />
            ))}
          </ul>
        </section>
      )}
      </>
      )}
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
