import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import InfluencerTab from '../components/InfluencerTab.jsx'
import ResharedList from '../components/ResharedList.jsx'
import { FeedCard } from './Home.jsx'
import ReferralCard from '../components/ReferralCard.jsx'
import { Loader, Orbit } from '../components/Cosmos.jsx'
import { PhotoViewer, Thumb } from '../components/Pieces.jsx'
import AvatarCropper from '../components/AvatarCropper.jsx'
import { signOut } from '../lib/signout.js'
import { fetchByAuthor, fetchOne, followCounts } from '../lib/content.js'
import { shareLink } from '../lib/share.js'
import { LANGS } from '../data/i18n.js'
import { TopBar } from '../components/Chrome.jsx'
import Icon from '../components/Icon.jsx'
import { uploadAvatar } from '../lib/avatar.js'
import { ChartNorth } from '../components/ChartSquare.jsx'
import { Kicker, PopAvatar, PopButton } from '../components/Pop.jsx'
import { Row } from '../components/Primitives.jsx'
import { useStore, useProfileFields } from '../store.jsx'
import { housesFrom, useMyChart } from '../lib/astro.js'
import { ConsultantPage } from './ConsultantProfile.jsx'
import IntroSheet, { introNote } from '../components/IntroSheet.jsx'
import UsernameSheet, { usernameNote } from '../components/UsernameSheet.jsx'
import { profileLink } from '../lib/profile.js'
import ProfileHead from '../components/ProfileHead.jsx'
import FollowSheet from '../components/FollowSheet.jsx'

/**
 * Profile, Instagram-shaped (4 Oct 2026, owner's call).
 *
 * The top is yours: your picture in a saffron ring, the three numbers
 * (posts, followers, following), your name and bio, and two buttons —
 * edit, share. Under it, icon tabs: your posts as a grid and what you
 * saved. Everything that is not you — wallet,
 * orders, invite, language, help, sign out — is behind the ☰ at the top
 * right, at `/profile/settings`, as on Instagram.
 *
 * 11 Oct 2026, Rahul: the Sun / Moon / Lagna line said nothing clear, the
 * + moved to Home (a post is made there), and the Kundli tab went — the
 * horoscope section already has it. /profile/kundli still opens, from a
 * pro's ☰.
 *
 * A pro has one profile (10 Oct 2026, Rahul): the Profile tab is their
 * consultant page — rates, about, posts, reviews — with Edit, Share and a
 * new post where a client sees Follow and Book. Saved and Kundli move to
 * the ☰ for them, and open at /profile/saved and /profile/kundli under a
 * plain top bar. Until the approved consultant row loads, or if there is
 * none (applied, not approved; blocked), the seeker profile shows.
 *
 * Replaced: an Overview / Settings pair, where Overview listed the
 * prototype's "Past sessions" (mock data shown to real accounts) and two
 * buttons that toasted "PDF downloaded" and "link copied" without doing
 * either. Both are gone.
 */
const TABS = [
  { key: 'posts', icon: 'grid', label: 'prof.tab.posts' },
  { key: 'saved', icon: 'bookmark', label: 'prof.tab.saved' },
]
// Not in the tab row; reached from a pro's ☰.
const KUNDLI = { key: 'kundli', icon: 'kundli', label: 'prof.tab.kundli' }

