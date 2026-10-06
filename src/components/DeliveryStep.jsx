import { useEffect, useRef, useState } from 'react'
import { deleteAddress, deliveryQuote, fetchAddresses, lookupPincode, saveAddress } from '../lib/shop.js'
import { rupees } from '../store.jsx'
import { PopButton } from './Pop.jsx'

/**
 * Where the parcel goes, and what sending it costs (5 Oct 2026).
 *
 * The seeker picks a saved address or adds one; the courier's rate for
 * that pincode comes back from the server as a quote, and the cart adds
 * it to the total. The amount shown is the server's and Buy names only
 * the quote — nothing here can change what is charged.
 *
 * `lines` is the cart as [{product_id, qty}]; a change of quantity is a
 * change of weight, so it asks again. `nonce` lets the cart ask again
 * after a refused payment (a quote lives 30 minutes).
 */
const LAST = 'namo:address'
const EMPTY = { name: '', phone: '', pincode: '', line1: '', line2: '', city: '', state: '' }

export default function DeliveryStep({ lines, nonce = 0, onQuote }) {
  const [addresses, setAddresses] = useState(null)
  const [chosen, setChosen] = useState(null)
  const [adding, setAdding] = useState(false)
  const [quote, setQuote] = useState(null)
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    let live = true
    fetchAddresses()
      .then((rows) => {
        if (!live) return
        setAddresses(rows)
        let last = null
        try {
          last = localStorage.getItem(LAST)
        } catch {
          /* blocked storage: the newest address is chosen instead */
        }
        const pick = rows.find((a) => a.id === last) || rows[0]
        setChosen(pick?.id ?? null)
        setAdding(rows.length === 0)
      })
      .catch(() => live && setAddresses([]))
    return () => {
      live = false
    }
  }, [])

  const key = JSON.stringify(lines)
  useEffect(() => {
    if (!chosen || !lines.length) {
      setQuote(null)
      onQuote(null)
      return undefined
    }
    let live = true
    setAsking(true)
    setQuote(null)
    onQuote(null)
    deliveryQuote(chosen, lines)
      .then((q) => {
        if (!live) return
        setQuote(q)
        onQuote(
          q?.ok
            ? {
                addressId: chosen,
                quoteId: q.quote_id,
                amountPaise: q.amount_paise,
                codAvailable: !!q.cod_available,
                codFeeBps: q.cod_fee_bps ?? 200,
                codMaxPaise: q.cod_max_paise ?? null,
              }
            : null,
        )
      })
      .catch((err) => live && setQuote({ ok: false, reason: err.message }))
      .finally(() => live && setAsking(false))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, key, nonce])

  function choose(id) {
    setChosen(id)
    try {
      localStorage.setItem(LAST, id)
    } catch {
      /* fine without it */
    }
  }

  async function remove(id) {
    await deleteAddress(id).catch(() => null)
    const rest = (addresses ?? []).filter((a) => a.id !== id)
    setAddresses(rest)
    if (chosen === id) setChosen(rest[0]?.id ?? null)
    if (!rest.length) setAdding(true)
  }

  if (addresses === null) {
    return <p className="py-3 text-meta t-faint">Loading your addresses…</p>
  }

  return (
    <section className="mt-6">
      <p className="text-meta font-semibold t-heading">Deliver to</p>

      {!adding && (
        <ul className="mt-2 space-y-2">
          {addresses.map((a) => {
            const on = a.id === chosen
            return (
              <li key={a.id}>
                <div
                  className={`flex items-start gap-3 rounded-2xl border p-3 transition-colors ${
                    on ? 'border-gold bg-gold/10' : 'border-rule bg-surface'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => choose(a.id)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    aria-pressed={on}
                  >
                    <span
                      className={`mt-1 inline-flex h-4 w-4 flex-none items-center justify-center rounded-full border-2 ${
                        on ? 'border-gold' : 'border-t4'
                      }`}
                    >
                      {on && <span className="h-2 w-2 rounded-full bg-gold" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-meta font-semibold t-heading">
                        {a.name} · <span className="tnum">{a.phone}</span>
                      </span>
                      <span className="mt-0.5 block text-meta t-sub">
                        {a.line1}
                        {a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state}{' '}
                        <span className="tnum">{a.pincode}</span>
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(a.id)}
                    className="flex-none text-micro font-semibold t-faint"
                    aria-label={`Remove the address for ${a.name}`}
                  >
                    Remove
                  </button>
                </div>
              </li>
            )
          })}
          <li>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="w-full rounded-2xl border border-dashed border-stroke p-3 text-meta font-semibold text-gold"
            >
              + Add a new address
            </button>
          </li>
        </ul>
      )}

      {adding && (
        <AddressForm
          canCancel={addresses.length > 0}
          onCancel={() => setAdding(false)}
          onSaved={(row) => {
            setAddresses([row, ...addresses])
            choose(row.id)
            setAdding(false)
          }}
        />
      )}

      {!adding && chosen && (
        <p className={`mt-3 text-meta ${quote && !quote.ok ? 'text-live' : 't-sub'}`}>
          {asking || !quote
            ? 'Checking delivery to this pincode…'
            : quote.ok
              ? `Delivery ₹${rupees(quote.amount_paise)}${
                  quote.etd_days ? ` · arrives in about ${quote.etd_days} days` : ''
                }`
              : quote.reason}
        </p>
      )}
    </section>
  )
}

function AddressForm({ onSaved, onCancel, canCancel }) {
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  /* The pincode comes first and fills the rest (6 Oct 2026): six digits in,
     city and state filled, and the areas that pincode covers offered as
     one-tap choices for "Area". A city or state the person typed is never
     overwritten; one this form filled follows a changed pincode. */
  const [lookup, setLookup] = useState({ state: 'idle', areas: [] })
  const filled = useRef({ city: '', state: '' })
  useEffect(() => {
    if (!/^[1-9][0-9]{5}$/.test(form.pincode)) {
      setLookup({ state: 'idle', areas: [] })
      return undefined
    }
    let live = true
    setLookup({ state: 'finding', areas: [] })
    lookupPincode(form.pincode).then((place) => {
      if (!live) return
      if (!place) {
        setLookup({ state: 'unknown', areas: [] })
        return
      }
      setForm((f) => {
        const city = !f.city || f.city === filled.current.city ? place.city : f.city
        const state = !f.state || f.state === filled.current.state ? place.state : f.state
        filled.current = { city: place.city, state: place.state }
        return { ...f, city, state }
      })
      setLookup({ state: 'found', areas: place.areas ?? [], where: `${place.city}, ${place.state}` })
    })
    return () => {
      live = false
    }
  }, [form.pincode])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const result = await saveAddress(form)
      if (result?.ok) onSaved(result.address)
      else setError(result?.reason || 'Could not save that address.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 space-y-4 rounded-2xl border border-rule bg-surface p-4">
      <Field label="Full name" required value={form.name} onChange={set('name')} autoComplete="name" />
      <Field
        label="Mobile number"
        required
        value={form.phone}
        onChange={set('phone')}
        inputMode="tel"
        autoComplete="tel"
        placeholder="The courier calls this"
      />
      <div>
        <Field
          label="Pincode"
          required
          value={form.pincode}
          onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="6 digits — city and state fill in"
        />
        {lookup.state === 'finding' && <p className="mt-1.5 text-micro t-faint">Finding your area…</p>}
        {lookup.state === 'found' && <p className="mt-1.5 text-micro text-ok">✓ {lookup.where}</p>}
        {lookup.state === 'unknown' && (
          <p className="mt-1.5 text-micro t-faint">Pincode not found. Type the city and state below.</p>
        )}
      </div>
      <Field
        label="House, flat, street"
        required
        value={form.line1}
        onChange={set('line1')}
        autoComplete="address-line1"
      />
      <div>
        <Field label="Area, landmark" value={form.line2} onChange={set('line2')} autoComplete="address-line2" />
        {lookup.areas.length > 0 && (
          <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
            {lookup.areas.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setForm((f) => ({ ...f, line2: f.line2 && !lookup.areas.includes(f.line2) ? `${f.line2}, ${a}` : a }))}
                className={`pill flex-none text-[12px] ${form.line2 === a ? 'border-gold-fill' : ''}`}
              >
                {a}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="City" required value={form.city} onChange={set('city')} autoComplete="address-level2" />
        <Field label="State" required value={form.state} onChange={set('state')} autoComplete="address-level1" />
      </div>
      {error && <p className="text-meta text-live">{error}</p>}
      <div className="flex gap-2">
        {canCancel && (
          <PopButton size="sm" onClick={onCancel}>
            Cancel
          </PopButton>
        )}
        <PopButton size="sm" variant="gold" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save address'}
        </PopButton>
      </div>
    </div>
  )
}

function Field({ label, required = false, ...rest }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-meta font-semibold t-heading">
        {label}
        {required && (
          <span className="ml-0.5 text-live" aria-hidden="true">
            *
          </span>
        )}
      </span>
      <input spellCheck="false" className="field-line" {...rest} />
    </label>
  )
}
