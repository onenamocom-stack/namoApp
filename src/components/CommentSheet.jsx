import { Loader } from './Cosmos.jsx'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { fetchComments, postComment, removeComment } from '../lib/content.js'
import { PopAvatar } from './Pop.jsx'
import { useStore } from '../store.jsx'

/**
 * Comments on a post or reel — Instagram's sheet: the thread, oldest first,
 * scrolling above a composer pinned to the bottom edge.
 *
 * Until 30 Sep the comment icon toasted "Replies — prototype only"; this is
 * the real thing, on `content_comments` (docs/05 §5.2d). You can remove your
 * own comment, and anything on your own post; there is no editing.
 *
 * Portalled to <body> and fixed, not absolute like `Sheet` (Chrome.jsx).
 * Mounted inside the feed's scroller, an absolute sheet sat UNDER the fixed
 * tab bar, which covered the composer — found in the first browser test.
 * Its own layout too, because a sheet whose input scrolls away with the
 * thread is a sheet you cannot type into. Capped at the phone frame's
 * 420px so it lines up with the app on a wide screen.
 *
 * `onCount` tells the caller the thread's length after every change, so the
 * count under the icon moves with it.
 */
export default function CommentSheet({ open, onClose, contentId, postAuthorId, onCount }) {
  const { session, showToast } = useStore()
  const me = session?.user?.id ?? null
  const [items, setItems] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef(null)
  const report = useRef(onCount)
  report.current = onCount

  useEffect(() => {
    if (!open) return undefined
    let alive = true
    setItems(null)
    fetchComments(contentId)
      .then((rows) => {
        if (!alive) return
        setItems(rows)
        report.current?.(rows.length)
      })
      .catch((err) => alive && (setItems([]), showToast(err.message)))
    return () => {
      alive = false
    }
  }, [open, contentId, showToast])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [items])

  if (!open) return null

  const same = (a, b) => String(a ?? '').replace(/-/g, '') === String(b ?? '').replace(/-/g, '')
  const myPost = me && same(me, postAuthorId)

  async function send() {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    try {
      const row = await postComment(contentId, text)
      const next = [...(items ?? []), row]
      setItems(next)
      report.current?.(next.length)
      setDraft('')
    } catch (err) {
      showToast(err.message)
    } finally {
      setSending(false)
    }
  }

  async function remove(c) {
    try {
      await removeComment(c.id)
      const next = items.filter((x) => x.id !== c.id)
      setItems(next)
      report.current?.(next.length)
    } catch (err) {
      showToast(err.message)
    }
  }

  return createPortal(
    <div className="fixed inset-y-0 left-1/2 z-[60] flex w-full max-w-[420px] -translate-x-1/2 flex-col justify-end">
      <button
        type="button"
        aria-label="Close comments"
        onClick={onClose}
        className="absolute inset-0 animate-fade bg-black/45"
      />
      <div className="relative flex max-h-[78%] min-h-[55%] animate-sheet-in flex-col rounded-t-3xl bg-white shadow-xl">
        <div className="flex-none border-b border-rule pt-3">
          <span className="mx-auto block h-1 w-9 rounded-full bg-black/15" aria-hidden="true" />
          <div className="flex items-center justify-between px-5 py-3">
            <p className="text-meta font-semibold text-t1">
              Comments{items?.length ? ` · ${items.length}` : ''}
            </p>
            <button type="button" onClick={onClose} className="text-meta font-semibold text-gold">
              Close
            </button>
          </div>
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {items === null && <Loader className="py-8" />}
          {items?.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-body font-semibold text-t1">No comments yet</p>
              <p className="mt-1 text-meta t-body">Start the conversation.</p>
            </div>
          )}
          <ul>
            {(items ?? []).map((c) => (
              <li key={c.id} className="flex gap-3 py-2.5">
                <Link to={`/u/${c.authorId}`} className="flex-none" onClick={onClose}>
                  <PopAvatar initials={c.initials} size={32} />
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="text-meta leading-snug text-t1">
                    <span className="mr-1.5 font-semibold">{c.name}</span>
                    <span className="whitespace-pre-line break-words text-t2">{c.body}</span>
                  </p>
                  <p className="mt-1 flex gap-3 text-[11px] text-t3">
                    <span className="tnum">{c.time}</span>
                    {(same(c.authorId, me) || myPost) && (
                      <button type="button" onClick={() => remove(c)} className="font-semibold">
                        Delete
                      </button>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div ref={endRef} />
        </div>

        {/* The composer, pinned. Signed out, it says how to take part rather
            than offering a box that refuses on send. */}
        <div className="flex-none border-t border-rule px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
          {session ? (
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
                rows={1}
                maxLength={1000}
                placeholder="Add a comment…"
                aria-label="Add a comment"
                className="max-h-28 min-h-[40px] flex-1 resize-none rounded-2xl border border-rule bg-bg px-4 py-2.5 text-meta text-t1 outline-none placeholder:text-t4 focus:border-gold-fill"
              />
              <button
                type="button"
                onClick={send}
                disabled={!draft.trim() || sending}
                className="h-10 flex-none px-2 text-meta font-semibold text-gold disabled:text-t4"
              >
                {sending ? 'Posting' : 'Post'}
              </button>
            </div>
          ) : (
            <Link
              to="/onboarding"
              className="block py-2 text-center text-meta font-semibold text-gold"
            >
              Sign in to comment
            </Link>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
