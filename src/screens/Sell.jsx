import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import { Loader } from '../components/Cosmos.jsx'
import Icon from '../components/Icon.jsx'
import { Kicker, PopButton } from '../components/Pop.jsx'
import { fetchCategories } from '../lib/shop.js'
import { bank, create, KINDS, mine, priceText, saveBank, update, withdraw } from '../lib/market.js'
import { uploadAsset } from '../lib/media.js'
import { useStore } from '../store.jsx'

/**
 * Sell on the Market (15 Oct 2026, docs/06 Phase 17): a Pro's or a
 * Creator's own listings — `/studio/market`.
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

  const load = () => {
    mine().then(setData).catch(() => setData(false))
  }
  useEffect(load, [])

  if (data === null) return (<><TopBar title="Your listings" back backTo="/studio" /><Loader /></>)
  if (data === false) {
    return (
      <>
        <TopBar title="Your listings" back backTo="/studio" />
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

  // Waiting for approval first, then live (16 Oct 2026, Rahul). A
  // rejection waits there too, with the admin's note.
  const live = data.listings.filter((r) => r.status === 'approved')
  const waiting = data.listings.filter((r) => r.status !== 'approved')

  return (
    <>
      <TopBar title="Your listings" back backTo="/studio" />

      {/* Earnings, insights and payout details are the Dashboard's (16 Oct
          2026, Rahul): this page is the listings. */}
      <section className="px-5 pt-5">
        <Kicker>Add a listing</Kicker>
        <div className="mt-3 grid grid-cols-4 gap-2.5">
          {Object.entries(KINDS).map(([kind, k]) => (
            <button
              key={kind}
              type="button"
              onClick={() => navigate(`/studio/market/new/${kind}`)}
              className="pop-tap flex flex-col items-center gap-2 rounded-2xl bg-white py-3.5 shadow-sm ring-1 ring-rule"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[var(--orange-hi)] to-[var(--orange-lo)] text-white shadow">
                <Icon name={KIND_ICON[kind]} size={18} />
              </span>
              <span className="text-micro font-semibold t-heading">{k.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-micro t-faint">An admin checks each one before it goes on the Market and your page.</p>
      </section>

      {data.listings.length === 0 ? (
        <p className="px-5 pt-8 text-meta t-faint">Nothing listed yet. Add your first above.</p>
      ) : (
        <>
          <Shelf
            title="Waiting for approval"
            count={waiting.length}
            empty="Nothing waiting."
            rows={waiting}
            navigate={navigate}
            drop={drop}
          />
          <Shelf title="Live" count={live.length} empty="Nothing live yet." rows={live} navigate={navigate} drop={drop} />
        </>
      )}
      <div className="h-16" />
    </>
  )
}

function Shelf({ title, count, empty, rows, navigate, drop }) {
  return (
    <section className="px-5 pt-7">
      <div className="flex items-center gap-2">
        <Kicker>{title}</Kicker>
        <span className="rounded-full bg-surface2 px-2 py-0.5 text-micro font-semibold t-sub tnum">{count}</span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-meta t-faint">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((row) => (
            <ListingCard key={row.id} row={row} navigate={navigate} drop={drop} />
          ))}
        </ul>
      )}
    </section>
  )
}

