import { Loader } from '../components/Cosmos.jsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { bannerStyle, followBanner, useBanners } from '../lib/appearance.js'
import { BackButton, TabHeader } from '../components/Chrome.jsx'
import { createPortal } from 'react-dom'
import Icon from '../components/Icon.jsx'
import Plate from '../components/Plate.jsx'
import { PopButton, PopCard } from '../components/Pop.jsx'
import {
  composeStatus,
  download,
  fetchAssets,
  hinduDateLine,
  recallStatusName,
  recallStatusPhoto,
  rememberStatusName,
  rememberStatusPhoto,
  saveBlob,
  inviteMessage,
  shareAsset,
  shareFile,
  shrinkForStatus,
  statusDateLine,
} from '../lib/bhakti.js'
import { istDate, useAstro } from '../lib/astro.js'
import { rupees, useStore } from '../store.jsx'
import BhaktiActions from '../components/BhaktiActions.jsx'
import { ActIcon } from '../components/ActIcon.jsx'
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
  { key: 'bhajan', label: 'Bhajans', icon: 'sound', hue: '#c2185b', help: 'Saves as an audio file you can play anywhere.' },
  { key: 'mantra', label: 'Mantras', icon: 'mala', hue: '#1e9e5a', help: 'Tap play, say how many times, and it repeats that many.' },
  /* Darshan is not a kind of file — it is the shrine, and it LEAVES this
     screen. It sits in this row anyway (25 Sep 2026): the row answers "pick
     a devotional thing to do", and the shrine is the one people came for.
     It was reachable only from Home's third tab, which nobody reads as
     "the mandir is over there". */
  { key: 'darshan', label: 'Darshan', icon: 'pooja', hue: '#c99a1a', to: '/darshan' },
  // Tunes last, after Darshan (5 Oct 2026, owner's call).
  { key: 'tune', label: 'Tunes', icon: 'bell', hue: '#2f7fd1', help: 'Save it, then pick it in your phone’s sound settings.' },
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
  // A search result lands here as ?kind=…&q=… (7 Oct 2026).
  const [params] = useSearchParams()
  const [kind, setKind] = useState(() => params.get('kind') || 'status')
  const [deity, setDeity] = useState('All')
  const [query, setQuery] = useState(() => params.get('q') || '')
  const [busy, setBusy] = useState(null)

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
      {/* Search opens the search screen, as on every tab (7 Oct 2026,
          Rahul: "should be same"); a result comes back here as
          ?kind=…&q=…, shown with a way to clear it. */}
      <TabHeader />
      {query && (
        <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-xl border border-stroke bg-surface px-3 py-2">
          <span className="min-w-0 truncate text-meta t-sub">
            Showing “{query}”
          </span>
          <button type="button" onClick={() => setQuery('')} className="flex-none caps-sm gold">
            Clear
          </button>
        </div>
      )}

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
        /* The same chip as Consult's categories — face, size and gap
           (8 Oct 2026, Rahul). */
        <div className="rail mt-3 gap-2 px-4">
          {deities.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={activeDeity === d}
              onClick={() => setDeity(d)}
              className="pill caps-sm flex-none"
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
        ) : kind === 'status' ? (
          <StatusShelf list={list} />
        ) : (
          <ul className={isAudio(kind) ? 'space-y-3' : 'space-y-4'}>
            {list.map((a) =>
              kind === 'bhajan' || kind === 'mantra' ? (
                <TrackCard key={a.id} asset={a} counted={kind === 'mantra'} />
              ) : isAudio(kind) ? (
                <AudioRow key={a.id} asset={a} busy={busy === a.id} onSave={() => save(a)} />
              ) : (
                <PictureCard key={a.id} asset={a} busy={busy === a.id} onDownload={() => save(a)} />
              ),
            )}
          </ul>
        )}

        {list.length > 0 && <p className="mt-5 text-center text-meta t-faint">{meta.help}</p>}
      </section>

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

/**
 * A wallpaper (25 Sep 2026; this shape 12 Oct 2026, Rahul): the picture, then
 * Home's like, comment, reshare and share, and a green Download. No title or
 * credit — the pictures are NAMO's own, as on the Status shelf.
 */
function PictureCard({ asset, busy, onDownload }) {
  const { showToast } = useStore()
  return (
    <li>
      <PopCard className="overflow-hidden">
        <img
          src={asset.url}
          alt={asset.title}
          loading="lazy"
          className="aspect-[3/4] w-full bg-surface2 object-cover"
        />
        <div className="flex items-center gap-4 py-3 pl-4 pr-3.5">
          <BhaktiActions asset={asset} />
          {/* The link share stays on a wallpaper (12 Oct 2026, Rahul); a
              status has the WhatsApp button for that. */}
          <ActIcon
            icon="share"
            label="Share"
            onClick={async () => {
              const said = await shareAsset(asset)
              if (said) showToast(said)
            }}
          />
          <span className="flex-1" />
          {asset.pricePaise != null && <Price paise={asset.pricePaise} />}
          <PopButton size="sm" variant="gold" full={false} disabled={busy} onClick={onDownload}>
            <span className="flex items-center gap-1.5">
              <DownloadGlyph />
              {busy ? 'Saving…' : 'Download'}
            </span>
          </PopButton>
        </div>
      </PopCard>
    </li>
  )
}

