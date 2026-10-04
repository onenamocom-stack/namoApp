import { Loader } from '../components/Cosmos.jsx'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchOrders } from '../lib/shop.js'
import { TopBar } from '../components/Chrome.jsx'
import { Button } from '../components/Primitives.jsx'
import { rupees, useStore } from '../store.jsx'

/**
 * What you have bought.
 *
 * THERE WAS NO SUCH SCREEN UNTIL TODAY. An order left no trace anywhere
 * a seeker could see it: a mis-tap that charged ₹890 and the refund that
 * put it back were both invisible to the person they happened to, and
 * the only proof either had occurred was in the database.
 *
 * WHAT EACH ORDER SAYS, in the order somebody asks it:
 *
 *   what it was     the items, because that is how an order is recognised
 *   where it is     not "paid" — paid is the least interesting true thing
 *                   about a parcel. Shipped, delivered, on its way.
 *   what it cost    and what came back, if anything came back
 *   what it earned  only when it earned something
 *
 * THE CASHBACK LINE IS ABSENT, NOT ZERO, on an order that earned none.
 * A line that exists only to say a thing did not happen makes every
 * order look like it was supposed to.
 */
export default function Orders() {
  const { session, sessionReady, t } = useStore()
  const [orders, setOrders] = useState(null)

  useEffect(() => {
    if (!sessionReady) return undefined
    let alive = true
    fetchOrders().then((rows) => alive && setOrders(rows))
    return () => {
      alive = false
    }
  }, [sessionReady, session])

  return (
    <>
      <TopBar title={t('prof.orders')} sub={t('ord.sub')} back backTo="/profile" />

      {orders === null && <Loader label={t('ord.loading')} />}

      {orders?.length === 0 && (
        <div className="px-5 py-10 text-center">
          <p className="prose-c">{t('ord.empty')}</p>
          <Button to="/shop" variant="quiet" className="mt-6">
            {t('ord.toShop')}
          </Button>
        </div>
      )}

      <ul className="section-tight">
        {(orders ?? []).map((o) => (
          <li key={o.id} className="border-b border-rule py-5 last:border-b-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="caps-sm t-faint tnum">{placed(o.placedAt)}</span>
              <span className={`caps-sm ${toneOf(o)}`}>{whereItIs(o, t)}</span>
            </div>

            <ul className="mt-3 space-y-1">
              {o.items.map((i, n) => (
                <li key={n} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-body text-t1">
                    {i.qty > 1 && <span className="t-faint tnum">{i.qty} × </span>}
                    {i.title}
                  </span>
                  <span className="flex-none text-meta t-sub tnum">
                    ₹{rupees(i.unitPricePaise * i.qty)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-rule pt-3">
              <span className="caps-sm t-faint">
                {o.status === 'refunded' || o.status === 'cancelled' ? t('ord.moneyBack') : t('ord.paid')}
              </span>
              <span className="text-meta t-heading tnum">₹{rupees(o.totalPaise)}</span>
            </div>

            {/* Only when there is one. */}
            {o.cashback && (
              <p className={`mt-2 text-micro ${cashbackTone(o.cashback)}`}>
                {cashbackLine(o.cashback, t)}
              </p>
            )}

            {/* The tracking number, once there is a parcel to track. */}
            {o.shipment?.awb && (
              <p className="mt-2 text-micro t-faint">
                {o.shipment.courier || t('ord.courier')} · {o.shipment.awb}
              </p>
            )}
          </li>
        ))}
      </ul>

      {orders?.length > 0 && (
        <p className="px-5 pb-8 pt-2 text-micro t-faint">
          {t('ord.notOrders')}{' '}
          <Link to="/wallet" className="underline">
            {t('ord.wallet')}
          </Link>
          {t('ord.notOrdersEnd')}
        </p>
      )}

      <div className="h-8" />
    </>
  )
}

/** "Paid" is the least interesting true thing about a parcel. */
function whereItIs(order, t) {
  if (order.status === 'cancelled') return t('ord.st.cancelled')
  if (order.status === 'refunded') return t('ord.st.refunded')
  const shipped = order.shipment?.status
  if (shipped === 'delivered') return t('ord.st.delivered')
  if (shipped === 'shipped') return t('ord.st.shipped')
  if (shipped === 'returned') return t('ord.st.returned')
  if (shipped === 'ready') return t('ord.st.packed')
  return t('ord.st.confirmed')
}

function toneOf(order) {
  if (order.status === 'cancelled' || order.status === 'refunded') return 't-faint'
  if (order.shipment?.status === 'delivered') return 'text-ok'
  return 'gold'
}

/**
 * Four states, and they must not read alike — "coming" and "arrived" are
 * the two a person actually distinguishes.
 */
function cashbackLine(cashback, t) {
  const amount = `₹${rupees(cashback.amount_paise)}`
  if (cashback.status === 'paid') return t('ord.cb.paid', { amount })
  if (cashback.status === 'cancelled') {
    return t('ord.cb.cancelled', { amount })
  }
  if (cashback.matures_at) {
    return t('ord.cb.on', { amount, day: onDay(cashback.matures_at, t) })
  }
  return t('ord.cb.later', { amount })
}

function cashbackTone(cashback) {
  if (cashback.status === 'paid') return 'text-ok'
  if (cashback.status === 'cancelled') return 't-faint'
  return 't-sub'
}

function placed(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function onDay(iso, t) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return t('ord.delivery')
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
