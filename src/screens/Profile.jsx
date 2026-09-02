import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { sessionHistory } from '../data/mock.js'
import { LANGS } from '../data/i18n.js'
import { TopBar } from '../components/Chrome.jsx'
import ChartWheel from '../components/ChartWheel.jsx'
import { ChartNorth, ChartSouth } from '../components/ChartSquare.jsx'
import { Kicker, PopAvatar, PopBar, PopButton, PopCard, PopTag, Stat } from '../components/Pop.jsx'
import { Acts, Row, Segmented } from '../components/Primitives.jsx'
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
  const { showToast, questionsLeft, cartCount, lang, setLang, t, chartSystem, session, sessionReady } =
    useStore()
  const me = useProfileFields()
  const mine = useMyChart({ ready: sessionReady, who: session?.user?.id ?? null })
  const houses = housesFrom(mine.chart, mine.timeKnown)

  return (
    <>
      <section className="border-b border-rule px-5 py-6 text-center">
        {/* Follows the preference set on /chart. Showing a wheel here to
            someone who reads South Indian is the app forgetting who they are
            between two screens. */}
        {chartSystem === 'vedic' && <ChartNorth size={200} houses={houses} />}
        {chartSystem === 'south' && <ChartSouth size={200} houses={houses} />}
        {chartSystem === 'western' && <ChartWheel size={200} houses={houses} />}
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
 * The daily reading, as a tab. Summary cards, the three placements, the
 * current transit and a short reading — the compact version. The full
 * three-day view with Do/Don't and transits lives on `/horoscope`.
 */
function HoroscopeTab() {
  const { showToast, hasFlag, toggleFlag, session, sessionReady } = useStore()
  const who = session?.user?.id ?? null
  const mine = useMyChart({ ready: sessionReady, who })
  const horoscope = useAstro('horoscope', { ready: sessionReady, who })

  const day = readingFrom(horoscope.payload, 'today', null)
  const transit = day?.transits[0]

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
          <p className="caps-sm gold">{longDate(day.date)}</p>
          <h2 className="mt-3 font-display text-title leading-tight t-heading">{day.headline}</h2>

          {day.intensity !== null && (
            <div className="mt-5 border-t border-stroke pt-4">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="caps-sm t-faint">Overall</span>
                <span className="caps-sm gold tnum">{day.intensity}/100</span>
              </div>
              <PopBar value={day.intensity} />
              <p className="mt-2 text-meta t-faint">
                The day&apos;s own score, out of a hundred, before you do anything with it.
              </p>
            </div>
          )}
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

      {/* Current transit */}
      {transit && (
        <section className="border-b border-rule px-5 py-6">
          <Kicker>Current transit</Kicker>
          <PopCard className="mt-4 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-body t-heading">{transit.title}</p>
              <PopTag tone="gold">{transit.weight}</PopTag>
            </div>
            <p className="mt-3 text-meta t-body">{transit.body}</p>
          </PopCard>
        </section>
      )}

      {/* Daily reading */}
      <section className="border-b border-rule px-5 py-6">
        <Kicker>Daily reading</Kicker>
        <p className="mt-4 text-read t-sub">{day.body}</p>

        <PopCard className="mt-5 p-4">
          <p className="caps-sm gold">{day.focusLabel}</p>
          <p className="mt-2 text-body t-heading">{day.focus}</p>
        </PopCard>

        <Acts
          className="mt-5"
          items={[
            {
              label: 'Save',
              onLabel: 'Saved',
              on: hasFlag('save:day-today'),
              onClick: () =>
                toggleFlag('save:day-today', {
                  on: 'Saved to your readings',
                  off: 'Removed from your readings',
                }),
            },
            { label: 'Share', onClick: () => showToast('Reading copied') },
          ]}
        />
      </section>

      {/* Ratings */}
      <section className="px-5 py-6">
        <Kicker>Across four areas</Kicker>
        <ul className="mt-4">
          {Object.entries(day.ratings)
            .filter(([, value]) => value !== null)
            .map(([area, value]) => (
              <li key={area} className="flex items-center gap-4 border-b border-rule py-3.5">
                <span className="w-16 flex-none caps-sm t-faint">{area}</span>
                <PopBar value={value} className="flex-1" />
                <span className="w-10 flex-none text-right caps-sm tnum t-sub">{value}</span>
              </li>
            ))}
        </ul>
      </section>
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
