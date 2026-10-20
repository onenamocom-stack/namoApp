import { useEffect, useState } from 'react'
import { fetchDarshanLive } from '../lib/bhakti.js'
import { useStore } from '../store.jsx'

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
 * A temple's channel is asked first whether it is live (Rahul: "agar live
 * available nahi h to time kab live hoga. Ye likh do"). Off air, the frame
 * shows the photo and when the temple goes live instead of YouTube's own
 * error, and asks again every two minutes. `onAir(bool)` tells the page.
 * Off air, a channel shows only its own photo, never another murti's
 * (Rahul: "usi deity ki image ... naki koi aur"); without one the frame
 * stays dark behind the timings.
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
        .catch(() => !stop && setStatus({ live: true, startsAt: null }))
    ask()
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [checks, image.id])

  const playing = image.kind === 'youtube' && (!checks || status?.live)
  useEffect(() => {
    onAir?.(image.kind === 'youtube' ? (checks ? (status ? status.live : null) : true) : null)
  }, [onAir, image.kind, checks, status])

  if (playing) {
    return (
      <span className="absolute inset-0 flex items-center justify-center" style={{ paddingBottom: '6%' }}>
        <span className="relative block aspect-video w-full overflow-hidden bg-black shadow-[0_8px_24px_rgba(0,0,0,.55)]">
          <iframe
            key={image.id}
            src={image.embedUrl}
            title={alt}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        </span>
      </span>
    )
  }
  if (image.kind === 'youtube') {
    return (
      <>
        {image.src && <Photo image={image} alt={alt} />}
        {status && <OffAir image={image} startsAt={status.startsAt} />}
      </>
    )
  }
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

/** The temple is off air: when it is next live — the stream it scheduled on
 *  YouTube first, else the timings the console wrote. */
function OffAir({ image, startsAt }) {
  const { lang, t } = useStore()
  const hours = (lang === 'hi' && image.liveHoursHi) || image.liveHours
  return (
    <span className="absolute inset-x-0 top-[34%] flex justify-center px-6">
      <span className="animate-fade max-w-[260px] rounded-2xl bg-[rgba(22,14,8,.82)] px-4 py-3 text-center shadow-[0_6px_18px_rgba(0,0,0,.45)] ring-1 ring-[rgba(214,172,74,.6)]">
        <span className="block text-[13px] font-semibold text-[#fff6e3]">{t('puja.offAir')}</span>
        {startsAt && <span className="mt-1 block text-[12px] text-[#e9d6a8]">{when(startsAt, lang, t)}</span>}
        {hours && <span className="mt-1 block text-[12px] text-[#e9d6a8]">{hours}</span>}
      </span>
    </span>
  )
}

function when(at, lang, t) {
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN'
  const time = at.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(at) - day(new Date())) / 86400000)
  if (days <= 0) return t('puja.liveToday', { time })
  if (days === 1) return t('puja.liveTomorrow', { time })
  return t('puja.liveOn', { date: at.toLocaleString(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) })
}
