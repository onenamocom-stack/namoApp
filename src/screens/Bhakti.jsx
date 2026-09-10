import { useEffect, useMemo, useRef, useState } from 'react'
import { TabHeader } from '../components/Chrome.jsx'
import Icon from '../components/Icon.jsx'
import { Kicker, PopButton, PopCard, PopTag } from '../components/Pop.jsx'
import { Segmented } from '../components/Primitives.jsx'
import { download, fetchAssets, shareFile } from '../lib/bhakti.js'
import { rupees, useStore } from '../store.jsx'

/**
 * Bhakti — the devotional media library, in the slot the shrine used to hold.
 *
 * The shrine did not shrink to make room; it moved to `/darshan` where it gets
 * the whole frame. What lives here instead is the thing people actually came
 * back for daily: something to take away. Wallpapers, ringtones, pooja tunes,
 * bhajans, and a way to put one on a WhatsApp status.
 *
 * ── WHAT A WEB PAGE CAN ACTUALLY DO, WHICH IS LESS THAN THE BRIEF ──────────
 * There is no native shell — no Capacitor, no manifest, a plain site on Pages.
 * **No browser API sets a wallpaper or a ringtone.** So every button here says
 * "Download", and a line under the grid says what to do with the file. The
 * alternative was a button labelled "Set as wallpaper" that silently does
 * something else, which is the class of lie this codebase keeps deleting.
 *
 * Sharing is real, though: `navigator.share` with a file opens the OS sheet
 * and WhatsApp is in it. We hand over a file; the person picks Status. We do
 * not "post a status" and the copy does not claim to.
 *
 * ── PRICING IS OPEN AND THE SCHEMA SAYS SO ─────────────────────────────────
 * `price_paise` is nullable and every seeded row is null, which the screen
 * reads as free. When pricing lands it is `spend()` on the download and the
 * badge below starts rendering — the shape is here, the decision is not made.
 */

const KINDS = [
  { key: 'wallpaper', label: 'Wallpapers', verb: 'Download', help: 'Save it, then set it from your photo gallery.' },
  { key: 'bhajan', label: 'Bhajans', verb: 'Download', help: 'Saves as an audio file you can play anywhere.' },
  { key: 'tune', label: 'Pooja tunes', verb: 'Download', help: 'Saves as an audio file you can play anywhere.' },
  { key: 'ringtone', label: 'Ringtones', verb: 'Download', help: 'Save it, then pick it in your phone’s sound settings.' },
]

const isAudio = (kind) => kind !== 'wallpaper'

export default function Bhakti() {
  const { showToast } = useStore()
  const [assets, setAssets] = useState(null) // null = loading
  const [failed, setFailed] = useState(false)
  const [kind, setKind] = useState('wallpaper')
  const [deity, setDeity] = useState('All')
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

      <StatusComposer assets={assets ?? []} />

      <section className="px-4 pt-2">
        <Segmented items={KINDS} value={kind} onChange={setKind} />
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
              The files are fine — this device could not read the list. Pull the screen again in a
              moment.
            </p>
          </PopCard>
        ) : list.length === 0 ? (
          <PopCard className="p-5">
            <p className="text-body t-heading">Nothing here yet.</p>
            <p className="mt-2 text-meta t-body">
              {meta.label} are curated rather than uploaded, so this fills up when the next batch is
              published. The wallpapers are ready now.
            </p>
          </PopCard>
        ) : (
          <ul className={isAudio(kind) ? 'space-y-3' : 'grid grid-cols-2 gap-3'}>
            {list.map((a) =>
              isAudio(kind) ? (
                <AudioRow key={a.id} asset={a} busy={busy === a.id} onSave={() => save(a)} />
              ) : (
                <WallpaperCard key={a.id} asset={a} busy={busy === a.id} onSave={() => save(a)} />
              ),
            )}
          </ul>
        )}

        {list.length > 0 && <p className="mt-5 text-center text-meta t-faint">{meta.help}</p>}
      </section>

      <div className="h-8" />
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
          <Icon name={playing ? 'close' : 'live'} size={18} />
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
 * WhatsApp status, which is a share and not a post.
 *
 * The image is composited on a canvas at 1080×1920 so what lands in the share
 * sheet is status-shaped rather than whatever aspect the source happened to
 * be. Their own photo goes through the identical path — the only difference is
 * where the bitmap came from.
 *
 * `navigator.share` with files is a phone API. On a desktop browser
 * `canShare` returns false and we save the composed image instead, which is
 * still the useful half.
 */
function StatusComposer({ assets }) {
  const { showToast } = useStore()
  const fileInput = useRef(null)
  const [working, setWorking] = useState(false)

  const compose = async (src) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = src
    await img.decode()

    const c = document.createElement('canvas')
    c.width = 1080
    c.height = 1920
    const ctx = c.getContext('2d')

    /* Cover, not contain: a status with letterbox bars reads as a screenshot
       of something else. Overflow is cropped evenly from both sides. */
    const scale = Math.max(c.width / img.width, c.height / img.height)
    const w = img.width * scale
    const h = img.height * scale
    ctx.fillStyle = '#0e0e10'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h)

    return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.92))
  }

  const run = async (src, name) => {
    setWorking(true)
    try {
      const blob = await compose(src)
      if (!blob) throw new Error('compose failed')
      const shared = await shareFile(blob, `${name}.jpg`, 'Namo')
      if (!shared) {
        const href = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = href
        a.download = `${name}.jpg`
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(href), 10_000)
        showToast('Saved — sharing needs a phone')
      }
    } catch {
      showToast('Could not prepare that image.')
    } finally {
      setWorking(false)
    }
  }

  const pick = (e) => {
    const f = e.target.files?.[0]
    e.target.value = '' // so choosing the same file twice still fires
    if (!f) return
    const url = URL.createObjectURL(f)
    run(url, 'namo-status').finally(() => URL.revokeObjectURL(url))
  }

  const featured = assets.find((a) => a.kind === 'wallpaper')

  return (
    <section className="px-4 pt-4">
      <PopCard raised className="p-4">
        <Kicker>WhatsApp status</Kicker>
        <p className="mt-2 text-meta t-body">
          Put a wallpaper on your status, or bring your own photo. We hand the picture to your
          share sheet — you pick WhatsApp, then Status.
        </p>
        <div className="mt-3.5 flex gap-2">
          <PopButton
            size="sm"
            variant="gold"
            full={false}
            disabled={working || !featured}
            onClick={() => featured && run(featured.url, 'namo-status')}
          >
            {working ? 'Preparing…' : 'Use today’s image'}
          </PopButton>
          <PopButton
            size="sm"
            full={false}
            disabled={working}
            onClick={() => fileInput.current?.click()}
          >
            Your own photo
          </PopButton>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          onChange={pick}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
      </PopCard>
    </section>
  )
}
