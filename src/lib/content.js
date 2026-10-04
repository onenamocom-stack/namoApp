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
    // A 400 carries its real sentence in `errors` ("Tag at most 3 products")
    // under a generic "Check the highlighted fields" — and a composer has no
    // highlighted field to point at, so the specific sentence wins.
    const fieldError = data?.errors && Object.values(data.errors).flat().find((e) => typeof e === 'string')
    throw new Error(fieldError || data?.message || `Request failed (${response.status})`)
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
    comments: row.comment_count ?? 0,
    reposts: row.repost_count ?? 0,
    publishedAt: row.published_at,
    time: ago(row.published_at),
    // Shop products the author tagged, and the author's A code for the link.
    // Defaulted, not assumed: an API deployed before tagging sends neither.
    products: (row.products ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      image: p.image_url || null,
      price: p.price_paise / 100,
      mrp: p.mrp_paise ? p.mrp_paise / 100 : null,
    })),
    shopRef: row.shop_ref ?? null,
  }
}

/**
 * Where a tagged product's tap goes: the shop, with that product picked out
 * (`p`) and the author's code (`ref`) riding along — the same two params the
 * affiliate links in "Your links" carry, so a purchase credits the author
 * exactly as one of those does.
 */
export function productHref(product, shopRef) {
  const q = new URLSearchParams({ p: product.id })
  if (shopRef) q.set('ref', shopRef)
  return `/shop?${q}`
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
/* Feeds read in the last few minutes, kept in memory (4 Oct 2026). Opening a
   reel from Home used to fetch the whole feed again (~0.85s) for rows Home
   had just loaded. An entry that came back shorter than its limit is the
   COMPLETE list for its kinds, so any narrower request is answered from it
   exactly; a full one could be missing rows, so it only answers itself. */
const FEED_TTL = 3 * 60 * 1000
const feedCache = new Map()

function cachedFeed(kinds, limit) {
  const now = Date.now()
  for (const [key, entry] of feedCache) {
    if (now - entry.at > FEED_TTL) {
      feedCache.delete(key)
      continue
    }
    const exact = entry.kinds.join(',') === (kinds ?? []).join(',') && entry.limit >= limit
    const covers = entry.complete && (!entry.kinds.length || (kinds ?? []).every((k) => entry.kinds.includes(k)))
    if (exact || (covers && kinds?.length)) {
      return entry.rows.then((rows) => (kinds?.length ? rows.filter((r) => kinds.includes(r.kind)) : rows).slice(0, limit))
    }
  }
  return null
}

export async function fetchFeed({ kinds, limit = 40, shuffle = false } = {}) {
  let rows = await cachedFeed(kinds, limit)
  if (!rows) {
    let path = `/content/feed/?limit=${limit}`
    if (kinds?.length) path += `&kinds=${kinds.join(',')}`
    const entry = {
      at: Date.now(),
      kinds: [...(kinds ?? [])],
      limit,
      complete: false,
      rows: api(path).then((body) => (body?.results ?? []).map(shape)),
    }
    entry.rows.then((r) => (entry.complete = r.length < limit)).catch(() => feedCache.delete(path))
    feedCache.set(path, entry)
    rows = await entry.rows
  }
  rows = [...rows]
  if (shuffle) {
    for (let i = rows.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[rows[i], rows[j]] = [rows[j], rows[i]]
    }
  }
  return rows
}

/**
 * Whether the deployed API knows about tagged products yet. The API ships by
 * hand, separately from this app; an API from before tagging silently drops
 * `product_ids`, and the post would go out without the tags the author
 * picked. A feed row carries a `products` key once it does. An empty feed
 * proves nothing either way, so it answers yes.
 */
export async function apiSupportsTags() {
  try {
    const body = await api('/content/feed/?limit=1')
    const row = body?.results?.[0]
    return !row || 'products' in row
  } catch {
    return false
  }
}

/**
 * Reshares, newest first: `{ id, byId, byName, at, time, post }` where `post`
 * is shaped like a feed row. `by` narrows to one person's profile. An API
 * from before reshares 404s here; that reads as "none", not as an error.
 */
export async function fetchReposts({ by = null, limit = 50 } = {}) {
  let path = `/content/reposts/?limit=${limit}`
  if (by) path += `&by=${by}`
  try {
    const rows = await api(path)
    return (rows ?? []).map((r) => ({
      id: `${r.reposted_by}:${r.post.id}`,
      byId: r.reposted_by,
      byName: r.reposted_by_name || 'Someone',
      at: r.reposted_at,
      time: ago(r.reposted_at),
      post: shape(r.post),
    }))
  } catch {
    return []
  }
}

/** A comment row as the sheet renders it. */
function shapeComment(c) {
  return {
    id: c.id,
    authorId: c.author_id,
    name: c.author_name || 'Someone',
    initials: (c.author_name || '?')
      .split(' ')
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase(),
    body: c.body,
    time: ago(c.created_at),
  }
}

/** A post's comments, oldest first. Anonymous, like the feed. */
export async function fetchComments(contentId) {
  const rows = await api(`/content/${contentId}/comments/`)
  return (rows ?? []).map(shapeComment)
}

/** Comment as the signed-in person; returns the new row. */
export async function postComment(contentId, body) {
  const token = await accessToken()
  if (!token) throw new Error('Sign in to comment')
  const row = await api(`/content/${contentId}/comments/`, {
    method: 'POST',
    body: { body },
    token,
  })
  return shapeComment(row)
}

/** Remove a comment: your own, or any on your own post. */
export async function removeComment(commentId) {
  const token = await accessToken()
  if (!token) throw new Error('Sign in first')
  await api(`/content/comments/${commentId}/remove/`, { method: 'POST', token })
}

/**
 * This person watched this reel. Counted once per person ever, server-side
 * (ContentView); returns the new count, or null when there is no session or
 * the API predates view counting — a failed count must not interrupt a reel.
 */
export async function recordView(contentId) {
  const token = await accessToken()
  if (!token) return null
  try {
    const data = await api(`/content/${contentId}/view/`, { method: 'POST', token })
    return data?.views ?? null
  } catch {
    return null
  }
}

/** One person's published work — their profile tab and the studio list. */
/** One live post by id (`GET /content/<id>/`), or null if it is not public. */
export async function fetchOne(contentId) {
  try {
    return shape(await api(`/content/${contentId}/`))
  } catch {
    return null
  }
}

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
export async function publish({ kind, title, body, caption, mediaUrl, productIds = [] }) {
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
      // Only sent when there are some, so a post from an ordinary account
      // is byte-identical to the request it made before tagging existed.
      ...(productIds.length ? { product_ids: productIds } : {}),
    },
    token,
  })
  feedCache.clear() // the new post must show at once
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
  feedCache.clear()
  const token = await accessToken()
  if (!token) throw new Error('Sign in to continue')
  await api(`/content/${contentId}/remove/`, { method: 'POST', token })
}

