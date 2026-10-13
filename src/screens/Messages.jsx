import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import { Loader } from '../components/Cosmos.jsx'
import { PopAvatar } from '../components/Pop.jsx'
import { Segmented } from '../components/Primitives.jsx'
import { fetchDmThreads } from '../lib/dms.js'
import { ago } from '../lib/notifications.js'

const initialsOf = (name) =>
  (name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

/**
 * Your conversations with people (13 Oct 2026, docs/06 Phase 15b): Inbox,
 * and Requests from people who do not follow you. Used by `/messages` and by
 * the chat panel's Messages tab; `onOpen` lets the panel close itself first.
 */
export function MessagesList({ onOpen }) {
  const navigate = useNavigate()
  const [box, setBox] = useState('inbox')
  const [data, setData] = useState(null)

  useEffect(() => {
    let alive = true
    setData(null)
    const load = () =>
      fetchDmThreads(box)
        .then((d) => alive && setData(d))
        .catch(() => alive && setData({ items: [], requests: 0 }))
    load()
    const timer = setInterval(load, 15_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [box])

  const open = (id) => {
    onOpen?.()
    navigate(`/messages/${id}`)
  }

  return (
    <div className="min-h-0 flex-1">
      <div className="px-4 pt-3">
        <Segmented
          items={[
            { key: 'inbox', label: 'Inbox' },
            { key: 'requests', label: data?.requests ? `Requests · ${data.requests}` : 'Requests' },
          ]}
          value={box}
          onChange={setBox}
        />
      </div>
      {data === null && <Loader />}
      {data && !data.items.length && (
        <p className="px-5 py-6 text-meta t-faint">
          {box === 'inbox'
            ? 'No messages yet. Open somebody’s profile and tap Message.'
            : 'No requests. A message from somebody who does not follow you waits here.'}
        </p>
      )}
      {data && data.items.length > 0 && (
        <ul className="mt-2">
          {data.items.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => open(c.id)}
                className="flex w-full items-center gap-3 border-b border-rule px-4 py-3 text-left"
              >
                <PopAvatar initials={initialsOf(c.with.name)} src={c.with.avatar_url} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-meta ${c.unread ? 'font-semibold text-t1' : 'text-t1'}`}>
                      {c.with.name}
                    </span>
                    <span className="flex-none text-[11px] tnum text-t3">
                      {c.last_message_at ? ago(c.last_message_at) : ''}
                    </span>
                  </span>
                  <span className={`block truncate text-[13px] ${c.unread ? 'text-t1' : 'text-t3'}`}>
                    {c.state === 'waiting' ? 'Sent. Waiting for them to accept.' : c.last_preview}
                  </span>
                </span>
                {c.unread > 0 && (
                  <span className="flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-btn px-1.5 text-[11px] font-semibold text-white">
                    {c.unread}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function Messages() {
  return (
    <>
      <TopBar title="Messages" back backTo="/home" />
      <MessagesList />
    </>
  )
}