/** An arrow into a tray, before Download. */
function DownloadGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14" />
    </svg>
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
 * The Status shelf (12 Oct 2026, Rahul: "there is no need for this step").
 * Each status is shown already made — the picture with your photo, name,
 * today's date and tithi on it, 9:16, exactly the image that goes out — and
 * Share hands that image to the phone's share sheet at once. There was a
 * second screen between the two; it is gone.
 *
 * Your photo and name are kept on this phone and used on every status until
 * changed (26 Sep; the name 9 Oct 2026). The pencils on any card open the page
 * that changes both, for all of them.
 */
function StatusShelf({ list }) {
  const { showToast, me, session, sessionReady } = useStore()
  const who = session?.user?.id ?? null
  const [photo, setPhoto] = useState(null)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    setPhoto(recallStatusPhoto(who))
    setName(recallStatusName(who) ?? me.name ?? '')
  }, [who, me.name])

  // Today's Hindu date for the card, from the same panchang Home shows.
  const almanac = useAstro('panchang', { ready: sessionReady, who })
  const hinduLine = hinduDateLine(almanac.payload)

  const details = useMemo(
    () => ({
      photoSrc: photo,
      name,
      dateLine: statusDateLine(istDate()),
      hinduLine,
      logoSrc: `${import.meta.env.BASE_URL}namo-logo-light.png`,
      iconSrc: `${import.meta.env.BASE_URL}namo-icon.png`,
    }),
    [photo, name, hinduLine],
  )

  return (
    <>
      <ul className="space-y-4">
        {list.map((a) => (
          <StatusCard key={a.id} asset={a} details={details} onEdit={() => setEditing(true)} />
        ))}
      </ul>
      {editing &&
        createPortal(
          <div className="fixed inset-0 z-[70] mx-auto w-full max-w-[420px]">
            <StatusDetails
              photo={photo}
              name={name}
              avatarUrl={me.avatarUrl}
              onClose={() => setEditing(false)}
              onSave={(next) => {
                rememberStatusPhoto(who, next.photo)
                rememberStatusName(who, next.name)
                setPhoto(next.photo)
                setName(next.name)
                setEditing(false)
                showToast('Saved. Every status uses it now.')
              }}
            />
          </div>,
          document.body,
        )}
    </>
  )
}

/**
 * One status, composed when it nears the screen rather than all at once —
 * each is a 1080 × 1920 canvas. Until it is ready the plain picture holds its
 * place. THE PREVIEW IS THE IMAGE: what you see is exactly what is shared.
 */
function StatusCard({ asset, details, onEdit }) {
  const { showToast } = useStore()
  const box = useRef(null)
  const [near, setNear] = useState(false)
  const [preview, setPreview] = useState(null) // { url, blob, marks }
  const [working, setWorking] = useState(false)

  useEffect(() => {
    const el = box.current
    if (!el || near) return undefined
    const watch = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && setNear(true),
      { rootMargin: '600px 0px' },
    )
    watch.observe(el)
    return () => watch.disconnect()
  }, [near])

  useEffect(() => {
    if (!near) return undefined
    let live = true
    let url = null
    composeStatus(asset.url, details).then((made) => {
      if (!live || !made?.blob) return
      url = URL.createObjectURL(made.blob)
      setPreview({ url, blob: made.blob, marks: made.marks })
    })
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [near, asset.url, details])

  const share = async () => {
    if (!preview?.blob) return
    setWorking(true)
    try {
      const filename = `namo-status-${Date.now()}.jpg`
      const shared = await shareFile(preview.blob, filename, await inviteMessage(asset))
      if (!shared) {
        saveBlob(preview.blob, filename)
        showToast('Saved — sharing needs a phone')
      }
    } catch {
      showToast('Could not prepare that image.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <li ref={box}>
      <PopCard className="overflow-hidden">
        <div className="relative aspect-[9/16] w-full bg-surface2">
          <img
            src={preview?.url ?? asset.url}
            alt={asset.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
          {/* The pencil is the screen's, not in the image (9 Oct 2026,
              Rahul's design). One, on the photo: it changes the photo and
              the name both, so the one on the name went (12 Oct 2026). */}
          {preview?.marks &&
            ['photo'].map((k) => (
              <button
                key={k}
                type="button"
                onClick={onEdit}
                aria-label="Change your photo and name"
                className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white shadow-lg ring-2 ring-white active:scale-90"
                style={{
                  left: `${preview.marks[k].x * 100}%`,
                  top: `${preview.marks[k].y * 100}%`,
                  background: 'linear-gradient(160deg, var(--orange-hi), var(--orange-lo))',
                }}
              >
                <PencilGlyph />
              </button>
            ))}
        </div>
        {/* Home's like, comment and reshare, then WhatsApp (12 Oct 2026,
            Rahul). The title and credit went: the pictures here are NAMO's
            own. No link-share icon: the green button is the one share, and
            it only shares the status. */}
        <div className="flex items-center gap-4 py-3 pl-4 pr-3.5">
          <BhaktiActions asset={asset} />
          <span className="flex-1" />
          <PopButton size="sm" variant="gold" full={false} disabled={working || !preview} onClick={share}>
            <span className="flex items-center gap-1.5">
              <WhatsAppGlyph />
              {working ? 'Preparing…' : 'Share'}
            </span>
          </PopButton>
        </div>
      </PopCard>
    </li>
  )
}

/** WhatsApp's mark, white, before Share on a status: it says where it goes. */
function WhatsAppGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.84 9.84 0 0 0 12.04 2Zm0 18.15h-.01a8.23 8.23 0 0 1-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.23 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z" />
    </svg>
  )
}

/** A small pencil, for the edit marks over the status preview. */
function PencilGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  )
}

