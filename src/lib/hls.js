import { useEffect, useRef } from 'react'

/**
 * Reels as HLS (part F of Rahul's video spec, 18 Oct 2026). A reel from
 * the video pipeline is `v/<id>/master.m3u8` on media.1namo.com, with 480p
 * and 720p versions and `thumb.webp` beside it; older reels are one MP4 and
 * play as before.
 *
 *   - the thumbnail shows first (the poster), so nothing waits on video
 *   - playback starts at 480p; 720p only on Wi-Fi or a strong connection,
 *     never with Data saver on
 *   - a reel near the screen loads only its first segment (about four
 *     seconds); the one on screen buffers normally
 *
 * hls.js plays it where the browser has Media Source (Chrome, the Android
 * WebView); Safari plays the playlist itself. hls.js (its light build: no
 * subtitles, DRM or second audio, none of which a reel has) is loaded only when an
 * HLS reel is first shown.
 */

const HLS = /\.m3u8(\?|#|$)/i
const MP4 = /\.(mp4|webm|mov|m4v)(\?|#|$)/i

export const isHls = (url) => HLS.test(url || '')
/** A video either way: an MP4 reel or an HLS one. */
export const isVideoUrl = (url) => MP4.test(url || '') || isHls(url)
/** The worker's thumbnail beside an HLS playlist; null for anything else. */
export const posterOf = (url) => (isHls(url) ? url.replace(/master\.m3u8.*$/i, 'thumb.webp') : null)

const SAVER_KEY = 'namo:data-saver'

/** Data saver (Profile, Preferences): 480p always, nothing loaded ahead. */
export function dataSaver() {
  try {
    return localStorage.getItem(SAVER_KEY) === '1'
  } catch {
    return false
  }
}

export function setDataSaver(on) {
  try {
    if (on) localStorage.setItem(SAVER_KEY, '1')
    else localStorage.removeItem(SAVER_KEY)
  } catch {
    /* the setting lasts this visit only */
  }
}

/** Wi-Fi, or a strong 4G connection, and Data saver off: 720p allowed. */
function fast() {
  if (dataSaver()) return false
  const c = typeof navigator !== 'undefined' ? navigator.connection : null
  if (!c) return true // the browser does not say (Safari): let the player judge
  if (c.saveData) return false
  if (c.type === 'wifi' || c.type === 'ethernet') return true
  return c.effectiveType === '4g' && (c.downlink ?? 0) >= 5
}

// Seconds buffered ahead: one segment for a reel waiting, normal for the
// one playing. hls.js buffers up to the cap whatever the target (its
// byte budget wins), so the cap moves with it: with only the target, a
// waiting reel loaded all of itself (checked in Chrome, 18 Oct 2026).
const AHEAD = { preload: 4, play: 30 }
const CAP = { preload: 4, play: 60 }

/**
 * Attach an HLS playlist to a <video>. `load` is 'none' (the poster only),
 * 'preload' (the first segment) or 'play' (buffer as it plays).
 */
export function useHls(ref, src, load = 'play') {
  const player = useRef(null)
  const off = !src || load === 'none'

  useEffect(() => {
    const video = ref.current
    if (!video || off) return undefined
    let gone = false
    import('hls.js/light').then(({ default: Hls }) => {
      if (gone) return
      if (!Hls.isSupported()) {
        // Safari and iOS play HLS themselves.
        if (video.canPlayType('application/vnd.apple.mpegurl')) video.src = src
        return
      }
      const hls = new Hls({
        startLevel: 0, // 480p first
        capLevelToPlayerSize: true,
        maxBufferLength: AHEAD[load] ?? AHEAD.play,
        maxMaxBufferLength: CAP[load] ?? CAP.play,
        backBufferLength: 30,
      })
      if (!fast()) hls.autoLevelCapping = 0
      hls.loadSource(src)
      hls.attachMedia(video)
      player.current = hls
    }).catch(() => {})
    return () => {
      gone = true
      player.current?.destroy()
      player.current = null
    }
  }, [ref, src, off]) // eslint-disable-line react-hooks/exhaustive-deps -- `load` only moves the buffer, below

  useEffect(() => {
    const hls = player.current
    if (!hls || !AHEAD[load]) return
    hls.config.maxBufferLength = AHEAD[load]
    hls.config.maxMaxBufferLength = CAP[load]
  }, [load])
}