export default function Profile() {
  const { tab } = useParams()
  const navigate = useNavigate()
  const { session, t, profile, consultant, consultantLoading } = useStore()
  const me = session?.user?.id
  const [posts, setPosts] = useState(null)
  const [counts, setCounts] = useState({ followers: 0, following: 0 })

  const load = useCallback(() => {
    if (!me) return
    fetchByAuthor(me)
      .then(setPosts)
      .catch((err) => {
        console.error('[profile] posts failed:', err.message)
        setPosts([])
      })
    followCounts(me)
      .then(setCounts)
      .catch((err) => console.error('[profile] follow counts failed:', err.message))
  }, [me])
  useEffect(load, [load])

  if (tab === 'settings') return <SettingsPage pro={Boolean(consultant)} />

  const tabs = profile?.influencer
    ? [...TABS, { key: 'influencer', icon: 'award', label: 'prof.tab.influencer' }]
    : TABS
  // Bare /profile opens on Posts, always (5 Oct 2026, owner's request) —
  // it used to open on the kundli when you had not posted yet.
  const active = tab ?? 'posts'
  if (tab && tab !== 'kundli' && !tabs.some((x) => x.key === tab) && !(tab === 'influencer' && profile === null)) {
    return <Navigate to="/profile" replace />
  }

  if (consultantLoading && !consultant) return <Loader />
  if (consultant && active !== 'posts') {
    const x = [...tabs, KUNDLI].find((y) => y.key === active)
    return (
      <>
        <TopBar title={t(x.label)} back backTo="/profile/settings" hardBack />
        <div className="animate-fade">
          {active === 'saved' && <SavedTab />}
          {active === 'kundli' && <KundliTab />}
          {active === 'influencer' && profile?.influencer && <InfluencerTab />}
        </div>
        <div className="h-24" />
      </>
    )
  }

  const seeker = (
    <>
      <TopBar
        title={t('nav.profile')}
        back
        backTo="/home"
        hardBack
        right={
          <Link
            to="/profile/settings"
            aria-label={t('prof.settingsTitle')}
            className="flex h-9 w-9 items-center justify-center rounded-full text-t1 transition-colors hover:bg-surface"
          >
            <span aria-hidden="true" className="text-lead leading-none">☰</span>
          </Link>
        }
      />

      <Hero posts={posts} counts={counts} />

      {/* Icon tabs with the accent underline, Instagram's row. */}
      <div className="sticky top-[52px] z-10 flex border-b border-rule bg-bg" role="tablist">
        {tabs.map((x) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={active === x.key}
            aria-label={t(x.label)}
            onClick={() => navigate(`/profile/${x.key}`)}
            className={`flex flex-1 flex-col items-center gap-1 border-b-2 pb-2 pt-3 transition-colors ${
              active === x.key ? 'border-gold-fill text-gold' : 'border-transparent t-faint'
            }`}
          >
            <Icon name={x.icon} size={20} weight={active === x.key ? 2.1 : 1.6} />
            <span className="text-[11px] font-semibold">{t(x.label)}</span>
          </button>
        ))}
      </div>

      <div key={active ?? 'loading'} className="animate-fade">
        {active === null && <Loader />}
        {active === 'posts' && (
          <PostsTab posts={posts} />
        )}
        {active === 'saved' && <SavedTab />}
        {active === 'kundli' && <KundliTab />}
        {active === 'influencer' && profile?.influencer && <InfluencerTab />}
      </div>

      <div className="h-24" />
    </>
  )
  if (consultant && me) {
    return <ConsultantPage id={me} own backTo="/home" fallback={seeker} saved={<SavedTab />} />
  }
  return seeker
}

/* ── The top: you ────────────────────────────────────────────────────────── */

function Hero({ posts, counts }) {
  const { t, session, showToast, profile } = useStore()
  const [listing, setListing] = useState(null)
  const me = useProfileFields()

  async function share() {
    const said = await shareLink(profileLink(profile?.username, `/u/${session?.user?.id}`), { title: me.name })
    if (said) showToast(said)
  }

  return (
    <section className="cosmic-dawn px-5 pb-5 pt-5">
      {/* Name over the three numbers, beside the photo (11 Oct 2026,
          Rahul: Instagram's layout). Followers and Following open the list
          (5 Oct 2026). */}
      <div className="flex items-center gap-5">
        <AvatarPicker />
        <ProfileHead
          name={me.name}
          stats={[
            { n: posts?.length ?? null, label: t('prof.posts') },
            { n: counts.followers, label: t('prof.followers'), onClick: () => setListing('followers') },
            { n: counts.following, label: t('prof.following'), onClick: () => setListing('following') },
          ]}
        />
      </div>

      <Bio />
      <div className="mt-4 flex gap-2">
        <Link
          to="/onboarding/details?edit=1"
          className="flex-1 rounded-xl border border-rule bg-white py-2.5 text-center text-meta font-semibold t-heading shadow-sm transition-colors hover:border-gold-fill"
        >
          {t('prof.editProfile')}
        </Link>
        <button
          type="button"
          onClick={share}
          className="flex-1 rounded-xl border border-rule bg-white py-2.5 text-center text-meta font-semibold t-heading shadow-sm transition-colors hover:border-gold-fill"
        >
          {t('prof.shareProfile')}
        </button>
      </div>
      <FollowSheet which={listing} onClose={() => setListing(null)} />
    </section>
  )
}

/**
 * Your face, and the one control that sets it — in a saffron ring, the
 * colour a story ring has in the feed. The avatar is the button.
 */
