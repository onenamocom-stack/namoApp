import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

/**
 * Namo Admin — shop orders (phase 13's first slice, docs/02-TRD.md §7).
 *
 * This app holds nothing elevated. It signs in with the same phone OTP as the
 * phone app and sends every request to the API's `/v1/admin/` (it was the
 * `admin` Edge Function until phase 10 moved onto Django), which checks
 * `admin_users` and the tier before touching anything and writes the audit
 * row. Hiding a button here is courtesy; the API is the gate.
 */

const SB_URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
// Ends in /v1, like the phone app's.
const API = import.meta.env.VITE_DJANGO_API_URL
// The project 1namo.com reads from since 21 Sep (HANDOFF §16) — named
// namo-dev, and production all the same. The banner keys on the ref.
const IS_PROD = (SB_URL ?? '').includes('usgzgrdxlzgnehtbebzo')
const supabase = SB_URL && KEY ? createClient(SB_URL, KEY) : null

const TIERS = ['support', 'fulfilment', 'finance', 'superadmin']
const can = (tier, needs) => TIERS.indexOf(tier) >= TIERS.indexOf(needs)
const POLL_MS = 30_000

function rupees(paise) {
  const d = paise % 100 === 0 ? 0 : 2
  return '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d })
}

const when = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—'

async function call(body) {
  const { data } = await supabase.auth.getSession()
  try {
    const response = await fetch(`${API}/admin/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.session?.access_token ?? ''}`,
      },
      body: JSON.stringify(body),
    })
    // Refusals are `{ ok: false, reason }` at their own status; the body is the answer.
    return (await response.json()) ?? { ok: false, reason: 'Empty answer from the API.' }
  } catch {
    return { ok: false, reason: 'Could not reach the API.' }
  }
}

/** One bucket per row, from both columns: the order says paid, the shipment says where. */
function bucket(row) {
  if (row.order.status === 'pending') return 'awaiting'
  if (row.order.status !== 'paid') return 'closed'
  return { ready: 'toship', shipped: 'shipped', delivered: 'delivered' }[row.status] ?? 'closed'
}

const TABS = [
  ['toship', 'To ship'],
  ['shipped', 'Shipped'],
  ['delivered', 'Delivered'],
  ['awaiting', 'Awaiting payment'],
  ['closed', 'Cancelled / refunded'],
  ['all', 'All'],
]

export default function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!supabase) return setReady(true)
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  return (
    <>
      <header className={`env ${IS_PROD ? 'env-prod' : 'env-dev'}`}>
        <strong>Namo Admin</strong>
        <span className="badge">{IS_PROD ? 'PRODUCTION — real orders, real money' : 'DEV'}</span>
        <span className="muted">{SB_URL ?? 'no env file'}</span>
      </header>
      <main>
        {!supabase ? (
          <p className="error">
            Missing env. Copy <code>admin/.env.example</code> to <code>admin/.env.dev.local</code> or{' '}
            <code>admin/.env.prod.local</code>.
          </p>
        ) : !ready ? (
          <p className="muted">Loading…</p>
        ) : session ? (
          <Console />
        ) : (
          <SignIn />
        )}
      </main>
    </>
  )
}

function SignIn() {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const e164 = '+91' + phone.replace(/\D/g, '').slice(-10)

  const send = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    // Never creates an account: an admin is somebody who already signed up.
    const { error } = await supabase.auth.signInWithOtp({ phone: e164, options: { shouldCreateUser: false } })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  const verify = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({ phone: e164, token: code.trim(), type: 'sms' })
    setBusy(false)
    if (error) setError(error.message)
  }

  return (
    <form className="card signin" onSubmit={sent ? verify : send}>
      <h1>Sign in</h1>
      <label>
        Phone
        <div className="row">
          <span className="muted">+91</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="numeric"
            placeholder="10-digit mobile"
            disabled={sent}
            required
          />
        </div>
      </label>
      {sent && (
        <label>
          Code
          <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoFocus required />
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy}>
        {busy ? '…' : sent ? 'Verify' : 'Send code'}
      </button>
    </form>
  )
}