function ListingCard({ row, navigate, drop }) {
  const [label, tone] = STATUS[row.status] || ['', '']
  const pill = { approved: 'bg-ok text-white', pending: 'bg-white/90 t-heading', rejected: 'bg-live text-white' }[row.status]
  return (
    <li className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-rule">
      <div className="flex gap-3 p-3">
        <div className="relative aspect-video w-32 flex-none overflow-hidden rounded-xl bg-surface2">
          {row.cover_url && <img src={row.cover_url} alt="" className="h-full w-full object-cover" />}
          <span className={`absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold shadow ${pill}`}>
            {label}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-meta font-semibold leading-snug t-heading">{row.title}</p>
          <p className="mt-1 flex items-center gap-1.5 text-micro t-faint">
            <Icon name={KIND_ICON[row.kind]} size={12} />
            {KINDS[row.kind].label}
          </p>
          <p className="mt-1.5 flex items-baseline gap-2">
            <span className="text-meta font-semibold t-heading tnum">{priceText(row.price_paise)}</span>
            {row.status === 'approved' && <span className="text-micro t-faint tnum">{row.sold} sold</span>}
          </p>
        </div>
      </div>
      {row.status === 'rejected' && row.review_note && (
        <p className={`mx-3 mb-3 rounded-xl bg-surface2 px-3 py-2 text-micro t-body ${tone}`}>
          <span className="font-semibold">Admin: </span>
          <span className="t-body">{row.review_note}</span>
        </p>
      )}
      <div className="flex border-t border-rule text-micro font-semibold">
        <button type="button" onClick={() => navigate(`/studio/market/${row.id}`)} className="flex-1 py-2.5 text-center t-heading active:bg-surface2">
          Edit
        </button>
        {row.status === 'approved' && (
          <Link
            to={row.kind === 'product' && row.product_id ? `/shop/p/${row.product_id}` : `/shop/l/${row.id}`}
            className="flex-1 border-l border-rule py-2.5 text-center t-heading active:bg-surface2"
          >
            See it
          </Link>
        )}
        <button type="button" onClick={() => drop(row)} className="flex-1 border-l border-rule py-2.5 text-center t-faint active:bg-surface2">
          Remove
        </button>
      </div>
    </li>
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

/** The photos after the cover (17 Oct 2026, Rahul): up to nine more, in
 *  order, each removable; several can be chosen at once. */
function MorePhotos({ photos, onChange }) {
  const ref = useRef(null)
  const [busy, setBusy] = useState(false)
  const { showToast } = useStore()
  const room = 9 - photos.length
  const pick = async (e) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'))
    e.target.value = ''
    if (!files.length) return
    if (files.length > room) showToast(`Up to 10 photos with the cover. The first ${room} are added.`)
    setBusy(true)
    let added = [...photos]
    try {
      for (const file of files.slice(0, room)) {
        const got = await uploadAsset(typed(file), 'image')
        added = [...added, got.publicUrl]
        onChange(added)
      }
    } catch (err) {
      showToast(err.message)
    }
    setBusy(false)
  }
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
      {photos.map((url, i) => (
        <span key={`${url}-${i}`} className="relative block h-16 w-24 flex-none overflow-hidden rounded-lg bg-surface2">
          <img src={url} alt="" className="h-full w-full object-cover" />
          <button type="button" onClick={() => onChange(photos.filter((_, j) => j !== i))} aria-label={`Remove photo ${i + 2}`}
            className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-[11px] text-white">
            ✕
          </button>
        </span>
      ))}
      {room > 0 && (
        <>
          <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={pick} />
          <button type="button" onClick={() => ref.current?.click()} disabled={busy} aria-label="Add photos"
            className="grid h-16 w-24 flex-none place-items-center rounded-lg border border-dashed border-rule gold disabled:opacity-50">
            {busy ? <span className="text-micro">Uploading</span> : <Icon name="plus" size={18} />}
          </button>
        </>
      )}
    </div>
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

  if (row === null) return (<><TopBar title="Listing" back backTo="/studio/market" /><Loader /></>)
  if (row === false || !KINDS[row.kind]) {
    return (
      <>
        <TopBar title="Listing" back backTo="/studio/market" />
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
      gallery: row.gallery || [],
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
      navigate('/studio/market')
    } catch (err) {
      showToast(err.message)
    }
    setBusy(false)
  }

  const whenValue = row.when ?? (row.starts_at ? toLocalInput(row.starts_at) : '')

  return (
    <>
      <TopBar title={`${id ? 'Edit' : 'New'} ${KINDS[kind].label.toLowerCase()}`} back backTo="/studio/market" />
      <div className="space-y-6 px-5 py-5">
        <Field label="Cover picture" note="16:9, like a YouTube thumbnail: 1280 × 720.">
          {row.cover_url && <img src={row.cover_url} alt="" className="mb-2 aspect-video w-full rounded-xl bg-surface2 object-contain" />}
          <FilePick label="Choose a picture" accept="image/*" kind="image" current={row.cover_url ? 'Change the picture' : null}
            onDone={(got) => setRow((r) => ({ ...r, cover_url: got.publicUrl }))} />
        </Field>
        {row.cover_url && (
          <Field label="More photos" note="Up to 9 more, shown after the cover. Swiped on the listing.">
            <MorePhotos photos={row.gallery || []} onChange={(gallery) => setRow((r) => ({ ...r, gallery }))} />
          </Field>
        )}
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
  const [form, setForm] = useState({ account_holder: '', account_number: '', ifsc: '', upi_id: '', pan: '',
    account_type: '', firm_name: '', gst_number: '', gst_doc_asset_id: null })
  const [gstName, setGstName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [current, setCurrent] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    bank().then((d) => {
      if (d.pro) return navigate('/studio/payout-details', { replace: true })
      setCurrent(d.bank)
      if (d.bank) setForm((f) => ({ ...f, account_holder: d.bank.account_holder, ifsc: d.bank.ifsc, upi_id: d.bank.upi_id,
        account_type: d.bank.account_type || '', firm_name: d.bank.firm_name || '', gst_number: d.bank.gst_number || '' }))
    }).catch(() => {})
  }, [navigate])
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const save = async () => {
    setBusy(true)
    try {
      await saveBank(form)
      showToast('Saved.')
      navigate('/studio/market')
    } catch (err) {
      showToast(err.message)
    }
    setBusy(false)
  }
  return (
    <>
      <TopBar title="Where we pay you" back backTo="/studio/market" />
      <div className="space-y-6 px-5 py-5">
        <p className="text-meta t-body">Your Market earnings go here on the 7th of every month. The account number and PAN are stored encrypted; only Namo's finance team can read them.</p>
        <Field label="Account holder's name"><input className="field-line" value={form.account_holder} onChange={set('account_holder')} /></Field>
        <Field label="Account number" note={current?.account_last4 ? `On file: …${current.account_last4}. Type it again only to change it.` : null}>
          <input className="field-line tnum" inputMode="numeric" value={form.account_number} onChange={set('account_number')} />
        </Field>
        <Field label="IFSC"><input className="field-line uppercase" value={form.ifsc} onChange={set('ifsc')} maxLength={11} /></Field>
        {/* Savings or current, as on a Pro's payout details (16 Oct 2026, Rahul). */}
        <div>
          <span className="mb-1.5 block text-meta font-semibold t-heading">Account type</span>
          <div className="grid grid-cols-2 gap-2">
            {[['savings', 'Savings'], ['current', 'Current']].map(([key, name]) => (
              <button key={key} type="button" aria-pressed={form.account_type === key}
                onClick={() => setForm((f) => ({ ...f, account_type: key }))}
                className={`rounded-xl border py-3 text-meta font-semibold ${form.account_type === key ? 'border-gold-fill bg-gold-fill/10 gold' : 'border-rule bg-white t-body'}`}>
                {name}
              </button>
            ))}
          </div>
        </div>
        <Field label="UPI ID" note="Instead of, or as well as, the account."><input className="field-line" value={form.upi_id} onChange={set('upi_id')} /></Field>
        <Field label="PAN" note={current?.pan_last4 ? `On file: …${current.pan_last4}.` : 'Needed for tax on what you earn.'}>
          <input className="field-line uppercase" value={form.pan} onChange={set('pan')} maxLength={10} />
        </Field>
        <Kicker>Firm and GST · optional</Kicker>
        <Field label="Firm name"><input className="field-line" value={form.firm_name} onChange={set('firm_name')} /></Field>
        <Field label="GST number"><input className="field-line uppercase" value={form.gst_number} onChange={set('gst_number')} maxLength={15} /></Field>
        <div>
          <span className="mb-1.5 block text-meta font-semibold t-heading">GST certificate</span>
          <label className="pop-tap flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border border-dashed border-rule bg-white px-4 py-3.5">
            <span className="min-w-0 truncate text-meta t-body">{uploading ? 'Uploading' : gstName || 'Add a photo or PDF'}</span>
            <span className={`flex-none text-meta font-semibold ${gstName ? 'text-ok' : 'gold'}`}>{gstName ? 'Added' : 'Choose'}</span>
            <input type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              setUploading(true)
              try {
                const { assetId } = await uploadAsset(file, 'document')
                setForm((f) => ({ ...f, gst_doc_asset_id: assetId }))
                setGstName(file.name)
              } catch (err) {
                showToast(err.message)
              }
              setUploading(false)
            }} />
          </label>
          {current?.has_gst_doc && !gstName && <span className="mt-1 block text-micro t-faint">On file.</span>}
        </div>
        <PopButton variant="gold" onClick={save} disabled={busy || uploading}>{busy ? '…' : 'Save'}</PopButton>
      </div>
    </>
  )
}
