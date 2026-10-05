import { Loader } from '../components/Cosmos.jsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { bannerStyle, followBanner, useBanners } from '../lib/appearance.js'
import { BackButton, TabHeader } from '../components/Chrome.jsx'
import { createPortal } from 'react-dom'
import Icon from '../components/Icon.jsx'
import Plate from '../components/Plate.jsx'
import { PopButton, PopCard } from '../components/Pop.jsx'
import { Search } from '../components/Primitives.jsx'
import {
  composeStatus,
  download,
  fetchAssets,
  recallStatusPhoto,
  rememberStatusPhoto,
  saveBlob,
  inviteMessage,
  shareAsset,
  shareFile,
  shrinkForStatus,
} from '../lib/bhakti.js'
import { istDate, longDate } from '../lib/astro.js'
import { rupees, useStore } from '../store.jsx'
import { tileStyle } from '../lib/tiles.js'

/**
 * Bhakti — the devotional media library, in the slot the shrine used to hold.
 *
 * Five kinds, as circle tiles rather than a segmented control: the same
 * `.tile` / `.tile-face` grammar as Consult's free-tools row, so the two
 * screens that offer "pick a thing to do" look like they were designed
 * together. WhatsApp status leads and opens by default — it is the thing
 * people come back for daily, and it was a card bolted above the switcher,
 * outside the kind system entirely, until 10 Sep 2026.
 *
 * Ringtones and pooja tunes merged the same day (migration `026`). They were
 * one file doing one job under two names, which made a curator guess which
 * bucket a track belonged in.
 *
 * ── WHAT A WEB PAGE CAN ACTUALLY DO, WHICH IS LESS THAN THE BRIEF ──────────
 * There is no native shell — no Capacitor, no manifest, a plain site on Pages.
 * **No browser API sets a wallpaper or a ringtone.** Not one. On iPhone it is
 * impossible even for a native app. So every button here says *Download* and a
 * line underneath says what to do with the file. The alternative was a button
 * labelled "Set as wallpaper" that quietly does something else, which is the
 * class of lie this codebase keeps deleting.
 *
 * Sharing is real: `navigator.share` with a file opens the OS sheet and
 * WhatsApp is in it. We hand over a file; the person picks Status. We do not
 * "post a status" and the copy does not claim to.
 *
 * ── PRICING IS OPEN AND THE SCHEMA SAYS SO ─────────────────────────────────
 * `price_paise` is nullable and every seeded row is null, which the screen
 * reads as free. When pricing lands it is `spend()` on the download and the
 * badge starts rendering — the shape is here, the decision is not made.
 */

const KINDS = [
  /* Each shelf has its own colour since 4 Oct 2026 (owner's call): a row of
     six identical peach circles read as one control, not six places. */
  { key: 'status', label: 'Status', icon: 'share', hue: '#f5782c', help: 'Pick a picture, then share it to WhatsApp → Status.' },
  { key: 'wallpaper', label: 'Wallpapers', icon: 'image', hue: '#8e44ad', help: 'Save it, then set it from your photo gallery.' },
  { key: 'tune', label: 'Tunes', icon: 'bell', hue: '#2f7fd1', help: 'Save it, then pick it in your phone’s sound settings.' },
  { key: 'bhajan', label: 'Bhajans', icon: 'sound', hue: '#c2185b', help: 'Saves as an audio file you can play anywhere.' },
  { key: 'mantra', label: 'Mantras', icon: 'pooja', hue: '#1e9e5a', help: 'Tap play, say how many times, and it repeats that many.' },
  /* Darshan is not a kind of file — it is the shrine, and it LEAVES this
     screen. It sits in this row anyway (25 Sep 2026): the row answers "pick
     a devotional thing to do", and the shrine is the one people came for.
     It was reachable only from Home's third tab, which nobody reads as
     "the mandir is over there". */
  { key: 'darshan', label: 'Darshan', icon: 'pooja', hue: '#c99a1a', to: '/darshan' },
]

const isAudio = (kind) => kind === 'tune' || kind === 'bhajan' || kind === 'mantra'

