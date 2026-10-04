import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import InfluencerTab from '../components/InfluencerTab.jsx'
import ResharedList from '../components/ResharedList.jsx'
import Composer from '../components/Composer.jsx'
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

/**
 * Profile, Instagram-shaped (4 Oct 2026, owner's call).
 *
 * The top is yours: your picture in a saffron ring, the three numbers
 * (posts, followers, following), your name and your Sun, Moon and Lagna,
 * and two buttons — edit, share. Under it, icon tabs: your posts as a grid,
 * what you saved, and your kundli. Everything that is not you — wallet,
 * orders, invite, language, help, sign out — is behind the ☰ at the top
 * right, at `/profile/settings`, as on Instagram.
 *
 * Not a copy, on purpose: most people here never post, so a profile with no
 * posts opens on the Kundli tab instead of an empty grid, and the kundli is
 * one tap away for everyone.
 *
 * Replaced: an Overview / Settings pair, where Overview listed the
 * prototype's "Past sessions" (mock data shown to real accounts) and two
 * buttons that toasted "PDF downloaded" and "link copied" without doing
 * either. Both are gone.
 */
const TABS = [
  { key: 'posts', icon: 'grid', label: 'prof.tab.posts' },
  { key: 'saved', icon: 'bookmark', label: 'prof.tab.saved' },
  { key: 'kundli', icon: 'kundli', label: 'prof.tab.kundli' },
]

export default function Profile() {
  const { tab } = useParams()
  const navigate = useNavigate()
  const { session, sessionReady, t, profile } = useStore()
  const me = session?.user?.id
  const [posts, setPosts] = useState(null)
  const [counts, setCounts] = useState({ followers: 0, following: 0 })
  const [composing, setComposing] = useState(false)

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

  if (tab === 'settings') return <SettingsPage />

  const tabs = profile?.influencer
    ? [...TABS, { key: 'influencer', icon: 'award', label: 'prof.tab.influencer' }]
    : TABS
  // Bare /profile: posts if you have any, otherwise your kundli.
  const active = tab ?? (posts === null ? null : posts.length ? 'posts' : 'kundli')
  if (tab && !tabs.some((x) => x.key === tab) && !(tab === 'influencer' && profile === null)) {
    return <Navigate to="/profile" replace />
  }

  return (
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

      <Hero
        posts={posts}
        counts={counts}
        sessionReady={sessionReady}
        onNewPost={profile?.blocked ? null : () => {
          setComposing((v) => !v)
          if (active !== 'posts') navigate('/profile/posts')
        }}
      />

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
          <PostsTab posts={posts} composing={composing} onDone={() => { setComposing(false); load() }} />
        )}
        {active === 'saved' && <SavedTab />}
        {active === 'kundli' && <KundliTab />}
        {active === 'influencer' && profile?.influencer && <InfluencerTab />}
      </div>

      <div className="h-24" />
    </>
  )
}

/* ── The top: you ────────────────────────────────────────────────────────── */

