import { supabase } from './supabase.js'
import { assertVideoLength, compressVideo, MAX_COMPRESSED_BYTES, videoSeconds } from './compress.js'

/**
 * A reel's upload through the video pipeline (18 Oct 2026, Rahul's spec;
 * the API is `/v1/videos/`, docs/02). The same steps the Android app takes:
 *
 *   1. compress on the phone (lib/compress.js, part B)
 *   2. POST /videos/init/  the SHA-256, size and length -> the row and a
 *                          presigned URL per 5 MB part. A file already on
 *                          Namo links to it and uploads nothing.
 *   3. PUT each part straight to R2, three tries each; URLs that ran out
 *      are asked for again (GET /videos/<id>/parts/)
 *   4. POST /videos/<id>/complete/  -> the worker encodes it to HLS and
 *                          SafeSearch looks at it
 *
 * The post is published with the video's id and waits, hidden, until the
 * video is live (content.video_settled on the server).
 */

const API_BASE = import.meta.env.VITE_DJANGO_API_URL

async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

async function call(path, token, { method = 'GET', body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const err = new Error(data?.message || `Request failed (${response.status})`)
    err.status = response.status
    throw err
  }
  return data
}

async function sha256(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function putPart(url, blob) {
  let last = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const put = await fetch(url, { method: 'PUT', body: blob })
      if (put.ok) return put.headers.get('ETag') || ''
      last = put.status
      // An expired URL does not get better by trying it again.
      if (put.status === 403) break
    } catch {
      last = 'network'
    }
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
  }
  const err = new Error('Upload failed. Check your connection and post it again.')
  err.status = last
  throw err
}

/**
 * Upload a video for a reel. Returns {id, status, file}, or null when this API
 * is not there (an older server): the caller then uploads the old way.
 * `onShrink` and `onSend` receive 0 to 1.
 */
export async function uploadVideo(original, { onShrink = null, onSend = null, trim = null } = {}) {
  const token = await accessToken()
  if (!token) throw new Error('Sign in to upload')
  // 90 seconds at most (14 Oct 2026, Rahul); a longer one comes cut (`trim`).
  if (!trim) await assertVideoLength(original)
  const file = await compressVideo(original, onShrink, trim)
  const seconds = (await videoSeconds(file)) ?? (await videoSeconds(original))
  // A length the browser cannot read: the old path, which does not need it.
  if (!seconds) return null

  let row
  try {
    row = await call('/videos/init/', token, {
      method: 'POST',
      body: {
        sha256: await sha256(file),
        size_bytes: file.size,
        duration_s: Math.round(seconds * 100) / 100,
        mime: file.type || 'video/mp4',
        // Not compressed here and over the cap: the worker compresses it.
        original: file === original && file.size > MAX_COMPRESSED_BYTES,
      },
    })
  } catch (err) {
    if (err.status === 404) return null
    throw err
  }

  const step = row.part_bytes
  let urls = row.urls
  let sent = 0
  const total = urls.length
  const etags = []
  for (let round = 0; urls.length && round < 2; round += 1) {
    const left = []
    for (const { part_number: n, url } of urls) {
      try {
        etags.push({ part_number: n, etag: await putPart(url, file.slice((n - 1) * step, n * step)) })
        sent += 1
        onSend?.(sent / total)
      } catch (err) {
        if (err.status !== 403) throw err
        left.push(n)
      }
    }
    if (!left.length) break
    // The URLs ran out (15 minutes): fresh ones for what is missing.
    urls = (await call(`/videos/${row.id}/parts/`, token)).urls
  }

  const done = await call(`/videos/${row.id}/complete/`, token, { method: 'POST', body: { parts: etags } })
  // `file` is what went up: the cut, smaller copy, for the composer's preview.
  return { id: done.id, status: done.status, file }
}