/**
 * Three banners, the same object Consult and Shop use: a gradient block with
 * one CTA. Two of them move this screen rather than leaving it, so a tap
 * lands somewhere real instead of toasting "prototype only".
 */
const BANNERS = [
  {
    id: 'bn-darshan',
    kicker: 'The shrine',
    title: 'Sit for darshan',
    note: 'Seven deities, twenty-six murtis, and an aarti you can ring.',
    cta: 'Enter the mandir',
    art: 'orbit',
    from: '#7c2d12',
    to: '#c2410c',
    to_: '/darshan',
  },
  {
    id: 'bn-status',
    kicker: 'Daily',
    title: 'A status for this morning',
    note: 'Share it to WhatsApp before the day starts.',
    cta: 'See today’s',
    art: 'halftone',
    from: '#6b3410',
    to: '#a85400',
    kind: 'status',
  },
  {
    id: 'bn-wallpaper',
    kicker: 'Free',
    title: 'Lock-screen deities',
    note: 'Painted wallpapers, saved to your gallery.',
    cta: 'Browse wallpapers',
    art: 'contour',
    from: '#8a3a00',
    to: '#b45309',
    kind: 'wallpaper',
  },
]

export default function Bhakti() {
  const { showToast, lang } = useStore()
  const navigate = useNavigate()
  // The console's banners first, then the built-in three (4 Oct 2026).
  const banners = useBanners('bhakti', BANNERS, lang)
  const [assets, setAssets] = useState(null) // null = loading
  const [failed, setFailed] = useState(false)
  const [kind, setKind] = useState('status')
  const [deity, setDeity] = useState('All')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(null)
  const [sharing, setSharing] = useState(null) // the asset whose share sheet is open

  useEffect(() => {
    let active = true
    fetchAssets()
      .then((rows) => active && setAssets(rows))
      .catch(() => active && (setFailed(true), setAssets([])))
    return () => {
      active = false
    }
  }, [])

  const ofKind = useMemo(() => (assets ?? []).filter((a) => a.kind === kind), [assets, kind])

  /* Search runs over the CURRENT kind, not the whole library: the row of
     tiles above already said which shelf you are on, and a search that
     silently jumped shelves would make the tiles a lie. Title and deity,
     because those are the two things printed on a card. */
  const matching = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return ofKind
    return ofKind.filter((a) =>
      `${a.title} ${a.deity ?? ''}`.toLowerCase().includes(needle),
    )
  }, [ofKind, query])

  /* Deities present in THIS kind, not across the library — a chip that filters
     to nothing is a dead control, and the wallpaper deities are not going to
     be the bhajan deities. */
  const deities = useMemo(
    () => ['All', ...[...new Set(matching.map((a) => a.deity).filter(Boolean))]],
    [matching],
  )

  /* A chip selected under one kind may not exist under the next. Fall back
     rather than showing an empty grid under a chip that is still lit. */
  const activeDeity = deities.includes(deity) ? deity : 'All'
  const list = activeDeity === 'All' ? matching : matching.filter((a) => a.deity === activeDeity)

  const meta = KINDS.find((k) => k.key === kind)

  const save = async (asset) => {
    setBusy(asset.id)
    try {
      await download(asset)
      showToast(`${asset.title} — saved`)
    } catch {
      showToast('Could not save that file.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      {/* No "Bhakti" tag in the header since 30 Sep — the tab bar already
          names the screen. Search leads, above the tiles (owner's call). */}
      <TabHeader />

      <Search
        value={query}
        onChange={setQuery}
        placeholder={`Search ${meta ? meta.label.toLowerCase() : 'bhakti'}`}
        label="Search bhakti"
      />

      {/* Circle tiles, not a segmented control — same grammar as Consult's
          free-tools row, because both answer "pick a thing to do". */}
      {/* Scrolls sideways (4 Oct 2026). Six 72px tiles need ~450px and a
          phone is 360–412: the row used to spread with `justify-around` and
          no overflow, so Darshan — and on small phones Mantras — sat cut off
          past the edge with no way to reach it. Same row as Consult's tools. */}
      <section className="pb-1 pt-1">
        <ul className="tile-rail">
          {KINDS.map((k) => (
            <li key={k.key} className="flex-none">
              {/* Darshan leaves the screen; the other four switch shelves on
                  it. A link and a button, because they do different things
                  and one of them belongs in browser history. */}
              {k.to ? (
                <Link to={k.to} className="tile">
                  <span className="tile-face" style={tileStyle(k.hue, false)}>
                    <Icon name={k.icon} size={20} />
                  </span>
                  <span className="text-center text-[12px] font-semibold leading-tight t-body">{k.label}</span>
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => setKind(k.key)}
                  aria-pressed={kind === k.key}
                  className="tile"
                >
                  <span className="tile-face" style={tileStyle(k.hue, kind === k.key)}>
                    <Icon name={k.icon} size={20} weight={kind === k.key ? 2.1 : 1.8} />
                  </span>
                  <span className="text-center text-[12px] font-semibold leading-tight t-body">{k.label}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* ── Banners ──────────────────────────────────────────────────────
          Under the tiles rather than above them: the tiles are the
          navigation and these are an offer, and an offer that pushes the
          navigation off the first screen is furniture. */}
      <div className="pt-3">
        <div className="rail gap-3 px-4">
          {banners.map((b, i) => {
            const inner = (
              <>
                <Plate
                  seed={b.id}
                  variant={b.art}
                  className="pointer-events-none absolute -right-8 -top-6 h-[150%] w-2/3 animate-float bg-transparent opacity-25 mix-blend-overlay"
                />
                <span className="relative flex flex-col items-start">
                  <span className="caps-sm text-white/70">{b.kicker}</span>
                  <span className="mt-1 max-w-[22ch] line-clamp-1 text-lead font-medium leading-tight text-white">
                    {b.title}
                  </span>
                  <span className="mt-1.5 max-w-[30ch] line-clamp-2 text-meta text-white/75">{b.note}</span>
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1 caps-sm text-ink shadow-md">
                    {b.cta} <span aria-hidden="true">→</span>
                  </span>
                </span>
              </>
            )
            const style = {
              ...bannerStyle(b),
              animation: `pop-in .5s cubic-bezier(.2,.7,.3,1) ${i * 80}ms backwards`,
            }
            return b.to_ ? (
              <Link key={b.id} to={b.to_} className="banner h-[150px] w-[86%] p-3 text-left" style={style}>
                {inner}
              </Link>
            ) : (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  if (b.remote) followBanner(b, navigate)
                  else {
                    setKind(b.kind)
                    setQuery('')
                  }
                }}
                className="banner h-[150px] w-[86%] p-3 text-left"
                style={style}
              >
                {inner}
              </button>
            )
          })}
        </div>
      </div>

      {deities.length > 1 && (
        <div className="rail mt-3 gap-1.5 px-4">
          {deities.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={activeDeity === d}
              onClick={() => setDeity(d)}
              className="pill flex-none"
            >
              {d}
            </button>
          ))}
        </div>
      )}

      <section className="px-4 pb-4 pt-5">
        {assets === null ? (
          <Loader />
        ) : failed ? (
          <PopCard className="p-5">
            <p className="text-body t-heading">Could not reach the library.</p>
            <p className="mt-2 text-meta t-body">
              The files are fine — this device could not read the list. Open the screen again in a
              moment.
            </p>
          </PopCard>
        ) : list.length === 0 ? (
          <PopCard className="p-5">
            {query.trim() ? (
              <>
                <p className="text-body t-heading">Nothing matches “{query.trim()}”.</p>
                <p className="mt-2 text-meta t-body">
                  Search reads the title and the deity, and only the shelf you are on.
                </p>
                <PopButton className="mt-4" onClick={() => setQuery('')}>
                  Clear the search
                </PopButton>
              </>
            ) : (
              <>
                <p className="text-body t-heading">Nothing here yet.</p>
                <p className="mt-2 text-meta t-body">
                  {meta.label} are curated rather than uploaded, so this fills up when the next
                  batch is published.
                </p>
              </>
            )}
          </PopCard>
        ) : (
          <ul className={isAudio(kind) ? 'space-y-3' : 'space-y-4'}>
            {list.map((a) =>
              kind === 'bhajan' || kind === 'mantra' ? (
                <TrackCard key={a.id} asset={a} counted={kind === 'mantra'} />
              ) : isAudio(kind) ? (
                <AudioRow key={a.id} asset={a} busy={busy === a.id} onSave={() => save(a)} />
              ) : (
                <PictureCard
                  key={a.id}
                  asset={a}
                  ratio={kind === 'status' ? 'aspect-[4/5]' : 'aspect-[3/4]'}
                  action={kind === 'status' ? 'Share' : 'Download'}
                  busy={busy === a.id}
                  onAction={() => (kind === 'status' ? setSharing(a) : save(a))}
                />
              ),
            )}
          </ul>
        )}

        {list.length > 0 && <p className="mt-5 text-center text-meta t-faint">{meta.help}</p>}
      </section>

      <ShareSheet asset={sharing} onClose={() => setSharing(null)} />

      <div className="h-24" />
    </>
  )
}

/**
 * Share one card — every shelf has one (5 Oct 2026). What goes out is a short
 * line, the app link and the sharer's own referral code (`inviteMessage`).
 */
function ShareButton({ asset }) {
  const { showToast } = useStore()
  return (
    <button
      type="button"
      onClick={async () => {
        const said = await shareAsset(asset)
        if (said) showToast(said)
      }}
      aria-label={`Share ${asset.title}`}
      className="flex-none p-1 text-t2 transition-transform duration-150 hover:text-t1 active:scale-90"
    >
      <Icon name="share" size={22} weight={1.8} />
    </button>
  )
}

/** Price badge. `null` is not priced yet, which is not the same as free. */
function Price({ paise }) {
  if (paise == null) return <span className="caps-sm t-faint">Free</span>
  return <span className="caps-sm gold tnum">₹{rupees(paise)}</span>
}

/**
 * Attribution is rendered, not just stored. Three fields, three columns, and
 * the reason they are separate is that this art is downloadable — several of
 * the deity images are share-alike and the credit travels with the file.
 */
function Credit({ asset }) {
  return (
    <p className="mt-1 caps-sm t-faint">
      {asset.artist} · {asset.licence}
    </p>
  )
}

/** Status artwork, full width — the thing being shared is a whole picture. */
/**
 * One card for both picture shelves — 25 Sep 2026.
 *
 * Status and wallpapers were a full-width list and a two-column grid, which
 * made the same artwork look like two products and gave the wallpaper
 * thumbnails no room to be looked at. One layout now: the picture at full
 * width, title and credit under it, one action on the right.
 *
 * The ACTION differs and the layout does not. A status is shared — composed
 * with the person on it and handed to the share sheet. A wallpaper is
 * downloaded: stamping a face and a watermark into the corner of somebody's
 * lock screen is not what that shelf is for.
 */
function PictureCard({ asset, ratio, action, busy, onAction }) {
  return (
    <li>
      <PopCard className="overflow-hidden">
        <img
          src={asset.url}
          alt={asset.title}
          loading="lazy"
          className={`${ratio} w-full bg-surface2 object-cover`}
        />
        <div className="flex items-center gap-3 p-3.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-body t-heading">{asset.title}</p>
            <Credit asset={asset} />
          </div>
          {asset.pricePaise != null && <Price paise={asset.pricePaise} />}
          {action !== 'Share' && <ShareButton asset={asset} />}
          <PopButton
            size="sm"
            variant={action === 'Share' ? 'gold' : 'default'}
            full={false}
            disabled={busy}
            onClick={onAction}
          >
            {busy ? 'Saving…' : action}
          </PopButton>
        </div>
      </PopCard>
    </li>
  )
}

function AudioRow({ asset, busy, onSave }) {
  const el = useRef(null)
  const [playing, setPlaying] = useState(false)

  const toggle = () => {
    const a = el.current
    if (!a) return
    if (a.paused) a.play().catch(() => setPlaying(false))
    else a.pause()
  }

  return (
    <li>
      <PopCard className="flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? `Pause ${asset.title}` : `Play ${asset.title}`}
          className="pill knob !h-11 !w-11 flex-none justify-center"
        >
          <Icon name={playing ? 'pause' : 'play'} size={18} />
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-meta t-heading">{asset.title}</p>
          <Credit asset={asset} />
        </div>

        <div className="flex flex-none items-center gap-2">
          <Price paise={asset.pricePaise} />
          <ShareButton asset={asset} />
          <PopButton size="sm" full={false} disabled={busy} onClick={onSave}>
            {busy ? '…' : 'Save'}
          </PopButton>
        </div>

        <audio
          ref={el}
          src={asset.url}
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
      </PopCard>
    </li>
  )
}

/**
 * Bhajans and mantras share one video-card shape (28–29 Sep 2026): the 16:9
 * thumbnail, then the title with a heart and a play button — no download on
 * these shelves.
 *
 * A bhajan is a full track: once started, the browser's own controls appear
 * under the picture, because a ten-minute track needs a scrubber.
 *
 * A mantra is `counted`: it is chanted a set number of times, so play asks
 * "How many times?" first and the clip repeats that many, with "Repeat n of
 * N" under the title. Pausing keeps the count; Stop drops it, and the next
 * play asks again.
 *
 * Starting any track pauses every other. The heart is the feed's `like:<id>`
 * reaction, so it is per account and survives a reload.
 */
function TrackCard({ asset, counted = false }) {
  const { hasFlag, toggleFlag } = useStore()
  const el = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [started, setStarted] = useState(false)
  const [asking, setAsking] = useState(false)
  const [times, setTimes] = useState('')
  const [total, setTotal] = useState(0)
  const [left, setLeft] = useState(0) // plays still owed, this one included; 0 = no count running
  // ponytail: stored as target_type 'content' because lib/reactions.js maps
  // `like` to content and the server does not check the target exists. Give
  // bhakti its own target_type (reactions CHECK + API deploy) before anything
  // counts likes per type.
  const likeKey = `like:${asset.id}`
  const liked = hasFlag(likeKey)

  const play = () => el.current?.play().catch(() => setPlaying(false))

  const toggle = () => {
    if (playing) return el.current.pause()
    if (!counted || left > 0) return play()
    setAsking((v) => !v)
  }

  const start = (e) => {
    e.preventDefault()
    const n = Math.floor(Number(times))
    if (!(n >= 1 && n <= 1008)) return
    setTotal(n)
    setLeft(n)
    setAsking(false)
    el.current.currentTime = 0
    play()
  }

  const stop = () => {
    el.current.pause()
    el.current.currentTime = 0
    setLeft(0)
  }

  const onPlay = (e) => {
    document.querySelectorAll('audio').forEach((other) => other !== e.target && other.pause())
    setPlaying(true)
    setStarted(true)
  }

  const onEnded = () => {
    if (left > 1) {
      setLeft(left - 1)
      el.current.currentTime = 0
      play()
    } else {
      setLeft(0)
      setPlaying(false)
    }
  }

  const scrubber = started && !counted

  return (
    <li>
      <PopCard className="overflow-hidden">
        <div className="aspect-video w-full bg-surface2">
          {asset.previewUrl && (
            <img src={asset.previewUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          )}
        </div>

        <audio
          ref={el}
          src={asset.url}
          preload="none"
          controls={scrubber}
          className={scrubber ? 'block w-full px-3 pt-3' : 'hidden'}
          onPlay={onPlay}
          onPause={() => setPlaying(false)}
          onEnded={onEnded}
        />

        <div className="flex items-center gap-3 p-3.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-body t-heading">{asset.title}</p>
            {left > 0 ? (
              <p className="mt-1 caps-sm t-faint tnum">
                Repeat {total - left + 1} of {total} ·{' '}
                <button type="button" onClick={stop} className="underline">
                  Stop
                </button>
              </p>
            ) : (
              <Credit asset={asset} />
            )}
          </div>
          <ShareButton asset={asset} />
          <button
            type="button"
            onClick={() => toggleFlag(likeKey)}
            aria-pressed={liked}
            aria-label={liked ? `Unlike ${asset.title}` : `Like ${asset.title}`}
            className={`flex-none p-1 transition-transform duration-150 active:scale-90 ${
              liked ? 'text-live' : 'text-t2 hover:text-t1'
            }`}
          >
            <Icon name="heart" size={24} weight={1.8} filled={liked} />
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? `Pause ${asset.title}` : `Play ${asset.title}`}
            className="pill knob !h-11 !w-11 flex-none justify-center"
          >
            <Icon name={playing ? 'pause' : 'play'} size={18} />
          </button>
        </div>

        {asking && (
          <form onSubmit={start} className="flex items-center gap-2 px-3.5 pb-3.5">
            <label htmlFor={`times-${asset.id}`} className="caps-sm t-faint flex-none">
              How many times?
            </label>
            <input
              id={`times-${asset.id}`}
              type="number"
              inputMode="numeric"
              min="1"
              max="1008"
              required
              autoFocus
              placeholder="e.g. 108"
              value={times}
              onChange={(e) => setTimes(e.target.value)}
              className="w-full rounded-lg border border-stroke bg-surface px-3 py-2 text-body tnum placeholder-t-faint focus:border-ink focus:outline-none"
            />
            <PopButton type="submit" size="sm" full={false}>
              Play
            </PopButton>
          </form>
        )}
      </PopCard>
    </li>
  )
}

/**
 * Three ways to pick the picture, one way out.
 *
 * Every source feeds the same path — composite at 1080×1920, burn today's
 * date on, hand the file to the OS share sheet. What differs is only where the
 * bitmap came from, so there is one compose and one share rather than three of
 * each.
 *
 * The camera option is the gallery input plus `capture`, which is the whole
 * difference on the web: it asks the OS for the camera rather than the picker.
 * On a desktop browser the attribute is ignored and it behaves as a file
 * picker, which is the right degradation.
 *
 * "Use profile picture" is live as of 10 Sep 2026 and hides itself when you
 * have not set one — an option that cannot do anything is worse than an option
 * that is not there, and unlike the disabled state it used to carry, there is
 * now a real thing behind it.
 */
function ShareSheet({ asset, onClose }) {
  const { showToast, me, session } = useStore()
  const who = session?.user?.id ?? null
  const gallery = useRef(null)
  const camera = useRef(null)
  const [working, setWorking] = useState(false)
  /* A data URL, or null. Not an object URL any more: the picture is kept
     between visits (26 Sep 2026), and an object URL dies with the page. */
  const [photo, setPhoto] = useState(null)

  /* Last time's picture, back on the sheet. It stays until it is changed or
     removed — somebody posting every morning should not go hunting for the
     same face every morning. */
  useEffect(() => {
    if (asset) setPhoto(recallStatusPhoto(who))
  }, [asset, who])

  const attach = async (src) => {
    if (!src) {
      setPhoto(null)
      rememberStatusPhoto(who, null)
      return
    }
    setWorking(true)
    const small = await shrinkForStatus(src)
    setWorking(false)
    if (!small) return showToast('Could not read that picture.')
    setPhoto(small)
    rememberStatusPhoto(who, small)
  }

  const pick = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''   // so choosing the same file twice still fires
    if (!file) return
    const url = URL.createObjectURL(file)
    attach(url).finally(() => URL.revokeObjectURL(url))
  }

  const share = async () => {
    if (!asset) return
    setWorking(true)
    try {
      const blob = await composeStatus(asset.url, {
        photoSrc: photo,
        name: photo ? me.name : '',
        dateLabel: longDate(istDate()),
        logoSrc: `${import.meta.env.BASE_URL}namo-logo-light.png`,
      })
      if (!blob) throw new Error('compose failed')
      const filename = `namo-status-${Date.now()}.jpg`
      const shared = await shareFile(blob, filename, await inviteMessage(asset))
      if (!shared) {
        saveBlob(blob, filename)
        showToast('Saved — sharing needs a phone')
      }
      onClose()
    } catch {
      showToast('Could not prepare that image.')
    } finally {
      setWorking(false)
    }
  }

  /* Full screen since 4 Oct 2026 (owner's call): as a bottom sheet the
     picture pushed the Share button below the fold. The preview is sized to
     the screen, the three picture options are one row of icon buttons, and
     Share is pinned to the bottom. The explainer line above the picture is
     gone too. */
  if (!asset) return null
  const options = [
    { key: 'gallery', icon: 'image', label: 'Gallery', onClick: () => gallery.current?.click() },
    { key: 'camera', icon: 'camera', label: 'Camera', onClick: () => camera.current?.click() },
    ...(me.avatarUrl ? [{ key: 'profile', icon: 'user', label: 'Profile photo', onClick: () => attach(me.avatarUrl) }] : []),
    ...(photo ? [{ key: 'remove', icon: 'close', label: 'Remove', onClick: () => attach(null) }] : []),
  ]

  return createPortal(
    <div className="fixed inset-0 z-[70] mx-auto flex w-full max-w-[420px] animate-fade flex-col bg-[#140c08] text-white">
      <div className="flex flex-none items-center gap-3 px-4 pb-3 pt-4">
        <BackButton dark onClick={onClose} label="Close" />
        <p className="flex-1 text-center text-meta font-semibold">Share to status</p>
        <span className="w-9" aria-hidden="true" />
      </div>

      {/* What the export will look like, in the order it is drawn: the
          artwork, your face bottom left, the mark bottom right. */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-6">
        <div className="relative aspect-[9/16] h-full max-h-full overflow-hidden rounded-2xl shadow-2xl">
          <img src={asset.url} alt={asset.title} className="h-full w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/80 to-transparent p-3">
            {photo ? (
              <img src={photo} alt="Your picture" className="h-11 w-11 flex-none rounded-full border-2 border-[#ffa05e] object-cover" />
            ) : (
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full border-2 border-dashed border-white/50 text-white/70">
                <Icon name="plus" size={16} />
              </span>
            )}
            <span className="min-w-0 flex-1">
              {photo && me.name && <span className="block truncate text-meta font-semibold">{me.name}</span>}
              <span className="block truncate caps-sm text-white/75">{longDate(istDate())}</span>
            </span>
            <img src={`${import.meta.env.BASE_URL}namo-logo-light.png`} alt="" className="h-5 flex-none opacity-90" />
          </div>
        </div>
      </div>

      <div className="flex-none px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-4">
        <p className="text-center text-[12px] text-white/60">
          {photo ? 'Your picture is on it, and stays until you change it.' : 'Add your picture, if you like.'}
        </p>
        <div className="mt-3 flex justify-center gap-3">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              disabled={working}
              onClick={o.onClick}
              className="flex w-[76px] flex-col items-center gap-1.5 rounded-2xl bg-white/10 px-2 py-3 text-[12px] font-semibold text-white/90 transition-colors hover:bg-white/15 active:scale-95 disabled:opacity-40"
            >
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full text-white"
                style={{ background: o.key === 'remove' ? 'rgba(255,255,255,0.15)' : 'linear-gradient(160deg, var(--orange-hi), var(--orange-lo))' }}
              >
                <Icon name={o.icon} size={19} weight={2} />
              </span>
              {o.label}
            </button>
          ))}
        </div>
        <PopButton variant="gold" className="mt-4" disabled={working} onClick={share}>
          {working ? 'Preparing…' : 'Share this'}
        </PopButton>
      </div>

      <input
        ref={gallery}
        type="file"
        accept="image/*"
        onChange={pick}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={pick}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>,
    document.body,
  )
}
