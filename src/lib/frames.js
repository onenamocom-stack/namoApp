/**
 * Festival frames for a photo post (14 Oct 2026, docs/06 Phase 15c).
 *
 * A frame is a 1080 x 1350 PNG with a see-through middle. The ones live
 * today are offered under a chosen photo: the console's first
 * (`appearance` frames), then the app's own below, each in its window.
 * Choosing one draws the photo, cut to 4:5, under the frame and posts the
 * result; "No frame" posts the photo as it was.
 *
 * The built-in art is drawn by tools/festival-frames.py and
 * festival-frames-text.mjs into public/frames/.
 */
import { useAppearance } from './appearance.js'

const IST = '+05:30'
// Windows are IST days, start inclusive, end exclusive. Dates are the 2026
// festivals: Sharad Navratri from 11 Oct, Dussehra 20 Oct, Diwali 8 Nov
// (Dhanteras 6 Nov to Bhai Dooj 10 Nov).
export const BUILT_IN_FRAMES = [
  { id: 'navratri', name: 'Shubh Navratri', image_url: '/frames/navratri.png', from: `2026-10-10T00:00:00${IST}`, until: `2026-10-20T00:00:00${IST}` },
  { id: 'dussehra', name: 'Happy Dussehra', image_url: '/frames/dussehra.png', from: `2026-10-20T00:00:00${IST}`, until: `2026-10-22T00:00:00${IST}` },
  { id: 'diwali', name: 'Shubh Deepawali', image_url: '/frames/diwali.png', from: `2026-11-06T00:00:00${IST}`, until: `2026-11-11T00:00:00${IST}` },
]

const W = 1080
const H = 1350

/** The frames live now: the console's, then the built-in ones in window. */
export function useFrames(now = Date.now()) {
  const data = useAppearance()
  const remote = (data?.frames ?? []).map((f) => ({ ...f, remote: true }))
  const own = BUILT_IN_FRAMES.filter((f) => Date.parse(f.from) <= now && now < Date.parse(f.until))
  return [...remote, ...own]
}

function load(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    // Before src: the console's frames live on R2, and a canvas drawn with
    // an image that is not CORS-clean cannot be exported.
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load that frame.'))
    img.src = src
  })
}

/** The photo, cut to 4:5 and centred, under the frame: a new JPEG file. */
export async function frameFile(photo, frameSrc) {
  const url = URL.createObjectURL(photo)
  try {
    const [pic, frame] = await Promise.all([load(url), load(frameSrc)])
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    const scale = Math.max(W / pic.naturalWidth, H / pic.naturalHeight)
    const w = pic.naturalWidth * scale
    const h = pic.naturalHeight * scale
    ctx.drawImage(pic, (W - w) / 2, (H - h) / 2, w, h)
    ctx.drawImage(frame, 0, 0, W, H)
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9))
    if (!blob) throw new Error('Could not make the framed photo.')
    const base = (photo.name || 'photo').replace(/\.[^.]+$/, '')
    return new File([blob], `${base}-framed.jpg`, { type: 'image/jpeg' })
  } finally {
    URL.revokeObjectURL(url)
  }
}
