import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import { Row, Section } from '../components/Primitives.jsx'
import IntroSheet, { introNote } from '../components/IntroSheet.jsx'
import { isPro } from '../side.js'
import { PopButton } from '../components/Pop.jsx'
import { Loader } from '../components/Cosmos.jsx'
import { categories } from '../data/mock.js'
import { myReview, saveMyProfile, sendForReview } from '../lib/consultants.js'
import { uploadAsset } from '../lib/media.js'
import { Certificate, Input } from '../pro/ProApply.jsx'
import { useStore } from '../store.jsx'

/**
 * Edit profile, for a consultant (13 Oct 2026, Rahul) — the same screen in
 * the seeker app and the consultant app, opened from the button on your own
 * page.
 *
 * Two parts, because two kinds of field. The top one saves at once:
 * specialization, About, years, languages, tags. The bottom one — practice,
 * credentials, degree and its certificate — was checked when you were
 * approved, so it is sent for review and reaches your page only once the
 * console approves it.
 */
const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean)
const splitCategory = (s) => list(String(s || ''))

export default function EditPractice() {
  const { session, consultant, consultantLoading, refreshConsultant, showToast } = useStore()
  const [review, setReview] = useState(null)

  useEffect(() => {
    if (!consultant) return
    let live = true
    myReview()
      .then((r) => live && setReview(r))
      .catch(() => live && setReview({ status: 'none' }))
    return () => {
      live = false
    }
  }, [consultant?.profile_id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!session) return <Navigate to="/profile" replace />
  if (consultantLoading && !consultant) return <Loader />
  if (!consultant) return <Navigate to="/profile" replace />

  return (
    <EditPracticeBody
      // The pro app keeps the intro in its Practice settings.
      top={isPro ? null : <BasicLink />}
      introRow={isPro ? null : <IntroRow />}
      consultant={consultant}
      review={review}
      onSaved={() => refreshConsultant(session.user.id)}
      onSent={setReview}
      toast={showToast}
    />
  )
}

/** The screen itself, with no store — so it can be drawn on its own. */
export function EditPracticeBody({ consultant, review, onSaved, onSent, toast, top = null, introRow = null }) {
  return (
    <div className="flex h-full flex-col">
      <TopBar title="Edit profile" back backTo={`/consult/${consultant.profile_id}`} />
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-16">
        {top}
        <Direct consultant={consultant} onSaved={onSaved} toast={toast} introRow={introRow} />
        {review === null ? (
          <Loader />
        ) : (
          <Reviewed consultant={consultant} review={review} onSent={onSent} toast={toast} />
        )}
      </div>
    </div>
  )
}

function Direct({ consultant, onSaved, toast, introRow = null }) {
  const [form, setForm] = useState(() => ({
    specialization: consultant.specialization || '',
    bio: consultant.bio || '',
    experience: consultant.experience_yrs == null ? '' : String(consultant.experience_yrs),
    languages: (consultant.languages || []).join(', '),
    tags: (consultant.tags || []).join(', '),
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save() {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await saveMyProfile({
        specialization: form.specialization.trim(),
        bio: form.bio.trim(),
        experience_yrs: form.experience.trim() === '' ? null : parseInt(form.experience, 10),
        languages: list(form.languages),
        tags: list(form.tags),
      })
      toast('Saved')
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    // "Your Pro Profile" (14 Oct 2026, Rahul): the Basic profile is linked
    // above it, and the intro opens this section.
    <Section label="Your Pro Profile" className="mt-6">
      {introRow}
      <Input
        label="Specialization"
        value={form.specialization}
        onChange={set('specialization')}
        placeholder="Vedic Astrology, Numerology, Prashna"
      />
      <p className="mt-1.5 text-micro t-faint">Separate with commas. Each one shows as its own chip.</p>
      <label className="mt-6 block">
        <span className="text-micro uppercase tracking-caps text-t3">About</span>
        <textarea
          value={form.bio}
          onChange={set('bio')}
          rows={5}
          maxLength={1000}
          placeholder="How you read, and who you help."
          className="mt-2 w-full resize-none border-b border-rule bg-transparent pb-3 text-body text-t1 outline-none transition-colors placeholder:text-t4 focus:border-t1"
        />
      </label>
      <Input
        label="Years of practice"
        value={form.experience}
        onChange={set('experience')}
        placeholder="10"
        inputMode="numeric"
      />
      <Input label="Languages" value={form.languages} onChange={set('languages')} placeholder="Hindi, English" />
      <Input label="Tags" value={form.tags} onChange={set('tags')} placeholder="manglik, kundli milan, career" />
      {error && <p className="mt-4 text-meta text-live">{error}</p>}
      <PopButton className="mt-6" onClick={save} disabled={saving || !form.specialization.trim()}>
        {saving ? 'Saving…' : 'Save'}
      </PopButton>
    </Section>
  )
}

function Reviewed({ consultant, review, onSent, toast }) {
  // A pending request shows what you asked for, so a second edit starts
  // from it; otherwise the form starts from what is on your page.
  const from = review.status === 'pending' ? review : consultant
  const [form, setForm] = useState(() => ({
    categories: splitCategory(from.category).filter((c) => categories.includes(c)),
    credentials: (from.credentials || []).join(', '),
    degree: from.degree || '',
  }))
  const [cert, setCert] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function send() {
    if (sending || !form.categories.length) return
    setSending(true)
    setError('')
    try {
      const r = await sendForReview({
        category: form.categories.join(', '),
        credentials: list(form.credentials),
        degree: form.degree.trim(),
        degreeAssetId: cert?.id ?? null,
      })
      setCert(null)
      onSent(r)
      toast('Sent for review')
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <Section label="Checked by NAMO" className="mt-4">
      <p className="-mt-1 text-meta t-faint">
        Your practice, credentials and degree were checked when you were approved. A change goes to
        review and shows on your page once it is approved.
      </p>
      <Status review={review} />

      <p className="mt-6 text-micro uppercase tracking-caps text-t3">Practice</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={form.categories.includes(c)}
            onClick={() =>
              setForm((f) => {
                const on = f.categories.includes(c)
                if (on && f.categories.length === 1) return f
                return {
                  ...f,
                  categories: on
                    ? f.categories.filter((x) => x !== c)
                    : categories.filter((x) => x === c || f.categories.includes(x)),
                }
              })
            }
            className="pill caps-sm"
          >
            {c}
          </button>
        ))}
      </div>
      <Input
        label="Credentials"
        value={form.credentials}
        onChange={set('credentials')}
        placeholder="Jyotish Visharad, ICAS Certified"
      />
      <Input
        label="Degree"
        value={form.degree}
        onChange={set('degree')}
        placeholder="Jyotish Acharya, Banaras Hindu University, 2011"
      />
      <Certificate
        cert={cert}
        uploading={uploading}
        onPick={async (file) => {
          setUploading(true)
          setError('')
          try {
            const { assetId } = await uploadAsset(file, 'document')
            setCert({ id: assetId, name: file.name })
          } catch (err) {
            setError(err.message)
          } finally {
            setUploading(false)
          }
        }}
        onClear={() => setCert(null)}
      />
      {error && <p className="mt-4 text-meta text-live">{error}</p>}
      <PopButton
        className="mt-6"
        variant="ghost"
        onClick={send}
        disabled={sending || uploading || !form.categories.length}
      >
        {sending ? 'Sending…' : 'Send for review'}
      </PopButton>
    </Section>
  )
}

function Status({ review }) {
  if (review.status === 'pending') {
    return (
      <p className="mt-4 rounded-2xl bg-gold/10 px-4 py-3 text-meta t-heading">
        <span className="font-semibold">In review.</span> Your page shows the old details until it is
        approved. Sending again replaces this request.
      </p>
    )
  }
  if (review.status === 'rejected') {
    return (
      <p className="mt-4 rounded-2xl bg-live/10 px-4 py-3 text-meta t-heading">
        <span className="font-semibold">Not approved.</span>{' '}
        {review.review_note || 'Change the details and send again.'}
      </p>
    )
  }
  if (review.status === 'approved') {
    return <p className="mt-4 text-meta font-semibold text-ok">Your last change was approved.</p>
  }
  return null
}

/** The Basic profile, at the top of Edit profile (14 Oct 2026, Rahul: "so
 *  that all profile edits are in one place"): name and birth details. */
function BasicLink() {
  return (
    <div className="pt-4">
      <Row to="/onboarding/details?edit=1" title="Basic profile" note="Your name and birth details" />
    </div>
  )
}

/** Your intro, the first thing in Your Pro Profile (14 Oct 2026, Rahul). The
 *  username stays with the Basic profile, in Settings. */
function IntroRow() {
  const { consultant } = useStore()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Row onClick={() => setOpen(true)} title="Intro video or photo" note={introNote(consultant)} />
      {open && <IntroSheet onClose={() => setOpen(false)} />}
    </>
  )
}
