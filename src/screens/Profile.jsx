import { useCallback, useEffect, useRef, useState } from 'react'
import ResharedList from '../components/ResharedList.jsx'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { sessionHistory } from '../data/mock.js'
import Composer from '../components/Composer.jsx'
import ReferralCard from '../components/ReferralCard.jsx'
import { signOut } from '../lib/signout.js'
import { fetchByAuthor, followCounts } from '../lib/content.js'
import { LANGS } from '../data/i18n.js'
import { TopBar } from '../components/Chrome.jsx'
import Icon from '../components/Icon.jsx'
import { uploadAvatar } from '../lib/avatar.js'
import { PRO_APP_URL } from '../lib/urls.js'
import { ChartNorth } from '../components/ChartSquare.jsx'
import { Kicker, PopAvatar, PopButton, PopTag } from '../components/Pop.jsx'
import { Row, Segmented } from '../components/Primitives.jsx'
import { useStore, useProfileFields } from '../store.jsx'
import { housesFrom, useMyChart } from '../lib/astro.js'

/**
 * Two, since 9 Sep 2026. Horoscope and Wallet were tabs here and are now
 * places of their own: the reading is Home's Today tab, and the wallet is in
 * the top bar on every screen. Both were summaries whose only real control
 * was a button to the full screen, which is a tab that exists to be left.
 */
const TABS = [
  { key: 'overview', label: 'prof.tab.overview' },
  { key: 'settings', label: 'prof.tab.settings' },
]

/* Keys into i18n.js, title and value both. */
const SETTINGS = [
  { key: 'prof.set.language', value: 'prof.set.languageVal' },
  { key: 'prof.set.notifications', value: 'prof.set.notificationsVal' },
  { key: 'prof.set.privacy', value: 'prof.set.privacyVal' },
  { key: 'prof.set.help', value: null },
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
  const { session, sessionReady, t } = useStore()
  const mine = useMyChart({ ready: sessionReady, who: session?.user?.id ?? null })

  if (!TABS.some((tb) => tb.key === tab)) return <Navigate to="/profile" replace />

  return (
    <>
      {/* hardBack: from Profile, "back" means Home — never an arbitrary
          previous screen. */}
      <TopBar title={t('nav.profile')} back backTo="/home" hardBack />

      <section className="flex items-center gap-4 border-b border-stroke px-5 py-6">
        <AvatarPicker />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-title leading-none t-heading">{me.name}</h1>
          {/* Empty while the chart is in flight, rather than three dashes that
              flash into signs. Two of the three when the birth time is
              unknown — the ascendant is not guessed here. */}
          <p className="mt-2 caps-sm t-faint">
            {[mine.sun, mine.moon, mine.rising].filter(Boolean).map((s) => t(`sign.${s}`)).join(' · ')}
          </p>
        </div>
        <PopTag tone="gold">{t('prof.member')}</PopTag>
      </section>

      <Segmented
        items={TABS.map((tb) => ({ ...tb, label: t(tb.label) }))}
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
  const { me, showToast, refreshProfile, session, t } = useStore()
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
      showToast(t('prof.picUpdated'))
    } catch (err) {
      showToast(err.message || t('prof.picFailed'))
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
  const { showToast, cartCount, lang, setLang, t, session, sessionReady, profile } =
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
          <PopButton onClick={() => showToast(t('prof.pdfDone'))}>{t('prof.download')}</PopButton>
          <PopButton onClick={() => showToast(t('prof.linkCopied'))}>{t('prof.share')}</PopButton>
        </div>
      </section>

      <section className="border-b border-rule px-5 py-6">
        <Kicker>{t('prof.birthData')}</Kicker>
        <dl className="mt-4">
          {[
            ['prof.date', me.birthDate],
            // A guess stored as a fact is what this column exists to prevent,
            // so a birth with no known time says so instead of showing one.
            ['prof.time', me.birthTimeKnown ? me.birthTime : t('prof.notKnown')],
            ['prof.place', me.birthPlace],
            // Asked at sign-up since 30 Sep 2026; older accounts have none.
            ...(profile?.gender
              ? [['d.gender', profile.gender[0].toUpperCase() + profile.gender.slice(1)]]
              : []),
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-6 border-b border-rule py-3">
              <dt className="caps-sm t-faint">{t(k)}</dt>
              <dd className="text-meta tnum t-heading">{v}</dd>
            </div>
          ))}
        </dl>
        {/* `?edit=1`: date, time, place, then saved — no phone and no code.
            It used to run the whole sign-up chain, OTP included, and the
            last step refused to overwrite what was stored (30 Sep 2026). */}
        <PopButton to="/onboarding/details?edit=1" className="mt-5">
          {t('d.editTitle')}
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
        <Kicker>{t('prof.everythingElse')}</Kicker>
        <div className="mt-2">
          <Row to="/chart" title={t('row.chart')} note={t('prof.chartNote')} />
          <Row to="/match" title={t('tool.match')} note={t('prof.matchNote')} />
          <Row to="/muhurat" title={t('tool.muhurat')} note={t('row.muhuratNote')} />
          <Row to="/reports" title={t('prof.reports')} note={t('prof.reportsNote')} />
          <Row to="/premium" title={t('prof.premium')} note={t('prof.premiumNote')} />
          <Row to="/academy" title={t('nav.academy')} note={t('prof.academyNote')} />
          {/* No count here any more. The number is the server's (ai_quota)
              and this row would have to fetch it; a stale client counter
              beside a screen that knows better is worse than no number. */}
          <Row to="/ask" title={t('prof.askStars')} />
          <Row to="/shop" title={t('nav.shop')} meta={t('prof.inCart', { n: cartCount })} />
        </div>
      </section>

      <section className="px-5 py-6">
        <Kicker action={t('a.all')} onAction={() => showToast(t('prof.historyProto'))}>
          {t('prof.pastSessions')}
        </Kicker>
        <ul className="mt-4">
          {sessionHistory.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => showToast(t('prof.receipt', { name: s.consultant }))}
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

      <MyPosts />
    </>
  )
}

