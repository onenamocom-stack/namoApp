import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchFeed } from '../lib/content.js'
import Icon from './Icon.jsx'
import Plate from './Plate.jsx'
import { firstName } from './Primitives.jsx'
import { useStore } from '../store.jsx'

/**
 * Vertical reel player.
 *
 * Full-bleed, one reel per screen, snap-scrolled — the format as it is
 * understood everywhere else. The media fills the frame and everything else
 * floats on top of it: byline and caption bottom-left, actions in a right-hand
 * rail, exactly where a thumb already expects them.
 *
 * An earlier version put the caption and actions in a strip UNDER the plate,
 * on the grounds that text over artwork is hard to read. That is true, and the
 * fix is a scrim rather than a strip: a dark gradient behind the overlay buys
 * the contrast back without costing half the screen.
 */
export default function ReelFeed({ startId, onIndexChange, syncUrl = false }) {
  const navigate = useNavigate()
  const scroller = useRef(null)

  /* Reels are rows since phase 9. The whole list is loaded because the format
     is a vertical scroll THROUGH the list — paging it in would mean deciding
     what happens when the reader outruns the fetch, and there is no volume yet
     that makes that worth solving. */
  const [clips, setClips] = useState([])
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  /* Through a ref, so the fetch does not depend on the callback's identity. A
     caller passing an inline arrow would otherwise refetch on every render, and
     the loop only shows up for whoever adds the second consumer of this
     component. */
  const report = useRef(onIndexChange)
  report.current = onIndexChange

  useEffect(() => {
    let active = true
    fetchFeed({ kinds: ['clip'] })
      .then((rows) => {
        if (!active) return
        setClips(rows)
        report.current?.(0, rows.length)
      })
      .catch((err) => console.error('[reels] load failed:', err.message))
    return () => {
      active = false
    }
  }, [])

  const startIndex = Math.max(
    0,
    clips.findIndex((c) => c.id === startId),
  )

  /* Jump straight to the tapped reel rather than animating past the others.
     This waits on `clips` as well as `startIndex`: the list arrives after the
     first paint, and scrolling to an index of a list that is not there yet
     lands on the first reel every time. */
  useEffect(() => {
    const el = scroller.current
    if (el && startIndex > 0) el.scrollTop = el.clientHeight * startIndex
    if (startIndex > 0) setIndex(startIndex)
  }, [startIndex, clips.length])

  const onScroll = () => {
    const el = scroller.current
    if (!el || !el.clientHeight) return
    const next = Math.round(el.scrollTop / el.clientHeight)
    if (next !== index && clips[next]) {
      setIndex(next)
      report.current?.(next, clips.length)
      if (syncUrl) navigate(`/reels/${clips[next].id}`, { replace: true })
    }
  }

  return (
    <div
      ref={scroller}
      onScroll={onScroll}
      className="no-scrollbar h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain bg-ink"
    >
      {!clips.length && (
        <p className="flex h-full items-center justify-center px-8 text-center text-meta text-white/70">
          No reels yet.
        </p>
      )}
      {clips.map((c, i) => (
        <ReelFrame
          key={c.id}
          reel={c}
          paused={paused}
          onTogglePlay={() => setPaused((p) => !p)}
          isLast={i === clips.length - 1}
        />
      ))}
    </div>
  )
}

/** One action in the right-hand rail: glyph, then its count underneath. */
function RailAct({ icon, label, count, on, tone = 'default', onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on === undefined ? undefined : on}
      className={`flex flex-col items-center gap-1 transition-transform duration-150 active:scale-90 ${
        on && tone === 'like' ? 'text-live' : 'text-white'
      }`}
    >
      <Icon name={icon} size={27} weight={1.8} filled={!!on && tone !== 'plain'} />
      {count != null && <span className="text-[11px] font-semibold tnum">{count}</span>}
    </button>
  )
}

