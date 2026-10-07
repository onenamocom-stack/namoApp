import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Button, Label, Section } from '../components/Primitives.jsx'
import { Kicker, PopCard } from '../components/Pop.jsx'
import Plate from '../components/Plate.jsx'
import { categories } from '../data/mock.js'
import { rupees, useStore } from '../store.jsx'
import { applyAsConsultant, listPriceBands } from '../lib/consultants.js'
import { uploadAsset } from '../lib/media.js'
import { SEEKER_APP_URL as SEEKER_URL } from '../lib/urls.js'

/**
 * The front door to the consultant side, and the thing that did not exist
 * before phase 4: the "I give readings" card in onboarding linked straight to
 * `/pro/studio`, so anyone who tapped it *was* Ritu Kashyap, with no account,
 * no row and nothing of their own to look at.
 *
 * Five states, and the screen is all five because the gate sends every
 * unresolved `/pro` visit here:
 *
 *   no session          → sign up, reusing the seeker's own phone steps
 *   session, no row     → the application
 *   the read failed     → say so, and offer a retry. NOT the application: a
 *                         failed fetch is not the same answer as no practice
 *   status 'pending'    → under review, which is a real state and not a stall
 *   status 'approved'   → straight through to the studio
 *
 * A price is chosen from a band, never typed. The RLS policy on
 * `consultant_services` refuses anything else, so the six buttons below are
 * the interface to a rule rather than the rule itself.
 */
export default function ProApply() {
  const { session, consultant, consultantLoading, consultantError, refreshConsultant, showToast } =
    useStore()

  if (session && consultant?.status === 'approved') return <Navigate to="/pro/studio" replace />

  return (
    <div className="flex min-h-full flex-col px-5 pb-16 pt-8">
      {!session ? (
        <SignUp />
      ) : consultantLoading ? (
        <Label>Checking your practice.</Label>
      ) : consultant ? (
        <UnderReview status={consultant.status} />
      ) : consultantError ? (
        <CouldNotCheck onRetry={() => refreshConsultant(session.user.id)} />
      ) : (
        <Application
          onDone={() => refreshConsultant(session.user.id)}
          toast={showToast}
        />
      )}
    </div>
  )
}

/* The read failed, which is not the same as having no practice. Showing the
   application form here would tell a working consultant to sign up again. */
function CouldNotCheck({ onRetry }) {
  return (
    <>
      <h1 className="mx-auto mt-10 max-w-[16ch] text-center text-display font-semibold">
        We could not reach your practice.
      </h1>
      <p className="mx-auto mt-4 max-w-measure text-center text-meta t-sub">
        The connection failed, so we do not know whether you have one. This is not a decision
        about you. If your device clock is wrong, fix that first — it is the usual cause.
      </p>
      <Button variant="solid" className="mt-10" onClick={onRetry}>
        Try again
      </Button>
    </>
  )
}

/* ── Signed out ──────────────────────────────────────────────────────────── */

function SignUp() {
  return (
    <>
      <h1 className="mx-auto mt-6 max-w-[16ch] text-center text-display font-semibold">
        Your practice needs an account.
      </h1>
      <p className="mx-auto mt-4 max-w-measure text-center text-meta t-sub">
        Same phone verification the rest of the app uses. You do not give us your own birth
        details — a consultant is not here for a reading.
      </p>

      <PopCard className="mt-10 overflow-hidden">
        <Plate seed="pro-apply" variant="contour" className="!rounded-none h-28 w-full !shadow-none" />
        <div className="p-5">
          <Kicker>What happens next</Kicker>
          <ol className="mt-3 space-y-2 text-meta t-sub">
            <li>1. Verify your number.</li>
            <li>2. Tell us what you practise and pick a price band.</li>
            <li>3. We approve you. Until then you are invisible to seekers.</li>
          </ol>
        </div>
      </PopCard>

      {/* TWO DOORS, because two different people arrive here.
      
          One has never been a consultant and needs the whole application.
          The other already has a practice — approved, priced, maybe with
          sessions behind it — and only needs to get back in. There was
          one button, and it took both of them through sign-UP, which asks
          a returning consultant for a name the account already has.
      
          Sign in carries `mode=signin`, which is what makes Supabase
          refuse to mint a new account for a number nobody has verified —
          so a mistyped number says "we don't have an account for that"
          instead of quietly creating a second one. */}
      <Button to="/onboarding/name?next=pro" variant="solid" className="mt-10">
        Apply as a consultant
      </Button>
      <Button
        to="/onboarding/phone?next=pro&mode=signin"
        variant="quiet"
        className="mt-3"
      >
        I already have an account
      </Button>
      <a href={SEEKER_URL} className="mx-auto mt-6 block text-meta text-t3 underline hover:text-t1">
        I am looking for a reading instead
      </a>
    </>
  )
}

