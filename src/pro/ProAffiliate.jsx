import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { affiliateLink, myCodes } from '../lib/referrals.js'
import { SEEKER_APP_URL } from '../lib/urls.js'
import { TopBar } from '../components/Chrome.jsx'
import Icon from '../components/Icon.jsx'
import { isPro } from '../side.js'
import { Kicker } from '../components/Pop.jsx'
import { useStore } from '../store.jsx'

/**
 * Links a consultant or a Creator can share, with their code already in them.
 *
 * WHY THE SERVER BUILDS THE URL. These get pasted into WhatsApp and live
 * for months. The shape of one is a contract with every link already
 * sent, so it belongs somewhere a single change fixes — not in a template
 * string on this screen, which cannot be corrected later without breaking
 * everything shared before the fix.
 *
 * ONE CODE, NOT ONE PER PRODUCT. The code IS the coupon: the buyer types
 * or arrives with the same string that credits the sharer. A link that
 * attributed through one identifier and paid through another would be a
 * link that can attribute and not pay.
 *
 * Two cards and the terms (16 Oct 2026, Rahul): the whole store's link on
 * top, then the way into the Market — every product page carries its own
 * "My Referral Link" button, so the product list that lived here is gone.
 * The rules sit below as numbered terms.
 */
export default function ProAffiliate() {
  const { showToast } = useStore()
  // The days a link holds a customer, as set in the console.
  const [days, setDays] = useState(null)
  const [store, setStore] = useState(null)

  useEffect(() => {
    let alive = true
    myCodes().then((row) => alive && setDays(row?.affiliate_days ?? null))
    affiliateLink().then((built) => alive && setStore(built))
    return () => {
      alive = false
    }
  }, [])

  /* The clipboard API can be refused by an older in-app browser (WhatsApp's). */
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text)
      showToast('Store link copied')
    } catch {
      showToast('Could not copy. Long-press the link to copy it.')
    }
  }

  async function share() {
    if (!store?.url) return showToast('Could not make your link. Try again.')
    if (!navigator.share) return copy(store.url)
    try {
      await navigator.share({ title: 'NAMO Shop', text: store.share_text, url: store.url })
    } catch {
      /* dismissed */
    }
  }

  // The Market lives in the main app; the pro app opens it there.
  const marketClass =
    'pop-tap mt-5 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-btn to-btn-deep py-3.5 caps-sm text-white shadow'
  const openMarket = isPro ? (
    <a href={`${SEEKER_APP_URL}shop`} target="_blank" rel="noreferrer" className={marketClass}>
      Open the Market →
    </a>
  ) : (
    <Link to="/shop" className={marketClass}>
      Open the Market →
    </Link>
  )

  return (
    <>
      <TopBar title="Your product referral link" sub="Share a link, earn on the order" back backTo={isPro ? '/pro/studio' : '/dashboard'} />

      <div className="space-y-4 px-5 pt-5">
        {/* 1. The whole store, on top. */}
        <section className="rounded-3xl bg-gradient-to-br from-gold-fill to-gold-dim p-5 text-white shadow-lg">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-white/20">
              <Icon name="cart" size={22} />
            </span>
            <div className="min-w-0">
              <p className="caps-sm text-white/80">Whole store link</p>
              <p className="text-lead font-semibold leading-snug">Earn on anything they buy</p>
            </div>
          </div>
          <p className="mt-4 break-all rounded-xl bg-white/15 px-3 py-2.5 text-meta select-all">
            {store?.url ?? 'Making your link'}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!store}
              onClick={() => copy(store.url)}
              className="flex items-center justify-center rounded-xl bg-white py-3 caps-sm text-ink disabled:opacity-60"
            >
              Copy link
            </button>
            <button
              type="button"
              disabled={!store}
              onClick={share}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/70 py-3 caps-sm text-white disabled:opacity-60"
            >
              <Icon name="share" size={15} /> Share
            </button>
          </div>
        </section>

        {/* 2. One product: from its own page. */}
        <section className="pop-card p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-gold-wash gold">
              <Icon name="gem" size={22} />
            </span>
            <div className="min-w-0">
              <p className="caps-sm t-faint">Link to a product</p>
              <p className="text-lead font-semibold leading-snug t-heading">Share one product</p>
            </div>
          </div>
          <ol className="mt-4 space-y-3">
            {[
              'Open the Market.',
              'Open any product.',
              'Tap My Referral Link on its page. Your link to that product is copied or shared.',
            ].map((step, i) => (
              <li key={step} className="flex items-start gap-3 text-meta t-body">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-gold-fill text-micro font-semibold text-white tnum">
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
          {openMarket}
        </section>
      </div>

      {/* 3. The rules as terms (the rules since 15 Oct 2026, Rahul). */}
      <section className="px-5 pb-10 pt-8">
        <Kicker>Terms and conditions</Kicker>
        <ol className="mt-3 list-decimal space-y-2.5 pl-5 text-meta t-sub">
          <li>Someone who opens your link is yours for {days ?? 15} days, for the whole store, not just the product you linked.</li>
          <li>If they order in that time, you earn on it. It goes into your earnings and is paid with your next payout.</li>
          <li>New or old customer, it pays.</li>
          <li>One click pays on one order. They open your link again for the next.</li>
          <li>If they open somebody else&apos;s link before buying, the order is theirs from then.</li>
          <li>The money lands seven days after delivery, not at checkout. A returned parcel cancels it.</li>
          <li>A product tagged on your post or reel carries your link too.</li>
        </ol>
      </section>
    </>
  )
}
