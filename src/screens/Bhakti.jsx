import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sheet, TabHeader } from '../components/Chrome.jsx'
import Icon from '../components/Icon.jsx'
import Plate from '../components/Plate.jsx'
import { PopButton, PopCard, PopTag } from '../components/Pop.jsx'
import { Search } from '../components/Primitives.jsx'
import { composeStatus, download, fetchAssets, saveBlob, shareFile } from '../lib/bhakti.js'
import { istDate, longDate } from '../lib/astro.js'
import { rupees, useStore } from '../store.jsx'

/**
 * Bhakti — the devotional media library, in the slot the shrine used to hold.
 *
 * Four kinds, as circle tiles rather than a segmented control: the same
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
  { key: 'status', label: 'Status', icon: 'share', help: 'Pick a picture, then share it to WhatsApp → Status.' },
  { key: 'wallpaper', label: 'Wallpapers', icon: 'eye', help: 'Save it, then set it from your photo gallery.' },
  { key: 'tune', label: 'Tunes', icon: 'bell', help: 'Save it, then pick it in your phone’s sound settings.' },
  { key: 'bhajan', label: 'Bhajans', icon: 'pooja', help: 'Saves as an audio file you can play anywhere.' },
  /* Darshan is not a kind of file — it is the shrine, and it LEAVES this
     screen. It sits in this row anyway (25 Sep 2026): the row answers "pick
     a devotional thing to do", and the shrine is the one people came for.
     It was reachable only from Home's third tab, which nobody reads as
     "the mandir is over there". */
  { key: 'darshan', label: 'Darshan', icon: 'pooja', to: '/darshan' },
]

const isAudio = (kind) => kind === 'tune' || kind === 'bhajan'

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
    title: 'Put a deity on your lock screen',
    note: 'Painted wallpapers, saved to your gallery.',
    cta: 'Browse wallpapers',
    art: 'contour',
    from: '#8a3a00',
    to: '#b45309',
    kind: 'wallpaper',
  },
]

