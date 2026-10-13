import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import { Loader } from '../components/Cosmos.jsx'
import { PopAvatar } from '../components/Pop.jsx'
import ReportSheet from '../components/ReportSheet.jsx'
import { DM_POLL_MS, acceptDm, blockPerson, declineDm, fetchDmMessages, markDmRead, sendDm } from '../lib/dms.js'
import { useStore } from '../store.jsx'

/**
 * One conversation with a person, `/messages/:id` (13 Oct 2026, docs/06
 * Phase 15b). Polls every three seconds while open. A request shows Accept
 * and Decline to the person it was sent to; the sender sees that it waits.
 * ⋯ holds Block and Report — the server refuses a blocked person's message,
 * this screen only says so.
 */
export default function Conversation() {
  const { id } = useParams()
  const { session, showToast } = useStore()
  const me = session?.user?.id
  const [thread, setThread] = useState(null)
  const [items, setItems] = useState(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [menu, setMenu] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [error, setError] = useState('')
  const end = useRef(null)
  const last = useRef(null)

  const load = useCallback(async () => {
    const d = await fetchDmMessages(id, last.current)
    setThread(d.thread)
    if (d.items.length) {
      last.current = d.items[d.items.length - 1].id
      setItems((now) => {
        const seen = new Set((now ?? []).map((m) => m.id))
        return [...(now ?? []), ...d.items.filter((m) => !seen.has(m.id))]
      })
      if (d.items.some((m) => m.sender_id !== me)) markDmRead(id).catch(() => {})
    } else {
      setItems((now) => now ?? [])
    }
  }, [id, me])

  useEffect(() => {
    last.current = null
    setItems(null)
    let alive = true
    let timer
    const tick = () =>
      load()
        .catch((e) => alive && setError(e.message))
        .finally(() => {
          if (alive) timer = setTimeout(tick, DM_POLL_MS)
        })
    tick()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [load])

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [items?.length])

  async function send() {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    setError('')
    try {
      const m = await sendDm(id, body)
      setText('')
      last.current = m.id
      setItems((now) => [...(now ?? []), m])
      load().catch(() => {})
    } catch (e) {
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  async function act(fn, said) {
    setMenu(false)
    try {
      await fn()
      if (said) showToast(said)
      await load()
    } catch (e) {
      showToast(e.message)
    }
  }

  const other = thread?.with
  const initials = (other?.name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar
        title={other?.name ?? ''}
        back
        backTo="/messages"
        right={
          other ? (
            <button type="button" onClick={() => setMenu((v) => !v)} aria-label="More" className="px-2 text-lead text-t2">
              ⋯
            </button>
          ) : null
        }
      />
      {menu && other && (
        <div className="mx-4 mb-2 overflow-hidden rounded-xl border border-stroke bg-white">
          <Link to={`/u/${other.id}`} className="block px-4 py-3 text-meta text-t1">View profile</Link>
          <button
            type="button"
            onClick={() =>
              act(
                () => blockPerson(other.id, !thread.i_blocked),
                thread.i_blocked ? `Unblocked ${other.name}` : `Blocked ${other.name}. Neither of you can write here.`,
              )
            }
            className="block w-full border-t border-rule px-4 py-3 text-left text-meta text-t1"
          >
            {thread.i_blocked ? 'Unblock' : 'Block'}
          </button>
          <button
            type="button"
            onClick={() => {
              setMenu(false)
              setReporting(true)
            }}
            className="block w-full border-t border-rule px-4 py-3 text-left text-meta text-live"
          >
            Report
          </button>
        </div>
      )}

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {items === null && <Loader />}
        {other && items !== null && (
          <Link to={`/u/${other.id}`} className="mb-4 flex flex-col items-center pt-2 text-center">
            <PopAvatar initials={initials} src={other.avatar_url} size={64} />
            <span className="mt-2 text-meta font-semibold text-t1">{other.name}</span>
          </Link>
        )}
        {items?.map((m) => {
          const mine = m.sender_id === me
          return (
            <div key={m.id} className={`mb-1.5 flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <p
                className={`max-w-[78%] whitespace-pre-line rounded-2xl px-3.5 py-2 text-body ${
                  mine ? 'bg-btn text-white' : 'bg-white text-t1'
                }`}
              >
                {m.body}
              </p>
            </div>
          )
        })}
        <div ref={end} />
      </div>

      {thread?.state === 'request' && (
        <div className="border-t border-rule bg-white px-4 py-3">
          <p className="text-meta text-t2">A request: you do not follow {other?.name}. Accept to reply.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => act(() => acceptDm(id))} className="flex-1 rounded-lg bg-btn py-2 text-center text-meta font-semibold text-white">
              Accept
            </button>
            <button type="button" onClick={() => act(() => declineDm(id), 'Declined')} className="flex-1 rounded-lg bg-ink/[0.07] py-2 text-center text-meta font-semibold text-t1">
              Decline
            </button>
          </div>
        </div>
      )}
      {thread?.state === 'waiting' && items?.length > 0 && (
        <p className="border-t border-rule bg-white px-4 py-2 text-[12px] text-t3">
          Sent. They see it as a request until they accept.
        </p>
      )}
      {thread?.blocked && (
        <p className="border-t border-rule bg-white px-4 py-2 text-[12px] text-t3">You cannot write here.</p>
      )}

      {thread && thread.state !== 'request' && thread.state !== 'declined' && !thread.blocked && (
        <div className="flex items-end gap-2 border-t border-rule bg-white px-3 py-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 2000))}
            rows={1}
            placeholder="Message"
            className="max-h-32 min-h-[40px] flex-1 resize-none rounded-2xl bg-ink/[0.05] px-3.5 py-2 text-body text-t1 outline-none"
          />
          <button
            type="button"
            onClick={send}
            disabled={!text.trim() || sending}
            className="h-10 flex-none rounded-full bg-btn px-4 text-meta font-semibold text-white disabled:opacity-40"
          >
            Send
          </button>
        </div>
      )}
      {error && <p className="bg-white px-4 pb-2 text-[12px] text-live">{error}</p>}

      {other && (
        <ReportSheet open={reporting} onClose={() => setReporting(false)} profileId={other.id} name={other.name} />
      )}
    </div>
  )
}
