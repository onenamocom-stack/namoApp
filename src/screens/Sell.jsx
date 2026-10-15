import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import { Loader } from '../components/Cosmos.jsx'
import Icon from '../components/Icon.jsx'
import { Kicker, PopButton, Stat } from '../components/Pop.jsx'
import { Row } from '../components/Primitives.jsx'
import { fetchCategories } from '../lib/shop.js'
import { bank, create, earnings, KINDS, mine, priceText, saveBank, update, withdraw } from '../lib/market.js'
import { uploadAsset } from '../lib/media.js'
import { rupees, useStore } from '../store.jsx'

/**
 * Sell on the Market (15 Oct 2026, docs/06 Phase 17): a Pro's or a
 * Creator's own listings — `/dashboard/market`.
 *
 * Add a download, a course, an event or a product; an admin approves it
 * before anybody sees it, and an edit goes back for approval. What you
 * earned, what is due on the 7th, what was paid; and, for a Creator, where
 * the money goes (a Pro's is Payout details).
 */

const STATUS = {
  pending: ['Waiting for approval', 't-faint'],
  approved: ['Live', 'text-ok'],
  rejected: ['Needs a change', 'text-live'],
}
const KIND_ICON = { download: 'download', course: 'play', event: 'calendar', product: 'cart' }