export default function Bhakti() {
  const { showToast } = useStore()
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
      <TabHeader action={<PopTag tone="gold">Bhakti</PopTag>} />

      {/* Circle tiles, not a segmented control — same grammar as Consult's
          free-tools row, because both answer "pick a thing to do". */}
      <section className="px-2 pb-1 pt-3">
        <ul className="flex items-start justify-around">
          {KINDS.map((k) => (
            <li key={k.key}>
              {/* Darshan leaves the screen; the other four switch shelves on
                  it. A link and a button, because they do different things
                  and one of them belongs in browser history. */}
              {k.to ? (
                <Link to={k.to} className="tile w-[68px]">
                  <span className="tile-face">
                    <Icon name={k.icon} size={22} />
                  </span>
                  <span className="caps-sm leading-tight t-body">{k.label}</span>
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => setKind(k.key)}
                  aria-pressed={kind === k.key}
                  className="tile w-[68px]"
                >
                  <span className={`tile-face ${kind === k.key ? 'tile-face-on' : ''}`}>
                    <Icon name={k.icon} size={22} />
                  </span>
                  <span className="caps-sm leading-tight t-body">{k.label}</span>
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
          {BANNERS.map((b, i) => {
            const inner = (
              <>
                <Plate
                  seed={b.id}
                  variant={b.art}
                  className="pointer-events-none absolute -right-8 -top-6 h-[150%] w-2/3 animate-float bg-transparent opacity-25 mix-blend-overlay"
                />
                <span className="relative flex flex-col items-start">
                  <span className="caps-sm text-white/70">{b.kicker}</span>
                  <span className="mt-1 block max-w-[22ch] text-lead font-medium leading-tight text-white">
                    {b.title}
                  </span>
                  <span className="mt-2 block max-w-[30ch] text-meta text-white/75">{b.note}</span>
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1 caps-sm text-ink shadow-md">
                    {b.cta} <span aria-hidden="true">→</span>
                  </span>
                </span>
              </>
            )
            const style = {
              backgroundImage: `linear-gradient(135deg, ${b.from} 0%, ${b.to} 100%)`,
              animation: `pop-in .5s cubic-bezier(.2,.7,.3,1) ${i * 80}ms backwards`,
            }
            return b.to_ ? (
              <Link key={b.id} to={b.to_} className="banner w-[86%] p-3 text-left" style={style}>
                {inner}
              </Link>
            ) : (
              <button
                key={b.id}
                type="button"
                onClick={() => { setKind(b.kind); setQuery('') }}
                className="banner w-[86%] p-3 text-left"
                style={style}
              >
                {inner}
              </button>
            )
          })}
        </div>
      </div>

      <Search
        value={query}
        onChange={setQuery}
        placeholder={`Search ${meta ? meta.label.toLowerCase() : 'bhakti'}`}
        label="Search bhakti"
      />

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
          <p className="animate-breathe py-10 text-center caps-sm t-faint">Loading</p>
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
              isAudio(kind) ? (
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
  const { showToast, me } = useStore()
  const gallery = useRef(null)
  const camera = useRef(null)
  const [working, setWorking] = useState(false)
  const [photo, setPhoto] = useState(null)   // { src, revoke } or null

  /* The picked file is an object URL and object URLs leak. Revoke on close
     and on replacement, not in the share handler — somebody who picks a
     photo and then changes their mind never reaches the share handler. */
  useEffect(() => {
    if (!asset) setPhoto((current) => { if (current?.revoke) URL.revokeObjectURL(current.revoke); return null })
  }, [asset])

  const attach = (src, revoke) =>
    setPhoto((current) => {
      if (current?.revoke) URL.revokeObjectURL(current.revoke)
      return { src, revoke }
    })

  const pick = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''   // so choosing the same file twice still fires
    if (!file) return
    attach(URL.createObjectURL(file), null)
  }

  const share = async () => {
    if (!asset) return
    setWorking(true)
    try {
      const blob = await composeStatus(asset.url, {
        photoSrc: photo?.src ?? null,
        name: photo ? me.name : '',
        dateLabel: longDate(istDate()),
        logoSrc: `${import.meta.env.BASE_URL}namo-logo.png`,
      })
      if (!blob) throw new Error('compose failed')
      const filename = `namo-status-${Date.now()}.jpg`
      const shared = await shareFile(blob, filename, 'Namo')
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

  return (
    <Sheet open={!!asset} onClose={onClose} title="Share to status">
      <p className="text-meta t-body">
        We hand the picture to your share sheet — you pick WhatsApp, then Status. Your name and
        today’s date are printed on it, with the Namo mark in the corner.
      </p>

      {/* What the export will look like, in the order it is drawn: the
          artwork, your face bottom left, the mark bottom right. Small, but
          it is the only way to know what you are about to send. */}
      {asset && (
        <div className="relative mt-5 overflow-hidden rounded-2xl">
          <img src={asset.url} alt={asset.title} className="aspect-[9/16] w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-ink/80 to-transparent p-3">
            {photo ? (
              <img
                src={photo.src}
                alt="Your picture"
                className="h-12 w-12 flex-none rounded-full border-2 border-gold object-cover"
              />
            ) : (
              <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full border-2 border-dashed border-white/50 text-white/70">
                <Icon name="plus" size={18} />
              </span>
            )}
            <span className="min-w-0 flex-1">
              {photo && me.name && (
                <span className="block truncate text-meta font-semibold text-white">{me.name}</span>
              )}
              <span className="block truncate caps-sm text-white/75">
                {longDate(istDate())}
              </span>
            </span>
            <img
              src={`${import.meta.env.BASE_URL}namo-logo.png`}
              alt=""
              className="h-7 flex-none opacity-90"
            />
          </div>
        </div>
      )}

      <p className="mt-4 caps-sm t-faint">
        {photo ? 'Your picture is on it. Tap another to change it.' : 'A picture is optional.'}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <PopButton full={false} disabled={working} onClick={() => gallery.current?.click()}>
          From gallery
        </PopButton>
        <PopButton full={false} disabled={working} onClick={() => camera.current?.click()}>
          Take one
        </PopButton>
        {me.avatarUrl && (
          <PopButton full={false} disabled={working} onClick={() => attach(me.avatarUrl, null)}>
            Profile picture
          </PopButton>
        )}
        {photo && (
          <PopButton full={false} disabled={working} onClick={() => attach(null, null)}>
            Remove picture
          </PopButton>
        )}
      </div>

      <PopButton variant="gold" className="mt-3" disabled={working} onClick={share}>
        {working ? 'Preparing…' : 'Share this'}
      </PopButton>

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
    </Sheet>
  )
}