function Console() {
  const [me, setMe] = useState(null)
  const [denied, setDenied] = useState(null)
  const [rows, setRows] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [tab, setTab] = useState('toship')
  const [section, setSection] = useState('shop')
  const [updatedAt, setUpdatedAt] = useState(null)
  const seen = useRef(null)
  const [fresh, setFresh] = useState(new Set())

  useEffect(() => {
    call({ action: 'whoami' }).then((r) => (r?.ok ? setMe(r) : setDenied(r?.reason ?? 'Not an admin.')))
  }, [])

  const load = useCallback(async () => {
    const r = await call({ action: 'shop.orders' })
    if (!r?.ok) return setLoadError(r?.reason ?? 'Could not load orders.')
    setLoadError(null)
    // Mark orders that were not there on the previous poll. The first load
    // marks nothing — everything is "new" to a console that just opened.
    const ids = new Set(r.orders.map((o) => o.order.id))
    if (seen.current) setFresh(new Set([...ids].filter((id) => !seen.current.has(id))))
    seen.current = ids
    setRows(r.orders)
    setUpdatedAt(new Date())
  }, [])

  useEffect(() => {
    if (!me) return
    load()
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [me, load])

  const counts = useMemo(() => {
    const c = { all: rows?.length ?? 0 }
    for (const r of rows ?? []) c[bucket(r)] = (c[bucket(r)] ?? 0) + 1
    return c
  }, [rows])

  useEffect(() => {
    document.title = counts.toship ? `(${counts.toship}) to ship — Namo Admin` : 'Namo Admin'
  }, [counts.toship])

  if (denied)
    return (
      <div className="card">
        <p className="error">{denied}</p>
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    )
  if (!me) return <p className="muted">Checking access…</p>

  const shown = (rows ?? []).filter((r) => tab === 'all' || bucket(r) === tab)

  return (
    <>
      <div className="toolbar">
        <nav className="tabs">
          <button className={section === 'shop' ? 'active' : ''} onClick={() => setSection('shop')}>
            Shop orders
          </button>
          <button className={section === 'academy' ? 'active' : ''} onClick={() => setSection('academy')}>
            Academy
          </button>
        </nav>
        <span className="muted">
          {me.name ?? 'Admin'} · {me.tier}
        </span>
        <span className="spacer" />
        <span className="muted">
          {updatedAt ? `Updated ${updatedAt.toLocaleTimeString('en-IN')} · refreshes every 30 s` : 'Loading…'}
        </span>
        <button onClick={load}>Refresh</button>
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>

      {section === 'academy' ? (
        <Academy tier={me.tier} />
      ) : (
        <>
      {fresh.size > 0 && <p className="notice">{fresh.size} new order{fresh.size > 1 ? 's' : ''} since the last refresh.</p>}
      {loadError && <p className="error">{loadError}</p>}

      {/* Suggestions for the courier field. Any name is accepted. */}
      <datalist id="couriers">
        {['Delhivery', 'Blue Dart', 'DTDC', 'Ekart', 'Xpressbees', 'India Post', 'Shadowfax'].map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <nav className="tabs">
        {TABS.map(([key, label]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            {label} <span className="count">{counts[key] ?? 0}</span>
          </button>
        ))}
      </nav>

      {rows === null ? (
        <p className="muted">Loading orders…</p>
      ) : shown.length === 0 ? (
        <p className="muted">Nothing here.</p>
      ) : (
        <div className="orders">
          {shown.map((r) => (
            <OrderCard key={r.order.id} row={r} tier={me.tier} fresh={fresh.has(r.order.id)} onChanged={load} />
          ))}
        </div>
      )}
        </>
      )}
    </>
  )
}

function OrderCard({ row, tier, fresh, onChanged }) {
  const o = row.order
  const a = row.address
  const lines = o.order_items.filter((i) => i.item_type === 'product')
  const b = bucket(row)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [courier, setCourier] = useState('')
  const [awb, setAwb] = useState('')
  const [refunding, setRefunding] = useState(false)
  const [reason, setReason] = useState('')
  const [restock, setRestock] = useState(false)

  const act = async (body, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(true)
    setError(null)
    const r = await call({ ...body, order_id: o.id })
    setBusy(false)
    if (!r?.ok) return setError(r?.reason ?? 'That did not work.')
    setRefunding(false)
    onChanged()
  }

  const addressText = [a.name, a.phone, a.line1, a.line2, `${a.city}, ${a.state} ${a.pincode}`]
    .filter(Boolean)
    .join('\n')

  return (
    <article className={`card order ${fresh ? 'fresh' : ''}`}>
      <div className="order-head">
        <span className={`status s-${b}`}>{TABS.find(([k]) => k === b)?.[1]}</span>
        {fresh && <span className="new">NEW</span>}
        <strong>{rupees(o.total_paise)}</strong>
        <span className="muted">{when(o.created_at)}</span>
        <span className="spacer" />
        <code className="muted" title={o.id}>
          #{o.id.slice(0, 8)}
        </code>
      </div>

      <div className="order-body">
        <div>
          <h3>Items</h3>
          <ul>
            {lines.map((i) => (
              <li key={i.id}>
                {i.qty} × {i.title} <span className="muted">· {rupees(i.unit_price_paise * i.qty)}</span>
              </li>
            ))}
            <li className="muted">
              Delivery · {row.shipping_paise ? rupees(row.shipping_paise) : 'free'} · {row.weight_grams} g
            </li>
          </ul>
          <p className="muted">
            Buyer account: {o.profiles?.name ?? '—'} · {o.profiles?.phone ?? '—'}
          </p>
        </div>

        <div>
          <h3>
            Ship to{' '}
            <button className="link" onClick={() => navigator.clipboard?.writeText(addressText)}>
              copy
            </button>
          </h3>
          <pre className="address">{addressText}</pre>
          {row.awb && (
            <p>
              {row.courier ?? 'Courier'} · <code>{row.awb}</code>
              <br />
              <span className="muted">
                Shipped {when(row.shipped_at)}
                {row.delivered_at ? ` · delivered ${when(row.delivered_at)}` : ''}
              </span>
            </p>
          )}
        </div>

        <div className="actions">
          {b === 'toship' && can(tier, 'fulfilment') && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                act({ action: 'shop.ship', courier, awb })
              }}
            >
              <input list="couriers" placeholder="Courier" value={courier} onChange={(e) => setCourier(e.target.value)} />
              <input placeholder="Tracking / AWB" value={awb} onChange={(e) => setAwb(e.target.value)} required />
              <button className="primary" disabled={busy}>
                Mark shipped
              </button>
            </form>
          )}
          {b === 'shipped' && can(tier, 'fulfilment') && (
            <button className="primary" disabled={busy} onClick={() => act({ action: 'shop.deliver' })}>
              Mark delivered
            </button>
          )}
          {o.status === 'paid' && can(tier, 'finance') && !refunding && (
            <button className="danger-outline" disabled={busy} onClick={() => setRefunding(true)}>
              Refund…
            </button>
          )}
          {refunding && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                act(
                  { action: 'shop.refund', reason, restock },
                  `Refund ${rupees(o.total_paise)} to the buyer's wallet?${restock ? ' Stock will be put back.' : ''}`,
                )
              }}
            >
              <input placeholder="Reason (the buyer may ask)" value={reason} onChange={(e) => setReason(e.target.value)} required />
              <label className="check">
                <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> Put stock back
              </label>
              <button className="danger" disabled={busy}>
                Refund {rupees(o.total_paise)}
              </button>
              <button type="button" onClick={() => setRefunding(false)}>
                Cancel
              </button>
            </form>
          )}
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    </article>
  )
}

