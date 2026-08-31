import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Button, Label, Section } from '../components/Primitives.jsx'
import { Kicker, PopCard } from '../components/Pop.jsx'
import Plate from '../components/Plate.jsx'
import { categories } from '../data/mock.js'
import { rupees, useStore } from '../store.jsx'
import { supabase } from '../lib/supabase.js'

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
          profileId={session.user.id}
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
      <h1 className="mx-auto mt-10 max-w-[16ch] text-center text-display font-light">
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
      <h1 className="mx-auto mt-6 max-w-[16ch] text-center text-display font-light">
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

      <Button to="/onboarding/name?next=pro" variant="solid" className="mt-10">
        Verify your number
      </Button>
      <Link to="/home" className="mx-auto mt-6 block text-meta text-t3 underline hover:text-t1">
        I am looking for a reading instead
      </Link>
    </>
  )
}

/* ── Applied, waiting ────────────────────────────────────────────────────── */

function UnderReview({ status }) {
  const blocked = status === 'blocked'
  return (
    <>
      <h1 className="mx-auto mt-10 max-w-[16ch] text-center text-display font-light">
        {blocked ? 'Your practice is closed.' : 'We are reading your application.'}
      </h1>
      <p className="mx-auto mt-4 max-w-measure text-center text-meta t-sub">
        {blocked
          ? 'You are not visible to seekers and cannot take bookings. Reply to the email we sent if you think this is wrong.'
          : 'Until it clears you are invisible to seekers, unbookable, and earning nothing. That is deliberate — nobody should be able to book a practice nobody has read.'}
      </p>
      <Link to="/home" className="mx-auto mt-10 block text-meta text-t3 underline hover:text-t1">
        Go to the seeker app
      </Link>
    </>
  )
}

/* ── The application ─────────────────────────────────────────────────────── */

function Application({ profileId, onDone, toast }) {
  const [bands, setBands] = useState([])
  const [form, setForm] = useState({
    category: categories[0],
    specialization: '',
    languages: 'Hindi, English',
    experience: '',
    bio: '',
    credentials: '',
    tier: null,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('price_bands')
      .select('*')
      .eq('active', true)
      .order('tier')
      .then(({ data, error: err }) => {
        if (err) return setError(err.message)
        setBands(data ?? [])
      })
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

    /* No `status` in this insert, and there could not be one: the column grant
       does not include it (007_consultants.sql). The row lands 'pending' by
       default and only the database GUI moves it — approval is not something
       the applicant participates in. */
    const { data: row, error: cErr } = await supabase
      .from('consultants')
      .insert({
        /* Sent explicitly, and it has to be: the table's primary key has no
           default, and the write policy is `profile_id = auth.uid()`. Omitting
           it made the check compare null to the caller and the row was refused
           with "new row violates row-level security policy" — which reads like
           a permissions bug and is really a missing field. It is not a
           client-supplied identity in the rule-3 sense either: the policy is
           what decides whose row this is, and a lie here is a refusal. */
        profile_id: profileId,
        category: form.category,
        specialization: form.specialization.trim(),
        languages: list(form.languages),
        experience_yrs: parseInt(form.experience, 10) || null,
        bio: form.bio.trim(),
        credentials: list(form.credentials),
      })
      .select()
      .single()

    if (cErr) {
      setError(cErr.message)
      setSaving(false)
      return
    }

    const mine = bands.filter((b) => b.tier === form.tier)
    const { error: sErr } = await supabase.from('consultant_services').insert(
      mine.map((b, n) => ({
        consultant_id: row.profile_id,
        band_id: b.id,
        mode: 'call',
        billing: b.billing,
        duration_mins: b.duration_mins,
        price_paise: b.price_paise,
        sort: n * 10,
      })),
    )
    if (sErr) setError(sErr.message)

    setSaving(false)
    toast('Application sent. We will read it.')
    onDone()
  }

  return (
    <>
      <h1 className="mx-auto mt-4 max-w-[18ch] text-center text-display font-light">
        Tell us what you practise.
      </h1>
      <p className="mx-auto mt-3 max-w-measure text-center text-meta t-sub">
        This is what a seeker reads before they book you. Write it the way you would say it.
      </p>

      <Section label="Practice" className="mt-10">
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={form.category === c}
              onClick={() => setForm((f) => ({ ...f, category: c }))}
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
        We take 18% of every session. Nothing else, and nothing up front.
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
