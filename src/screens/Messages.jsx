import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Sheet, TabHeader, TopBar } from '../components/Chrome.jsx'
import { isPro } from '../side.js'
import { Loader } from '../components/Cosmos.jsx'
import Icon from '../components/Icon.jsx'
import { PopAvatar } from '../components/Pop.jsx'
import { clearDm, fetchDmThreads } from '../lib/dms.js'
import { useLongPress } from '../lib/longpress.js'
import { ago } from '../lib/notifications.js'
import { useStore } from '../store.jsx'

const initialsOf = (name) =>
  (name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

/**
 * Your conversations with people (13 Oct 2026, docs/06 Phase 15b): the
 * Chatbox, and Chat requests from people who do not follow you. Used by
 * `/messages` and by the consultant app's chat panel; `onOpen` lets the
 * panel close itself first.
 *
 * Redrawn 14 Oct 2026 (Rahul: "thoda modern"): a "Chats" heading with a
 * new-message pen (it opens People search), underline tabs, larger photos,
 * unread in bold with a saffron count. Groups left this screen the same day;
 * they are Home's round button.
 */
export function MessagesList({ onOpen }) {
  const navigate = useNavigate()
  const [box, setBox] = useState('inbox')
  const [data, setData] = useState(null)
  const [requests, setRequests] = useState(0)
  // The chat held down for "Delete chat" (14 Oct 2026, Rahul).
  const [picked, setPicked] = useState(null)
  const { showToast } = useStore()

  useEffect(() => {
    let alive = true
    setData(null)
    const load = () =>
      fetchDmThreads(box)
        .then((d) => {
          if (!alive) return
          setData(d)
          setRequests(box === 'inbox' ? d?.requests ?? 0 : (d?.items ?? []).length)
        })
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

  const tabs = [
    { key: 'inbox', label: 'Chatbox' },
    { key: 'requests', label: 'Chat requests', count: requests },
  ]

  return (
    <div className="min-h-0 flex-1 bg-white">
      <div className="flex items-center justify-between px-4 pb-1 pt-4">
        <h1 className="font-display text-[26px] font-bold leading-none t-heading">Chats</h1>
        <Link
          to="/search?in=users"
          onClick={() => onOpen?.()}
          aria-label="New message"
          title="New message"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 t-heading transition-colors hover:bg-surface"
        >
          <Icon name="edit" size={19} weight={1.9} />
        </Link>
      </div>

      <div role="tablist" className="flex gap-6 border-b border-rule px-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={box === t.key}
            onClick={() => setBox(t.key)}
            className={`relative py-3 text-[15px] font-semibold transition-colors ${
              box === t.key ? 't-heading' : 'text-t3 hover:text-t1'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gold-fill px-1.5 align-[1px] text-[11px] font-bold text-white tnum">
                {t.count}
              </span>
            )}
            <span
              aria-hidden="true"
              className={`absolute inset-x-0 -bottom-px h-[2.5px] rounded-full bg-t1 transition-transform duration-200 ${
                box === t.key ? 'scale-x-100' : 'scale-x-0'
              }`}
            />
          </button>
        ))}
      </div>

      {data === null && <Loader />}
      {data && !data.items.length && (
        <div className="flex flex-col items-center px-8 py-16 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gold-fill/10 gold">
            <Icon name="infinity" size={30} weight={1.8} />
          </span>
          <p className="mt-4 text-body font-semibold t-heading">
            {box === 'inbox' ? 'No chats yet' : 'No chat requests'}
          </p>
          <p className="mt-1 text-meta t-faint">
            {box === 'inbox'
              ? 'Find somebody and send them a message.'
              : 'A message from somebody who does not follow you waits here.'}
          </p>
          {box === 'inbox' && (
            <Link
              to="/search?in=users"
              onClick={() => onOpen?.()}
              className="mt-5 rounded-full bg-gold-fill px-5 py-2.5 text-meta font-semibold text-white shadow-sm"
            >
              Find people
            </Link>
          )}
        </div>
      )}
      {data && data.items.length > 0 && (
        <ul className="py-1">
          {data.items.map((c) => {
            const unread = c.unread > 0
            const waiting = c.state === 'waiting'
            return (
              <li key={c.id}>
                <HoldButton
                  onHold={() => setPicked(c)}
                  onClick={() => open(c.id)}
                  className="flex w-full select-none items-center gap-3.5 px-4 py-2.5 text-left transition-colors active:bg-surface-2"
                >
                  <PopAvatar initials={initialsOf(c.with.name)} src={c.with.avatar_url} size={54} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-[15px] ${unread ? 'font-bold t-heading' : 'font-semibold text-t1'}`}>
                        {c.with.name}
                      </span>
                      <span className={`flex-none text-[11px] tnum ${unread ? 'font-semibold gold' : 'text-t3'}`}>
                        {c.last_message_at ? ago(c.last_message_at) : ''}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span
                        className={`flex min-w-0 flex-1 items-center gap-1 truncate text-[13.5px] ${
                          unread ? 'font-semibold text-t1' : 'text-t3'
                        }`}
                      >
                        {waiting && <ClockMark />}
                        <span className="truncate">{waiting ? 'Sent · waiting for them to accept' : c.last_preview}</span>
                      </span>
                      {unread && (
                        <span className="flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-gold-fill px-1.5 text-[11px] font-bold text-white tnum">
                          {c.unread > 9 ? '9+' : c.unread}
                        </span>
                      )}
                    </span>
                  </span>
                </HoldButton>
              </li>
            )
          })}
        </ul>
      )}
      <Sheet open={!!picked} onClose={() => setPicked(null)} title={picked?.with?.name || 'Chat'}>
        <p className="text-meta t-sub">
          The chat leaves your Chats. {picked?.with?.name?.split(' ')[0] || 'They'} keeps their copy, and a new
          message brings it back.
        </p>
        <button
          type="button"
          onClick={async () => {
            const c = picked
            setPicked(null)
            try {
              await clearDm(c.id)
              setData((d) => (d ? { ...d, items: d.items.filter((x) => x.id !== c.id) } : d))
            } catch (err) {
              showToast(err.message)
            }
          }}
          className="mt-5 block w-full rounded-xl bg-[#c0392b] py-3 text-center text-meta font-semibold text-white"
        >
          Delete chat
        </button>
        <button type="button" onClick={() => setPicked(null)} className="mt-2 block w-full py-3 text-center text-meta font-semibold t-sub">
          Cancel
        </button>
      </Sheet>
    </div>
  )
}

/** A row that opens on a tap and offers Delete on a hold (14 Oct 2026). */
function HoldButton({ onHold, onClick, className, children }) {
  const hold = useLongPress(onHold)
  return (
    <button type="button" onClick={onClick} className={className} {...hold}>
      {children}
    </button>
  )
}

function ClockMark() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="flex-none">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  )
}

/* A tab in the seeker app (the bar's middle slot, 13 Oct 2026), so the
   shared header, with its search like every other tab (14 Oct, Rahul) —
   it opens /search on people; a page with Back in the consultant app. */
export default function Messages() {
  return (
    <>
      {isPro ? <TopBar title="Messages" back backTo="/pro/studio" /> : <TabHeader />}
      <MessagesList />
    </>
  )
}
