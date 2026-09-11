import { useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { sessionHistory } from '../data/mock.js'
import { LANGS } from '../data/i18n.js'
import { TopBar } from '../components/Chrome.jsx'
import Icon from '../components/Icon.jsx'
import { uploadAvatar } from '../lib/avatar.js'
import { ChartNorth } from '../components/ChartSquare.jsx'
import { Kicker, PopAvatar, PopButton, PopTag } from '../components/Pop.jsx'
import { Row, Segmented } from '../components/Primitives.jsx'
import { useStore, useProfileFields } from '../store.jsx'
import { housesFrom, signLine, useMyChart } from '../lib/astro.js'

/**
 * Two, since 9 Sep 2026. Horoscope and Wallet were tabs here and are now
 * places of their own: the reading is Home's Today tab, and the wallet is in
 * the top bar on every screen. Both were summaries whose only real control
 * was a button to the full screen, which is a tab that exists to be left.
 */
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'settings', label: 'Settings' },
]

const SETTINGS = [
  { key: 'Language', value: 'English' },
  { key: 'Notifications', value: 'Daily at 08:00' },
  { key: 'Privacy & data', value: 'On device' },
  { key: 'Help & support', value: null },
]

/**
 * Profile.
 *
 * Two tabs, and the URL carries which (`/profile/settings`) so both stay
 * deep-linkable. `overview` maps to the bare `/profile` so the default has
 * one address rather than two.
 *
 * Horoscope was a third tab and Wallet a fourth. The reading is Home's Today
 * tab now and the wallet is in the top bar on every screen, which is where a
 * balance you check constantly belongs. What was here were summaries whose
 * only real control was a button to the full screen.
 */
export default function Profile() {
  const { tab = 'overview' } = useParams()
  const navigate = useNavigate()
  const me = useProfileFields()
  const { session, sessionReady } = useStore()
  const mine = useMyChart({ ready: sessionReady, who: session?.user?.id ?? null })

  if (!TABS.some((t) => t.key === tab)) return <Navigate to="/profile" replace />

  return (
    <>
      {/* hardBack: from Profile, "back" means Home — never an arbitrary
          previous screen. */}
      <TopBar title="Profile" back backTo="/home" hardBack />

      <section className="flex items-center gap-4 border-b border-stroke px-5 py-6">
        <AvatarPicker />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-title leading-none t-heading">{me.name}</h1>
          {/* Empty while the chart is in flight, rather than three dashes that
              flash into signs. Two of the three when the birth time is
              unknown — the ascendant is not guessed here. */}
          <p className="mt-2 caps-sm t-faint">{signLine(mine)}</p>
        </div>
        <PopTag tone="gold">Member</PopTag>
      </section>

      <Segmented
        items={TABS}
        value={tab}
        onChange={(k) => navigate(k === 'overview' ? '/profile' : `/profile/${k}`)}
      />

      <div key={tab} className="animate-fade">
        {tab === 'overview' && <Overview />}
        {tab === 'settings' && <SettingsTab />}
      </div>

      <div className="h-24" />
    </>
  )
}

/**
 * Your face, and the one control that sets it.
 *
 * The avatar is the button rather than carrying a button beside it — it is the
 * thing being changed, it is already a 56px tap target, and a separate "change
 * picture" row would be a second affordance for a job the first one implies.
 *
 * Only your own picture is readable (`027`), so this is the only place in the
 * app that can offer this. Everybody else's face needs a public projection
 * that does not exist yet.
 */
