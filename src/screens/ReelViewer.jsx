import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ReelFeed from '../components/ReelFeed.jsx'

/**
 * Standalone reel route. Full-bleed: no top bar, because a bar here would eat
 * the top of the video and the only control it carried was Back. That becomes
 * a floating glyph over the media instead, which is where every player in the
 * category puts it.
 */
export default function ReelViewer() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)
  const [total, setTotal] = useState(0)

  /* The counter is told by the feed rather than working it out: since phase 9
     the list is a query, and this screen redirecting on "not found" before the
     rows arrived sent every reel link straight back to /home. ReelFeed shows
     its own empty state if the id resolves to nothing. */
  const onIndexChange = useCallback((next, count) => {
    setIndex(next)
    if (count != null) setTotal(count)
  }, [])

  return (
    <div className="relative h-full bg-ink">
      <ReelFeed startId={id} onIndexChange={onIndexChange} syncUrl />

      <button
        type="button"
        onClick={() => navigate(-1)}
        aria-label="Back"
        className="absolute left-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-transform active:scale-90"
      >
        <span className="text-body leading-none">←</span>
      </button>

      <span className="pointer-events-none absolute right-4 top-5 z-20 text-[10px] font-bold uppercase tracking-[0.1em] text-white/70 tnum">
        {total ? `${index + 1} / ${total}` : ''}
      </span>

      <span className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 text-[11px] font-bold uppercase tracking-[0.12em] text-white/90">
        Reels
      </span>
    </div>
  )
}