/* ── What you have posted ────────────────────────────────────────────────── */

/**
 * A seeker publishes too, since `025`. Photos and blog posts, not reels — a
 * reel is the consultant's marketing surface, and the rule is an RLS predicate
 * rather than a tab that happens to be missing.
 *
 * Three counts, all of them queries rather than columns (§1.3). Followers and
 * following come from one view in one round trip, because they sit side by side
 * and two queries for two integers is two chances to disagree.
 */
function MyPosts() {
  const { session, profile, t } = useStore()
  const me = session?.user?.id
  const [posts, setPosts] = useState(null)
  const [counts, setCounts] = useState({ followers: 0, following: 0 })
  const [composing, setComposing] = useState(false)

  const load = useCallback(() => {
    if (!me) return
    fetchByAuthor(me)
      .then(setPosts)
      .catch((err) => {
        console.error('[my posts] load failed:', err.message)
        setPosts([])
      })
    followCounts(me)
      .then(setCounts)
      .catch((err) => console.error('[follow counts] load failed:', err.message))
  }, [me])

  useEffect(load, [load])

  if (!me) return null

  return (
    <section className="border-t border-stroke px-5 py-6">
      <Kicker
        action={profile?.blocked ? null : composing ? t('a.close') : t('prof.newPost')}
        onAction={() => setComposing((v) => !v)}
      >
        {t('prof.yourPosts')}
      </Kicker>

      {/* Counted, never quoted. A new account reads 0 · 0 · 0, which is true —
          the mock's 84,200 followers against zero rows is what this replaces. */}
      <p className="mt-2 caps-sm t-faint tnum">
        {t('prof.counts', {
          posts: posts === null ? '—' : posts.length,
          followers: counts.followers,
          following: counts.following,
        })}
      </p>

      {/* Said out loud. A blocked account has every post refused, and
          somebody who is not told why will read it as the app being
          broken and try again — which is worse for them and for whoever
          answers the support mail. */}
      {profile?.blocked && (
        <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2.5 text-micro t-sub">
          {t('prof.blocked')}
        </p>
      )}

      {composing && !profile?.blocked && (
        <div className="-mx-5 mt-4 border-y border-rule">
          {/* Text and a photo for everyone; a Reel tab only when the flag
              is on. The flag is the SERVER's — drawing the tab does not
              grant anything, and a clip from somebody without it is
              refused whatever this list says. It is here so that an
              influencer who was given video can find it, rather than
              being told to become a consultant. */}
          <Composer
            kinds={profile?.video_enabled ? ['clip', 'post', 'article'] : ['post', 'article']}
            onPublished={() => {
              setComposing(false)
              load()
            }}
          />
        </div>
      )}

      <div className="mt-3">
        {(posts ?? []).map((c) => (
          <Row
            key={c.id}
            to={c.kind === 'article' ? `/read/${c.id}` : undefined}
            title={c.title || c.caption}
            meta={c.time}
            note={c.kind === 'article' ? t('prof.blog') : t('prof.photo')}
          />
        ))}
        {posts !== null && !posts.length && !composing && (
          <p className="prose-c">
            {t('prof.noPosts')}
          </p>
        )}
      </div>

      <ResharedList by={me} className="mt-8" />
    </section>
  )
}

