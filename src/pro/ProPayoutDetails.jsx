import { Loader } from '../components/Cosmos.jsx'
import { useEffect, useRef, useState } from 'react'
import { TopBar } from '../components/Chrome.jsx'
import { Kicker, PopButton } from '../components/Pop.jsx'
import { Field } from '../components/Primitives.jsx'
import { payoutDetails, savePayoutDetails } from '../lib/consultants.js'
import { uploadAsset } from '../lib/media.js'
import { useStore } from '../store.jsx'

/**
 * Payout details — PAN and the bank account payouts go to (payouts P2,
 * 3 Oct 2026). Reached from Profile → Settings.
 *
 * Collected before payouts exist so they can start the day they are built.
 * The PAN and account number are encrypted on the server and never come
 * back: after saving, this screen only ever shows the last four. So a change
 * means typing both numbers and adding both photos again, which is also the
 * point — changed details are checked again before money goes to them.
 *
 * Two photos, both to the private bucket: the PAN card, and a cancelled
 * cheque or passbook page. Finance compares them with what was typed,
 * because there is no automatic bank or PAN check yet. No Aadhaar.
 */

const STATUS = {
  submitted: {
    tone: 'bg-surface',
    text: 'Sent. Your details are checked against the photos before your first payout.',
  },
  verified: { tone: 'bg-[color-mix(in_srgb,var(--ok)_12%,white)]', text: 'Verified. Payouts will go to this account.' },
  rejected: { tone: 'bg-[color-mix(in_srgb,var(--live)_10%,white)]', text: 'Sent back.' },
}

const EMPTY = {
  pan: '',
  pan_name: '',
  account_holder: '',
  account_number: '',
  account_number_confirm: '',
  ifsc: '',
  upi_id: '',
}

