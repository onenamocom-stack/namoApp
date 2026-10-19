import { useEffect, useMemo, useRef, useState } from 'react'
import { MAX_VIDEO_SECONDS } from '../lib/compress.js'
import { PopButton } from './Pop.jsx'

/**
 * Cut a long video down before it posts (19 Oct 2026, Rahul: "If video is
 * long can we allow to cut it"). A video over 90 seconds opens this instead
 * of a refusal. The whole video plays with its own controls and the time it
 * is at; *Start here* and *End here* take that moment, the sliders fine-tune
 * it, and a bar shows the chosen part against the whole (same day, Rahul:
 * "pta nahi chal raha kitni second pe chal rahi h"). *Play the part* loops
 * just the part. At most 90 seconds. The cut itself happens on the phone
 * while the video is made smaller (compress.js), so only that part uploads.
 */
const clock = (s) => {
  const t = Math.max(0, Math.floor(s))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

export default function VideoTrim({ file, seconds, onCancel, onCut }) {
  const url = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(Math.min(seconds, MAX_VIDEO_SECONDS))
  const [now, setNow] = useState(0)
  const [looping, setLooping] = useState(false)
  const video = useRef(null)

  useEffect(() => {
    const v = video.current
    if (!v) return
    const tick = () => {
      setNow(v.currentTime)
      if (looping && (v.currentTime < start - 0.3 || v.currentTime >= end)) v.currentTime = start
    }
    // Dragging the video's own bar outside the part stops the loop.
    const away = () => {
      if (looping && (v.currentTime < start - 0.3 || v.currentTime > end + 0.3)) setLooping(false)
    }
    v.addEventListener('timeupdate', tick)
    v.addEventListener('seeked', tick)
    v.addEventListener('seeking', away)
    return () => {
      v.removeEventListener('timeupdate', tick)
      v.removeEventListener('seeked', tick)
      v.removeEventListener('seeking', away)
    }
  }, [start, end, looping])

  function seek(t) {
    if (video.current) video.current.currentTime = t
    setNow(t)
  }

  // The part keeps within 90 s and at least a second: moving one end drags
  // the other along when it has to.
  function moveStart(next) {
    const s = Math.max(0, Math.min(next, seconds - 1))
    setStart(s)
    setEnd((e) => Math.min(seconds, Math.max(s + 1, Math.min(e, s + MAX_VIDEO_SECONDS))))
    setLooping(false)
    seek(s)
  }

  function moveEnd(next) {
    const e = Math.min(seconds, Math.max(next, 1))
    setEnd(e)
    setStart((s) => Math.max(0, Math.min(s, e - 1), e - MAX_VIDEO_SECONDS))
    setLooping(false)
    seek(Math.max(0, e - 2))
  }

  function playPart() {
    setLooping(true)
    seek(start)
    video.current?.play().catch(() => {})
  }

  const pct = (t) => `${(t / seconds) * 100}%`
  return (
    <div role="dialog" aria-modal="true" aria-label="Cut the video" className="fixed inset-0 z-[60] flex justify-center bg-black/60">
      <div className="no-scrollbar flex h-full w-full max-w-[420px] flex-col overflow-y-auto bg-white">
        <div className="flex items-center justify-between border-b border-rule px-4 py-3">
          <button type="button" onClick={onCancel} className="caps-sm t-sub">Cancel</button>
          <span className="text-meta t-heading">Cut the video</span>
          <span className="w-12" />
        </div>
        <p className="px-5 pt-4 text-micro t-sub">
          This video is {clock(seconds)}. Videos can be up to {MAX_VIDEO_SECONDS} seconds: choose the part to post.
        </p>

        <div className="relative mx-5 mt-4">
          <video
            ref={video}
            src={url}
            className="max-h-[45vh] w-full rounded-lg bg-black object-contain"
            playsInline
            controls
            preload="metadata"
            onPlay={() => { if (looping && (now < start || now >= end)) seek(start) }}
          />
          <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-micro font-semibold text-white tnum">
            {clock(now)} / {clock(seconds)}
          </span>
        </div>

        {/* The whole video: the chosen part in saffron, where it is now as a line. */}
        <div className="relative mx-5 mt-4 h-3 rounded-full bg-surface-2" aria-hidden="true">
          <span className="absolute inset-y-0 rounded-full bg-[#f26a1b]/70" style={{ left: pct(start), width: pct(end - start) }} />
          <span className="absolute -inset-y-1 w-0.5 bg-t1" style={{ left: pct(now) }} />
        </div>
        <div className="mx-5 mt-1 flex justify-between text-micro t-faint tnum">
          <span>0:00</span>
          <span>{clock(seconds)}</span>
        </div>

        <div className="mx-5 mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => moveStart(now)} className="rounded-lg border border-stroke px-3 py-2.5 text-meta t-body">
            Start here · <span className="tnum">{clock(now)}</span>
          </button>
          <button type="button" onClick={() => moveEnd(now)} className="rounded-lg border border-stroke px-3 py-2.5 text-meta t-body">
            End here · <span className="tnum">{clock(now)}</span>
          </button>
        </div>

        <div className="space-y-4 px-5 pt-5">
          <label className="block">
            <span className="flex justify-between caps-sm t-faint">
              <span>Starts at</span>
              <span className="tnum">{clock(start)}</span>
            </span>
            <input type="range" min={0} max={Math.max(0, seconds - 1)} step={0.5} value={start}
              onChange={(e) => moveStart(Number(e.target.value))} className="mt-2 w-full accent-[#f26a1b]" />
          </label>
          <label className="block">
            <span className="flex justify-between caps-sm t-faint">
              <span>Ends at</span>
              <span className="tnum">{clock(end)}</span>
            </span>
            <input type="range" min={1} max={seconds} step={0.5} value={end}
              onChange={(e) => moveEnd(Number(e.target.value))} className="mt-2 w-full accent-[#f26a1b]" />
          </label>
          <div className="flex items-center justify-between">
            <p className="text-meta t-body tnum">Posting {clock(start)} to {clock(end)} · {clock(end - start)}</p>
            <button type="button" onClick={playPart} className="caps-sm gold">Play the part</button>
          </div>
        </div>

        <div className="mt-auto px-5 py-5">
          <PopButton variant="gold" className="w-full" onClick={() => onCut({ start, end })}>
            Use this part
          </PopButton>
        </div>
      </div>
    </div>
  )
}
