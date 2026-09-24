import { useEffect, useState } from 'react'
import { affiliateLink, myCodes } from '../lib/referrals.js'
import { fetchProducts } from '../lib/shop.js'
import { TopBar } from '../components/Chrome.jsx'
import { Kicker, PopButton } from '../components/Pop.jsx'
import { Section } from '../components/Primitives.jsx'
import { rupees, useStore } from '../store.jsx'

/**
 * Links a consultant can share, with their code already in them.
 *
 * WHY THE SERVER BUILDS THE URL. These get pasted into WhatsApp and live
 * for months. The shape of one is a contract with every link already
 * sent, so it belongs somewhere a single change fixes — not in a template
 * string on this screen, which cannot be corrected later without breaking
 * everything shared before the fix.
 *
 * ONE CODE, NOT ONE PER PRODUCT. The code IS the coupon: the buyer types
 * or arrives with the same string that credits the consultant. A link
 * that attributed through one identifier and paid through another would
 * be a link that can attribute and not pay, which is the failure nobody
 * notices until a month of commission is missing.
 *
 * The screen is deliberately honest about the two things a consultant
 * gets wrong here: it only pays on somebody's FIRST order, and the money
 * arrives after delivery rather than at checkout. Both are said before
 * the copy button, not in a help page.
 */
export default function ProAffiliate() {
  const { showToast } = useStore()
  const [code, setCode] = useState(null)
  const [products, setProducts] = useState(null)
  const [links, setLinks] = useState({})

  useEffect(() => {
    let alive = true
    myCodes().then((row) => alive && setCode(row?.codes?.consultant ?? null))
    fetchProducts()
      .then((rows) => alive && setProducts(rows))
      .catch(() => alive && setProducts([]))
    return () => {
      alive = false
    }
  }, [])

  /* Copied through the clipboard API with a textarea fallback: this app is
     served over https so the API is available, but an older in-app browser
     (people open WhatsApp links inside WhatsApp) can still refuse it. */
  async function copy(text, what) {
    try {
      await navigator.clipboard.writeText(text)
      showToast(`${what} copied`)
    } catch {
      showToast('Could not copy. Long-press the link to copy it.')
    }
  }

  async function makeLink(product) {
    if (links[product.id]) return copy(links[product.id].url, 'Link')
    const built = await affiliateLink(product.id)
    if (!built) return showToast('Could not build that link')
    setLinks((prev) => ({ ...prev, [product.id]: built }))
    copy(built.url, 'Link')
  }

  return (
    <>
      <TopBar title="Your links" sub="Share a product, earn 10%" back backTo="/pro/studio" />

      {/* Said before the buttons, because both of these are what a
          consultant would otherwise learn from an angry message. */}
      <Section label="How it pays" tight>
        <p className="horoscope">
          Someone who buys through your link pays the full price and gets 10%
          back in their wallet. You get 10% too, into your earnings, and it goes
          out with your next payout.
        </p>
        <ul className="mt-4 space-y-2 text-meta t-sub">
          <li>• It only pays on their <b>first ever order</b>. After that the code stops working for them.</li>
          <li>• The money lands <b>seven days after delivery</b>, not at checkout — a returned parcel cancels it.</li>
          <li>• Another consultant buying through your link earns nobody anything.</li>
        </ul>
      </Section>

      <Section label="Your code" tight>
        {code === null ? (
          <p className="prose-c">Loading.</p>
        ) : (
          <>
            <button
              type="button"
              onClick={() => copy(code, 'Code')}
              className="w-full rounded-lg border border-rule px-4 py-5 text-center transition-colors hover:border-t1"
            >
              <span className="block font-display text-display tracking-[0.2em] t-heading">
                {code}
              </span>
              <span className="mt-2 block caps-sm t-faint">Tap to copy</span>
            </button>
            <p className="mt-3 text-micro t-faint">
              This never changes. A link you share today and one you share next
              year credit the same account.
            </p>
          </>
        )}
      </Section>

      <Section label="Link to a product" last>
        {products === null && <p className="prose-c">Loading the shop.</p>}
        {products?.length === 0 && (
          <p className="prose-c">Nothing in the shop to link to yet.</p>
        )}
        <ul className="space-y-3">
          {(products ?? []).map((p) => (
            <li key={p.id} className="pop-card flex items-center gap-3 p-3">
              {p.imageUrl ? (
                <img
                  src={p.imageUrl}
                  alt=""
                  className="h-14 w-14 flex-none rounded-lg object-cover"
                />
              ) : (
                <span className="h-14 w-14 flex-none rounded-lg bg-surface-2" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body text-t1">{p.name}</span>
                <span className="mt-0.5 block caps-sm t-faint tnum">
                  ₹{rupees(p.pricePaise)} · you earn ₹{rupees(Math.floor(p.pricePaise / 10))}
                </span>
              </span>
              <PopButton
                size="sm"
                variant={links[p.id] ? 'ghost' : 'gold'}
                full={false}
                className="flex-none"
                onClick={() => makeLink(p)}
              >
                {links[p.id] ? 'Copy again' : 'Get link'}
              </PopButton>
            </li>
          ))}
        </ul>

        <Kicker className="mt-8">Or the whole shop</Kicker>
        <PopButton
          variant="ghost"
          className="mt-3"
          onClick={async () => {
            const built = await affiliateLink()
            if (built) copy(built.url, 'Shop link')
          }}
        >
          Copy a link to the shop
        </PopButton>
      </Section>

      <div className="h-8" />
    </>
  )
}