function AvatarPicker() {
  const { me, showToast, refreshProfile, session } = useStore()
  const input = useRef(null)
  const [busy, setBusy] = useState(false)

  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // so re-picking the same file still fires
    if (!file) return

    setBusy(true)
    try {
      await uploadAvatar(file)
      /* The row is written; the store is not. Without this the header keeps
         the old face until a reload, which reads as the upload having failed. */
      await refreshProfile(session?.user?.id)
      showToast('Picture updated')
    } catch (err) {
      showToast(err.message || 'Could not update that picture.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={me.avatarUrl ? 'Change your picture' : 'Add a picture'}
        className="relative flex-none rounded-full transition-transform active:scale-95"
      >
        <PopAvatar initials={me.initials} src={me.avatarUrl} size={56} />
        <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink text-white ring-2 ring-bg">
          <Icon name={busy ? 'check' : 'plus'} size={11} />
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        onChange={pick}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
    </>
  )
}

/* ── Overview ────────────────────────────────────────────────────────────── */

function Overview() {
  const { showToast, questionsLeft, cartCount, lang, setLang, t, session, sessionReady } =
    useStore()
  const me = useProfileFields()
  const mine = useMyChart({ ready: sessionReady, who: session?.user?.id ?? null })
  const houses = housesFrom(mine.chart, mine.timeKnown)

  return (
    <>
      <section className="border-b border-rule px-5 py-6 text-center">
        {/* The same diagram /chart draws, because there is only one now. */}
        <ChartNorth size={200} houses={houses} />
        <div className="mt-6 flex gap-3">
          <PopButton onClick={() => showToast('Kundli PDF downloaded')}>Download</PopButton>
          <PopButton onClick={() => showToast('Chart link copied')}>Share</PopButton>
        </div>
      </section>

      <section className="border-b border-rule px-5 py-6">
        <Kicker>Birth data</Kicker>
        <dl className="mt-4">
          {[
            ['Date', me.birthDate],
            // A guess stored as a fact is what this column exists to prevent,
            // so a birth with no known time says so instead of showing one.
            ['Time', me.birthTimeKnown ? me.birthTime : 'Not known'],
            ['Place', me.birthPlace],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-6 border-b border-rule py-3">
              <dt className="caps-sm t-faint">{k}</dt>
              <dd className="text-meta tnum t-heading">{v}</dd>
            </div>
          ))}
        </dl>
        <PopButton to="/onboarding/date" className="mt-5">
          Edit birth details
        </PopButton>
      </section>

      {/* ── Language ─────────────────────────────────────────────────────
          A pill pair rather than a Row into a sub-screen: there are two
          options and switching is the whole interaction, so a page to hold it
          would be a page you visit once and never again. */}
      <section className="border-b border-rule px-5 py-6">
        <Kicker>{t('set.language')}</Kicker>
        <div className="mt-3 flex gap-2">
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              aria-pressed={lang === l.code}
              onClick={() => setLang(l.code)}
              className="pill flex-1"
            >
              {l.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-meta t-faint">{t('set.langNote')}</p>
      </section>

      <section className="border-b border-rule px-5 py-6">
        <Kicker>Everything else</Kicker>
        <div className="mt-2">
          <Row to="/chart" title="Your full chart" note="Nine placements, plainly written" />
          <Row to="/people" title="People" note="Charts you have read against yours" />
          <Row to="/reports" title="Reports" note="Long-form readings, written once" />
          <Row to="/premium" title="Premium" note="Eros, packs and more questions" />
          <Row to="/academy" title="Academy" note="Courses, events and downloads" />
          <Row to="/ask" title="Ask the Stars" meta={`${questionsLeft} left`} />
          <Row to="/shop" title="Shop" meta={`${cartCount} in cart`} />
        </div>
      </section>

      <section className="px-5 py-6">
        <Kicker action="All" onAction={() => showToast('Full history — prototype only')}>
          Past sessions
        </Kicker>
        <ul className="mt-4">
          {sessionHistory.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => showToast(`Receipt · ${s.consultant}`)}
                className="flex w-full items-center gap-3 border-b border-rule py-3.5 text-left transition-opacity hover:opacity-70"
              >
                <PopAvatar initials={s.initials} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-meta t-heading">{s.consultant}</span>
                  <span className="mt-1 block caps-sm t-faint tnum">
                    {s.type} · {s.date}
                  </span>
                </span>
                <span className="flex-none text-right">
                  <span className="block text-meta tnum t-sub">
                    {s.amount ? `₹${s.amount.toLocaleString('en-IN')}` : '—'}
                  </span>
                  <span
                    className={`block caps-sm ${s.status === 'Completed' ? 'text-ok' : 'text-live'}`}
                  >
                    {s.status}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

/* ── Settings tab ────────────────────────────────────────────────────────── */

function SettingsTab() {
  const { showToast, hasFlag, toggleFlag } = useStore()
  // Full/uncropped is the default now; the flag is an opt-in back to the
  // screen-filling crop, so its absence is the common case.
  const fullImage = !hasFlag('setting:croppedDeityImage')

  return (
    <>
      <section className="border-b border-rule px-5 py-6">
        <Kicker>Consulting</Kicker>
        <div className="mt-2">
          {/* Plain navigation — the URL is what decides which side you are on,
              so there is no role to toggle. */}
          <Row
            to="/pro/studio"
            title="Switch to consultant"
            note="Your studio, your sessions, your page"
          />
        </div>
      </section>

      <section className="border-b border-rule px-5 py-6">
        <Kicker>Preferences</Kicker>
        <div className="mt-2">
          <Row
            onClick={() =>
              toggleFlag('setting:croppedDeityImage', {
                on: 'Back to the cropped, screen-filling murti',
                off: 'Full deity image on — the murti will no longer be cropped',
              })
            }
            title="Full deity image"
            note="Show the complete murti, uncropped"
            meta={fullImage ? 'On' : 'Off'}
          />
          {SETTINGS.map((s) => (
            <Row
              key={s.key}
              onClick={() => showToast(`${s.key} — prototype only`)}
              title={s.key}
              meta={s.value}
            />
          ))}
        </div>
      </section>

      <section className="px-5 py-6">
        <Kicker>About</Kicker>
        <p className="mt-4 text-meta t-body">
          Namo. A front-end layout prototype — no backend, no auth, no network calls. Every value
          on screen comes from one hardcoded file, and nothing survives a reload.
        </p>
        <PopButton to="/onboarding" className="mt-5">
          Run onboarding again
        </PopButton>
        <Link to="/notifications" className="mt-4 block text-center caps-sm t-faint">
          Notification history
        </Link>
      </section>
    </>
  )
}
