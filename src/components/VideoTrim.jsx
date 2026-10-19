import { useEffect, useMemo, useRef, useState } from 'react'
import { MAX_VIDEO_SECONDS } from '../lib/compress.js'
import { PopButton } from './Pop.jsx'

/**
 * Cut a long video down before it posts (19 Oct 2026, Rahul: "If video is
 * long can we allow to cut it"). A video over 90 seconds opens this instead
 * of a refusal: it plays the chosen stretch on a loop, two sliders set where
 * it starts and ends, and the stretch is at most 90 seconds. The cut itself
 * happens on the phone while the video is made smaller (compress.js), so
 * only the kept part ever uploads.
 */
const clock = (s) => {
  const t = Math.max(0, Math.round(s))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

export default function VideoTrim({ file, seconds, onCancel, onCut }) {
  const url = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(Math.min(seconds, MAX_VIDEO_SECONDS))
  const video = useRef(null)

  // Loop the chosen stretch, so what plays is what posts.
  useEffect(() => {
    const v = video.current
    if (!v) return
    const keep = () => {
      if (v.currentTime < start - 0.3 || v.currentTime >= end) v.currentTime = start
    }
    v.addEventListener('timeupdate', keep)
    return () => v.removeEventListener('timeupdate', keep)
  }, [start, end])

  function moveStart(next) {
    const s = Math.min(next, seconds - 1)
    setStart(s)
    // The stretch keeps its length where it can, and never passes 90 s.
    setEnd((e) => Math.min(seconds, Math.max(s + 1, Math.min(e, s + MAX_VIDEO_SECONDS))))
    if (video.current) video.current.currentTime = s
  }

  function moveEnd(next) {
    const e = Math.max(next, 1)
    setEnd(e)
    setStart((s) => Math.max(0, Math.min(s, e - 1), e - MAX_VIDEO_SECONDS))
    if (video.current) video.current.currentTime = Math.max(0, e - 2)
  }

  const length = end - start
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
        <video
          ref={video}
          src={url}
          className="mx-5 mt-4 max-h-[50vh] rounded-lg bg-black object-contain"
          playsInline
          autoPlay
          muted
          controls={false}
          onLoadedMetadata={(e) => { e.currentTarget.currentTime = start }}
        />
        <div className="space-y-5 px-5 pt-5">
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
          <p className="text-meta t-body tnum">Posting {clock(length)} of {clock(seconds)}</p>
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