function AvatarPicker() {
  const { me, showToast, refreshProfile, session, t } = useStore()
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  // A chosen file waits here while you place and zoom it (AvatarCropper).
  const [chosen, setChosen] = useState(null)

  const pick = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // so re-picking the same file still fires
    if (file) setChosen(file)
  }

  const upload = async (file) => {
    setChosen(null)
    setBusy(true)
    try {
      await uploadAvatar(file)
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
        <span
          className="block rounded-full p-[3px]"
          style={{ background: 'conic-gradient(from 200deg, #ffa05e, #f5782c, #c2410c, #ffb27a, #ffa05e)' }}
        >
          <span className="block rounded-full bg-bg p-[3px]">
            <PopAvatar initials={me.initials} src={me.avatarUrl} size={78} />
          </span>
        </span>
        {/* Online, as a dot on the photo (11 Oct 2026, Rahul) — it was a
            "● Available" line under the name. */}
        <span
          aria-label="Online"
          className="absolute right-1.5 top-1.5 h-4 w-4 rounded-full bg-ok ring-2 ring-bg"
        />
        <span className="absolute bottom-0.5 right-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-gold-fill text-white ring-2 ring-bg">
          <Icon name={busy ? 'check' : 'plus'} size={13} weight={2.4} />
        </span>
      </button>
      <input ref={input} type="file" accept="image/*" onChange={pick} className="hidden" aria-hidden="true" tabIndex={-1} />
      {chosen && <AvatarCropper file={chosen} onCancel={() => setChosen(null)} onDone={upload} />}
    </>
  )
}

/**
 * The line under your name (4 Oct 2026, owner's request). "Available" until
 * you write one — WhatsApp's default, and it reads like a status rather
 * than an empty field. Tap to edit; 150 characters.
 */
function Bio() {
  const { profile, saveProfile, refreshProfile, session, showToast, t } = useStore()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const text = profile?.bio?.trim() || t('prof.bioDefault')

  async function save() {
    setSaving(true)
    try {
      await saveProfile({ bio: draft.trim() })
      await refreshProfile(session?.user?.id)
      setEditing(false)
    } catch (err) {
      showToast(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="mt-2">
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 150))}
          rows={3}
          placeholder={t('prof.bioPh')}
          className="w-full resize-none rounded-xl border border-gold-fill bg-white px-3 py-2 text-meta text-t1 outline-none"
        />
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[11px] tnum t-faint">{draft.length}/150</span>
          <span className="flex gap-3">
            <button type="button" onClick={() => setEditing(false)} className="text-meta t-faint">
              {t('a.cancel')}
            </button>
            <button type="button" onClick={save} disabled={saving} className="text-meta font-semibold text-gold">
              {saving ? t('d.saving') : t('prof.bioSave')}
            </button>
          </span>
        </div>
      </div>
    )
  }
  // No bio yet: a plain invitation to write one (5 Oct 2026). The
  // "● Available" line above it went on 11 Oct (Rahul); the green dot is on
  // the photo now.
  if (!profile?.bio?.trim()) {
    return (
      <div className="mt-0.5">
        <button
          type="button"
          onClick={() => {
            setDraft('')
            setEditing(true)
          }}
          className="mt-1.5 flex items-center gap-1 text-meta font-semibold text-gold"
        >
          <Icon name="plus" size={14} /> {t('prof.bioAdd')}
        </button>
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(profile?.bio ?? '')
        setEditing(true)
      }}
      className="mt-1 flex items-center gap-1.5 whitespace-pre-line text-left text-meta t-body"
    >
      <span className={profile?.bio?.trim() ? '' : 'inline-flex items-center gap-1.5'}>
        {!profile?.bio?.trim() && <span className="h-2 w-2 rounded-full bg-ok" aria-hidden="true" />}
        {text}
      </span>
      <span aria-hidden="true" className="text-[12px] t-faint">✎</span>
    </button>
  )
}

/* ── Posts ───────────────────────────────────────────────────────────────── */

/** A blog post has no picture, so its tile is the reveal's saffron sky
 *  with the title on it. */