/**
 * The Academy (phase 10b): events with their seats, and every enrolment.
 * Refunding an enrolment pays the wallet back and removes access; cancelling
 * an event refunds every paid seat at once. Both write their audit row in the
 * same transaction (031), and the function checks the tier again.
 */
function Academy({ tier }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const r = await call({ action: 'academy.list' })
    if (!r?.ok) return setError(r?.reason ?? 'Could not load the Academy.')
    setError(null)
    setData(r)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Loading the Academy…</p>

  const titles = new Map([...data.courses, ...data.events].map((x) => [x.id, x.title]))
  const counts = {}
  for (const e of data.enrolments) {
    if (e.status === 'active') counts[e.item_id] = (counts[e.item_id] ?? 0) + 1
  }

  return (
    <>
      <div className="toolbar">
        <h1>Events</h1>
        <span className="spacer" />
        <button onClick={load}>Refresh</button>
      </div>
      {data.events.length === 0 ? (
        <p className="muted">No events.</p>
      ) : (
        <div className="orders">
          {data.events.map((ev) => (
            <EventCard key={ev.id} ev={ev} enrolled={counts[ev.id] ?? 0} tier={tier} onChanged={load} />
          ))}
        </div>
      )}

      <div className="toolbar">
        <h1>Enrolments</h1>
        <span className="muted">newest 300</span>
      </div>
      {data.enrolments.length === 0 ? (
        <p className="muted">Nobody has enrolled yet.</p>
      ) : (
        <div className="orders">
          {data.enrolments.map((en) => (
            <EnrolmentRow key={en.id} en={en} title={titles.get(en.item_id) ?? '(removed)'} tier={tier} onChanged={load} />
          ))}
        </div>
      )}
    </>
  )
}

