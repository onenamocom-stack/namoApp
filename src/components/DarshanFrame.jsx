import { useEffect, useState } from 'react'
import { fetchDarshanLive } from '../lib/bhakti.js'

/**
 * What stands in the shrine's frame for one murti (20 Oct 2026, Rahul:
 * "either image or video or yt video link in darshan deity. Anyone. And
 * that will show in this frame"): the photo as before, a video on a silent
 * loop, or a temple's YouTube video in YouTube's own player, inside Namo.
 * The bells, diyas, dhoop, flowers and aarti stand in front of any of them.
 *
 * Only YouTube streams that allow playing in other apps get into the
 * console, and nothing here links out to YouTube.
 *
 * A temple's channel with a photo of its murti shows the photo; the live
 * stream plays only when the seeker asks for it (21 Oct 2026, Rahul: "jab
 * live darshan available hai tab live darshan ka ek button ... nahi to baki
 * time us deity ki usi mandir ki photo"), and `watch` says they did. Back to
 * the photo is the same button. Off air it is the photo and nothing else.
 * Since 22 Oct 2026 (Rahul: "jinme direct video aa rahi hai usme deity ki
 * image aani chahiye na pehle") no channel plays by itself, photo or not,
 * and no past recording plays; a channel with no photo is dark until Live.
 *
 * A temple's channel is asked first whether it is live, and again every two
 * minutes while it is not. Until 22 Oct 2026 a channel without a photo
 * played by itself, off air its latest finished stream played as a
 * recording, and the plaque's third line said which and when it was next
 * live; Rahul's process of that day ended all three. `onAir` tells the page:
 * null (not a channel, or not known yet), {live: true}, or
 * {live: false, at: null, startsAt: Date | null};
 * with `playing` (the player is on screen, with its own sound) and `choice`
 * (a temple channel: the page offers the Live button).
 */
const RECHECK_MS = 120000

export default function DarshanFrame({ image, alt, onAir, watch = false }) {
  const [status, setStatus] = useState(null)
  const checks = image.kind === 'youtube' && image.checksLive

  useEffect(() => {
    setStatus(null)
    if (!checks) return undefined
    let stop = false
    let timer
    const ask = () =>
      fetchDarshanLive(image.id)
        .then((s) => {
          if (stop) return
          setStatus(s)
          if (!s.live) timer = setTimeout(ask, RECHECK_MS)
        })
        // The check failing must not hide a stream: play it.
        .catch(() => !stop && setStatus({ live: true, startsAt: null, last: null }))
    ask()
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [checks, image.id])

  const choice = Boolean(checks)
  const playing = image.kind === 'youtube' && (!checks || status?.live) && (!choice || watch)
  const recording = null
  useEffect(() => {
    let air = null
    if (image.kind === 'youtube') {
      if (!checks) air = { live: true }
      else if (status) {
        air = status.live
          ? { live: true }
          : { live: false, at: recording?.at ?? null, startsAt: status.startsAt }
      }
    }
    onAir?.(air && { ...air, playing: Boolean(playing || recording), choice })
  }, [onAir, image.kind, checks, status, playing, recording, choice])

  if (playing) return <Player id={image.id} src={(checks && status?.embedUrl) || image.embedUrl} title={alt} />
  if (recording) return <Player id={`${image.id}-rec`} src={recording.embedUrl} title={alt} />
  if (image.kind === 'youtube') return image.src ? <Photo image={image} alt={alt} /> : null
  if (image.kind === 'video') {
    return (
      <video
        key={image.id}
        src={image.video}
        poster={image.src || undefined}
        aria-label={alt}
        autoPlay
        muted
        loop
        playsInline
        className="animate-fade absolute inset-0 h-full w-full object-contain"
        style={{ objectPosition: '50% 45%' }}
      />
    )
  }
  return <Photo image={image} alt={alt} />
}

function Player({ id, src, title }) {
  return (
    <span className="absolute inset-0 flex items-center justify-center" style={{ paddingBottom: '6%' }}>
      <span className="relative block aspect-video w-full overflow-hidden bg-black shadow-[0_8px_24px_rgba(0,0,0,.55)]">
        <iframe
          key={id}
          src={src}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      </span>
    </span>
  )
}

function Photo({ image, alt }) {
  return (
    <Pic
      key={image.id}
      src={image.src}
      alt={alt}
      className="animate-fade absolute inset-0 h-full w-full object-contain"
      style={{ objectPosition: '50% 45%' }}
    />
  )
}

/* A temple photo in `public/darshan/temples/` has an AVIF beside its WebP,
   about 40 KB to the WebP's 100 (22 Oct 2026, Rahul: "Can we do it 30-50kb").
   The phone takes the AVIF when it can and the WebP when it cannot. */
const AVIF = /\/darshan\/temples\/[^/]+\.webp$/

export function Pic({ src, ...img }) {
  if (!src || !AVIF.test(src)) return <img src={src} {...img} />
  return (
    <picture>
      <source srcSet={src.replace(/\.webp$/, '.avif')} type="image/avif" />
      <img src={src} {...img} />
    </picture>
  )
}
