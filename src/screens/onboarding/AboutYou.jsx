import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BackButton, useGoBack } from '../../components/Chrome.jsx'
import CodeField from '../../components/CodeField.jsx'
import PlaceField, { placeLabel } from '../../components/PlaceField.jsx'
import {
  DateField,
  TimeField,
  from24,
  isValidDate,
  isValidTime,
} from '../../components/BirthInputs.jsx'
import { Button } from '../../components/Primitives.jsx'
import { clearAstroCache } from '../../lib/astro.js'
import { SIGNUP_REF_KEY, claimCode, takeReturnPath } from '../../lib/referrals.js'
import { clearBirthDraft, useStore } from '../../store.jsx'
import { birthFields, warmCharts } from './Computing.jsx'

const GENDERS = ['male', 'female', 'other']
// Keys of backend-django/apps/profiles/interests.py, in the order shown.
export const INTERESTS = [
  'bhakti', 'astrology', 'yoga', 'meditation', 'mantra', 'ayurveda',
  'festivals', 'temples', 'scripture', 'jain', 'vastu', 'numerology',
]
const MIN_PICK = 3
const MAX_PICK = 5
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** "1997-08-09" → "09/08/1997". */
const toDdMmYyyy = (iso) => (iso ? iso.split('-').reverse().join('/') : '')

/**
 * Sign-up without birth details (13 Oct 2026, docs/06 Phase 15a): a name and
 * three to five interests, then Home. The kundli, rashifal and matching ask
 * for birth details the first time they need them, by sending you to this
 * page as `?edit=1&need=1&next=<where you were>`.
 *
 * Until then, every birth detail on one page (3 Oct 2026):
 *
 * Replaced six one-question screens (name, gender, date, time, place, phone +
 * email) that the owner found tiring to tap through. The account already
 * exists by the time anyone sees this — Welcome verified the phone — so it
 * only collects the profile and hands over to Computing, which writes it and
 * plays the one-time reveal.
 *
 * `?edit=1` is Profile's "Edit birth details": the same page, prefilled from
 * the profile, saving straight back with no reveal. Birth details are
 * required there only when asked for (`need=1`), already on file, or begun.
 *
 * The rules the old steps enforced are all still here: a real calendar date,
 * a 12-hour time or an explicit "don't know" (stored as NULL, never as a
 * guessed midnight), and a place from the geocoder so the birth zone is the
 * place's own and never defaulted.
 */