function EventCard({ ev, enrolled, tier, onChanged }) {
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  const cancel = async (e) => {
    e.preventDefault()
    if (!window.confirm(`Cancel "${ev.title}"? Every paid seat is refunded to the wallet. This cannot be undone.`)) return
    setBusy(true)
    const r = await call({ action: 'academy.cancel_event', event_id: ev.id, reason })
    setBusy(false)
    if (!r?.ok) return setResult(r?.reason ?? 'That did not work.')
    setResult(`Cancelled · ${r.refunded} refunded (${rupees(r.amount_paise)}) · ${r.free_cancelled} free · ${r.pending_released} unpaid released`)
    setCancelling(false)
    onChanged()
  }

  return (
    <article className="card order">
      <div className="order-head">
        <span className={`status ${ev.status === 'cancelled' ? 's-closed' : 's-toship'}`}>
          {ev.status === 'cancelled' ? 'Cancelled' : ev.kind}
        </span>
        <strong>{ev.title}</strong>
        <span className="muted">{when(ev.starts_at)}</span>
        <span className="spacer" />
        <span className="muted">
          {ev.price_paise ? rupees(ev.price_paise) : 'Free'} · {ev.seats - ev.seats_left}/{ev.seats} seats ·{' '}
          {enrolled} enrolled{ev.active ? '' : ' · hidden'}
        </span>
      </div>
      <div className="actions">
        {ev.status === 'scheduled' && can(tier, 'finance') && !cancelling && (
          <button className="danger-outline" onClick={() => setCancelling(true)}>
            Cancel event…
          </button>
        )}
        {cancelling && (
          <form onSubmit={cancel}>
            <input placeholder="Reason (everyone enrolled will ask)" value={reason} onChange={(e) => setReason(e.target.value)} required />
            <button className="danger" disabled={busy}>
              Cancel and refund
            </button>
            <button type="button" onClick={() => setCancelling(false)}>
              Keep it
            </button>
          </form>
        )}
        {result && <p className="muted">{result}</p>}
      </div>
    </article>
  )
}

function EnrolmentRow({ en, title, tier, onChanged }) {
  const [refunding, setRefunding] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const o = en.orders

  const refund = async (e) => {
    e.preventDefault()
    if (!window.confirm(`Refund ${rupees(o.total_paise)} to the buyer's wallet and remove their access?`)) return
    setBusy(true)
    const r = await call({ action: 'academy.refund', order_id: o.id, reason })
    setBusy(false)
    if (!r?.ok) return setError(r?.reason ?? 'That did not work.')
    setRefunding(false)
    onChanged()
  }

  return (
    <article className="card order">
      <div className="order-head">
        <span className={`status ${en.status === 'active' ? 's-delivered' : en.status === 'pending' ? 's-awaiting' : 's-closed'}`}>
          {en.status}
        </span>
        <strong>{title}</strong>
        <span className="muted">
          {en.item_type} · {o ? rupees(o.total_paise) : 'free'} · {en.profiles?.name ?? '—'} · {en.profiles?.phone ?? '—'}
        </span>
        <span className="spacer" />
        <span className="muted">{when(en.created_at)}</span>
      </div>
      {o?.status === 'paid' && en.status === 'active' && can(tier, 'finance') && (
        <div className="actions">
          {!refunding ? (
            <button className="danger-outline" onClick={() => setRefunding(true)}>
              Refund…
            </button>
          ) : (
            <form onSubmit={refund}>
              <input placeholder="Reason (the buyer may ask)" value={reason} onChange={(e) => setReason(e.target.value)} required />
              <button className="danger" disabled={busy}>
                Refund {rupees(o.total_paise)}
              </button>
              <button type="button" onClick={() => setRefunding(false)}>
                Cancel
              </button>
            </form>
          )}
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </article>
  )
}
