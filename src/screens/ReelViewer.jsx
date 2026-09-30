import { useNavigate, useParams } from 'react-router-dom'
import ReelFeed from '../components/ReelFeed.jsx'

/**
 * Standalone reel route. Full-bleed: no top bar, because a bar here would eat
 * the top of the video and the only control it carried was Back. That becomes
 * a floating glyph over the media instead, which is where every player in the
 * category puts it.
 *
 * The "3 / 49" position counter in the top right was removed on 30 Sep (owner's
 * call): a reel feed is endless by feel, and a total says the opposite.
 */
export default function ReelViewer() {
  const { id } = useParams()
  const navigate = useNavigate()

  return (
    <div className="relative h-full bg-ink">
      <ReelFeed startId={id} syncUrl />

      <button
        type="button"
        onClick={() => navigate(-1)}
        aria-label="Back"
        className="absolute left-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-transform active:scale-90"
      >
        <span className="text-body leading-none">←</span>
      </button>

      <span className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 text-[11px] font-bold uppercase tracking-[0.12em] text-white/90">
        Reels
      </span>
    </div>
  )
}