/* ── Applied, waiting ────────────────────────────────────────────────────── */

function UnderReview({ status }) {
  const blocked = status === 'blocked'
  return (
    <>
      <h1 className="mx-auto mt-10 max-w-[16ch] text-center text-display font-semibold">
        {blocked ? 'Your practice is closed.' : 'We are reading your application.'}
      </h1>
      <p className="mx-auto mt-4 max-w-measure text-center text-meta t-sub">
        {blocked
          ? 'You are not visible to seekers and cannot take bookings. Reply to the email we sent if you think this is wrong.'
          : 'Until it clears you are invisible to seekers, unbookable, and earning nothing. That is deliberate — nobody should be able to book a practice nobody has read.'}
      </p>
      <a href={SEEKER_URL} className="mx-auto mt-10 block text-meta text-t3 underline hover:text-t1">
        Go to the seeker app
      </a>
    </>
  )
}

/* ── The application ─────────────────────────────────────────────────────── */

/* No `profileId` prop any more: the application used to send it as the row's
   primary key, and the JWT is the identity now. The caller stopped passing
   it in the same commit. */
function Application({ onDone, toast }) {
  const [bands, setBands] = useState([])
  const [form, setForm] = useState({
    // More than one practice (5 Oct 2026, owner's request): saved as one
    // comma-separated `category`, "Astrologer, Tarot", read back as a list.
    categories: [categories[0]],
    specialization: '',
    languages: 'Hindi, English',
    experience: '',
    bio: '',
    credentials: '',
    tags: '',
    degree: '',
    tier: null,
  })
  /* The certificate, once it is uploaded: { id, name }. The file goes to
     the private bucket the moment it is picked rather than on submit, so a
     slow scan uploads while the rest of the form is still being typed —
     and so a refused file (wrong type, too big) is said here instead of
     after everything else was filled in. */
  const [cert, setCert] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    /* The active-only filter and the tier sort moved to the server with the
       endpoint; this reads whatever `listPriceBands()` returns. */
    listPriceBands()
      .then((data) => setBands(data ?? []))
      .catch((err) => setError(err.message))
  }, [])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  // The 20-minute row is the one quoted, the same session the whole app is
  // priced against. The other three come with the tier.
  const tiers = bands.filter((b) => b.billing === 'fixed' && b.duration_mins === 20)
  const valid = form.specialization.trim() && form.bio.trim() && form.tier

  const submit = async () => {
    if (!valid || saving) return
    setSaving(true)
    setError('')

    const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean)

    /* Two writes became one call, and that is the point of the move rather
       than tidiness: the consultants row and its service rows now land in a
       single server transaction (INSTRUCTIONS.md rule 5). Under PostgREST a
       failure on the second insert left an applicant with a practice and no
       prices, and nothing rolled the first one back.

       `profile_id` is gone from the body. It had to be sent explicitly when
       the write policy was `profile_id = auth.uid()`; the JWT is the
       identity now, and a client-supplied one would be rule 3's bug.

       `status` is still absent and still cannot be here — the row lands
       'pending' server-side. Approval is not something the applicant
       participates in. The tier goes up as a name and the server copies
       that band's prices itself, so the browser never sends a price. */
    try {
      await applyAsConsultant({
        category: form.categories.join(', '),
        specialization: form.specialization.trim(),
        languages: list(form.languages),
        experienceYrs: parseInt(form.experience, 10) || null,
        bio: form.bio.trim(),
        credentials: list(form.credentials),
        tags: list(form.tags),
        degree: form.degree.trim(),
        degreeAssetId: cert?.id ?? null,
        tier: form.tier,
      })
    } catch (err) {
      setError(err.message)
      setSaving(false)
      return
    }

    setSaving(false)
    toast('Application sent. We will read it.')
    onDone()
  }

  return (
    <>
      <h1 className="mx-auto mt-4 max-w-[18ch] text-center text-display font-semibold">
        Tell us what you practise.
      </h1>
      <p className="mx-auto mt-3 max-w-measure text-center text-meta t-sub">
        This is what a seeker reads before they book you. Write it the way you would say it.
      </p>

      <Section label="Practice" className="mt-10">
        <p className="-mt-1 mb-3 text-meta t-faint">Pick every one you practise.</p>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={form.categories.includes(c)}
              onClick={() =>
                setForm((f) => {
                  const on = f.categories.includes(c)
                  // At least one stays chosen: a practice of nothing is not an application.
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

        <Input label="Specialization" value={form.specialization} onChange={set('specialization')}
               placeholder="Vedic astrology · Career & timing" />
        <Input label="Languages" value={form.languages} onChange={set('languages')} placeholder="Hindi, English" />
        <Input label="Years of practice" value={form.experience} onChange={set('experience')}
               placeholder="12" inputMode="numeric" />
        <Input label="Credentials" value={form.credentials} onChange={set('credentials')}
               placeholder="Jyotish Visharad, ICAS Certified" />
        {/* Free text, comma separated. A seeker searches with words the
            five categories do not carry — "manglik", "kundli milan",
            "career" — and a fixed list would be curated by the people who
            do not take the bookings. */}
        <Input label="Tags" value={form.tags} onChange={set('tags')}
               placeholder="manglik, kundli milan, career, vastu" />
        <Input label="Degree" value={form.degree} onChange={set('degree')}
               placeholder="Jyotish Acharya, Banaras Hindu University, 2011" />
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

        <label className="mt-6 block">
          <span className="text-micro uppercase tracking-caps text-t3">How you read</span>
          <textarea
            value={form.bio}
            onChange={set('bio')}
            rows={5}
            placeholder="I read charts the way a doctor reads a scan. Pattern first, prescription second."
            className="mt-2 w-full resize-none border-b border-rule bg-transparent pb-3 text-body text-t1 outline-none transition-colors placeholder:text-t4 focus:border-t1"
          />
        </label>
      </Section>

      <Section label="Price">
        <p className="text-meta t-sub">
          Six bands, set by the platform. You choose one — you do not type a number. It carries
          your 15, 20 and 30 minute sessions and your per-minute rate for instant calls.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {tiers.map((b) => (
            <button
              key={b.id}
              type="button"
              aria-pressed={form.tier === b.tier}
              onClick={() => setForm((f) => ({ ...f, tier: b.tier }))}
              className="pill caps-sm justify-center tnum"
            >
              ₹{rupees(b.price_paise)}
            </button>
          ))}
        </div>
        {form.tier && <TierDetail bands={bands} tier={form.tier} />}
      </Section>

      {error && <p className="mt-6 text-center text-meta text-live">{error}</p>}

      <Button variant="solid" className="mt-10" onClick={submit} disabled={!valid || saving}>
        {saving ? 'Sending…' : 'Send application'}
      </Button>
      <p className="mx-auto mt-4 max-w-measure text-center text-micro text-t3">
        Nothing to pay up front.
      </p>
    </>
  )
}

function TierDetail({ bands, tier }) {
  const mine = bands.filter((b) => b.tier === tier)
  const perMinute = mine.find((b) => b.billing === 'per_minute')
  const fixed = mine.filter((b) => b.billing === 'fixed').sort((a, b) => a.duration_mins - b.duration_mins)

  return (
    <p className="mt-4 text-meta t-sub tnum">
      {fixed.map((b) => `${b.duration_mins} min · ₹${rupees(b.price_paise)}`).join('   ')}
      {perMinute && `   ·   ₹${rupees(perMinute.price_paise)} a minute`}
    </p>
  )
}

/**
 * The degree certificate — optional, and private.
 *
 * Most practitioners in this market have no certificate to scan, so this
 * never blocks an application. What it does do is say where the file goes:
 * a scan carries a full name, often a date of birth and a registration
 * number, and it lands in a bucket with no public URL. The only reader is
 * whoever decides the application, through a link the console signs for ten
 * minutes.
 */
function Certificate({ cert, uploading, onPick, onClear }) {
  const input = useRef(null)
  return (
    <label className="mt-5 block">
      <span className="text-micro uppercase tracking-caps text-t3">Certificate</span>
      {cert ? (
        <div className="mt-1.5 flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-body t-body">{cert.name}</span>
          <button type="button" onClick={onClear} className="flex-none caps-sm text-t2 underline">
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => input.current?.click()}
          className="field-line mt-1.5 w-full text-left disabled:opacity-40"
        >
          {uploading ? 'Uploading…' : 'Attach a copy — PDF or photo, up to 5 MB'}
        </button>
      )}
      <span className="mt-1.5 block text-micro t-faint">
        Optional. Only the reviewer sees it, through a link that expires; it is never shown to
        seekers.
      </span>
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onPick(file)
        }}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
    </label>
  )
}

function Input({ label, ...rest }) {
  return (
    <label className="mt-6 block">
      <span className="text-micro uppercase tracking-caps text-t3">{label}</span>
      <input
        {...rest}
        className="mt-2 w-full border-b border-rule bg-transparent pb-3 text-body text-t1 outline-none transition-colors placeholder:text-t4 focus:border-t1"
      />
    </label>
  )
}