function Hero({ posts, counts, sessionReady, onNewPost }) {
  const { t, session, showToast } = useStore()
  const me = useProfileFields()
  const mine = useMyChart({ ready: sessionReady, who: session?.user?.id ?? null })
  const signs = [
    ['r.sun', mine.sun, 'var(--gold-fill)'],
    ['r.moon', mine.moon, 'var(--tier-10)'],
    ['r.rising', mine.rising, 'var(--tier-500)'],
  ].filter(([, v]) => v)

  async function share() {
    const said = await shareLink(`/u/${session?.user?.id}`, { title: me.name })
    if (said) showToast(said)
  }

  return (
    <section className="cosmic-dawn px-5 pb-5 pt-5">
      <div className="flex items-center gap-5">
        <AvatarPicker />
        <dl className="grid flex-1 grid-cols-3 text-center">
          {[
            [posts === null ? '—' : posts.length, 'prof.posts'],
            [counts.followers, 'prof.followers'],
            [counts.following, 'prof.following'],
          ].map(([n, k]) => (
            <div key={k}>
              <dt className="sr-only">{t(k)}</dt>
              <dd className="font-display text-lead leading-none tnum t-heading">
                {typeof n === 'number' ? n.toLocaleString('en-IN') : n}
              </dd>
              <span className="mt-1 block text-[12px] t-faint">{t(k)}</span>
            </div>
          ))}
        </dl>
      </div>

      <h1 className="mt-4 font-display text-lead leading-tight t-heading">{me.name}</h1>
      <Bio />
      {/* Each sign in its own colour: the sun saffron, the moon blue, the
          rising sign purple. Empty while the chart is in flight, and two of
          the three when the birth time is unknown. */}
      {signs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {signs.map(([label, sign, colour]) => (
            <span
              key={label}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold"
              style={{ color: colour, background: `color-mix(in srgb, ${colour} 12%, white)` }}
            >
              <span className="font-normal opacity-80">{t(label)}</span> {t(`sign.${sign}`)}
            </span>
          ))}
        </div>
      )}

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
        {onNewPost && (
          <button
            type="button"
            onClick={onNewPost}
            aria-label={t('prof.newPost')}
            className="flex w-11 flex-none items-center justify-center rounded-xl text-white shadow-sm"
            style={{ background: 'linear-gradient(160deg, var(--orange-hi), var(--orange-lo))' }}
          >
            <Icon name="plus" size={20} weight={2.2} />
          </button>
        )}
      </div>
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
          rows={2}
          placeholder={t('prof.bioDefault')}
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
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(profile?.bio ?? '')
        setEditing(true)
      }}
      className="mt-1 flex items-center gap-1.5 text-left text-meta t-body"
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

function PostsTab({ posts, composing, onDone }) {
  const { profile, session, t } = useStore()
  return (
    <>
      {profile?.blocked && (
        <p className="mx-5 mt-4 rounded-lg bg-surface-2 px-3 py-2.5 text-micro t-sub">{t('prof.blocked')}</p>
      )}
      {composing && !profile?.blocked && (
        <div className="border-b border-rule">
          {/* A Reel tab only when the server's video flag is on; drawing
              the tab grants nothing — a clip without it is refused. */}
          <Composer
            kinds={profile?.video_enabled ? ['clip', 'post', 'article'] : ['post', 'article']}
            onPublished={onDone}
          />
        </div>
      )}

      {posts?.length ? (
        <div className="grid grid-cols-3 gap-0.5">
          {posts.map((p) => (
            <Tile key={p.id} post={p} />
          ))}
        </div>
      ) : (
        !composing && (
          <div className="flex flex-col items-center px-8 py-12 text-center">
            <Orbit size={56} />
            <p className="mt-4 text-body font-semibold t-heading">{t('prof.firstPostTitle')}</p>
            <p className="mt-1 text-meta t-faint">{t('prof.firstPostNote')}</p>
          </div>
        )
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
function SettingsPage() {
  const { showToast, hasFlag, toggleFlag, profile, t, lang, setLang, cartCount } = useStore()
  const [leaving, setLeaving] = useState(false)

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
  const fullImage = !hasFlag('setting:croppedDeityImage')

  return (
    <>
      <TopBar title={t('prof.settingsTitle')} back backTo="/profile" hardBack />

      <ReferralCard />

      <section className="border-b border-rule px-5 py-6">
        <Kicker>{t('prof.account')}</Kicker>
        <div className="mt-2">
          <Row to="/wallet" title={t('a.wallet')} note={t('prof.walletNote')} />
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

      <section className="border-b border-rule px-5 py-6">
        <Kicker>{t('prof.explore')}</Kicker>
        <div className="mt-2">
          <Row to="/ask" title={t('prof.askStars')} />
          <Row to="/premium" title={t('prof.premium')} note={t('prof.premiumNote')} />
          <Row to="/academy" title={t('nav.academy')} note={t('prof.academyNote')} />
          <Row to="/shop" title={t('nav.shop')} meta={t('prof.inCart', { n: cartCount })} />
        </div>
      </section>

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
        <div className="mt-3">
          <Row
            onClick={() =>
              toggleFlag('setting:croppedDeityImage', { on: t('prof.croppedOn'), off: t('prof.croppedOff') })
            }
            title={t('prof.fullImage')}
            note={t('prof.fullImageNote')}
            meta={fullImage ? t('prof.on') : t('prof.off')}
          />
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
