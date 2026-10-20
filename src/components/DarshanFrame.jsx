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
 * A temple's channel is asked first whether it is live, and again every two
 * minutes while it is not. Off air, its latest finished stream plays as a
 * recording (Rahul: "jinka nahi h live unka jo last live available h wo
 * dikha de"); with none, the murti's own photo, never another murti's
 * (Rahul: "usi deity ki image ... naki koi aur"). What it is and when the
 * temple is next live go on the plaque's third line (Rahul: "Name plate pe
 * we can have three lines"), so `onAir` tells the page:
 * null (not a channel, or not known yet), {live: true}, or
 * {live: false, at: Date | null (the recording's day), startsAt: Date | null}.
 */
const RECHECK_MS = 120000

export default function DarshanFrame({ image, alt, onAir }) {
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

  const playing = image.kind === 'youtube' && (!checks || status?.live)
  const recording = checks && status && !status.live ? status.last : null
  useEffect(() => {
    let air = null
    if (image.kind === 'youtube') {
      if (!checks) air = { live: true }
      else if (status) {
        air = status.live ? { live: true } : { live: false, at: status.last?.at ?? null, startsAt: status.startsAt }
      }
    }
    onAir?.(air)
  }, [onAir, image.kind, checks, status])

  if (playing) return <Player id={image.id} src={image.embedUrl} title={alt} />
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
    <img
      key={image.id}
      src={image.src}
      alt={alt}
      className="animate-fade absolute inset-0 h-full w-full object-contain"
      style={{ objectPosition: '50% 45%' }}
    />
  )
}

/** The plaque's third line for a temple channel: Live; or what plays and
 *  when the temple is next live — the stream it scheduled on YouTube, else
 *  the console's timings, else "not known" (Rahul: "Last Live ki Recording.
 *  Next Live: Timing. Or agar timing nahi pta to 'Pta nahi'"). */
export function airLine(air, image, lang, t) {
  if (!air) return ''
  if (air.live) return t('puja.live')
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN'
  const what = air.at
    ? t('puja.lastLive', { date: air.at.toLocaleDateString(locale, { day: 'numeric', month: 'short' }) })
    : t('puja.offAir')
  const hours = (lang === 'hi' && image.liveHoursHi) || image.liveHours
  const next = air.startsAt
    ? t('puja.nextLive', { when: when(air.startsAt, locale, t) })
    : hours
      ? t('puja.nextLive', { when: hours })
      : t('puja.nextUnknown')
  return `${what} · ${next}`
}

function when(at, locale, t) {
  const time = at.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(at) - day(new Date())) / 86400000)
  if (days <= 0) return t('puja.today', { time })
  if (days === 1) return t('puja.tomorrow', { time })
  return at.toLocaleString(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}
