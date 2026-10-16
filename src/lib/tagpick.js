/**
 * Tag a product from the Market (15 Oct 2026, Rahul): a Pro or a Creator
 * writing a post taps Tag, the Market opens in pick mode, they open a
 * product and tap "Tag this product", and Done takes them back to the post
 * with it tagged. The post is the composer's own saved draft (localStorage,
 * per mode), so nothing typed is lost on the way; this file only adds to
 * its `tagged` list and remembers where to go back to.
 */

const PICK = 'namo.tagpick'
const DRAFT_KEY = (mode) => `namo.draft.${mode}`
const EMPTY = { caption: '', title: '', body: '', media: null, tagged: [] }
export const MAX_TAGS = 3 // the composer's and the server's cap

/** Who may tag and share, and earn on it: the Creator module (docs/06
 *  Phase 18, 16 Oct 2026; it was any approved Pro or a Creator).
 *  `consultant` is kept so the callers need not change. */
export function isSharer(consultant, profile) {
  return Boolean(profile?.influencer)
}

function readDraft(mode) {
  try {
    return { ...EMPTY, ...(JSON.parse(localStorage.getItem(DRAFT_KEY(mode)) || 'null') || {}) }
  } catch {
    return { ...EMPTY }
  }
}

function writeDraft(mode, draft) {
  try {
    localStorage.setItem(DRAFT_KEY(mode), JSON.stringify(draft))
  } catch {
    /* full storage: the tag is lost, the post is not */
  }
}

/** Into pick mode. `back` is where Done returns (the composer reopens). */
export function startPick({ mode = 'post', back = '/home?compose=1', draft = null } = {}) {
  if (draft) writeDraft(mode, { ...readDraft(mode), ...draft })
  sessionStorage.setItem(PICK, JSON.stringify({ mode, back }))
}

export function pickState() {
  try {
    const p = JSON.parse(sessionStorage.getItem(PICK) || 'null')
    if (!p) return null
    return { ...p, tagged: readDraft(p.mode).tagged || [] }
  } catch {
    return null
  }
}

/** The fields a tag needs: what the composer's chips and the feed card read. */
function slim(p) {
  // One of Namo's e-books (a bhakti asset: title, previewUrl, pricePaise).
  if (p.kind === 'ebook' && p.pricePaise !== undefined) {
    return { id: p.id, ebook: true, kind: 'ebook', name: p.title, image: p.previewUrl || null,
      price: (p.pricePaise || 0) / 100, mrp: p.mrpPaise ? p.mrpPaise / 100 : null }
  }
  // A Market listing (an API row: title, cover_url, price_paise).
  if (p.kind && p.title !== undefined && p.price_paise !== undefined) {
    return { id: p.id, listing: true, kind: p.kind, name: p.title, image: p.cover_url || null,
      price: p.price_paise / 100, mrp: p.mrp_paise ? p.mrp_paise / 100 : null }
  }
  return { id: p.id, slug: p.slug ?? null, name: p.name, subtitle: p.subtitle ?? '', image: p.image ?? null,
    price: p.price, mrp: p.mrp ?? null, category: p.category ?? null, categories: p.categories ?? [] }
}

/** Tag or untag `product` on the post being written. Returns the new list,
 *  or null when it is full. */
export function toggleTag(product) {
  const p = pickState()
  const mode = p?.mode || 'post'
  const draft = readDraft(mode)
  const has = draft.tagged.some((t) => t.id === product.id)
  if (!has && draft.tagged.length >= MAX_TAGS) return null
  draft.tagged = has ? draft.tagged.filter((t) => t.id !== product.id) : [...draft.tagged, slim(product)]
  writeDraft(mode, draft)
  return draft.tagged
}

/** Leave pick mode; answers where to go back to. */
export function endPick() {
  const p = pickState()
  sessionStorage.removeItem(PICK)
  return p?.back || '/home?compose=1'
}

/** "Tag in post" from a product page with no post open: a new post with it. */
export function tagInNewPost(product) {
  const draft = readDraft('post')
  if (!draft.tagged.some((t) => t.id === product.id)) {
    if (draft.tagged.length >= MAX_TAGS) return false
    draft.tagged = [...draft.tagged, slim(product)]
  }
  writeDraft('post', draft)
  sessionStorage.removeItem(PICK)
  return true
}
