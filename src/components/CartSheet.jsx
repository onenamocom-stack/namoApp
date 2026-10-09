import { useState } from 'react'
import { Sheet } from './Chrome.jsx'
import CodeField from './CodeField.jsx'
import DeliveryStep from './DeliveryStep.jsx'
import ProductArt from './ProductArt.jsx'
import { codFeePaise } from '../lib/shop.js'
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
/* The quantity steppers (6 Oct 2026): drawn, not typed. A "−" and a "+"
   set as text sat left of centre — the caps letter-spacing and the glyphs'
   own side bearings — so each is two strokes centred in the circle. */
const STEP =
  'inline-flex h-8 w-8 flex-none items-center justify-center rounded-full border border-stroke bg-surface shadow-sm t-body transition-transform active:scale-90'

function StepIcon({ plus = false }) {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="2" y1="6" x2="10" y2="6" />
      {plus && <line x1="6" y1="2" x2="6" y2="10" />}
    </svg>
  )
}

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
  } = useStore()

  /* An astrologer's code, typed here or carried in from their link. This
     is the only place it can be applied to a basket — the Shop's Buy
     button is one product, and a coupon that only worked there would be a
     coupon most people could not use. */
  // Paise against rupees: `cartTotal` is rupees (the catalogue's unit on
  // this screen) and the wallet is paise everywhere. Compared in paise,
  // because that is the one the server uses.
  /* Delivery (5 Oct 2026): the courier's rate for the chosen address,
     from the server. Pay waits for it — a parcel needs somewhere to go,
     and the total on the button must be the total charged. */
  const [delivery, setDelivery] = useState(null)
  // Clear asks first (6 Oct 2026): one tap emptied a cart somebody built.
  const [confirmClear, setConfirmClear] = useState(false)
  const [nonce, setNonce] = useState(0)
  /* How it is paid (6 Oct 2026): online — Razorpay's checkout for this
     order, UPI, card or netbanking; the wallet is for chat, not the shop —
     or cash on delivery, 2% more, where a courier at that pincode takes
     cash. */
  const [payment, setPayment] = useState('online')
  const goodsAndDelivery = cartTotal * 100 + (delivery?.amountPaise ?? 0)
  const codOffered = !!delivery?.codAvailable
  const cod = payment === 'cod' && codOffered
  const fee = cod ? codFeePaise(goodsAndDelivery, delivery.codFeeBps) : 0
  const totalPaise = goodsAndDelivery + fee
  const overCap = cod && delivery?.codMaxPaise != null && totalPaise > delivery.codMaxPaise


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
    const result = await checkoutCart(coupon, delivery, cod ? 'cod' : 'online')
    if (result?.ok) {
      clearCart()
      setCartOpen(false)
    } else {
      // A refused payment may have been a stale quote; ask again.
      setNonce((n) => n + 1)
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
                <ProductArt product={l} className="h-14 w-14 flex-none rounded-lg" />

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
                    className={STEP}
                  >
                    <StepIcon />
                  </button>
                  <span className="w-5 text-center text-meta tnum t-heading">{l.qty}</span>
                  <button
                    type="button"
                    onClick={() => setQty(l.id, l.qty + 1)}
                    aria-label={`More ${l.name}`}
                    className={STEP}
                  >
                    <StepIcon plus />
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

          <DeliveryStep
            lines={cart.map((l) => ({ product_id: l.id, qty: l.qty }))}
            nonce={nonce}
            onQuote={setDelivery}
          />

          <div className="mt-6 space-y-1 border-t border-stroke pt-4">
            <div className="flex items-baseline justify-between">
              <span className="caps-sm t-faint">Items</span>
              <span className="text-meta tnum t-sub">₹{cartTotal.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="caps-sm t-faint">Delivery</span>
              <span className="text-meta tnum t-sub">
                {/* Free while Namo pays the courier (8 Oct 2026). */}
                {!delivery ? '—' : delivery.amountPaise === 0 ? 'Free' : `₹${rupees(delivery.amountPaise)}`}
              </span>
            </div>
            {cod && (
              <div className="flex items-baseline justify-between">
                <span className="caps-sm t-faint">Cash on delivery fee · {delivery.codFeeBps / 100}%</span>
                <span className="text-meta tnum t-sub">₹{rupees(fee)}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between pt-1">
              <span className="caps-sm t-faint">{cod ? 'To pay on delivery' : 'Total'}</span>
              <span className="text-lead tnum t-heading">₹{rupees(totalPaise)}</span>
            </div>
          </div>

          {/* How to pay. Cash on delivery only where a courier at this
              pincode takes cash, and said so rather than hidden. */}
          {delivery && (
            <div className="mt-4" role="radiogroup" aria-label="How to pay">
              <p className="caps-sm t-faint">Pay</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {[
                  { key: 'online', title: 'Pay online', note: 'UPI, card or netbanking' },
                  {
                    key: 'cod',
                    title: 'Cash on delivery',
                    note: codOffered ? `${delivery.codFeeBps / 100}% extra` : 'Not at this pincode',
                    off: !codOffered,
                  },
                ].map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    role="radio"
                    aria-checked={(o.key === 'cod') === cod}
                    disabled={o.off}
                    onClick={() => setPayment(o.key)}
                    className={`rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-45 ${
                      (o.key === 'cod') === cod ? 'border-gold-fill bg-gold-fill/10' : 'border-stroke bg-surface'
                    }`}
                  >
                    <span className="block text-meta font-semibold t-heading">{o.title}</span>
                    <span className="block text-micro t-faint">{o.note}</span>
                  </button>
                ))}
              </div>
              {overCap && (
                <p className="mt-2 text-micro text-live">
                  Cash on delivery is for orders up to ₹{rupees(delivery.codMaxPaise)}. Pay online for this one.
                </p>
              )}
            </div>
          )}



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
              lines={cart.map((l) => ({ product_id: l.id, qty: l.qty }))}
              payment={cod ? 'cod' : 'online'}
              label="Coupon or astrologer's code"
              hint="An astrologer's code gives you cashback in your wallet on your first prepaid order."
            />
          </div>

          {confirmClear && (
            <div role="alertdialog" aria-label="Clear the cart?" className="mt-5 rounded-2xl border border-live/40 bg-live/5 p-4">
              <p className="text-meta font-semibold t-heading">Clear your cart?</p>
              <p className="mt-1 text-meta t-sub">
                {cart.length === 1 ? 'The item is removed.' : `All ${cart.length} items are removed.`} Nothing has been
                charged.
              </p>
              <div className="mt-3 flex gap-2">
                <PopButton size="sm" onClick={() => setConfirmClear(false)} className="flex-1" full={false}>
                  Keep items
                </PopButton>
                <button
                  type="button"
                  onClick={() => {
                    clearCart()
                    setConfirmClear(false)
                  }}
                  className="flex-1 rounded-xl border-2 border-live bg-white px-3 py-2 caps-sm text-live transition-transform active:scale-95"
                >
                  Clear cart
                </button>
              </div>
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <PopButton size="sm" onClick={() => setConfirmClear(true)} disabled={confirmClear}>
              Clear
            </PopButton>
            {/* The amount is ON the button. A button that says only "Pay"
                is one somebody presses without reading the total above
                it — which is exactly how this went wrong. */}
            <PopButton
              size="sm"
              variant="gold"
              disabled={spending || !delivery || overCap}
              onClick={checkout}
            >
              {spending
                ? cod ? 'Placing…' : 'Paying…'
                : !delivery
                  ? 'Choose an address'
                  : cod
                    ? `Place order · ₹${rupees(totalPaise)} on delivery`
                    : `Pay ₹${rupees(totalPaise)}`}
            </PopButton>
          </div>

          <p className="mt-4 text-center text-meta t-faint">
            {cod
              ? 'Pay the courier in cash when the parcel arrives. Nothing is taken from your wallet. Stock is claimed when you place the order.'
              : 'Pay securely through Razorpay, delivery included. Your items are held for 15 minutes while you pay; close the payment and nothing is charged.'}
          </p>
        </>
      )}
    </Sheet>
  )
}
