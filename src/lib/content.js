/**
 * CUTOVER — module 5 (content): replace src/lib/content.js with this file,
 * set VITE_DJANGO_API_URL, deploy API then client.
 *
 * A drop-in rewrite of src/lib/content.js with the identical exported
 * surface and semantics — ago, fetchFeed, fetchByAuthor, publish,
 * uploadMedia, remove, fetchReviews, leaveReview, reviewableBookings,
 * followCounts, followerCount, fetchAuthor — against the Django API instead
 * of Supabase PostgREST:
 *
 *   GET  {API}/content/feed/                 -> the feed (content_public)
 *   GET  {API}/content/by-author/            -> one author's published work
 *   GET  {API}/content/<id>/                 -> one live post
 *   POST {API}/content/publish/              -> publish (author from the JWT)
 *   POST {API}/content/<id>/publish/         -> draft -> live
 *   POST {API}/content/<id>/remove/          -> soft delete (owner-scoped)
 *   GET  {API}/content/reviews/              -> reviews_public
 *   POST {API}/content/reviews/              -> the anti-fraud gate
 *   GET  {API}/content/reviews/reviewable/   -> completed, unreviewed bookings
 *   GET  {API}/content/follow-counts/        -> profile_follow_counts
 *   GET  {API}/content/authors/<id>/         -> authors_public
 *   POST {API}/media/presign/ + PUT + confirm-> uploads (see uploadMedia)
 *
 * Auth is unchanged: the JWT is still Supabase-issued, read off the existing
 * supabase-js session. Identity stays in Supabase Auth (docs/07 §1).
 *
 * Behaviour parity notes:
 *   - The feed rows keep the exact shape shape() builds (id, authorId,
 *     isConsultant, consultantId, consultant, initials, kind, title, body,
 *     caption, mediaUrl, views, likes, saves, publishedAt, time) — the
 *     server returns the content_public columns and this file keeps doing
 *     the rendering derivations, exactly as before.
 *   - publish() never sent author_id as a claim — RLS checked it against
 *     auth.uid(). The API forces the author from the JWT, so the spoof
 *     surface simply does not exist. The kind gate (seekers get post and
 *     article, reels are the approved consultant's) is enforced server-side;
 *     the 403 carries the same sentence the old 42501 mapping produced:
 *     "Only a consultant can post a reel".
 *   - uploadMedia changes mechanism, not contract: instead of supabase-js
 *     storage.upload into the public `content-media` bucket it asks Django
 *     for a presigned PUT, uploads straight to the bucket (R2 at cutover —
 *     bytes never touch Django), then confirms and the row flips ready.
 *     It still returns the public URL stored on media_url. 022's public-read
 *     decision survives: the URL needs no signing round trip per card.
 *   - leaveReview's two refusal sentences are byte-identical: the server
 *     sends "You can only review a session you have completed" (403) and
 *     "You have already reviewed this session" (409), so the toasts read the
 *     same as they did under Supabase errors.
 *   - Refusals arrive in the app's {ok, reason, message} envelope; we throw
 *     the human-readable `message`, like the old `throw error` did.
 *   - REALTIME CAVEAT: this file never subscribed to supabase.channel — the
 *     feed, reels and articles are fetch-on-mount, and 015's publication
 *     covers messages/sessions only, so nothing realtime is lost at cutover
 *     and polling/refresh stays as-is. (The chat screens' subscriptions are
 *     module 7's cutover problem; against Django they stop working until
 *     replaced there.)
 *   - The API paginates the feed by keyset (`after` cursor in the response's
 *     next_after); the screens never outran a single page, so this file
 *     keeps the one-shot fetchFeed shape. The cursor is there when volume
 *     arrives.
 */

import { supabase } from './supabase.js'

const API_BASE = import.meta.env.VITE_DJANGO_API_URL // e.g. https://api.example.com/v1

/** The Supabase access token off the existing session; null when signed out. */
async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

async function api(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    // { ok, reason, message } envelope — throw the message, like the old
    // `throw error` did with supabase-js.
    throw new Error(data?.message || `Request failed (${response.status})`)
  }
  return data
}

/**
 * A content_public row in the shape the feed components already read —
 * byte-identical to the old shape(), so every call site keeps working.
 */
function shape(row) {
  return {
    id: row.id,
    authorId: row.author_id,
    isConsultant: row.author_is_consultant,
    // Kept so the call sites reading `consultantId` keep working.
    consultantId: row.author_id,
    consultant: row.author_name,
    initials: (row.author_name || '')
      .split(' ')
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase(),
    kind: row.kind,
    title: row.title,
    body: row.body,
    caption: row.caption,
    mediaUrl: row.media_url,
    views: row.view_count,
    likes: row.like_count,
    saves: row.save_count,
    publishedAt: row.published_at,
    time: ago(row.published_at),
  }
}

