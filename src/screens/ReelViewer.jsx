import { useParams } from 'react-router-dom'
import { BackButton, useGoBack } from '../components/Chrome.jsx'
import ReelFeed from '../components/ReelFeed.jsx'
import { isPro } from '../side.js'
import { useStore } from '../store.jsx'

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
  // A reel opened from a shared link has nothing behind it in the app; Back
  // lands on Home instead of closing the tab (30 Sep 2026).
  const goBack = useGoBack(isPro ? '/pro/studio' : '/home')
  // In the consultant app a reel is opened from Studio or Insights, and the
  // viewer shows only the consultant's own reels (4 Oct 2026).
  const { session } = useStore()
  const authorId = isPro ? session?.user?.id ?? null : null

  return (
    <div className="reel-stage relative h-full bg-ink">
      {(!isPro || authorId) && <ReelFeed startId={id} syncUrl authorId={authorId} />}

      <BackButton dark onClick={goBack} className="absolute left-3 top-3 z-20" />

      <span className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 text-[11px] font-bold uppercase tracking-[0.12em] text-white/90">
        Reels
      </span>
    </div>
  )
}
