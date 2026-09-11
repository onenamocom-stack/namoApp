import { useEffect, useMemo, useRef, useState } from 'react'
import { Sheet, TabHeader } from '../components/Chrome.jsx'
import Icon from '../components/Icon.jsx'
import { PopButton, PopCard, PopTag } from '../components/Pop.jsx'
import { composeStatus, download, fetchAssets, saveBlob, shareFile } from '../lib/bhakti.js'
import { longDate } from '../lib/astro.js'
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
]

const isAudio = (kind) => kind === 'tune' || kind === 'bhajan'

export default function Bhakti() {
  const { showToast } = useStore()
  const [assets, setAssets] = useState(null) // null = loading
  const [failed, setFailed] = useState(false)
  const [kind, setKind] = useState('status')
  const [deity, setDeity] = useState('All')
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

  /* Deities present in THIS kind, not across the library — a chip that filters
     to nothing is a dead control, and the wallpaper deities are not going to
     be the bhajan deities. */
  const deities = useMemo(
    () => ['All', ...[...new Set(ofKind.map((a) => a.deity).filter(Boolean))]],
    [ofKind],
  )

  /* A chip selected under one kind may not exist under the next. Fall back
     rather than showing an empty grid under a chip that is still lit. */
  const activeDeity = deities.includes(deity) ? deity : 'All'
  const list = activeDeity === 'All' ? ofKind : ofKind.filter((a) => a.deity === activeDeity)

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
              <button
                type="button"
                onClick={() => setKind(k.key)}
                aria-pressed={kind === k.key}
                className="tile w-[80px]"
              >
                <span className={`tile-face ${kind === k.key ? 'tile-face-on' : ''}`}>
                  <Icon name={k.icon} size={22} />
                </span>
                <span className="caps-sm leading-tight t-body">{k.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

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
            <p className="text-body t-heading">Nothing here yet.</p>
            <p className="mt-2 text-meta t-body">
              {meta.label} are curated rather than uploaded, so this fills up when the next batch is
              published.
            </p>
          </PopCard>
        ) : (
          <ul className={kind === 'status' ? 'space-y-4' : isAudio(kind) ? 'space-y-3' : 'grid grid-cols-2 gap-3'}>
            {list.map((a) =>
              kind === 'status' ? (
                <StatusCard key={a.id} asset={a} onShare={() => setSharing(a)} />
              ) : isAudio(kind) ? (
                <AudioRow key={a.id} asset={a} busy={busy === a.id} onSave={() => save(a)} />
              ) : (
                <WallpaperCard key={a.id} asset={a} busy={busy === a.id} onSave={() => save(a)} />
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
function StatusCard({ asset, onShare }) {
  return (
    <li>
      <PopCard className="overflow-hidden">
        <img
          src={asset.url}
          alt={asset.title}
          loading="lazy"
          className="aspect-[4/5] w-full bg-surface2 object-cover"
        />
        <div className="flex items-center gap-3 p-3.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-body t-heading">{asset.title}</p>
            <Credit asset={asset} />
          </div>
          <PopButton size="sm" variant="gold" full={false} onClick={onShare}>
            Share
          </PopButton>
        </div>
      </PopCard>
    </li>
  )
}

function WallpaperCard({ asset, busy, onSave }) {
  return (
    <li>
      <PopCard className="overflow-hidden">
        <img
          src={asset.url}
          alt={asset.title}
          loading="lazy"
          className="aspect-[3/4] w-full bg-surface2 object-cover"
        />
        <div className="p-3">
          <p className="truncate text-meta t-heading">{asset.title}</p>
          <Credit asset={asset} />
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <Price paise={asset.pricePaise} />
            <PopButton size="sm" full={false} disabled={busy} onClick={onSave}>
              {busy ? 'Saving…' : 'Download'}
            </PopButton>
          </div>
        </div>
      </PopCard>
    </li>
  )
}

/**
 * An audio row. One `<audio>` element for the whole screen would be tidier,
 * but it lives here per row because pausing on unmount is then automatic and
 * two rows cannot get out of sync with one shared `playing` id.
 *
 * This is the app's first audio of any kind — `HANDOFF.md` recorded "no audio
 * anywhere" as a deliberate omission until 9 Sep 2026, and the mandir's
 * sangeet button said so on screen.
 */
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

  const run = async (src, revoke) => {
    setWorking(true)
    try {
      const blob = await composeStatus(src, longDate(new Date().toISOString()))
      if (!blob) throw new Error('compose failed')
      const name = `namo-status-${Date.now()}.jpg`
      const shared = await shareFile(blob, name, 'Namo')
      if (!shared) {
        saveBlob(blob, name)
        showToast('Saved — sharing needs a phone')
      }
      onClose()
    } catch {
      showToast('Could not prepare that image.')
    } finally {
      setWorking(false)
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }

  const pick = (e) => {
    const f = e.target.files?.[0]
    e.target.value = '' // so choosing the same file twice still fires
    if (!f) return
    const url = URL.createObjectURL(f)
    run(url, url)
  }

  return (
    <Sheet open={!!asset} onClose={onClose} title="Share to status">
      <p className="text-meta t-body">
        We hand the picture to your share sheet — you pick WhatsApp, then Status. Today’s date is
        printed on it.
      </p>

      <div className="mt-5 space-y-2">
        {me.avatarUrl && (
          <PopButton disabled={working} onClick={() => run(me.avatarUrl, null)}>
            Use profile picture
          </PopButton>
        )}
        <PopButton
          variant="gold"
          disabled={working}
          onClick={() => asset && run(asset.url, null)}
        >
          {working ? 'Preparing…' : 'Use this artwork'}
        </PopButton>
        <PopButton disabled={working} onClick={() => gallery.current?.click()}>
          Add image from gallery
        </PopButton>
        <PopButton disabled={working} onClick={() => camera.current?.click()}>
          Add image from camera
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
    </Sheet>
  )
}