/**
 * The page behind the pencils (9 Oct 2026, Rahul): the photo and the name on
 * your status, changed once and saved for every status after it. Kept on
 * this phone. The name here is the status's, not the account's — changing
 * it does not rename the account.
 */
function StatusDetails({ photo, name, avatarUrl, onClose, onSave }) {
  const { showToast } = useStore()
  const gallery = useRef(null)
  const camera = useRef(null)
  const [nextPhoto, setNextPhoto] = useState(photo)
  const [nextName, setNextName] = useState(name)
  const [busy, setBusy] = useState(false)

  const attach = async (src) => {
    if (!src) return setNextPhoto(null)
    setBusy(true)
    const small = await shrinkForStatus(src)
    setBusy(false)
    if (!small) return showToast('Could not read that picture.')
    setNextPhoto(small)
  }

  const pick = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''   // so choosing the same file twice still fires
    if (!file) return
    const url = URL.createObjectURL(file)
    attach(url).finally(() => URL.revokeObjectURL(url))
  }

  const options = [
    { key: 'gallery', icon: 'image', label: 'Gallery', onClick: () => gallery.current?.click() },
    { key: 'camera', icon: 'camera', label: 'Camera', onClick: () => camera.current?.click() },
    ...(avatarUrl ? [{ key: 'profile', icon: 'user', label: 'Profile photo', onClick: () => attach(avatarUrl) }] : []),
    ...(nextPhoto ? [{ key: 'remove', icon: 'close', label: 'Remove', onClick: () => attach(null) }] : []),
  ]

  return (
    <div className="absolute inset-0 z-10 flex animate-fade flex-col bg-[#140c08] text-white">
      <div className="flex flex-none items-center gap-3 px-4 pb-3 pt-4">
        <BackButton dark onClick={onClose} label="Back" />
        <p className="flex-1 text-center text-meta font-semibold">Your status details</p>
        <span className="w-9" aria-hidden="true" />
      </div>

      <div className="flex-1 overflow-y-auto px-6 pt-6">
        <div className="mx-auto h-32 w-32 overflow-hidden rounded-full ring-4 ring-white">
          {nextPhoto ? (
            <img src={nextPhoto} alt="Your photo" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-white/10 text-white/60">
              <Icon name="user" size={40} />
            </span>
          )}
        </div>
        <div className="mt-5 flex justify-center gap-3">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              disabled={busy}
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

        <label className="mt-8 block">
          <span className="caps-sm text-white/60">Name on your status</span>
          <input
            value={nextName}
            onChange={(e) => setNextName(e.target.value)}
            maxLength={40}
            placeholder="Your name"
            className="mt-2 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-body text-white outline-none placeholder:text-white/40 focus:border-white/60"
          />
        </label>
      </div>

      <div className="flex-none px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-4">
        <PopButton
          variant="gold"
          disabled={busy}
          onClick={() => onSave({ photo: nextPhoto, name: nextName.trim() })}
        >
          Save
        </PopButton>
      </div>

      <input ref={gallery} type="file" accept="image/*" onChange={pick} className="hidden" aria-hidden="true" tabIndex={-1} />
      <input ref={camera} type="file" accept="image/*" capture="user" onChange={pick} className="hidden" aria-hidden="true" tabIndex={-1} />
    </div>
  )
}
