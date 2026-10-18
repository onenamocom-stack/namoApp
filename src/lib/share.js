/**
 * Sharing, from every Share button in the app.
 *
 * Share opens the app's own sheet (14 Oct 2026, Rahul): people on NAMO to
 * send it to, and under them WhatsApp, the phone's share sheet and Copy
 * link. `ShareSheet.jsx` draws it; this file holds what it needs, so a
 * screen calls one function and knows nothing about the sheet.
 */
import { SEEKER_APP_URL } from './urls.js'

/* The one sheet listens here. A module-level listener rather than store
   state: every Share button calls a plain function and none of them
   rerenders when a sheet opens elsewhere. */
let listener = null
export function onShareRequest(fn) {
  listener = fn
  return () => {
    if (listener === fn) listener = null
  }
}

/**
 * Open the share sheet.
 *
 * `path` is in this app or a full URL. `title` names the thing (the card in
 * a chat shows it). `media` is its picture or video, shown on that card when
 * it is ours. `external` is what the sheet's Share button does — the phone's
 * share sheet for the link, unless the caller has something better (a
 * product's price line, a status picture as a file); it returns the
 * sentence to toast, or null.
 *
 * With no sheet mounted it runs `external` straight away, so a caller that
 * toasts the result keeps working.
 */
export async function openShare({ path, title = '', media = null, external } = {}) {
  const phone = external || (() => phoneShare(path, { title }))
  if (!listener) return phone()
  listener({ path, title, media, external: phone })
  return null
}

/** Every Share button's old call, unchanged: it opens the sheet now. */
export function shareLink(path, { title, media } = {}) {
  return openShare({ path, title, media })
}

/**
 * The phone's own share sheet where there is one (WhatsApp is where these
 * go), the clipboard where there is not. Returns the sentence to toast, or
 * null when the person dismissed the sheet — a cancelled share is not an
 * error and says nothing.
 *
 * This replaced toasts that said "link copied" and copied nothing.
 */
export async function phoneShare(path, { title, text } = {}) {
  const url = fullUrl(path)
  if (navigator.share) {
    try {
      // `text` too: WhatsApp drops `title` and shows only text and link.
      await navigator.share({ url, title, ...(text || title ? { text: text || title } : {}) })
      return null
    } catch (err) {
      if (err?.name === 'AbortError') return null
      // Any other refusal (an in-app browser that exposes share and then
      // blocks it) falls through to the clipboard.
    }
  }
  return copyLink(path)
}

export async function copyLink(path) {
  try {
    await navigator.clipboard.writeText(fullUrl(path))
    return 'Link copied'
  } catch {
    return 'Could not copy. Long-press the address bar to copy the link.'
  }
}

/* A real address since the move off the hash router (6 Oct 2026). A full
   URL passes through: a username link is always 1namo.com, even when
   shared from the pro app (11 Oct 2026). */
export function fullUrl(path) {
  return /^https?:/.test(path) ? path : `${window.location.origin}${path}`
}

/* ── In a chat ─────────────────────────────────────────────────────────────
   A share is an ordinary message, so it needs no new table: the link on the
   first line, the title on the second, the picture on the third. The
   address is always 1namo.com — the person it goes to is in the seeker app,
   whichever app it was sent from. */

const OURS = /^https:\/\/(?:pro\.)?1namo\.com(\/\S*)$/
const MEDIA_HOST = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
/* Our R2 bucket's addresses: media.1namo.com since 18 Oct 2026, and the
   r2.dev one older rows keep. The exact host, not any r2.dev: those are
   anybody's buckets. Without these every R2 picture was dropped from the
   card (Rahul, 18 Oct 2026: a reel arrived as words only). */
const R2_HOSTS = ['https://media.1namo.com/', 'https://pub-3af0d667ea734b68a3281ea8d13e3a72.r2.dev/']

export function shareMessage({ path, title, media }) {
  const url = /^https?:/.test(path) ? path : `${SEEKER_APP_URL.replace(/\/$/, '')}${path}`
  return [url, (title || '').replace(/\s+/g, ' ').trim(), ourMedia(media) || ''].join('\n').trimEnd()
}

/* A picture on a card is shown only from our own storage or our own site:
   anybody can type a message, and a stranger's address would be a pixel
   that tells them you read it. */
function ourMedia(url) {
  if (!url || typeof url !== 'string') return null
  if (url.startsWith('/')) return url
  if (MEDIA_HOST && url.startsWith(`${MEDIA_HOST}/storage/`)) return url
  if (R2_HOSTS.some((h) => url.startsWith(h))) return url
  return OURS.test(url) ? url : null
}

/* What kind of thing a path is, by its first segment. */
const KINDS = [
  [/^\/reels\//, 'reel'],
  [/^\/read\//, 'article'],
  [/^\/bhakti\//, 'bhakti'],
  [/^\/shop\b/, 'product'],
  [/^\/(u|consult)\//, 'profile'],
  [/^\/groups\//, 'group'],
  [/^\/onboarding\b/, 'invite'],
]

export const KIND_LABEL = {
  reel: 'Reel',
  post: 'Post',
  article: 'Article',
  bhakti: 'Bhakti',
  product: 'Shop',
  profile: 'Profile',
  group: 'Group',
  invite: 'Invite',
  link: 'NAMO',
}

const PREVIEW = {
  reel: 'Sent a reel',
  post: 'Sent a post',
  article: 'Sent an article',
  bhakti: 'Sent from Bhakti',
  product: 'Sent a product',
  profile: 'Sent a profile',
  group: 'Sent a group',
  invite: 'Sent an invite',
  link: 'Sent a link',
}

function kindOf(path) {
  // A post has no page: it is shared as its author's, marked (Home).
  if (/[?&]post=/.test(path)) return 'post'
  return KINDS.find(([re]) => re.test(path))?.[1] ?? (path.split('?')[0].split('/').filter(Boolean).length === 1 ? 'profile' : 'link')
}

/** A message that is a share, as `{path, kind, title, media}`; null for
 *  anything else. */
export function parseShare(body) {
  const [first = '', title = '', media = ''] = (body || '').split('\n')
  const hit = first.trim().match(OURS)
  if (!hit) return null
  const path = hit[1] || '/'
  return { path, kind: kindOf(path), title: title.trim(), media: reelCard(path) || ourMedia(media.trim()) }
}

/* A reel's card in a chat is its link preview (18 Oct 2026, Rahul: "like
   share"): the standing frame with the logo and the play mark that
   WhatsApp shows, one small JPEG for an MP4 or an HLS reel alike, and
   for reels sent before this too. */
function reelCard(path) {
  const id = path.match(/^\/reels\/([0-9a-f-]{36})/i)?.[1]
  return id ? `${SEEKER_APP_URL.replace(/\/$/, '')}/og/reel/${id}.jpg?v=3` : null
}

/** The Chats list's line for a conversation whose last message is a share. */
export function sharePreview(text) {
  const first = (text || '').split('\n')[0].trim()
  const hit = first.match(OURS)
  if (!hit) return text
  return PREVIEW[kindOf(hit[1] || '/')]
}
