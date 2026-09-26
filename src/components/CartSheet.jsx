import { useState } from 'react'
import { looksLikeReferral } from '../lib/referrals.js'
import { Sheet } from './Chrome.jsx'
import Plate from './Plate.jsx'
import { PopButton } from './Pop.jsx'
import { rupees, useStore } from '../store.jsx'

/**
 * Cart sheet.
 *
 * The cart used to be a bare number with nowhere to go — the badge counted up
 * through the whole demo and tapping it did nothing. It now holds real line
 * items, so the total is computed rather than typed and checkout can actually
 * draw against the wallet.
 */
export default function CartSheet() {
  const {
    cartOpen,
    setCartOpen,
    cart,
    cartTotal,
    setQty,
    removeFromCart,
    clearCart,
    checkoutCart,
    spending,
    balance,
  } = useStore()

  /* An astrologer's code, typed here or carried in from their link. This
     is the only place it can be applied to a basket — the Shop's Buy
     button is one product, and a coupon that only worked there would be a
     coupon most people could not use. */
  // Paise against rupees: `cartTotal` is rupees (the catalogue's unit on
  // this screen) and the wallet is paise everywhere. Compared in paise,
  // because that is the one the server uses.
  const short = balance !== null && balance < cartTotal * 100

  const [coupon, setCoupon] = useState(() => {
    try {
      return sessionStorage.getItem('namo.ref') || ''
    } catch {
      return ''
    }
  })

  /* Through the server's checkout, which claims the stock and writes the
     order. It used to be a bare `spend()` — a wallet debit and nothing
     else — so the last item could be sold to everyone holding it in a
     cart. Still awaited: without it a refusal reads as truthy and clears
     a cart nobody paid for. */
  const checkout = async () => {
    const result = await checkoutCart(coupon)
    if (result?.ok) {
      clearCart()
      setCartOpen(false)
    }
  }

  return (
    <Sheet open={cartOpen} onClose={() => setCartOpen(false)} title="Your cart">
      {cart.length === 0 ? (
        <>
          <p className="py-8 text-center text-meta t-faint">Nothing in the cart yet.</p>
          <PopButton size="sm" onClick={() => setCartOpen(false)}>
            Keep browsing
          </PopButton>
        </>
      ) : (
        <>
          <ul>
            {cart.map((l) => (
              <li key={l.id} className="flex items-center gap-3 border-b border-rule py-3">
                <Plate seed={l.id} className="h-14 w-14 flex-none" />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-meta t-heading">{l.name}</p>
                  <p className="mt-1 caps-sm t-faint tnum">
                    ₹{l.price.toLocaleString('en-IN')} each
                  </p>
                </div>

                {/* Quantity stepper. Dropping to zero removes the line. */}
                <div className="flex flex-none items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQty(l.id, l.qty - 1)}
                    aria-label={`Fewer ${l.name}`}
                    className="caps-sm h-8 w-8 rounded-full border border-stroke bg-surface shadow-sm t-body transition-transform active:scale-90"
                  >
                    −
                  </button>
                  <span className="w-5 text-center text-meta tnum t-heading">{l.qty}</span>
                  <button
                    type="button"
                    onClick={() => setQty(l.id, l.qty + 1)}
                    aria-label={`More ${l.name}`}
                    className="caps-sm h-8 w-8 rounded-full border border-stroke bg-surface shadow-sm t-body transition-transform active:scale-90"
                  >
                    +
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => removeFromCart(l.id)}
                  aria-label={`Remove ${l.name}`}
                  className="caps-sm flex-none t-faint"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex items-baseline justify-between border-t border-stroke pt-4">
            <span className="caps-sm t-faint">Total</span>
            <span className="text-lead tnum t-heading">₹{cartTotal.toLocaleString('en-IN')}</span>
          </div>

          {/* What leaves and what is left, before the button that does it.
              Buy used to charge on the tap with none of this on screen —
              a gold button two taps from Add, and the money was gone
              before the page changed. */}
          <div className="mt-2 flex items-baseline justify-between">
            <span className="caps-sm t-faint">Wallet after</span>
            <span
              className={`text-meta tnum ${short ? 'text-live' : 't-sub'}`}
            >
              {balance === null
                ? '—'
                : short
                  ? `short by ₹${rupees(cartTotal * 100 - balance)}`
                  : `₹${rupees(balance - cartTotal * 100)}`}
            </span>
          </div>

          {/* The coupon goes HERE, between the total and the payment, which
              is the last moment it can change what happens and the first
              moment somebody knows what they are buying. An astrologer's
              code carried in from their link arrives already filled. */}
          <label className="mt-5 block">
            <span className="caps-sm t-faint">Coupon or astrologer&apos;s code</span>
            <input
              value={coupon}
              onChange={(e) => setCoupon(e.target.value.toUpperCase())}
              placeholder="Optional"
              maxLength={32}
              aria-label="Coupon or astrologer's code"
              className="mt-2 w-full rounded-lg border border-rule bg-transparent px-3 py-2.5 text-body tracking-[0.1em] text-t1 outline-none transition-colors placeholder:tracking-normal placeholder:text-t4 focus:border-t1"
            />
          </label>

          {/* Cashback, never "off" — and said before paying, because a
              seeker who finds out afterwards that the 10% was not taken
              off the total has been surprised by their own money. The
              total above does not move, and this explains why. */}
          {looksLikeReferral(coupon) && coupon.startsWith('A') && (
            <p className="mt-2 text-micro t-sub">
              You pay the full price and get <b>10% back</b> in your wallet
              seven days after delivery — on your first order only.
            </p>
          )}

          <div className="mt-5 flex gap-2">
            <PopButton size="sm" onClick={clearCart}>
              Clear
            </PopButton>
            {/* The amount is ON the button. A button that says only "Pay"
                is one somebody presses without reading the total above
                it — which is exactly how this went wrong. */}
            <PopButton
              size="sm"
              variant="gold"
              disabled={spending || short}
              onClick={checkout}
            >
              {spending
                ? 'Paying…'
                : short
                  ? 'Not enough balance'
                  : `Pay ₹${cartTotal.toLocaleString('en-IN')}`}
            </PopButton>
          </div>

          <p className="mt-4 text-center text-meta t-faint">
            Paid from your wallet. Stock is claimed when you pay, so nothing
            is held for you until then.
          </p>
        </>
      )}
    </Sheet>
  )
}
