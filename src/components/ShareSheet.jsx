import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { fetchDmThreads, sendDm, startDm } from '../lib/dms.js'
import { followList } from '../lib/content.js'
import { searchPeople } from '../lib/people.js'
import { copyLink, fetchStatusFile, fullUrl, onShareRequest, shareMessage, statusFileUrl } from '../lib/share.js'
import { PopAvatar, PopButton } from './Pop.jsx'
import Icon from './Icon.jsx'

const initialsOf = (name = '') =>
  name.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

/**
 * The share sheet, one for the whole app (14 Oct 2026, Rahul): every Share
 * button opens it through `openShare`.
 *
 * Top, people on NAMO — your recent chats, then whom you follow, or a
 * search. Pick one or more and Send: each gets the thing as a message, a
 * card in the chat. Approved Pros are never listed (Rahul: "Pro ko koi msg
 * nahi jayga"); their paid chat is how anybody reaches them. Under the
 * people, WhatsApp, the phone's own share sheet and Copy link.
 *
 * Signed out there is nobody to send to, so Share goes straight to the
 * phone's sheet, as it did before.
 */
export default function ShareSheet() {
  const { session, showToast } = useStore()
  const [item, setItem] = useState(null)
  const [people, setPeople] = useState(null)
  const [q, setQ] = useState('')
  const [found, setFound] = useState(null)
  const [picked, setPicked] = useState([])
  const [sending, setSending] = useState(false)
  const me = session?.user?.id

  useEffect(
    () =>
      onShareRequest(async (next) => {
        if (!me) {
          const said = await next.external()
          if (said) showToast(said)
          return
        }
        setItem(next)
        setQ('')
        setFound(null)
        setPicked([])
      }),
    [me, showToast],
  )

  /* Recent chats first, then whom you follow; asked for each time the sheet
     opens, so a new chat is in it. */
  useEffect(() => {
    if (!item) return undefined
    let live = true
    setPeople(null)
    Promise.all([
      fetchDmThreads('inbox').then((r) => (r?.items ?? []).map((c) => c.with)).catch(() => []),
      followList('following').catch(() => []),
    ]).then(([chats, follows]) => {
      if (live) setPeople(sendable([...chats, ...follows], me))
    })
    return () => {
      live = false
    }
  }, [item, me])

  useEffect(() => {
    if (q.trim().replace(/^@/, '').length < 2) {
      setFound(null)
      return undefined
    }
    let live = true
    const timer = setTimeout(() => {
      searchPeople(q).then((rows) => live && setFound(sendable(rows, me)))
    }, 250)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [q, me])

  /* WhatsApp Status (24 Oct 2026, Rahul): the reel's video (or the picture)
     as a file. Fetched as the sheet opens, because the phone's share sheet
     only opens straight after a tap, not after a download. */
  const [statusFile, setStatusFile] = useState(null) // null · 'loading' · File · 'no-file' · 'no-share'
  useEffect(() => {
    if (!item || !statusFileUrl(item.media)) {
      setStatusFile(null)
      return undefined
    }
    let live = true
    setStatusFile('loading')
    fetchStatusFile(item.media).then((file) => {
      if (!live) return
      // Which way it failed, said on a tap rather than hiding the button.
      if (!file) setStatusFile('no-file')
      else if (!navigator.canShare?.({ files: [file] })) setStatusFile('no-share')
      else setStatusFile(file)
    })
    return () => {
      live = false
    }
  }, [item])

  const shown = found ?? people
  /* Somebody picked from a search stays picked when the search changes. */
  const [names, setNames] = useState({})
  const pickedPeople = useMemo(() => picked.map((id) => names[id]).filter(Boolean), [picked, names])

  if (!item) return null

  const close = () => setItem(null)
  const toggle = (p) => {
    setNames((n) => ({ ...n, [p.id]: p }))
    setPicked((ids) => (ids.includes(p.id) ? ids.filter((i) => i !== p.id) : [...ids, p.id]))
  }

  const send = async () => {
    if (!picked.length || sending) return
    setSending(true)
    const body = shareMessage(item)
    const failed = []
    for (const p of pickedPeople) {
      try {
        const thread = await startDm(p.id)
        await sendDm(thread.id, body)
      } catch (err) {
        failed.push(`${p.name}: ${err.message}`)
      }
    }
    setSending(false)
    if (failed.length === pickedPeople.length) {
      showToast(failed[0])
      return
    }
    close()
    showToast(failed.length ? `Sent. Not to ${failed[0]}` : 'Sent')
  }

  const outside = async (run) => {
    close()
    const said = await run()
    if (said) showToast(said)
  }
  const toStatus = async () => {
    if (statusFile === 'no-file') return showToast('Could not get this video for a status. Try again in a minute.')
    if (statusFile === 'no-share') return showToast('This phone cannot send a video to WhatsApp from the app.')
    if (!(statusFile instanceof File)) return // still getting it
    close()
    try {
      // The link rides as the status's text (24 Oct 2026, Rahul: "link to
      // will be in status text"), so a viewer outside NAMO can find it.
      // Copied too: WhatsApp sometimes drops a file's text, and then it pastes.
      const text = [item.title, fullUrl(item.path)].filter(Boolean).join('\n')
      navigator.clipboard?.writeText(text).catch(() => {})
      await navigator.share({ files: [statusFile], text })
    } catch (err) {
      if (err?.name !== 'AbortError') showToast('This phone cannot send the video to WhatsApp from here.')
    }
  }
  const whatsapp = () => {
    const text = [item.title, fullUrl(item.path)].filter(Boolean).join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
    close()
  }

  /* Its own panel, not the shared `Sheet` (14 Oct 2026, Rahul: "thoda
     modern"): a handle and nothing else on top, a round search, big faces,
     and the way out of NAMO in round buttons along the foot. */
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <button type="button" aria-label="Close" onClick={close} className="absolute inset-0 animate-fade bg-ink opacity-40" />
      <div className="relative flex max-h-[82%] animate-sheet-in flex-col rounded-t-[28px] bg-white shadow-xl">
        <span className="mx-auto mt-3 block h-1 w-10 flex-none rounded-full bg-black/15" aria-hidden="true" />

        <label className="mx-5 mt-4 flex h-11 flex-none items-center gap-2.5 rounded-full bg-ink/[0.05] px-4">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="flex-none t-faint">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            aria-label="Search people"
            className="min-w-0 flex-1 bg-transparent text-body text-t1 outline-none placeholder:text-t4"
          />
          {q && (
            <button type="button" aria-label="Clear search" onClick={() => setQ('')} className="flex-none t-faint">
              <Icon name="close" size={16} />
            </button>
          )}
        </label>

        <div className="no-scrollbar min-h-[160px] flex-1 overflow-y-auto px-4 pb-4 pt-5">
          {shown === null ? (
            <p className="py-10 text-center text-meta t-faint">Loading</p>
          ) : shown.length === 0 ? (
            <p className="px-6 py-10 text-center text-meta t-faint">
              {found ? 'Nobody by that name.' : 'Follow people or chat with them, and they show here. Or search.'}
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-x-2 gap-y-5">
              {shown.slice(0, 30).map((p) => {
                const on = picked.includes(p.id)
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => toggle(p)}
                      aria-pressed={on}
                      className="flex w-full flex-col items-center gap-2 transition-transform active:scale-95"
                    >
                      <span className={`relative flex rounded-full p-[3px] transition-shadow ${on ? 'ring-2 ring-gold' : ''}`}>
                        <PopAvatar initials={initialsOf(p.name)} src={p.avatar_url} size={70} />
                        {on && (
                          <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-gold-fill text-white">
                            <Icon name="check" size={13} weight={2.6} />
                          </span>
                        )}
                      </span>
                      <span className={`line-clamp-2 px-1 text-center text-meta leading-tight ${on ? 'font-semibold t-heading' : 't-sub'}`}>{p.name}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="flex-none border-t border-rule bg-white px-5 pb-6 pt-4">
          {picked.length > 0 ? (
            <PopButton variant="gold" onClick={send} disabled={sending}>
              {sending ? 'Sending' : 'Send'}
            </PopButton>
          ) : (
            <div className="flex justify-around">
              <Outside label="WhatsApp" onClick={whatsapp} green>
                <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
                  <path d="M12 2.2a9.7 9.7 0 0 0-8.4 14.6L2.2 21.8l5.1-1.3A9.7 9.7 0 1 0 12 2.2Zm0 17.7a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 19.9Zm4.4-6c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8 1c-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-3.2-2.8c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 5 5 0 0 0 1 2.6 11.3 11.3 0 0 0 4.3 3.8c1.6.7 2.2.7 3 .6.5-.1 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1l-.4-.2Z" />
                </svg>
              </Outside>
              {/* Dim until the file is in hand; a tap on a dim one says why. */}
              {statusFile && (
                <Outside
                  label={statusFile === 'loading' ? 'Getting it' : 'Status'}
                  onClick={toStatus}
                  green
                  dim={!(statusFile instanceof File)}
                >
                  {/* WhatsApp's mark in a dashed ring: its status. */}
                  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <circle cx="12" cy="12" r="9.5" strokeDasharray="4.2 2.2" />
                    <path d="M9.5 8.8v6.4l5.4-3.2z" fill="currentColor" stroke="none" />
                  </svg>
                </Outside>
              )}
              <Outside label="Share" onClick={() => outside(item.external)}>
                <Icon name="share" size={22} />
              </Outside>
              <Outside label="Copy link" onClick={() => outside(() => copyLink(item.path))}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
                  <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
                </svg>
              </Outside>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* WhatsApp's button is the app's green (Rahul); the others plain. */
function Outside({ label, onClick, green = false, dim = false, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 transition-transform active:scale-95 ${dim ? 'opacity-50' : ''}`}
    >
      <span
        className={`flex h-14 w-14 items-center justify-center rounded-full ${
          green ? 'pop-btn-gold border-0' : 'bg-ink/[0.06] t-heading'
        }`}
      >
        {children}
      </span>
      <span className="text-meta t-sub">{label}</span>
    </button>
  )
}

/* People a share can go to: once each, never you, never an approved Pro.
   A row without the flag (an API from before it) is let through; the
   server still refuses a Pro who does not follow you. */
function sendable(rows, me) {
  const seen = new Set()
  return rows.filter((p) => {
    if (!p?.id || p.id === me || p.is_consultant || seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })
}