/** "2h", "5d". Short by design — the cards have room for two characters. */
export function ago(iso) {
  if (!iso) return ''
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/**
 * The feed. Newest live content first, from every seeker and every approved
 * consultant. `kinds` narrows it for the screens that want one shape; the
 * shuffle is the same Fisher–Yates deal of the deck it always was — the
 * server orders, the client shuffles.
 */
export async function fetchFeed({ kinds, limit = 40, shuffle = false } = {}) {
  let path = `/content/feed/?limit=${limit}`
  if (kinds?.length) path += `&kinds=${kinds.join(',')}`
  const body = await api(path)
  const rows = (body?.results ?? []).map(shape)
  if (shuffle) {
    for (let i = rows.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[rows[i], rows[j]] = [rows[j], rows[i]]
    }
  }
  return rows
}

/** One person's published work — their profile tab and the studio list. */
export async function fetchByAuthor(authorId, { limit = 40 } = {}) {
  const rows = await api(`/content/by-author/?author_id=${authorId}&limit=${limit}`)
  return (rows ?? []).map(shape)
}

/**
 * Publish. The author is the signed-in user, forced server-side — the old
 * code sent author_id for RLS to check; the API never lets the body carry
 * an identity at all (rule 3). The kind gate's refusal arrives with the
 * same sentence the old 42501 mapping produced.
 */
export async function publish({ kind, title, body, caption, mediaUrl }) {
  const token = await accessToken()
  if (!token) throw new Error('Sign in to publish')

  const data = await api('/content/publish/', {
    method: 'POST',
    body: {
      kind,
      title: title ?? null,
      body: body ?? null,
      caption: caption ?? null,
      media_url: mediaUrl ?? null,
    },
    token,
  })
  return data.id
}

/**
 * Upload one file and hand back the URL to store on the row.
 *
 * The mechanism changes from supabase-js storage.upload to the Phase 1
 * presign flow (docs/07 §4), the contract does not:
 *
 *   1. POST /v1/media/presign/  -> { asset_id, upload_url, headers, public_url }
 *   2. PUT upload_url           -> the bytes go straight to the bucket (R2
 *                                  at cutover); Django never carries them
 *   3. POST /v1/media/<id>/confirm/ -> the row flips ready
 *
 * The path inside the bucket is the server's, and the returned public_url is
 * the playback URL the content row stores on media_url — 022's public-read
 * decision, R2-shaped. The timestamp-uniqueness the old client built into
 * its path is now a UUID in the bucket key, so the file still never changes
 * under its URL and caches for a year.
 */
export async function uploadMedia(file) {
  const token = await accessToken()
  if (!token) throw new Error('Sign in to upload')

  const presigned = await api('/media/presign/', {
    method: 'POST',
    body: {
      kind: file.type.startsWith('video/') ? 'reel' : 'image',
      filename: file.name.replace(/[^\w.-]+/g, '-').toLowerCase(),
      size_bytes: file.size,
      mime: file.type,
    },
    token,
  })

  const put = await fetch(presigned.upload_url, {
    method: 'PUT',
    headers: presigned.headers,
    body: file,
  })
  if (!put.ok) throw new Error('Upload failed — try again')

  await api(`/media/${presigned.asset_id}/confirm/`, { method: 'POST', token })
  return presigned.public_url
}

/** Soft delete. Never a DELETE — a removed post in a dispute is evidence. */
export async function remove(contentId) {
  const token = await accessToken()
  if (!token) throw new Error('Sign in to continue')
  await api(`/content/${contentId}/remove/`, { method: 'POST', token })
}

/* ── Reviews ───────────────────────────────────────────────────────────────── */

/**
 * A consultant's reviews. `verified` arrives derived from the server; the
 * screen only renders the distinction.
 */
export async function fetchReviews(consultantId, { limit = 20 } = {}) {
  const rows = await api(`/content/reviews/?consultant_id=${consultantId}&limit=${limit}`)
  return (rows ?? []).map((r) => ({
    id: r.id,
    name: r.reviewer_name,
    rating: r.rating,
    text: r.body,
    verified: r.verified,
    ago: ago(r.created_at),
  }))
}

/**
 * Leave a review. The anti-fraud gate lives in the API, as it lived in the
 * RLS policy: the booking must be yours and COMPLETED, and one booking buys
 * one review. The two refusal sentences are byte-identical to the old ones.
 */
export async function leaveReview({ bookingId, consultantId, rating, body }) {
  const token = await accessToken()
  if (!token) throw new Error('Sign in to review')

  await api('/content/reviews/', {
    method: 'POST',
    body: {
      booking_id: bookingId,
      consultant_id: consultantId,
      rating,
      body: body ?? null,
    },
    token,
  })
}

/** Bookings this seeker has completed and not yet reviewed. */
export async function reviewableBookings() {
  const token = await accessToken()
  if (!token) return []
  return api('/content/reviews/reviewable/', { token })
}

/**
 * Followers and following for any profile, consultant or not. One round
 * trip for both numbers; a follow of a practitioner and a follow of a
 * person both count — one audience, not two.
 */
export async function followCounts(profileId) {
  const counts = await api(`/content/follow-counts/?profile_id=${profileId}`)
  return { followers: counts?.followers ?? 0, following: counts?.following ?? 0 }
}

/** Just the follower count — the consultant profile header shows only that. */
export async function followerCount(profileId) {
  return (await followCounts(profileId)).followers
}

/** A published author's public name, for /u/:id. Null when they have not published. */
export async function fetchAuthor(profileId) {
  try {
    return await api(`/content/authors/${profileId}/`)
  } catch (err) {
    if (err.message === 'That author is not available.') return null
    throw err
  }
}