/* ── Reporting ─────────────────────────────────────────────────────── */

/**
 * The reasons a person can pick. The server holds the same closed list and
 * refuses anything else, so this array is the interface's copy of a rule it
 * does not own — adding one here without adding it there gets a 400.
 */
export const REPORT_REASONS = [
  { value: 'spam', label: 'Spam or a scam' },
  { value: 'abuse', label: 'Abuse, threats or harassment' },
  { value: 'adult', label: 'Nudity or sexual content' },
  { value: 'false', label: 'Dangerous or false claims' },
  { value: 'other', label: 'Something else' },
]

/**
 * Report a post, or a person when `contentId` is null.
 *
 * Reporting the same thing twice answers ok rather than refusing: the
 * intent was "I have told you about this", and it stays true. The server
 * counts one either way.
 *
 * Nothing happens to the post when this returns. A report is a complaint an
 * admin reads, not a delete — see apps/content/services.py for why a count
 * has never been allowed to act on its own.
 */
export async function report({ contentId = null, profileId = null, reason, note }) {
  const token = await accessToken()
  if (!token) throw new Error('Sign in to continue')
  const path = contentId
    ? `/content/${contentId}/report/`
    : `/content/authors/${profileId}/report/`
  return api(path, { method: 'POST', token, body: { reason, note: note || null } })
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