function ReelFrame({ reel: c, paused, onTogglePlay, isLast }) {
  const { showToast, hasFlag, toggleFlag } = useStore()
  const liked = hasFlag(`like:${c.id}`)
  const saved = hasFlag(`save:${c.id}`)
  const following = hasFlag(`follow:${c.consultantId}`)

  return (
    <section className="relative h-full snap-start snap-always overflow-hidden">
      {/* The media, edge to edge. Tapping it toggles playback — the only
          gesture this screen claims beyond the scroll itself. */}
      <button
        type="button"
        onClick={onTogglePlay}
        aria-label={paused ? 'Play' : 'Pause'}
        className="absolute inset-0 h-full w-full"
      >
        {c.mediaUrl ? (
          /* A real upload. Muted and looping because the format autoplays and
             a reel that starts talking at full volume in a quiet room is how
             people close the tab. */
          c.mediaUrl.match(/\.(mp4|webm|mov)$/i) ? (
            <video
              src={c.mediaUrl}
              className="h-full w-full object-cover"
              autoPlay={!paused}
              muted
              loop
              playsInline
            />
          ) : (
            <img src={c.mediaUrl} alt={c.caption ?? ''} className="h-full w-full object-cover" />
          )
        ) : (
          <Plate seed={c.id} className="!rounded-none h-full w-full !shadow-none" />
        )}
      </button>

      {/* Scrims. Two gradients, top and bottom, so white text holds up over
          artwork whose brightness we do not control. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/55 to-transparent"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/80 via-black/45 to-transparent"
      />

      {/* Progress. A hairline across the very top. */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-[2.5px] bg-white/25">
        <span className={`block h-full w-1/3 bg-white ${paused ? '' : 'animate-breathe'}`} />
      </span>

      {paused && (
        <span className="pointer-events-none absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
          <Icon name="live" size={26} weight={2} />
        </span>
      )}

      {/* ── The right rail ─────────────────────────────────────────────── */}
      <div className="absolute bottom-32 right-3 z-10 flex flex-col items-center gap-5">
        <RailAct
          icon="heart"
          label={liked ? 'Liked' : 'Like'}
          tone="like"
          on={liked}
          count={(c.likes + (liked ? 1 : 0)).toLocaleString('en-IN')}
          onClick={() => toggleFlag(`like:${c.id}`)}
        />
        <RailAct
          icon="chat"
          label="Reply"
          tone="plain"
          onClick={() => showToast('Replies — prototype only')}
        />
        <RailAct
          icon="share"
          label="Share"
          tone="plain"
          onClick={() => showToast('Reel link copied')}
        />
        <RailAct
          icon="bookmark"
          label={saved ? 'Saved' : 'Save'}
          on={saved}
          onClick={() =>
            toggleFlag(`save:${c.id}`, {
              on: 'Saved to your reels',
              off: 'Removed from your reels',
            })
          }
        />
      </div>

      {/* ── The overlay strip ──────────────────────────────────────────── */}
      <div className="absolute inset-x-0 bottom-0 z-10 px-4 pb-6 pr-20">
        <div className="flex items-center gap-2.5">
          <Link to={`/consult/${c.consultantId}`} className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white/15 text-[11px] font-bold text-white ring-1 ring-white/40">
              {c.initials}
            </span>
            <span className="truncate text-meta font-semibold text-white">{c.consultant}</span>
          </Link>
          <button
            type="button"
            onClick={() =>
              toggleFlag(`follow:${c.consultantId}`, {
                on: `Following ${firstName(c.consultant)}`,
                off: `Unfollowed ${firstName(c.consultant)}`,
              })
            }
            className={`flex-none rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] transition-colors ${
              following
                ? 'border-white/40 text-white/80'
                : 'border-white bg-white/10 text-white'
            }`}
          >
            {following ? 'Following' : 'Follow'}
          </button>
        </div>

        <p className="mt-3 text-meta leading-snug text-white">{c.caption}</p>
        <p className="mt-1.5 text-[11px] uppercase tracking-[0.08em] text-white/60">{c.time}</p>

        {/* The commercial hook. Small and inline — a full-width block here
            would cover the thing you came to watch. */}
        <div className="mt-3 flex items-center gap-2">
          <Link
            to={`/consult/${c.consultantId}`}
            className="rounded-xl bg-white px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-ink shadow-md transition-transform active:scale-95"
          >
            Book a session
          </Link>
          <span className="text-[10px] uppercase tracking-[0.08em] text-white/45">
            {isLast ? 'Last reel' : 'Swipe up'}
          </span>
        </div>
      </div>
    </section>
  )
}
