import { Sheet } from './Chrome.jsx'
import Plate from './Plate.jsx'
import { PopButton } from './Pop.jsx'
import { useStore } from '../store.jsx'

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
    spend,
    spending,
  } = useStore()

  /* `spend` is a promise since phase 2. Without the await this reads as
     truthy every time and clears the cart on a payment the server refused. */
  const checkout = async () => {
    if (!cart.length) return
    if (await spend(cartTotal, `Order · ${cart.length} ${cart.length === 1 ? 'item' : 'items'}`)) {
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

          <div className="mt-5 flex gap-2">
            <PopButton size="sm" onClick={clearCart}>
              Clear
            </PopButton>
            <PopButton size="sm" variant="gold" disabled={spending} onClick={checkout}>
              {spending ? 'Paying…' : 'Pay from wallet'}
            </PopButton>
          </div>

          <p className="mt-4 text-center text-meta t-faint">
            The wallet is real. Nothing is shipped — fulfilment is phase 10.
          </p>
        </>
      )}
    </Sheet>
  )
}
