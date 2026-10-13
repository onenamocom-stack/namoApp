import { useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon.jsx'
import { useStore } from '../store.jsx'

/** Must match MAX_NOTE_CHARS in backend-django/apps/reactions/models.py. */
const MAX_NOTE = 500

/**
 * Reshare asks how (13 Oct 2026, Rahul — LinkedIn's sheet): "Reshare with
 * your thoughts" opens a box for a line of your own, shown above the card in
 * the feed; "Reshare now" is the old single tap. Undoing a reshare is still
 * one tap on the lit icon — only turning it on asks.
 *
 * `useReshare(key)` gives the icon its `tap` and the sheet to render beside
 * it. The key is the store's flag (`repost:` for a post or reel, `brepost:`
 * for a Bhakti item), so the counts, the rollback and the reload all work as
 * they did.
 *
 * Portalled and fixed like CommentSheet: mounted in the feed's scroller, an
 * absolute sheet sits under the tab bar.
 */
export function useReshare(key) {
  const { hasFlag, toggleFlag, t } = useStore()
  const [open, setOpen] = useState(false)
  const messages = { on: t('home.reshared'), off: t('home.reshareRemoved') }

  function tap() {
    if (hasFlag(key)) toggleFlag(key, messages)
    else setOpen(true)
  }

  const sheet = (
    <ReshareSheet
      open={open}
      onClose={() => setOpen(false)}
      onReshare={(note) => {
        setOpen(false)
        toggleFlag(key, messages, { note })
      }}
    />
  )
  return { tap, sheet }
}

function ReshareSheet({ open, onClose, onReshare }) {
  const [writing, setWriting] = useState(false)
  const [note, setNote] = useState('')

  if (!open) return null

  function close() {
    setWriting(false)
    setNote('')
    onClose()
  }

  function send(words) {
    setWriting(false)
    setNote('')
    onReshare(words)
  }

  return createPortal(
    <div className="fixed inset-y-0 left-1/2 z-[60] flex w-full max-w-[420px] -translate-x-1/2 flex-col justify-end">
      <button type="button" aria-label="Close" onClick={close} className="absolute inset-0 animate-fade bg-black/45" />
      <div className="relative animate-sheet-in rounded-t-3xl bg-white px-5 pb-8 pt-3 shadow-xl">
        <span className="mx-auto block h-1 w-9 rounded-full bg-black/15" aria-hidden="true" />
        {writing ? (
          <>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              maxLength={MAX_NOTE}
              autoFocus
              placeholder="Add your thoughts"
              className="mt-5 w-full resize-none rounded-2xl border border-rule bg-transparent p-3 text-body text-t1 outline-none placeholder:text-t4 focus:border-[#1f7a4d]"
            />
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setWriting(false)}
                className="flex h-11 flex-1 items-center justify-center rounded-full border border-rule text-meta font-semibold text-t2"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => send(note.trim())}
                disabled={!note.trim()}
                className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-full bg-[#1f7a4d] text-meta font-semibold text-white disabled:opacity-40"
              >
                <Icon name="repost" size={18} weight={2.2} />
                Reshare
              </button>
            </div>
          </>
        ) : (
          <div className="mt-5 space-y-3">
            <button
              type="button"
              onClick={() => setWriting(true)}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full border-2 border-[#1f7a4d] text-body font-semibold text-[#1f7a4d]"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 20h4L19 9l-4-4L4 16z" />
              </svg>
              Reshare with your thoughts
            </button>
            <button
              type="button"
              onClick={() => send('')}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#1f7a4d] text-body font-semibold text-white"
            >
              <Icon name="repost" size={18} weight={2.2} />
              Reshare now
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
