import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { sessionHistory } from '../data/mock.js'
import { LANGS } from '../data/i18n.js'
import { TopBar } from '../components/Chrome.jsx'
import { ChartNorth } from '../components/ChartSquare.jsx'
import { Kicker, PopAvatar, PopButton, PopCard, PopTag, Stat } from '../components/Pop.jsx'
import { Row, Segmented } from '../components/Primitives.jsx'
import { rupees, useStore, useProfileFields } from '../store.jsx'
import { housesFrom, longDate, readingFrom, signLine, useAstro, useMyChart } from '../lib/astro.js'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'horoscope', label: 'Horoscope' },
  { key: 'wallet', label: 'Wallet' },
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
 * Horoscope is a tab in here rather than a separate page — the tab bar spends
 * its five slots on Home / Consult / Live / Academy / Shop, and the daily
 * reading belongs to the person, not to a destination. The URL still carries
 * the tab (`/profile/horoscope`) so it stays deep-linkable and the header
 * shortcut on Home can land straight on it.
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
        <PopAvatar initials={me.initials} size={56} />
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
        {tab === 'horoscope' && <HoroscopeTab />}
        {tab === 'wallet' && <WalletTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>

      <div className="h-24" />
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
          <Row to="/wallet" title="Wallet" note="Balance, top-up and history" />
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

/* ── Horoscope tab ───────────────────────────────────────────────────────── */

/**
 * The daily reading, as a tab — the day itself and the reader's own three
 * placements, which are the two things here that are true.
 *
 * It used to carry a transit, a short reading, a focus card and four area
 * ratings. All four came from the canonical birth behind the rashi rather than
 * from the reader (`readingFrom()` in lib/astro.js has the field list), so they
 * are gone rather than relabelled. The placements stay because they come from
 * this person's own chart.
 */
function HoroscopeTab() {
  const { session, sessionReady } = useStore()
  const who = session?.user?.id ?? null
  const mine = useMyChart({ ready: sessionReady, who })
  const horoscope = useAstro('horoscope', { ready: sessionReady, who })

  const day = readingFrom(horoscope.payload, 'today', null)

  /* The whole tab is one reading. If there is not one, say why once at the top
     rather than four times down the page in four different empty cards. */
  if (horoscope.loading || horoscope.refusal) {
    return (
      <section className="px-5 py-8">
        {horoscope.loading ? (
          <p className="text-meta t-faint">Reading the sky.</p>
        ) : (
          <>
            <p className="text-body t-heading">{horoscope.refusal.reason}</p>
            {horoscope.refusal.code === 'no_birth' && (
              <Link to="/onboarding/date" className="mt-3 block caps-sm t-faint">
                Answer the four questions
              </Link>
            )}
          </>
        )}
      </section>
    )
  }

  return (
    <>
      {/* Summary cards */}
      <section className="border-b border-rule px-5 py-6">
        <Kicker action="Full reading" to="/horoscope">
          Today
        </Kicker>

        <PopCard raised className="mt-4 p-5">
          <p className="caps-sm gold">
            {longDate(day.date)}
            {/* NO RASHI LABEL HERE ANY MORE, 9 Sep. What survives of this
                reading is the panchang mood and the day's windows, and those
                are byte-identical across all twelve signs — checked. Naming a
                sign beside content that does not vary by sign claims a
                personalisation that is not there. The reader's own moon sign
                still appears where it is true: in Your placements below, off
                their own chart. */}
          </p>
          {/* THE HEADLINE AND THE OVERALL SCORE ARE GONE, 9 Sep. Both came
              from the canonical birth behind this rashi, and the score was
              weighted by that invented person's dasha — "the day's own score
              before you do anything with it" was not this reader's day. */}
          <p className="mt-3 text-read t-sub">{day.dayMood}</p>
        </PopCard>
      </section>

      {/* Sun / Moon / Rising */}
      <section className="border-b border-rule px-5 py-6">
        <Kicker action="Full chart" to="/chart">
          Your placements
        </Kicker>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            ['Sun', mine.sun, 'how you push'],
            ['Moon', mine.moon, 'how you feel'],
            // Null without a birth time, and named as the reason rather than
            // filled in from a noon the person did not give us.
            ['Rising', mine.rising, mine.rising ? 'how you land' : 'needs your birth time'],
          ].map(([label, sign, note]) => (
            <PopCard key={label} className="p-3">
              <p className="caps-sm gold">{label}</p>
              <p className="mt-2 text-body t-heading">{sign ?? '—'}</p>
              <p className="mt-1 caps-sm t-faint">{note}</p>
            </PopCard>
          ))}
        </div>
      </section>

      {/* THE TRANSIT, THE READING AND THE FOUR RATINGS STOOD HERE AND ARE
          GONE, 9 Sep. Every one was the canonical birth's: the only transits
          the payload carries are alignments to that person's dasha, the focus
          card is built on `remedy.basis.dominant_dasha_lord`, and love /
          career / health / money are scores weighted by both. The placements
          above are the reader's own and stay — they come from their chart. */}

    </>
  )
}

/* ── Wallet tab ──────────────────────────────────────────────────────────── */

/** A compact wallet summary. The full screen lives at `/profile/wallet`. */
function WalletTab() {
  const { balance, ledger, questionsLeft } = useStore()
  /* The seeded transactions are gone. They were denominated in rupees while
     real rows are paise, and a list mixing the two is off by a hundred on
     half its lines. The wallet starts with your own history and nothing
     else — the same call as showing 0 followers rather than 84,200. */
  const rows = ledger.slice(0, 5)

  return (
    <>
      <section className="border-b border-rule px-5 py-6">
        <PopCard raised className="p-5">
          <p className="caps-sm t-faint">Available balance</p>
          <p className="mt-2 font-display text-display leading-none tnum t-heading">
            {balance === null ? '—' : `₹${rupees(balance)}`}
          </p>
          {/* One button, not two. Both went to /wallet, and since phase 2 the
              gold one promised something that screen refuses — adding money
              waits for payments. */}
          <div className="mt-6">
            <PopButton size="sm" to="/wallet" variant="gold">
              Open wallet
            </PopButton>
          </div>
        </PopCard>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <PopCard className="p-4">
            <Stat label="Questions left" value={questionsLeft} />
          </PopCard>
          <PopCard className="p-4">
            <Stat label="Sessions" value={sessionHistory.length} sub="all time" />
          </PopCard>
        </div>
      </section>

      <section className="px-5 py-6">
        <Kicker action="All" to="/wallet">
          Recent
        </Kicker>
        <ul className="mt-4">
          {rows.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 border-b border-rule py-3.5 last:border-b-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-meta t-heading">{t.label}</span>
                <span className="mt-1 block caps-sm t-faint tnum">
                  {t.date} · {t.method}
                </span>
              </span>
              <span
                className={`flex-none text-meta tnum ${t.kind === 'credit' ? 'text-ok' : 't-sub'}`}
              >
                {t.kind === 'credit' ? '+' : '−'}₹{rupees(t.amountPaise)}
              </span>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="py-4 text-meta t-faint">Nothing yet.</li>
          )}
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
