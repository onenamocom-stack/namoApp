import { useEffect, useState } from 'react'
import { TopBar } from '../components/Chrome.jsx'
import { PopCard } from '../components/Pop.jsx'
import { rupees, useStore } from '../store.jsx'
import { listMyOrders } from '../lib/shop.js'

/**
 * Your shop orders (phase 10). Read-only: cancelling a paid order or asking
 * for a return is a message to support until an admin console exists.
 *
 * One label per state, read off both columns. The order says whether it was
 * paid; the shipment says where the parcel is. Neither alone is the answer a
 * person wants — "paid" on a parcel that came back is not success.
 */
function label(o) {
  if (o.orderStatus === 'pending') return { text: 'Awaiting payment', tone: 't-faint' }
  if (o.orderStatus === 'cancelled') return { text: 'Cancelled · not charged', tone: 't-faint' }
  if (o.orderStatus === 'refunded') return { text: 'Refunded to wallet', tone: 't-faint' }
  return (
    {
      ready: { text: 'Paid · packing', tone: 'gold' },
      shipped: { text: 'Shipped', tone: 'gold' },
      delivered: { text: 'Delivered', tone: 'gold' },
      returned: { text: 'Returned', tone: 'text-live' },
      cancelled: { text: 'Cancelled', tone: 'text-live' },
    }[o.shipmentStatus] ?? { text: 'Paid', tone: 'gold' }
  )
}

export default function Orders() {
  const { session } = useStore()
  const [orders, setOrders] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!session) return
    let active = true
    listMyOrders()
      .then((rows) => active && setOrders(rows))
      .catch((err) => {
        console.error('[orders]', err.message)
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [session])

  return (
    <>
      <TopBar title="Your orders" back backTo="/profile" />

      <section className="space-y-3 px-4 py-5">
        {failed ? (
          <p className="py-12 text-center text-meta t-faint">Could not load your orders.</p>
        ) : orders === null ? (
          <p className="py-12 text-center text-meta t-faint">Loading…</p>
        ) : orders.length === 0 ? (
          <p className="py-12 text-center text-meta t-faint">No orders yet.</p>
        ) : (
          orders.map((o) => {
            const l = label(o)
            return (
              <PopCard key={o.id} className="p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className={`caps-sm ${l.tone}`}>{l.text}</p>
                  <p className="caps-sm t-faint tnum">
                    {new Date(o.createdAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>

                <ul className="mt-3 space-y-1">
                  {o.lines.map((i) => (
                    <li key={i.id} className="flex justify-between gap-3 text-meta">
                      <span className="t-heading">
                        {i.title}
                        {i.qty > 1 && <span className="t-faint"> × {i.qty}</span>}
                      </span>
                      <span className="tnum t-body">₹{rupees(i.unit_price_paise * i.qty)}</span>
                    </li>
                  ))}
                  <li className="flex justify-between gap-3 text-meta t-faint">
                    <span>Delivery</span>
                    <span className="tnum">
                      {o.shippingPaise ? `₹${rupees(o.shippingPaise)}` : 'Free'}
                    </span>
                  </li>
                </ul>

                <div className="mt-3 flex items-baseline justify-between border-t border-stroke pt-3">
                  <span className="caps-sm t-faint">Total</span>
                  <span className="text-body tnum t-heading">₹{rupees(o.totalPaise)}</span>
                </div>

                {o.awb && (
                  <p className="mt-2 text-meta t-body">
                    {o.courier ?? 'Courier'} · tracking <span className="tnum">{o.awb}</span>
                  </p>
                )}
                <p className="mt-2 text-meta t-faint">
                  To {o.address.name}, {o.address.city} {o.address.pincode}
                </p>
              </PopCard>
            )
          })
        )}
      </section>
    </>
  )
}
