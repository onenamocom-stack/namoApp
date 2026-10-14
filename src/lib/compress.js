/**
 * A video made small on the phone, before it uploads (14 Oct 2026, docs/06
 * Phase 15d). Reels were stored as shot: a 100 MB phone video cost 100 MB of
 * the person's data to upload, 100 MB of storage, and 100 MB of bandwidth
 * on every full view. Here it becomes H.264 at most 1280 px on its long
 * side, about 1.2 Mbit/s, with AAC sound — about 9 MB a minute.
 *
 * Done in the browser with WebCodecs (the `mediabunny` library, loaded only
 * when a video is chosen), so no server transcodes anything and the upload
 * itself shrinks. **It never blocks a post:** a phone or browser that
 * cannot encode, a file it cannot read, or a result no smaller than the
 * original, and the original uploads as before (the 100 MB gate stays).
 */

const MAX_SIDE = 1280
const VIDEO_BPS = 1_200_000
const AUDIO_BPS = 96_000
// Small enough already: a short clip is not worth a minute of the phone's time.
const LEAVE_UNDER = 8 * 1024 * 1024

const even = (n) => Math.max(2, Math.round(n / 2) * 2)

/* The longest video anybody posts (14 Oct 2026, Rahul: "like Instagram").
   Reels were 90 s on Instagram for years; it keeps uploads, compression
   and bandwidth short. */
export const MAX_VIDEO_SECONDS = 90

/** A video's length in seconds, read from its metadata; null when the
 *  browser cannot tell. */
export function videoSeconds(file) {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    const url = URL.createObjectURL(file)
    const done = (n) => {
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(n) ? n : null)
    }
    v.preload = 'metadata'
    v.onloadedmetadata = () => done(v.duration)
    v.onerror = () => done(null)
    setTimeout(() => done(null), 8000)
    v.src = url
  })
}

const clock = (s) => {
  const m = Math.floor(s / 60)
  const r = Math.round(s % 60)
  return m ? `${m} min${r ? ` ${r} s` : ''}` : `${r} s`
}

/** Throws the sentence the person reads when a video is too long. */
export async function assertVideoLength(file) {
  if (!file?.type?.startsWith('video/')) return
  const secs = await videoSeconds(file)
  if (secs !== null && secs > MAX_VIDEO_SECONDS + 0.5) {
    throw new Error(`Videos can be up to ${MAX_VIDEO_SECONDS} seconds. This one is ${clock(secs)}.`)
  }
}

/** The file to upload: a smaller MP4, or `file` unchanged. `onProgress`
 *  receives 0 to 1 while it works. */
export async function compressVideo(file, onProgress = null) {
  if (!file?.type?.startsWith('video/') || file.size < LEAVE_UNDER) return file
  if (typeof window === 'undefined' || !('VideoEncoder' in window)) return file
  try {
    const mb = await import('mediabunny')
    if (!(await mb.canEncodeVideo('avc')) || !(await mb.canEncodeAudio('aac'))) return file

    const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(file) })
    const track = await input.getPrimaryVideoTrack()
    if (!track) return file
    const w = track.displayWidth
    const h = track.displayHeight
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h))

    const output = new mb.Output({
      format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: new mb.BufferTarget(),
    })
    const conversion = await mb.Conversion.init({
      input,
      output,
      video: {
        width: even(w * scale),
        height: even(h * scale),
        fit: 'fill',
        codec: 'avc',
        quality: new mb.Quality({ bitrate: VIDEO_BPS }),
        forceTranscode: true,
      },
      audio: { codec: 'aac', quality: new mb.Quality({ bitrate: AUDIO_BPS }) },
    })
    // A track it would have to drop (the sound, say) is a worse post than a
    // bigger file.
    if (!conversion.isValid || conversion.discardedTracks.length) return file
    if (onProgress) conversion.onProgress = (p) => onProgress(Math.max(0, Math.min(1, p)))
    await conversion.execute()

    const buffer = output.target.buffer
    if (!buffer || buffer.byteLength >= file.size * 0.9) return file
    const name = `${(file.name || 'video').replace(/\.[^.]+$/, '')}.mp4`
    return new File([buffer], name, { type: 'video/mp4' })
  } catch (err) {
    console.error('[compress] kept the original:', err?.message)
    return file
  }
}
