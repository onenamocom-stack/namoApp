import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { affiliateLink } from '../lib/referrals.js'
import { endPick, isSharer, MAX_TAGS, pickState, tagInNewPost, toggleTag } from '../lib/tagpick.js'
import { useStore } from '../store.jsx'
import Icon from './Icon.jsx'

/**
 * Tagging and links for a Pro or a Creator, on the Market (15 Oct 2026,
 * Rahul). Nobody else sees any of it.
 *
 *   PickBar     — across the top of the Market and a product page while a
 *                 post is waiting for tags: how many, and Done.
 *   SharerBar   — on a product's, a listing's or an e-book's page: Tag
 *                 this product (in pick mode), or Tag in post and My link.
 *   CardCorner  — a card's corner while picking: tag it.
 */

export function useSharer() {
  const { consultant, profile } = useStore()
  return isSharer(consultant, profile)
}

export function PickBar() {
  const navigate = useNavigate()
  const sharer = useSharer()
  const pick = pickState()
  if (!sharer || !pick) return null
  return (
    <div className="sticky top-[52px] z-20 mx-3 mt-2 flex items-center gap-3 rounded-2xl bg-ink px-4 py-2.5 text-white shadow-lg">
      <span className="text-[#ffd27a]"><Icon name="plus" size={16} /></span>
      <span className="min-w-0 flex-1 text-meta">
        Tag a product · {pick.tagged.length}/{MAX_TAGS} tagged
        <span className="block text-micro text-white/60">Open one and tap Tag this product</span>
      </span>
      <button type="button" onClick={() => navigate(endPick())} className="rounded-full bg-white px-3.5 py-1.5 caps-sm text-ink">
        Done
      </button>
    </div>
  )
}

async function shareLink(item, name, showToast) {
  const isEbook = item.kind === 'ebook' && item.pricePaise !== undefined
  const isListing = !isEbook && item.title !== undefined && item.price_paise !== undefined
  const built = await affiliateLink(isListing || isEbook ? null : item.id, isListing ? item.id : null,
    isEbook ? item.id : null)
  if (!built?.url) return showToast('Could not make your link. Try again.')
  try {
    if (navigator.share) await navigator.share({ title: name, text: name, url: built.url })
    else {
      await navigator.clipboard.writeText(built.url)
      showToast('Your link is copied. You earn on what it sells.')
    }
  } catch {
    /* dismissed */
  }
}

export function SharerBar({ product }) {
  const navigate = useNavigate()
  const { showToast } = useStore()
  const sharer = useSharer()
  const [, redraw] = useState(0)
  if (!sharer || !product) return null
  const pick = pickState()

  if (pick) {
    const on = pick.tagged.some((t) => t.id === product.id)
    return (
      <div className="mx-5 mt-4 rounded-2xl border border-gold-fill bg-gold-fill/10 p-3">
        <button
          type="button"
          onClick={() => {
            const list = toggleTag(product)
            if (list === null) return showToast(`A post takes ${MAX_TAGS} products at most.`)
            showToast(on ? 'Untagged.' : 'Tagged to your post.')
            redraw((n) => n + 1)
          }}
          className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 caps-sm ${on ? 'bg-white t-heading' : 'bg-gold-fill text-white'}`}
        >
          <Icon name={on ? 'check' : 'plus'} size={16} />
          {on ? 'Tagged · tap to remove' : 'Tag this product'}
        </button>
        {on && (
          <button type="button" onClick={() => navigate(endPick())} className="mt-2 w-full py-1 text-center caps-sm gold">
            Done, back to my post
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="mx-5 mt-4 grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => {
          if (!tagInNewPost(product)) return showToast(`Your post already has ${MAX_TAGS} products.`)
          navigate('/home?compose=1')
        }}
        className="flex items-center justify-center gap-2 rounded-xl border border-gold-fill py-2.5 caps-sm gold"
      >
        <Icon name="plus" size={15} /> Tag in post
      </button>
      <button
        type="button"
        onClick={() => shareLink(product, product.name || product.title, showToast)}
        className="flex items-center justify-center gap-2 rounded-xl border border-gold-fill py-2.5 caps-sm gold"
      >
        <Icon name="share" size={15} /> My Referral Link
      </button>
      {/* Products, listings and e-books all pay their sharer (15 Oct 2026). */}
      <p className="col-span-2 text-center text-micro t-faint">Only you see these. You earn on what your link or tag sells.</p>
    </div>
  )
}

/** A card's corner, for a sharer picking tags for a post: + to tag, ✓ once tagged. */
export function CardCorner({ product }) {
  const { showToast } = useStore()
  const sharer = useSharer()
  const [, redraw] = useState(0)
  if (!sharer) return null
  const pick = pickState()
  if (pick) {
    const on = pick.tagged.some((t) => t.id === product.id)
    return (
      <span
        role="button"
        tabIndex={0}
        aria-label={on ? 'Untag' : 'Tag this product'}
        onClick={(e) => {
          e.stopPropagation()
          if (toggleTag(product) === null) return showToast(`A post takes ${MAX_TAGS} products at most.`)
          redraw((n) => n + 1)
        }}
        className={`absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full shadow-md ${on ? 'bg-ok text-white' : 'bg-white text-ink'}`}
      >
        <Icon name={on ? 'check' : 'plus'} size={16} />
      </span>
    )
  }
  // Out of pick mode a card carries nothing (15 Oct 2026, Rahul: the
  // product page's Share is enough).
  return null
}