export default function AboutYou() {
  const navigate = useNavigate()
  const goBack = useGoBack('/profile')
  const [params] = useSearchParams()
  const edit = params.get('edit') === '1'
  const need = params.get('need') === '1'
  // Back to the screen that asked; a path on this site only.
  const next = (params.get('next') || '').startsWith('/') ? params.get('next') : null
  const { t, profile, session, sessionReady, saveProfile, refreshProfile, showToast } =
    useStore()

  const [name, setName] = useState('')
  const [gender, setGender] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [ampm, setAmpm] = useState('AM')
  const [unknown, setUnknown] = useState(false)
  const [place, setPlace] = useState(null)
  const [email, setEmail] = useState('')
  // Your About line, edited here and only here (13 Oct 2026, Rahul): one
  // place to change your profile. Profile shows it without a pencil.
  const [bio, setBio] = useState('')
  const [interests, setInterests] = useState([])
  const filled = useRef(false)

  /* Edit mode fills from the profile once it arrives. A direct open or a
     reload mounts this page before the profile loads, so initial state alone
     left every field blank. */
  useEffect(() => {
    if (!edit || !profile || filled.current) return
    filled.current = true
    const start = from24(profile.birth_time)
    setName(profile.name && profile.name !== 'there' ? profile.name : '')
    setGender(profile.gender ?? '')
    setDate(toDdMmYyyy(profile.birth_date))
    setTime(start.time)
    setAmpm(start.ampm)
    setUnknown(profile.birth_time_known === false)
    setPlace(
      profile.birth_place
        ? { label: profile.birth_place, lat: profile.birth_lat, lng: profile.birth_lon, timezone: profile.birth_zone }
        : null,
    )
    setEmail(profile.email ?? '')
    setBio(profile.bio ?? '')
    setInterests(profile.interests ?? [])
  }, [edit, profile])
  // A code carried in by a sign-up link (Welcome stores it) arrives filled in.
  const [referral, setReferral] = useState(() => {
    try {
      return sessionStorage.getItem(SIGNUP_REF_KEY) || ''
    } catch {
      return ''
    }
  })
  const [showReferral, setShowReferral] = useState(() => Boolean(referral))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // The account comes first (Welcome). Without a session there is nothing to save to.
  useEffect(() => {
    if (sessionReady && !session) navigate('/onboarding', { replace: true })
  }, [sessionReady, session, navigate])

  // Birth details: on the details page, when asked for, on file, or begun.
  const birthWanted = edit && (need || Boolean(profile?.birth_date) || Boolean(date || time || place))
  const picks = interests.length
  const missing = [
    !name.trim() && t('d.name'),
    // Sign-up must pick; the details page may leave none, never one or two.
    (!edit ? picks < MIN_PICK : picks > 0 && picks < MIN_PICK) && t('d.interests'),
    birthWanted && !gender && t('d.gender'),
    birthWanted && !isValidDate(date) && t('d.date'),
    birthWanted && !unknown && !isValidTime(time) && t('d.time'),
    birthWanted && !place && t('d.place'),
  ].filter(Boolean)
  const emailOk = !email.trim() || EMAIL.test(email.trim())
  const ready = missing.length === 0 && emailOk && !saving

  const draft = () => ({
    date,
    time: unknown ? '' : `${time} ${ampm}`,
    timeKnown: !unknown,
    place: placeLabel(place),
    lat: place.lat,
    lon: place.lng ?? place.lon,
    // The birth place's own zone, from the geocoder. Never defaulted.
    zone: place.timezone ?? place.zone,
  })

  async function submit() {
    if (!ready) return
    setError('')

    if (edit) {
      setSaving(true)
      try {
        await saveProfile({
          name: name.trim(),
          email: email.trim() || null,
          bio: bio.trim(),
          ...(picks ? { interests } : {}),
          ...(birthWanted ? { gender, ...birthFields(draft()) } : {}),
        })
        if (birthWanted) {
          clearAstroCache()
          clearBirthDraft()
        }
        await refreshProfile(session.user.id)
        if (birthWanted) warmCharts(session.user.id)
        showToast('Saved')
        navigate(next || '/profile', { replace: true })
      } catch (e) {
        setError(e.message)
      } finally {
        setSaving(false)
      }
      return
    }

    // Sign-up: name and interests, saved here; no chart yet, so no reveal.
    setSaving(true)
    try {
      await saveProfile({ name: name.trim(), email: email.trim() || null, interests })
      await refreshProfile(session.user.id)
    } catch (e) {
      setError(e.message)
      setSaving(false)
      return
    }
    setSaving(false)

    /* A referral is a perk, not a gate: claimed now that there is a session,
       and a refusal is a toast while sign-up carries on. */
    const code = referral.trim()
    if (code) {
      claimCode(code)
        .then(() => showToast('Referral applied. Three free questions a day from tomorrow.'))
        .catch((e) => showToast(e.message))
        .finally(() => {
          try {
            sessionStorage.removeItem(SIGNUP_REF_KEY)
          } catch {
            /* nothing to clear */
          }
        })
    }
    // A new account from a shared link goes back to that page (16 Oct 2026).
    navigate(takeReturnPath() ?? '/home', { replace: true })
  }

  const toggleInterest = (key) =>
    setInterests((now) =>
      now.includes(key) ? now.filter((k) => k !== key) : now.length < MAX_PICK ? [...now, key] : now,
    )

  return (
    <div className="flex min-h-full flex-col px-6 pb-8 pt-6">
      {edit && (
        <BackButton onClick={next ? () => navigate(-1) : goBack} className="self-start" />
      )}

      <div className={`${edit ? 'mt-2' : 'mt-6'} animate-fade-rise`}>
        <h1 className="text-title font-semibold text-t1">
          {need ? t('d.birthTitle') : edit ? t('d.editDetails') : t('d.title')}
        </h1>
        <p className="mt-2 text-meta text-t2">{t(need ? 'd.birthHint' : edit ? 'd.editHint' : 'd.signupHint')}</p>
      </div>

      <div className="mt-7 space-y-6">
        <Group label={t('d.name')} required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('d.namePh')}
            autoComplete="name"
            autoCapitalize="words"
            className="field-line !text-lead"
          />
        </Group>

        {edit && !need && (
          <Group label={t('d.about')}>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 150))}
              rows={3}
              placeholder={t('prof.bioPh')}
              className="w-full resize-none rounded-xl border border-rule bg-white px-3 py-2 text-body text-t1 outline-none focus:border-gold-fill"
            />
            <p className="mt-1 text-right text-[11px] tnum t-faint">{bio.length}/150</p>
          </Group>
        )}

        {!need && (
          <Group label={t('d.interests')} required={!edit}>
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={interests.includes(key)}
                  onClick={() => toggleInterest(key)}
                  className="pill !py-2 text-meta"
                >
                  {t(`i.${key}`)}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[12px] tnum text-t3">{t('d.interestsCount', { n: picks })}</p>
          </Group>
        )}

        {edit && !need && <p className="pt-2 text-meta font-semibold text-t2">{t('d.birthGroup')}</p>}

        {edit && (
        <>
        <Group label={t('d.gender')} required={birthWanted}>
          <div className="grid grid-cols-3 gap-2">
            {GENDERS.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={gender === g}
                onClick={() => setGender(g)}
                className="pill justify-center !py-2.5 text-meta"
              >
                {t(`d.${g}`)}
              </button>
            ))}
          </div>
        </Group>

        <Group label={t('d.date')} required={birthWanted}>
          <DateField value={date} onChange={setDate} className="field-line !text-lead" />
        </Group>

        <Group label={t('d.time')} required={birthWanted}>
          <TimeField
            value={time}
            onChange={setTime}
            ampm={ampm}
            onAmpm={setAmpm}
            disabled={unknown}
            className="field-line !text-lead"
          />
          <label className="mt-3 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={unknown}
              onChange={(e) => {
                setUnknown(e.target.checked)
                if (e.target.checked) setTime('')
              }}
              className="mt-0.5 h-5 w-5 flex-none accent-[var(--gold-fill)]"
            />
            <span>
              <span className="block text-meta text-t1">{t('d.timeUnknown')}</span>
              {unknown && <span className="mt-1 block text-[12px] text-t3">{t('d.timeUnknownNote')}</span>}
            </span>
          </label>
        </Group>

        <Group label={t('d.place')} required={birthWanted}>
          <PlaceField place={place} onPick={setPlace} placeholder={t('d.placePh')} />
        </Group>
        </>
        )}

        <Group label={t('d.email')}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck="false"
            className="field-line"
          />
          {!emailOk && <p className="mt-1 text-[12px] text-live">you@example.com</p>}
        </Group>

        {!edit &&
          (showReferral ? (
            <CodeField
              value={referral}
              onChange={setReferral}
              label={t('d.referral')}
              placeholder="NXXXXXXX"
              hint="Invited by someone? You both get three free questions a day for three days."
            />
          ) : (
            <button type="button" onClick={() => setShowReferral(true)} className="text-meta font-medium text-gold">
              {t('d.referral')}
            </button>
          ))}
      </div>

      <div className="mt-auto pt-8">
        {missing.length > 0 && (name || date || place || picks > 0) && (
          <p className="mb-3 text-center text-[12px] text-t3">{t('d.missing', { list: missing.join(', ') })}</p>
        )}
        {error && <p className="mb-3 text-center text-meta text-live">{error}</p>}
        <Button variant="solid" onClick={submit} disabled={!ready}>
          {saving ? t('d.saving') : edit ? t('d.saveEdit') : t('d.join')}
        </Button>
      </div>
    </div>
  )
}

function Group({ label, required = false, children }) {
  return (
    <div>
      <p className="mb-2 text-meta font-semibold text-t1">
        {label}
        {/* Red asterisk on required fields (owner's request, 4 Oct). */}
        {required && (
          <span className="ml-0.5 text-live" aria-hidden="true">
            *
          </span>
        )}
      </p>
      {children}
    </div>
  )
}
