import { useEffect, useRef } from 'react'
import { qualifyView } from '../lib/content.js'

const SECONDS = 30

/**
 * A reel that has actually played 30 seconds is a qualified view (16 Oct
 * 2026, Rahul). Playback time, not time on screen: a paused reel earns
 * nothing. The reels loop, so a jump backwards is the loop starting over
 * and a jump of more than a second and a half is a seek; neither adds.
 * Claimed once per mount; the server counts a person once a day.
 *
 * `ready` re-attaches when the element mounts late (the feed mounts a
 * reel's <video> only near the screen).
 */
export default function useWatchQualify(video, contentId, ready = true) {
  const played = useRef(0)
  const claimed = useRef(false)

  useEffect(() => {
    const v = video.current
    if (!v || !ready || claimed.current) return undefined
    let last = v.currentTime
    const tick = () => {
      const step = v.currentTime - last
      last = v.currentTime
      if (step > 0 && step < 1.5) played.current += step
      if (!claimed.current && played.current >= SECONDS) {
        claimed.current = true
        qualifyView(contentId, 'watch')
      }
    }
    v.addEventListener('timeupdate', tick)
    return () => v.removeEventListener('timeupdate', tick)
  }, [video, contentId, ready])
}
