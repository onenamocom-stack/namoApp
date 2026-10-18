import { forwardRef, useImperativeHandle, useRef } from 'react'
import { isHls, posterOf, useHls } from '../lib/hls.js'

/**
 * A reel's <video>, MP4 or HLS (lib/hls.js, 18 Oct 2026). An MP4 opens at
 * `frameAt` seconds so its own frame is the cover; an HLS reel shows the
 * worker's thumbnail until it plays. `load` is 'none', 'preload' or
 * 'play' for HLS; an MP4 maps it onto `preload`.
 */
const Video = forwardRef(function Video({ src, load = 'play', frameAt = 0.5, ...rest }, ref) {
  const el = useRef(null)
  useImperativeHandle(ref, () => el.current)
  const hls = isHls(src)
  useHls(el, hls ? src : null, load)
  if (hls) return <video ref={el} poster={posterOf(src)} preload="none" {...rest} />
  const preload = load === 'play' ? 'auto' : load === 'preload' ? 'metadata' : 'none'
  return <video ref={el} src={frameAt ? `${src}#t=${frameAt}` : src} preload={preload} {...rest} />
})

export default Video