export default function SellHome() {
  const navigate = useNavigate()
  const { showToast } = useStore()
  const [data, setData] = useState(null)
  const [book, setBook] = useState(null)
  const [account, setAccount] = useState(null)

  const load = () => {
    mine().then(setData).catch(() => setData(false))
    earnings().then(setBook).catch(() => setBook(false))
    bank().then(setAccount).catch(() => setAccount(false))
  }
  useEffect(load, [])

  if (data === null) return (<><TopBar title="Sell on the Market" back backTo="/dashboard" /><Loader /></>)
  if (data === false) {
    return (
      <>
        <TopBar title="Sell on the Market" back backTo="/dashboard" />
        <p className="px-6 py-16 text-center text-meta t-body">Could not open your listings. Try again.</p>
      </>
    )
  }

  const drop = async (row) => {
    if (!window.confirm(`Take “${row.title}” off the Market?`)) return
    try {
      await withdraw(row.id)
      showToast('Taken off the Market.')
      load()
    } catch (err) {
      showToast(err.message)
    }
  }

  return (
    <>
      <TopBar title="Sell on the Market" back backTo="/dashboard" />

      {book && (
        <section className="px-5 pt-5">
          <Kicker>Your Market earnings</Kicker>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Stat label="Earned" value={`₹${rupees(book.net_paise)}`} />
            <Stat label="Due" value={`₹${rupees(book.due_paise)}`} />
            <Stat label="Paid" value={`₹${rupees(book.paid_paise)}`} />
          </div>
          <p className="mt-2 text-micro t-faint">
            After Namo's share. Paid on the 7th of every month for the month before; next on{' '}
            {new Date(book.next_payout).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}.
          </p>
          <div className="mt-2">
            {account?.pro ? (
              <Row to="/dashboard/payout-details" title="Payout details" note="Your PAN and bank account" />
            ) : (
              <Row
                to="/dashboard/market/bank"
                title="Where we pay you"
                note={account?.bank ? `${account.bank.account_holder} · ${account.bank.account_last4 ? `A/c …${account.bank.account_last4}` : account.bank.upi_id}` : 'Add your bank account or UPI'}
              />
            )}
          </div>
        </section>
      )}

      <section className="px-5 pt-6">
        <Kicker>Add a listing</Kicker>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {Object.entries(KINDS).map(([kind, k]) => (
            <button key={kind} type="button" onClick={() => navigate(`/dashboard/market/new/${kind}`)}
              className="flex flex-col items-center gap-1.5 rounded-2xl border border-rule bg-surface py-3">
              <span className="gold"><Icon name={KIND_ICON[kind]} size={20} /></span>
              <span className="text-micro font-semibold t-heading">{k.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-micro t-faint">An admin checks each one before it goes on the Market and your page.</p>
      </section>

      <section className="px-5 pt-6">
        <Kicker>Your listings</Kicker>
        {data.listings.length === 0 ? (
          <p className="mt-3 text-meta t-faint">Nothing yet. Add your first above.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {data.listings.map((row) => {
              const [label, tone] = STATUS[row.status] || ['', '']
              return (
                <li key={row.id} className="rounded-2xl border border-rule bg-surface p-3">
                  <div className="flex gap-3">
                    {row.cover_url ? (
                      <img src={row.cover_url} alt="" className="aspect-video w-28 flex-none rounded-lg bg-surface2 object-contain" />
                    ) : (
                      <span className="aspect-video w-28 flex-none rounded-lg bg-surface2" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-meta font-semibold t-heading">{row.title}</p>
                      <p className="text-micro t-faint">{KINDS[row.kind].label} · {priceText(row.price_paise)} · {row.sold} sold</p>
                      <p className={`mt-1 caps-sm ${tone}`}>{label}</p>
                    </div>
                  </div>
                  {row.status === 'rejected' && row.review_note && (
                    <p className="mt-2 rounded-lg bg-surface2 px-3 py-2 text-micro t-body">{row.review_note}</p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <PopButton size="sm" full={false} className="flex-1" onClick={() => navigate(`/dashboard/market/${row.id}`)}>
                      Edit
                    </PopButton>
                    {row.status === 'approved' && (
                      <PopButton size="sm" full={false} variant="ghost" className="flex-1"
                        to={row.kind === 'product' && row.product_id ? `/shop/p/${row.product_id}` : `/shop/l/${row.id}`}>
                        See it
                      </PopButton>
                    )}
                    <PopButton size="sm" full={false} variant="ghost" onClick={() => drop(row)}>
                      Remove
                    </PopButton>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {book?.recent?.length > 0 && (
        <section className="px-5 pt-6">
          <Kicker>Sales</Kicker>
          <ul className="mt-2 divide-y divide-rule">
            {book.recent.map((e, i) => (
              <li key={i} className="flex items-baseline gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-meta t-heading">{e.title}</span>
                  <span className="block text-micro t-faint">
                    {new Date(e.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ₹{rupees(e.gross_paise)} − ₹{rupees(e.commission_paise + e.delivery_paise)} Namo
                  </span>
                </span>
                <span className="text-meta font-semibold t-heading tnum">₹{rupees(e.net_paise)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="h-16" />
    </>
  )
}

/* A file the browser could not name (some phones send no type): guessed
   from the extension, so the server's check can read it. */
const GUESS = { pdf: 'application/pdf', zip: 'application/zip', epub: 'application/epub+zip', mp4: 'video/mp4',
  mp3: 'audio/mpeg', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', txt: 'text/plain' }
function typed(file) {
  if (file.type) return file
  const ext = file.name.split('.').pop()?.toLowerCase()
  return GUESS[ext] ? new File([file], file.name, { type: GUESS[ext] }) : file
}

function Field({ label, note, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-meta font-semibold t-heading">{label}</span>
      {children}
      {note && <span className="mt-1 block text-micro t-faint">{note}</span>}
    </label>
  )
}

function FilePick({ label, accept, kind, onDone, current }) {
  const ref = useRef(null)
  const [busy, setBusy] = useState(false)
  const { showToast } = useStore()
  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const got = await uploadAsset(typed(file), kind)
      onDone({ ...got, name: file.name })
    } catch (err) {
      showToast(err.message)
    }
    setBusy(false)
  }
  return (
    <>
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={pick} />
      <button type="button" onClick={() => ref.current?.click()} disabled={busy}
        className="flex w-full items-center gap-3 rounded-xl border border-dashed border-rule px-4 py-3 text-left">
        <span className="gold"><Icon name={busy ? 'download' : 'plus'} size={18} /></span>
        <span className="min-w-0 flex-1 truncate text-meta t-body">{busy ? 'Uploading…' : current || label}</span>
      </button>
    </>
  )
}

const toRupees = (paise) => (paise ? String(paise / 100) : '')
const toPaise = (text) => Math.round(Number(String(text).replace(/[^\d.]/g, '') || 0) * 100)

export function SellForm() {
  const { kind: newKind, id } = useParams()
  const navigate = useNavigate()
  const { showToast } = useStore()
  const [row, setRow] = useState(id ? null : { kind: newKind, lessons: [] })
  const [cats, setCats] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (id) {
      mine().then((d) => setRow(d.listings.find((x) => x.id === id) || false)).catch(() => setRow(false))
    }
  }, [id])
  useEffect(() => {
    fetchCategories().then(setCats).catch(() => {})
  }, [])

  if (row === null) return (<><TopBar title="Listing" back backTo="/dashboard/market" /><Loader /></>)
  if (row === false || !KINDS[row.kind]) {
    return (
      <>
        <TopBar title="Listing" back backTo="/dashboard/market" />
        <p className="px-6 py-16 text-center text-meta t-body">That listing is not yours, or it is gone.</p>
      </>
    )
  }

  const kind = row.kind
  const set = (k) => (e) => setRow((r) => ({ ...r, [k]: e?.target ? e.target.value : e }))
  const price = toPaise(row.price ?? toRupees(row.price_paise))

  const lessons = row.lessons || []
  const setLesson = (i, patch) => setRow((r) => ({ ...r, lessons: r.lessons.map((x, j) => (j === i ? { ...x, ...patch } : x)) }))

  const save = async () => {
    const body = {
      kind,
      title: row.title || '',
      description: row.description || '',
      cover_url: row.cover_url || '',
      price_paise: price,
      mrp_paise: toPaise(row.mrp ?? toRupees(row.mrp_paise)) || null,
    }
    if (kind === 'download') body.file_asset_id = row.file_asset_id || null
    if (kind === 'course') {
      body.language = row.language || ''
      body.lessons = lessons.map((x, i) => ({ title: x.title || '', minutes: Number(x.minutes) || 0, asset_id: x.asset_id, preview: i === 0 }))
    }
    if (kind === 'event') {
      body.starts_at = row.when ? new Date(row.when).toISOString() : row.starts_at
      body.duration_minutes = Number(row.duration_minutes) || null
      body.seats = Number(row.seats) || null
      body.join_url = row.join_url || ''
    }
    if (kind === 'product') {
      body.category_name = row.category_name || ''
      body.stock = Number(row.stock) || null
      body.weight_grams = Number(row.weight_grams) || null
    }
    setBusy(true)
    try {
      if (id) await update(id, body)
      else await create(body)
      showToast('Sent for approval. We tell you when it is live.')
      navigate('/dashboard/market')
    } catch (err) {
      showToast(err.message)
    }
    setBusy(false)
  }

  const whenValue = row.when ?? (row.starts_at ? toLocalInput(row.starts_at) : '')

  return (
    <>
      <TopBar title={`${id ? 'Edit' : 'New'} ${KINDS[kind].label.toLowerCase()}`} back backTo="/dashboard/market" />
      <div className="space-y-6 px-5 py-5">
        <Field label="Cover picture" note="16:9, like a YouTube thumbnail: 1280 × 720.">
          {row.cover_url && <img src={row.cover_url} alt="" className="mb-2 aspect-video w-full rounded-xl bg-surface2 object-contain" />}
          <FilePick label="Choose a picture" accept="image/*" kind="image" current={row.cover_url ? 'Change the picture' : null}
            onDone={(got) => setRow((r) => ({ ...r, cover_url: got.publicUrl }))} />
        </Field>
        <Field label="Name">
          <input className="field-line" value={row.title || ''} onChange={set('title')} maxLength={200}
            placeholder={kind === 'event' ? 'Sharad Purnima Lakshmi Sadhana, live' : kind === 'course' ? 'Read your own kundli in 7 days' : ''} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Price (₹)" note={kind === 'product' ? null : '0 for free'}>
            <input className="field-line tnum" inputMode="decimal" value={row.price ?? toRupees(row.price_paise)} onChange={set('price')} />
          </Field>
          <Field label="MRP (₹)" note="Optional, above the price">
            <input className="field-line tnum" inputMode="decimal" value={row.mrp ?? toRupees(row.mrp_paise)} onChange={set('mrp')} />
          </Field>
        </div>
        <Field label="Description" note="What it is and who it is for. ## for a heading, **bold**, - for a list.">
          <textarea className="field-line min-h-[120px]" value={row.description || ''} onChange={set('description')} />
        </Field>

        {kind === 'download' && (
          <Field label="The file" note="PDF, e-book, ZIP (for software and tools), audio, video or pictures, up to 500 MB. Buyers get it after paying.">
            <FilePick label="Upload the file" kind="download" current={row.file_name || null}
              onDone={(got) => setRow((r) => ({ ...r, file_asset_id: got.assetId, file_name: got.name }))} />
          </Field>
        )}

        {kind === 'course' && (
          <>
            <Field label="Language">
              <input className="field-line" value={row.language || ''} onChange={set('language')} placeholder="Hindi" />
            </Field>
            <div>
              <p className="mb-2 text-meta font-semibold t-heading">Lessons</p>
              <p className="mb-3 text-micro t-faint">A video each (or a PDF). The first is a free preview anybody can watch.</p>
              <ol className="space-y-3">
                {lessons.map((x, i) => (
                  <li key={i} className="rounded-xl border border-rule p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-micro t-faint tnum">{i + 1}</span>
                      <input className="field-line flex-1" placeholder="Lesson name" value={x.title || ''}
                        onChange={(e) => setLesson(i, { title: e.target.value })} />
                      <input className="field-line w-16 tnum" inputMode="numeric" placeholder="min" value={x.minutes || ''}
                        onChange={(e) => setLesson(i, { minutes: e.target.value })} />
                      <button type="button" aria-label="Remove lesson" className="t-faint"
                        onClick={() => setRow((r) => ({ ...r, lessons: r.lessons.filter((_, j) => j !== i) }))}>
                        <Icon name="close" size={16} />
                      </button>
                    </div>
                    <div className="mt-2">
                      <FilePick label="Upload the video" accept="video/*,application/pdf" kind="download"
                        current={x.asset_id ? x.name || 'Uploaded · tap to replace' : null}
                        onDone={(got) => setLesson(i, { asset_id: got.assetId, name: got.name })} />
                    </div>
                  </li>
                ))}
              </ol>
              <button type="button" className="pill caps-sm mt-3"
                onClick={() => setRow((r) => ({ ...r, lessons: [...(r.lessons || []), { title: '', minutes: '' }] }))}>
                <Icon name="plus" size={14} /> Add a lesson
              </button>
            </div>
          </>
        )}

        {kind === 'event' && (
          <>
            <Field label="Starts">
              <input type="datetime-local" className="field-line" value={whenValue} onChange={set('when')} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="How long (minutes)">
                <input className="field-line tnum" inputMode="numeric" value={row.duration_minutes || ''} onChange={set('duration_minutes')} />
              </Field>
              <Field label="Seats">
                <input className="field-line tnum" inputMode="numeric" value={row.seats || ''} onChange={set('seats')} />
              </Field>
            </div>
            <Field label="Joining link" note="Zoom, Google Meet or YouTube Live. Only people who booked see it.">
              <input className="field-line" value={row.join_url || ''} onChange={set('join_url')} placeholder="https://" />
            </Field>
          </>
        )}

        {kind === 'product' && (
          <>
            <Field label="Category">
              <select className="field-line" value={row.category_name || ''} onChange={set('category_name')}>
                <option value="">Pick one</option>
                {cats.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="How many you will send">
                <input className="field-line tnum" inputMode="numeric" value={row.stock || ''} onChange={set('stock')} />
              </Field>
              <Field label="Weight, packed (g)">
                <input className="field-line tnum" inputMode="numeric" value={row.weight_grams || ''} onChange={set('weight_grams')} />
              </Field>
            </div>
            <p className="text-micro t-faint">
              Once it is approved, you send the stock to Namo and Namo ships every order. Delivery is free for the buyer.
            </p>
          </>
        )}

        <PopButton variant="gold" onClick={save} disabled={busy}>
          {busy ? '…' : id ? 'Save and send for approval' : 'Send for approval'}
        </PopButton>
        <p className="text-center text-micro t-faint">
          By listing you confirm you own it or may sell it. <Link to="/support" className="underline">Questions</Link>
        </p>
      </div>
    </>
  )
}

function toLocalInput(iso) {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function SellBank() {
  const navigate = useNavigate()
  const { showToast } = useStore()
  const [form, setForm] = useState({ account_holder: '', account_number: '', ifsc: '', upi_id: '', pan: '' })
  const [current, setCurrent] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    bank().then((d) => {
      if (d.pro) return navigate('/dashboard/payout-details', { replace: true })
      setCurrent(d.bank)
      if (d.bank) setForm((f) => ({ ...f, account_holder: d.bank.account_holder, ifsc: d.bank.ifsc, upi_id: d.bank.upi_id }))
    }).catch(() => {})
  }, [navigate])
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const save = async () => {
    setBusy(true)
    try {
      await saveBank(form)
      showToast('Saved.')
      navigate('/dashboard/market')
    } catch (err) {
      showToast(err.message)
    }
    setBusy(false)
  }
  return (
    <>
      <TopBar title="Where we pay you" back backTo="/dashboard/market" />
      <div className="space-y-6 px-5 py-5">
        <p className="text-meta t-body">Your Market earnings go here on the 7th of every month. The account number and PAN are stored encrypted; only Namo's finance team can read them.</p>
        <Field label="Account holder's name"><input className="field-line" value={form.account_holder} onChange={set('account_holder')} /></Field>
        <Field label="Account number" note={current?.account_last4 ? `On file: …${current.account_last4}. Type it again only to change it.` : null}>
          <input className="field-line tnum" inputMode="numeric" value={form.account_number} onChange={set('account_number')} />
        </Field>
        <Field label="IFSC"><input className="field-line uppercase" value={form.ifsc} onChange={set('ifsc')} maxLength={11} /></Field>
        <Field label="UPI ID" note="Instead of, or as well as, the account."><input className="field-line" value={form.upi_id} onChange={set('upi_id')} /></Field>
        <Field label="PAN" note={current?.pan_last4 ? `On file: …${current.pan_last4}.` : 'Needed for tax on what you earn.'}>
          <input className="field-line uppercase" value={form.pan} onChange={set('pan')} maxLength={10} />
        </Field>
        <PopButton variant="gold" onClick={save} disabled={busy}>{busy ? '…' : 'Save'}</PopButton>
      </div>
    </>
  )
}
