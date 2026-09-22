import { useEffect, useState } from 'react'
import { Sheet } from './Chrome.jsx'
import Plate from './Plate.jsx'
import { PopButton } from './Pop.jsx'
import { rupees, useStore } from '../store.jsx'
import { listAddresses, quoteDelivery, saveAddress } from '../lib/shop.js'

/**
 * Cart and checkout, one sheet, three steps: the cart, where it goes and how
 * it is paid, and the receipt.
 *
 * Every total on this sheet is a PREVIEW built from display prices and the
 * delivery quote. The server prices the order from its own rows (028), so a
 * number here that has drifted from the catalogue is refused at checkout, not
 * charged.
 */
export default function CartSheet() {
  const {
    cartOpen,
    setCartOpen,
    cart,
    cartTotalPaise,
    setQty,
    removeFromCart,
    clearCart,
    placeOrder,
    spending,
    session,
    balance,
    showToast,
  } = useStore()

  const [step, setStep] = useState('cart')
  const [done, setDone] = useState(null)

  const close = () => {
    setCartOpen(false)
    if (step === 'done') setStep('cart')
  }

  return (
    <Sheet open={cartOpen} onClose={close} title={step === 'done' ? 'Order placed' : 'Your cart'}>
      {step === 'done' ? (
        <Receipt result={done} onClose={close} />
      ) : cart.length === 0 ? (
        <>
          <p className="py-8 text-center text-meta t-faint">Nothing in the cart yet.</p>
          <PopButton size="sm" onClick={close}>
            Keep browsing
          </PopButton>
        </>
      ) : (
        <>
          <ul>
            {cart.map((l) => (
              <li key={l.id} className="flex items-center gap-3 border-b border-rule py-3">
                <Plate seed={l.id} className="h-14 w-14 flex-none">
                  {l.imageUrl && (
                <img src={l.imageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
              )}
                </Plate>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-meta t-heading">{l.name}</p>
                  <p className="mt-1 caps-sm t-faint tnum">₹{rupees(l.pricePaise)} each</p>
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
                    disabled={l.qty >= Math.min(10, l.stock)}
                    aria-label={`More ${l.name}`}
                    className="caps-sm h-8 w-8 rounded-full border border-stroke bg-surface shadow-sm t-body transition-transform active:scale-90 disabled:opacity-40"
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

          {step === 'cart' ? (
            <>
              <div className="mt-6 flex items-baseline justify-between border-t border-stroke pt-4">
                <span className="caps-sm t-faint">Items</span>
                <span className="text-lead tnum t-heading">₹{rupees(cartTotalPaise)}</span>
              </div>
              <p className="mt-1 text-right caps-sm t-faint">Delivery priced at the next step</p>

              <div className="mt-5 flex gap-2">
                <PopButton size="sm" onClick={clearCart}>
                  Clear
                </PopButton>
                <PopButton
                  size="sm"
                  variant="gold"
                  onClick={() =>
                    session ? setStep('deliver') : showToast('Sign in to place an order.')
                  }
                >
                  Checkout
                </PopButton>
              </div>
            </>
          ) : (
            <Deliver
              cart={cart}
              itemsPaise={cartTotalPaise}
              balance={balance}
              spending={spending}
              onBack={() => setStep('cart')}
              onPay={async (addressId, quoteId, pay) => {
                const res = await placeOrder(addressId, quoteId, pay)
                if (!res.ok) {
                  showToast(res.reason)
                  return false
                }
                clearCart()
                setDone(res)
                setStep('done')
                return true
              }}
            />
          )}
        </>
      )}
    </Sheet>
  )
}

/** Address, delivery price, and the two ways to pay. */
function Deliver({ cart, itemsPaise, balance, spending, onBack, onPay }) {
  const [addresses, setAddresses] = useState(null)
  const [addressId, setAddressId] = useState(null)
  const [adding, setAdding] = useState(false)
  const [quote, setQuote] = useState({ status: 'idle' })

  useEffect(() => {
    let active = true
    listAddresses()
      .then((rows) => {
        if (!active) return
        setAddresses(rows)
        setAddressId(rows[0]?.id ?? null)
        setAdding(rows.length === 0)
      })
      .catch((err) => {
        console.error('[shop] addresses:', err.message)
        if (active) setAddresses([])
      })
    return () => {
      active = false
    }
  }, [])

  // A quote is for one address and one cart. Either changing asks again.
  const cartKey = cart.map((l) => `${l.id}:${l.qty}`).join(',')
  useEffect(() => {
    if (!addressId) return
    let active = true
    setQuote({ status: 'loading' })
    quoteDelivery(cart, addressId).then((res) => {
      if (!active) return
      setQuote(res?.ok ? { status: 'ready', ...res } : { status: 'error', reason: res?.reason })
    })
    return () => {
      active = false
    }
    // `cart` is read through `cartKey`; the array itself is a new object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressId, cartKey])

  const totalPaise = quote.status === 'ready' ? itemsPaise + quote.amount_paise : null
  const ready = totalPaise !== null && !spending

  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between">
        <p className="caps-sm t-faint">Deliver to</p>
        <button type="button" onClick={onBack} className="caps-sm gold">
          Back to cart
        </button>
      </div>

      {addresses === null ? (
        <p className="py-4 text-meta t-faint">Loading your addresses…</p>
      ) : (
        <>
          <ul className="mt-2 space-y-2">
            {addresses.map((a) => (
              <li key={a.id}>
                <label className="pop-inset flex cursor-pointer gap-3 p-3">
                  <input
                    type="radio"
                    name="address"
                    checked={addressId === a.id}
                    onChange={() => setAddressId(a.id)}
                    className="mt-1"
                  />
                  <span className="text-meta t-body">
                    <span className="t-heading">{a.name}</span> · {a.phone}
                    <br />
                    {a.line1}
                    {a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state} {a.pincode}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {adding ? (
            <AddressForm
              onCancel={addresses.length ? () => setAdding(false) : null}
              onSaved={(row) => {
                setAddresses((list) => [row, ...list])
                setAddressId(row.id)
                setAdding(false)
              }}
            />
          ) : (
            <button type="button" onClick={() => setAdding(true)} className="mt-3 caps-sm gold">
              + Add an address
            </button>
          )}
        </>
      )}

      {addressId && (
        <div className="mt-6 space-y-2 border-t border-stroke pt-4 tnum">
          <Line label="Items" value={`₹${rupees(itemsPaise)}`} />
          <Line
            label={
              quote.status === 'ready' && quote.courier ? `Delivery · ${quote.courier}` : 'Delivery'
            }
            value={
              quote.status === 'ready'
                ? quote.amount_paise === 0
                  ? 'Free'
                  : `₹${rupees(quote.amount_paise)}`
                : quote.status === 'loading'
                  ? '…'
                  : '—'
            }
          />
          {quote.status === 'ready' && quote.etd_days && (
            <p className="text-right caps-sm t-faint">Arrives in about {quote.etd_days} days</p>
          )}
          {quote.status === 'error' && (
            <p className="text-meta text-live">{quote.reason ?? 'Could not price delivery.'}</p>
          )}
          <div className="flex items-baseline justify-between pt-2">
            <span className="caps-sm t-faint">Total · GST included</span>
            <span className="text-lead t-heading">
              {totalPaise === null ? '—' : `₹${rupees(totalPaise)}`}
            </span>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-2">
        <PopButton
          size="sm"
          variant="gold"
          disabled={!ready}
          onClick={() => onPay(addressId, quote.quote_id, 'wallet')}
        >
          {spending ? 'Placing order…' : `Pay from wallet · ₹${balance === null ? '—' : rupees(balance)}`}
        </PopButton>
        <PopButton
          size="sm"
          disabled={!ready}
          onClick={() => onPay(addressId, quote.quote_id, 'razorpay')}
        >
          Pay by card or UPI
        </PopButton>
      </div>
    </section>
  )
}

function Line({ label, value }) {
  return (
    <div className="flex items-baseline justify-between text-meta">
      <span className="t-faint">{label}</span>
      <span className="t-heading">{value}</span>
    </div>
  )
}

const FIELD =
  'w-full rounded-lg border border-stroke bg-surface px-3 py-2 text-body placeholder-t-faint focus:border-ink focus:outline-none'

function AddressForm({ onSaved, onCancel }) {
  const [f, setF] = useState({ name: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      onSaved(await saveAddress({ ...f, line2: f.line2 || null }))
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      <input required maxLength={80} placeholder="Full name" value={f.name} onChange={set('name')} className={FIELD} />
      <input
        required
        inputMode="numeric"
        pattern="[6-9][0-9]{9}"
        title="Ten digits, starting 6 to 9"
        placeholder="Mobile number"
        value={f.phone}
        onChange={set('phone')}
        className={FIELD}
      />
      <input required maxLength={200} placeholder="House, street" value={f.line1} onChange={set('line1')} className={FIELD} />
      <input maxLength={200} placeholder="Area, landmark (optional)" value={f.line2} onChange={set('line2')} className={FIELD} />
      <div className="flex gap-2">
        <input required maxLength={80} placeholder="City" value={f.city} onChange={set('city')} className={FIELD} />
        <input required maxLength={80} placeholder="State" value={f.state} onChange={set('state')} className={FIELD} />
      </div>
      <input
        required
        inputMode="numeric"
        pattern="[1-9][0-9]{5}"
        title="Six-digit pincode"
        placeholder="Pincode"
        value={f.pincode}
        onChange={set('pincode')}
        className={FIELD}
      />
      {error && <p className="text-meta text-live">{error}</p>}
      <div className="flex gap-2">
        {onCancel && (
          <PopButton size="sm" type="button" onClick={onCancel}>
            Cancel
          </PopButton>
        )}
        <PopButton size="sm" variant="gold" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save address'}
        </PopButton>
      </div>
    </form>
  )
}

function Receipt({ result, onClose }) {
  return (
    <>
      <p className="text-body t-heading">
        {result?.settling
          ? 'Your payment went through and the order is being confirmed. It will show as paid in a moment.'
          : 'Paid. Track it under Your orders once it ships.'}
      </p>
      <div className="mt-6 flex gap-2">
        <PopButton size="sm" onClick={onClose}>
          Keep browsing
        </PopButton>
        <PopButton size="sm" variant="gold" to="/orders" onClick={onClose}>
          Your orders
        </PopButton>
      </div>
    </>
  )
}