/* ── Settings tab ────────────────────────────────────────────────────────── */

function SettingsTab() {
  const { showToast, hasFlag, toggleFlag, profile, t } = useStore()
  const [leaving, setLeaving] = useState(false)

  /* The store is already watching onAuthStateChange and SessionGate
     already sends a signed-out app back to onboarding, so this only has
     to do the signing out. */
  const leave = async () => {
    if (leaving) return
    setLeaving(true)
    try {
      await signOut()
    } catch (err) {
      showToast(err.message)
      setLeaving(false)
    }
  }
  // Full/uncropped is the default now; the flag is an opt-in back to the
  // screen-filling crop, so its absence is the common case.
  const fullImage = !hasFlag('setting:croppedDeityImage')

  return (
    <>
      {/* First, above Consulting. The owner asked for it on settings, and
          a referral card below three preference rows is one nobody
          scrolls to — the thing it needs most is to be seen. */}
      <ReferralCard />

      <section className="border-b border-rule px-5 py-6">
        <Kicker>{t('prof.consulting')}</Kicker>
        <div className="mt-2">
          {/* Plain navigation — the URL is what decides which side you are
              on, so there is no role to toggle. The consultant app is a
              separate deployment, so this is an absolute link out, not a
              route this build carries. */}
          <Row
            href={PRO_APP_URL}
            title={t('prof.switchPro')}
            note={t('prof.switchProNote')}
          />
        </div>
      </section>

      <section className="border-b border-rule px-5 py-6">
        <Kicker>{t('prof.preferences')}</Kicker>
        <div className="mt-2">
          <Row
            onClick={() =>
              toggleFlag('setting:croppedDeityImage', {
                on: t('prof.croppedOn'),
                off: t('prof.croppedOff'),
              })
            }
            title={t('prof.fullImage')}
            note={t('prof.fullImageNote')}
            meta={fullImage ? t('prof.on') : t('prof.off')}
          />
          {SETTINGS.map((s) => (
            <Row
              key={s.key}
              onClick={() => showToast(t('prof.protoOnly', { what: t(s.key) }))}
              title={t(s.key)}
              meta={s.value && t(s.value)}
            />
          ))}
        </div>
      </section>

      <section className="px-5 py-6">
        <Kicker>{t('prof.account')}</Kicker>
        <div className="mt-2">
          <Row
            onClick={() => showToast(t('prof.signedInAs', { phone: profile?.phone ?? '—' }))}
            title={t('prof.phone')}
            note={t('prof.phoneNote')}
            meta={profile?.phone ?? '—'}
          />
          {/* First in Account, above the alerts: an order is the thing
              somebody comes looking for, and there was nowhere to look
              until 26 Sep. */}
          <Row to="/orders" title={t('prof.orders')} note={t('prof.ordersNote')} />
          <Link to="/notifications" className="act-row">
            <span className="min-w-0">
              <span className="block text-body text-t1">{t('prof.notifHistory')}</span>
            </span>
          </Link>
        </div>

        {/* Last, and by itself. Signing out is the one action on this
            screen somebody can regret, so it does not sit in a row list
            where a thumb reaches for the thing above it.

            The old copy here said Namo had "no backend, no auth, no
            network calls" and offered to run onboarding again. All three
            were true in the prototype and none of them since phase 1. */}
        <button
          type="button"
          onClick={leave}
          disabled={leaving}
          className="mt-8 w-full rounded-lg border border-rule py-3.5 text-center caps-sm text-live transition-colors hover:border-live disabled:opacity-40"
        >
          {leaving ? t('prof.signingOut') : t('prof.signOut')}
        </button>
        <p className="mt-3 text-center text-micro t-faint">
          {t('prof.signOutNote')}
        </p>
      </section>
    </>
  )
}
