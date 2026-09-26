import { useState } from 'react'
import { Sheet } from './Chrome.jsx'
import CodeField from './CodeField.jsx'
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
          {/* The tick means the SERVER agrees. This drew its "10% back"
              line off a regex until 26 Sep, so a well-shaped code nobody
              had ever issued looked exactly as valid as a real one —
              until Pay refused it. The subtotal goes with the check so
              the answer can name the actual amount rather than "10%". */}
          <div className="mt-5">
            <CodeField
              value={coupon}
              onChange={setCoupon}
              subtotalPaise={cartTotal * 100}
              label="Coupon or astrologer's code"
              hint="An astrologer's code pays you 10% back after delivery, on your first order."
            />
          </div>

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
