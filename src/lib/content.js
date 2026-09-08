import { supabase } from './supabase.js'

/**
 * The feed, the studio's publish path, and reviews. One file, because all three
 * read the same two tables and a second file would mean two answers to "what is
 * live".
 *
 * The feed is a QUERY, not a table (`docs/05-BACKEND-SCHEMA.md` §5.3). A feed
 * table is a ranking system and there is no ranking — this is `content` ordered
 * by `published_at`, and `feed_pins` exists for the admin console to override
 * that later. Do not add a sort weight here; it would be the second ranking.
 *
 * Everything reads through the views, never the tables:
 *
 *   content_public              live content from approved consultants, with
 *                               like and save counts already aggregated
 *   consultant_follower_counts  the number that used to be '84.2k' in a mock
 *   reviews_public             `verified` derived from booking_id, and the
 *                               reviewer named as "Tara V." rather than in full
 *
 * The counts come from the view rather than from a column on purpose (§1.3).
 * Asking for them per row would be N+1; the view aggregates once.
 */

/**
 * A `content_public` row in the shape the feed components already read.
 *
 * `initials` is derived here, exactly as `consultants.js` derives it, and for
 * the same reason: it is a rendering of the name, and a column holding it is a
 * second thing to keep in step.
 *
 * `time` is a relative label because that is what the cards show. It is
 * computed at render rather than stored — a stored "2h" is wrong an hour later,
 * which is the whole of §1.5 in one field.
 */
function shape(row) {
  return {
    id: row.id,
    consultantId: row.consultant_id,
    consultant: row.consultant_name,
    initials: (row.consultant_name || '')
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
 * The feed. Newest live content first, across every approved consultant.
 *
 * `kinds` narrows it for the screens that want one shape — Home's reel rail
 * asks for clips, the article list asks for articles. The default is
 * everything, which is what the main feed wants.
 */
export async function fetchFeed({ kinds, limit = 40 } = {}) {
  let q = supabase
    .from('content_public')
    .select('*')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (kinds?.length) q = q.in('kind', kinds)

  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map(shape)
}

/** One consultant's published work — their profile tab and the studio list. */
export async function fetchByConsultant(consultantId, { limit = 40 } = {}) {
  const { data, error } = await supabase
    .from('content_public')
    .select('*')
    .eq('consultant_id', consultantId)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(shape)
}

/**
 * Publish. The studio's "Published to your feed" toast becomes a row.
 *
 * `consultant_id` is sent because RLS checks it against `auth.uid()` — the
 * policy is `consultant_id = auth.uid()`, so a client claiming somebody else's
 * ID is refused by the database rather than trusted here. It is not an identity
 * the client gets to assert (rule 3); it is one the server checks.
 */
export async function publish({ kind, title, body, caption, mediaUrl }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in to publish')

  const { data, error } = await supabase
    .from('content')
    .insert({
      consultant_id: user.id,
      kind,
      title: title ?? null,
      body: body ?? null,
      caption: caption ?? null,
      media_url: mediaUrl ?? null,
      status: 'live',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  // A refusal returns a reason the interface can show, in the app's voice
  // (INSTRUCTIONS §2, Errors). The one a person actually hits is standing on
  // /pro/studio without being an approved consultant: `isPro` comes from the
  // URL, so the screen renders for anybody, and the foreign key is what
  // actually stops them. Raw Postgres text is not the app's voice.
  if (error) {
    if (error.code === '23503') throw new Error('Only an approved consultant can publish')
    throw error
  }
  return data.id
}

/**
 * Upload one file and hand back the URL to store on the row.
 *
 * The path is `<uid>/<time>-<name>`, because the storage policy compares the
 * first folder segment to `auth.uid()` — a consultant writes into their own
 * folder and nowhere else. The timestamp prefix means uploading two files
 * called `reel.mp4` keeps both rather than silently replacing the first.
 *
 * Size and type are the bucket's rules, not this function's. Restating them
 * here would be a second set of limits to keep in step with `022`, and the one
 * in the browser is the one an attacker skips.
 */
export async function uploadMedia(file) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in to upload')

  const safe = file.name.replace(/[^\w.-]+/g, '-').toLowerCase()
  const path = `${user.id}/${Date.now()}-${safe}`

  const { error } = await supabase.storage.from('content-media').upload(path, file)
  if (error) {
    // The two a person actually hits, in the app's voice.
    if (/exceeded the maximum allowed size/i.test(error.message)) {
      throw new Error('That file is over 25 MB')
    }
    if (/mime type/i.test(error.message)) throw new Error('Upload an image or a video')
    throw error
  }

  const { data } = supabase.storage.from('content-media').getPublicUrl(path)
  return data.publicUrl
}

/** Soft delete. Never a DELETE — a removed post in a dispute is evidence. */
export async function remove(contentId) {
  const { error } = await supabase
    .from('content')
    .update({ status: 'removed' })
    .eq('id', contentId)
  if (error) throw error
}

/* ── Reviews ───────────────────────────────────────────────────────────────── */

/**
 * A consultant's reviews. `verified` arrives derived from the view; the screen
 * only has to render the distinction, not work it out.
 */
export async function fetchReviews(consultantId, { limit = 20 } = {}) {
  const { data, error } = await supabase
    .from('reviews_public')
    .select('*')
    .eq('consultant_id', consultantId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.reviewer_name,
    rating: r.rating,
    text: r.body,
    verified: r.verified,
    ago: ago(r.created_at),
  }))
}

/**
 * Leave a review. The booking is not optional and not decorative: the RLS
 * policy requires it to be the caller's own and COMPLETED, so a review with no
 * session behind it is refused by the database. That refusal is the phase's
 * anti-fraud story, and it lives there rather than here because a check in the
 * client is a suggestion.
 */
export async function leaveReview({ bookingId, consultantId, rating, body }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in to review')

  const { error } = await supabase.from('reviews').insert({
    booking_id: bookingId,
    seeker_id: user.id,
    consultant_id: consultantId,
    rating,
    body: body ?? null,
  })

  // The server's job is to make the interface's string true
  // (INSTRUCTIONS §2, Errors), so the two refusals a seeker can actually cause
  // get the sentence the screen shows.
  if (error) {
    if (error.code === '23505') throw new Error('You have already reviewed this session')
    throw new Error('You can only review a session you have completed')
  }
}

/** Bookings this seeker has completed and not yet reviewed. */
export async function reviewableBookings() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('bookings')
    .select('id, consultant_id, starts_at')
    .eq('seeker_id', user.id)
    .eq('status', 'completed')
    .order('starts_at', { ascending: false })
  if (error) throw error
  if (!data?.length) return []

  const { data: done } = await supabase
    .from('reviews')
    .select('booking_id')
    .in('booking_id', data.map((b) => b.id))

  const reviewed = new Set((done ?? []).map((r) => r.booking_id))
  return data.filter((b) => !reviewed.has(b.id))
}

/** Follower count, for the consultant profile header. */
export async function followerCount(consultantId) {
  const { data, error } = await supabase
    .from('consultant_follower_counts')
    .select('follower_count')
    .eq('consultant_id', consultantId)
    .maybeSingle()
  if (error) throw error
  return data?.follower_count ?? 0
}