export default function ProPayoutDetails() {
  const { showToast } = useStore()
  const [saved, setSaved] = useState(null)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    let live = true
    payoutDetails()
      .then((d) => {
        if (!live) return
        setSaved(d)
        setEditing(d.status === 'missing')
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [])

  return (
    <>
      <TopBar title="Payout details" sub="PAN and bank account" back backTo="/pro/profile/settings" />

      {failed && (
        <p className="px-5 pt-6 text-meta t-body">Could not load your payout details. Open this page again.</p>
      )}
      {!failed && !saved && <Loader />}

      {saved && saved.status !== 'missing' && !editing && (
        <Summary details={saved} onChange={() => setEditing(true)} />
      )}

      {saved && editing && (
        <Form
          prior={saved}
          onCancel={saved.status === 'missing' ? null : () => setEditing(false)}
          onSaved={(d) => {
            setSaved(d)
            setEditing(false)
            showToast('Payout details sent for checking')
          }}
        />
      )}

      <div className="h-24" />
    </>
  )
}

function Summary({ details, onChange }) {
  const s = STATUS[details.status] ?? STATUS.submitted
  return (
    <>
      <section className="px-5 pt-5">
        <div className={`rounded-2xl px-4 py-3 text-meta t-body ${s.tone}`}>
          {s.text}
          {details.status === 'rejected' && details.review_note && (
            <span className="mt-1 block font-semibold t-heading">{details.review_note}</span>
          )}
        </div>
      </section>

      <section className="px-5 py-6">
        <Kicker>PAN</Kicker>
        <div className="mt-2">
          <Field k="PAN" v={`••••••${details.pan_last4}`} />
          <Field k="Name on PAN" v={details.pan_name} />
          <Field k="PAN card photo" v={details.has_pan_doc ? 'Added' : 'Missing'} />
        </div>
      </section>

      <section className="px-5 pb-6">
        <Kicker>Bank account</Kicker>
        <div className="mt-2">
          <Field k="Account holder" v={details.account_holder} />
          <Field k="Account" v={`••••${details.account_last4}`} />
          <Field k="IFSC" v={details.ifsc} />
          {details.upi_id && <Field k="UPI ID" v={details.upi_id} />}
          <Field k="Cheque or passbook" v={details.has_bank_doc ? 'Added' : 'Missing'} />
        </div>
      </section>

      <section className="px-5">
        <PopButton variant="ghost" onClick={onChange}>
          Change details
        </PopButton>
        <p className="mt-3 text-meta t-faint">
          A change is checked again before any payout goes to the new account.
        </p>
      </section>
    </>
  )
}

function Form({ prior, onSaved, onCancel }) {
  const [v, setV] = useState({
    ...EMPTY,
    pan_name: prior.pan_name ?? '',
    account_holder: prior.account_holder ?? '',
    ifsc: prior.ifsc ?? '',
    upi_id: prior.upi_id ?? '',
  })
  const [panDoc, setPanDoc] = useState(null)
  const [bankDoc, setBankDoc] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [bank, setBank] = useState(null)

  const put = (k) => (e) => {
    let value = e.target.value
    if (k === 'pan' || k === 'ifsc') value = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (k === 'account_number' || k === 'account_number_confirm') value = value.replace(/\D/g, '')
    setV((x) => ({ ...x, [k]: value }))
    if (error?.field === k) setError(null)
  }

  /* The branch, looked up from the IFSC so a typo shows as the wrong bank
     before it is sent. Razorpay's public IFSC directory; if it is down the
     form works without it. */
  useEffect(() => {
    setBank(null)
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.ifsc)) return undefined
    let live = true
    fetch(`https://ifsc.razorpay.com/${v.ifsc}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setBank(d ? `${d.BANK}, ${d.BRANCH}` : 'No bank has this IFSC.'))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [v.ifsc])

  const ready =
    v.pan.length === 10 &&
    v.pan_name.trim() &&
    v.account_holder.trim() &&
    v.account_number.length >= 9 &&
    v.account_number_confirm &&
    v.ifsc.length === 11 &&
    panDoc?.id &&
    bankDoc?.id &&
    !saving

  async function send() {
    if (!ready) return
    setSaving(true)
    setError(null)
    try {
      const d = await savePayoutDetails({
        ...v,
        pan_doc_asset_id: panDoc.id,
        bank_doc_asset_id: bankDoc.id,
      })
      onSaved(d)
    } catch (err) {
      setError({ field: err.body?.field ?? null, message: err.message })
    } finally {
      setSaving(false)
    }
  }

  const err = (field) =>
    error?.field === field ? <p className="mt-1.5 text-[12px] text-live">{error.message}</p> : null

  return (
    <div className="px-5 pt-5">
      <p className="text-meta t-body">
        Payouts are paid once a month into this account, with TDS deducted, which is why your PAN is
        needed. Your PAN and account number are stored encrypted; only Namo&rsquo;s finance team can
        see them in full.
      </p>

      <p className="mt-3 text-meta t-faint">
        <Req /> Required
      </p>

      <Kicker className="mt-5">PAN</Kicker>
      <div className="mt-3 space-y-5">
        <Input required label="PAN number" value={v.pan} onChange={put('pan')} placeholder="ABCDE1234F" maxLength={10} autoCapitalize="characters" />
        {err('pan')}
        <Input required label="Name as on your PAN card" value={v.pan_name} onChange={put('pan_name')} autoComplete="name" />
        {err('pan_name')}
        <Upload required label="Photo of your PAN card" value={panDoc} onChange={setPanDoc} />
        {err('pan_doc')}
      </div>

      <Kicker className="mt-8">Bank account</Kicker>
      <div className="mt-3 space-y-5">
        <Input required label="Account holder name" value={v.account_holder} onChange={put('account_holder')} />
        {err('account_holder')}
        <Input required label="Account number" value={v.account_number} onChange={put('account_number')} inputMode="numeric" maxLength={18} autoComplete="off" />
        {err('account_number')}
        <Input
          required
          label="Account number again"
          value={v.account_number_confirm}
          onChange={put('account_number_confirm')}
          inputMode="numeric"
          maxLength={18}
          autoComplete="off"
          onPaste={(e) => e.preventDefault()}
        />
        {v.account_number_confirm && v.account_number_confirm !== v.account_number && (
          <p className="text-[12px] text-live">The two account numbers do not match.</p>
        )}
        {err('account_number_confirm')}
        <div>
          <Input required label="IFSC" value={v.ifsc} onChange={put('ifsc')} placeholder="HDFC0001234" maxLength={11} autoCapitalize="characters" />
          {bank && <p className="mt-1.5 text-meta t-faint">{bank}</p>}
        </div>
        {err('ifsc')}
        <Upload required label="Photo of a cancelled cheque or your passbook's first page" value={bankDoc} onChange={setBankDoc} />
        {err('bank_doc')}
        <Input label="UPI ID · optional" value={v.upi_id} onChange={put('upi_id')} placeholder="name@bank" autoCapitalize="none" />
        {err('upi_id')}
      </div>

      {error && !error.field && <p className="mt-5 text-meta text-live">{error.message}</p>}

      <PopButton variant="gold" className="mt-8" onClick={send} disabled={!ready}>
        {saving ? 'Sending' : 'Send for checking'}
      </PopButton>
      {onCancel && (
        <PopButton variant="ghost" className="mt-3" onClick={onCancel}>
          Cancel
        </PopButton>
      )}
    </div>
  )
}

/** A red asterisk after a required field's label (owner's request, 4 Oct). */
export function Req() {
  return (
    <span className="ml-0.5 text-live" aria-hidden="true">
      *
    </span>
  )
}

function Input({ label, required = false, ...rest }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-meta font-semibold t-heading">
        {label}
        {required && <Req />}
      </span>
      <input spellCheck="false" className="field-line" required={required} {...rest} />
    </label>
  )
}

/** A private upload: PDF, JPG or PNG, up to 5 MB (the server's rule). */
function Upload({ label, value, onChange, required = false }) {
  const ref = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const { assetId } = await uploadAsset(file, 'document')
      onChange({ id: assetId, name: file.name })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <span className="mb-1.5 block text-meta font-semibold t-heading">
        {label}
        {required && <Req />}
      </span>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        className="pop-tap flex w-full items-center justify-between gap-3 rounded-2xl border border-dashed border-rule bg-white px-4 py-3.5 text-left"
      >
        <span className="min-w-0 truncate text-meta t-body">
          {busy ? 'Uploading' : value ? value.name : 'Add a photo or PDF'}
        </span>
        <span className={`flex-none text-meta font-semibold ${value ? 'text-ok' : 'gold'}`}>
          {value ? 'Added' : 'Choose'}
        </span>
      </button>
      <input
        ref={ref}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="hidden"
        onChange={pick}
      />
      {error && <p className="mt-1.5 text-[12px] text-live">{error}</p>}
    </div>
  )
}