function Tile({ post }) {
  const [open, setOpen] = useState(false)
  const inner = post.mediaUrl ? (
    <span className="block h-full w-full [&>span]:!h-full [&>span]:!w-full [&>span]:!rounded-none">
      <Thumb piece={post} size="100%" />
    </span>
  ) : (
    <span
      className="flex h-full w-full items-end p-2 text-left"
      style={{ background: 'linear-gradient(150deg, #f5782c 0%, #c2410c 55%, #7c2d12 100%)' }}
    >
      <span className="line-clamp-3 text-[12px] font-semibold leading-snug text-white">
        {post.title || post.caption}
      </span>
    </span>
  )
  const cls = 'relative block aspect-square overflow-hidden bg-surface'
  if (post.kind === 'article') return <Link to={`/read/${post.id}`} className={cls}>{inner}</Link>
  if (post.kind === 'clip') return <Link to={`/reels/${post.id}`} className={cls}>{inner}</Link>
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${cls} w-full`}>
        {inner}
      </button>
      {open && <PhotoViewer src={post.mediaUrl} caption={post.caption} onClose={() => setOpen(false)} />}
    </>
  )
}

function PostsTab({ posts }) {
  const { profile, session, t } = useStore()
  return (
    <>
      {profile?.blocked && (
        <p className="mx-5 mt-4 rounded-lg bg-surface-2 px-3 py-2.5 text-micro t-sub">{t('prof.blocked')}</p>
      )}
      {posts?.length ? (
        // Each post in full, newest first, as the feed draws it (11 Oct
        // 2026, Rahul) — it was a 3-column grid of thumbnails.
        <div className="bg-white">
          {posts.map((p) => (
            <FeedCard key={p.id} piece={p} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center px-8 py-12 text-center">
          <Orbit size={56} />
          <p className="mt-4 text-body font-semibold t-heading">{t('prof.firstPostTitle')}</p>
          <p className="mt-1 text-meta t-faint">{t('prof.firstPostNote')}</p>
        </div>
      )}

      <ResharedList by={session?.user?.id} className="mt-8 px-5" />
    </>
  )
}

/* ── Saved ───────────────────────────────────────────────────────────────── */

/**
 * What you bookmarked — the `save:` flags the store already holds, each read
 * back as the post it points at. A post since removed simply drops out.
 */
function SavedTab() {
  const { flags, t } = useStore()
  const ids = [...flags].filter((k) => k.startsWith('save:')).map((k) => k.slice(5)).slice(0, 60)
  const key = ids.join(',')
  const [items, setItems] = useState(null)

  useEffect(() => {
    let live = true
    Promise.all(key ? key.split(',').map((id) => fetchOne(id)) : [])
      .then((rows) => live && setItems(rows.filter(Boolean)))
      .catch(() => live && setItems([]))
    return () => {
      live = false
    }
  }, [key])

  if (items === null) return <Loader />
  if (!items.length) {
    return (
      <div className="flex flex-col items-center px-8 py-12 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface text-gold">
          <Icon name="bookmark" size={24} />
        </span>
        <p className="mt-4 text-body font-semibold t-heading">{t('prof.savedEmptyTitle')}</p>
        <p className="mt-1 text-meta t-faint">{t('prof.savedEmpty')}</p>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-3 gap-0.5">
      {items.map((p) => (
        <Tile key={p.id} post={p} />
      ))}
    </div>
  )
}

/* ── Kundli ──────────────────────────────────────────────────────────────── */

function KundliTab() {
  const { t, session, sessionReady, profile } = useStore()
  const me = useProfileFields()
  const mine = useMyChart({ ready: sessionReady, who: session?.user?.id ?? null })
  const houses = housesFrom(mine.chart, mine.timeKnown)

  return (
    <>
      <section className="px-5 pt-6">
        <div className="pop-card cosmic-dawn p-5 text-center">
          <ChartNorth size={220} houses={houses} />
          <PopButton variant="gold" to="/chart" className="mt-5">
            {t('prof.openChart')}
          </PopButton>
        </div>
      </section>

      <section className="px-5 py-6">
        <Kicker>{t('prof.birthData')}</Kicker>
        <dl className="mt-3">
          {[
            ['prof.date', me.birthDate],
            // A guess stored as a fact is what this column exists to prevent.
            ['prof.time', me.birthTimeKnown ? me.birthTime : t('prof.notKnown')],
            ['prof.place', me.birthPlace],
            ...(profile?.gender ? [['d.gender', t(`d.${profile.gender}`)]] : []),
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-6 border-b border-rule py-3">
              <dt className="caps-sm t-faint">{t(k)}</dt>
              <dd className="text-right text-meta tnum t-heading">{v}</dd>
            </div>
          ))}
        </dl>
        <PopButton variant="ghost" to="/onboarding/details?edit=1" className="mt-4">
          {t('d.editTitle')}
        </PopButton>
      </section>

      <section className="px-5 pb-2">
        <Kicker>{t('prof.tools')}</Kicker>
        <div className="mt-2">
          <Row to="/chart" title={t('row.chart')} note={t('prof.chartNote')} />
          <Row to="/match" title={t('tool.match')} note={t('prof.matchNote')} />
          <Row to="/muhurat" title={t('tool.muhurat')} note={t('row.muhuratNote')} />
          <Row to="/reports" title={t('prof.reports')} note={t('prof.reportsNote')} />
        </div>
      </section>
    </>
  )
}

/* ── ☰ Settings ──────────────────────────────────────────────────────────── */

/**
 * Everything that is not you, behind the ☰ (`/profile/settings`, the old
 * Settings tab's address, so links to it still land). The two rows that
 * only toasted "prototype only" — notifications and privacy — are gone.
 */
function SettingsPage({ pro }) {
  const { showToast, profile, t, lang, setLang, consultant } = useStore()
  const [leaving, setLeaving] = useState(false)
  const [intro, setIntro] = useState(false)
  const [naming, setNaming] = useState(false)

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

  return (
    <>
      <TopBar title={t('prof.settingsTitle')} back backTo="/profile" hardBack />

      <ReferralCard />

      {/* A pro's profile is their consultant page; what was in its tabs is
          here (10 Oct 2026). */}
      {pro && (
        <section className="border-b border-rule px-5 py-6">
          <Kicker>{t('nav.profile')}</Kicker>
          <div className="mt-2">
            <Row onClick={() => setIntro(true)} title="Intro video or photo" note={introNote(consultant)} />
            {/* Kundli and Saved went on 11 Oct 2026 (Rahul): the horoscope
                section has the kundli, and Saved is a tab on your page. */}
            {profile?.influencer && <Row to="/profile/influencer" title={t('prof.tab.influencer')} />}
          </div>
        </section>
      )}
      {intro && <IntroSheet onClose={() => setIntro(false)} />}
      {naming && <UsernameSheet onClose={() => setNaming(false)} />}

      <section className="border-b border-rule px-5 py-6">
        <Kicker>{t('prof.account')}</Kicker>
        <div className="mt-2">
          {/* No Wallet row since 11 Oct 2026 (Rahul): the wallet is the
              icon at the top of every tab. Name and birth details are here
              for a pro, whose page has no Edit profile button (11 Oct). */}
          {pro && (
            <Row to="/onboarding/details?edit=1" title="Edit name and birth details" />
          )}
          {/* Your profile link, 1namo.com/<username>, for everybody (11 Oct
              2026, Rahul). */}
          <Row onClick={() => setNaming(true)} title="Username" note={usernameNote(profile)} />
          <Row to="/orders" title={t('prof.orders')} note={t('prof.ordersNote')} />
          <Row to="/notifications" title={t('prof.notifHistory')} />
          <Row
            onClick={() => showToast(t('prof.signedInAs', { phone: profile?.phone ?? '—' }))}
            title={t('prof.phone')}
            note={t('prof.phoneNote')}
            meta={profile?.phone ?? '—'}
          />
        </div>
      </section>

      {/* "More from Namo" (Ask the Stars, Premium, Academy, Shop) went on
          11 Oct 2026 (Rahul): each was a second link to a tab or a tool,
          and Premium is not offered yet. /premium still exists. */}

      <section className="border-b border-rule px-5 py-6">
        <Kicker>{t('prof.preferences')}</Kicker>
        <p className="mt-3 text-meta font-semibold t-heading">{t('set.language')}</p>
        <div className="mt-2 flex gap-2">
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              aria-pressed={lang === l.code}
              onClick={() => setLang(l.code)}
              className="pill flex-1 justify-center"
            >
              {l.label}
            </button>
          ))}
        </div>
        {/* No "Full deity image" toggle since 11 Oct 2026 (Rahul): the
            murti is always shown whole. */}
        <div className="mt-3">
          <Row to="/support" title={t('prof.set.help')} note="+91 99580 40508 · support@1namo.com" />
        </div>
      </section>

      <section className="px-5 py-6">
        <button
          type="button"
          onClick={leave}
          disabled={leaving}
          className="w-full rounded-lg border border-rule py-3.5 text-center caps-sm text-live transition-colors hover:border-live disabled:opacity-40"
        >
          {leaving ? t('prof.signingOut') : t('prof.signOut')}
        </button>
        <p className="mt-3 text-center text-micro t-faint">{t('prof.signOutNote')}</p>
      </section>

      <div className="h-24" />
    </>
  )
}
