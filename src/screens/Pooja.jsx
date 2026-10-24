import { useEffect, useRef, useState } from 'react'
import { creditLine, deities as SHIPPED, offerings } from '../data/mock.js'
import { dayFirst } from '../lib/dayDeity.js'
import { markSadhana } from '../lib/streak.js'
import { startAartiSangeet, stopAartiSangeet } from '../lib/aartiSangeet.js'
import { BackButton, useGoBack } from '../components/Chrome.jsx'
import Icon from '../components/Icon.jsx'
import {
  Dhoop,
  Diya,
  Ghanti,
  LampFlame,
  PujaPhoto,
  Thali,
} from '../components/PujaProps.jsx'
import { useStore } from '../store.jsx'
import { fetchAssets, fetchDarshan, withJi } from '../lib/bhakti.js'
import DarshanFrame, { Pic } from '../components/DarshanFrame.jsx'
import BhaktiActions from '../components/BhaktiActions.jsx'

/**
 * Mandir — e-puja only, and it does not scroll.
 *
 * That is the whole layout rule. You cannot perform an aarti while hunting for
 * the thali, so the shrine takes every pixel of the page, and every prop —
 * bells, offerings, thali, sangeet — sits on it rather than under it.
 *
 * There are no offering buttons (5 Oct 2026, the owner's pick of four
 * options): you touch the samagri itself. The ghantis ring, the diyas and the
 * agarbatti light, and the bowl of marigolds on the step showers flowers. Each
 * glows until the first offering, and a one-time toast says what to touch.
 *
 * 6 Oct 2026, the owner's reference, "same to same": deity pills along the
 * top; a gold band across the shrine with the two bells hanging from it and
 * the mandir's plaque under it (tap: choose the murti); the murti filling the
 * page over a blurred wash of itself; a white marble altar slab across the
 * bottom with the samagri standing on it. It replaced a full-page mandir
 * entrance (marble, sandstone, gold, granite) — described below as it was:
 *
 * Since 5 Oct 2026 the page IS a mandir entrance: a photographed white-marble
 * doorway fills the screen and the murti stands inside it. The top bar and the
 * deity row went with that. Back, the deity and sangeet now sit on the
 * frieze over the arch: the deity's name is a nameplate that opens one sheet
 * for deity and murti, and sangeet opens with that deity's own bhajans and
 * mantras first. Nothing on this screen is below the fold because there
 * is no fold. (A white action bar under the image was tried on 3 Oct 2026 and
 * taken out the same day, the owner's call: the rail is the layout.)
 *
 * The brass is photographed: `public/puja/*.webp`, each falling back to its
 * drawing in PujaProps.jsx until the file exists.
 *
 * Consequence worth knowing before you add anything: this is the one screen in
 * the app whose root is a fixed-height flex column instead of a scrolling
 * stack. A new section does not go at the bottom, it goes on the image or it
 * goes in the murti sheet. If neither fits, it does not belong here.
 *
 * Nothing books a pandit and nothing is charged. Sangeet plays Bhakti's
 * bhajans and mantras (4 Oct 2026).
 */
/* ── The ghanti's voice (5 Oct 2026) ─────────────────────────────────────
   A RECORDING of a temple ghanta: one strike, 4.2 s, cut from "Indian Temple
   Bell" by ganiket (Freesound #466652, recorded in Kothi, Himachal Pradesh,
   CC0 — no credit owed, given anyway). It replaced a synthesised bell that
   the owner rightly said did not sound like a ghanta.

   Each tap plays a fresh copy, so quick taps overlap the way a real bell's
   strikes do. Called from inside the tap: a phone only lets a page make
   sound from the gesture itself. */
const GHANTA_URL = `${import.meta.env.BASE_URL}puja/ghanta.mp3`
let ghanta = null
function ringGhanti() {
  try {
    ghanta = ghanta || new Audio(GHANTA_URL)
    const strike = ghanta.cloneNode()
    strike.volume = 0.9
    strike.play().catch(() => {})
  } catch {
    /* No audio on this device. The bells still swing. */
  }
}

/* Where the five wicks of the thali's lamp are, as a fraction of the photo
   (`public/puja/thali.webp`), so the aarti's flames stand on them. Measured
   off the photo; move these if the photo is replaced. */
const THALI_WICKS = [
  [0.496, 0.114],
  [0.347, 0.197],
  [0.614, 0.177],
  [0.354, 0.374],
  [0.636, 0.379],
]

/* What a pushpanjali showers (5 Oct 2026): photographed whole marigolds and
   loose genda and rose petals, `public/puja/{flower,petal}-*.webp`, keyed
   from Canva images. Listed more than once to weight the mix. `size` is the
   rendered width in px before each one's own ±25%. */
const BLOOMS = [
  { f: 'flower-marigold', size: 26 },
  { f: 'flower-marigold', size: 26 },
  { f: 'flower-marigold', size: 26 },
  { f: 'flower-marigold-yellow', size: 26 },
  { f: 'flower-marigold-yellow', size: 26 },
  { f: 'petal-rose-2', size: 15, petal: true },
  { f: 'petal-rose-3', size: 15, petal: true },
  { f: 'petal-rose-4', size: 15, petal: true },
  { f: 'petal-genda-1', size: 14, petal: true },
  { f: 'petal-genda-5', size: 14, petal: true },
]
/* The deities and their murtis come from the console (8 Oct 2026, Rahul:
   each murti will be a photo from a different temple, its name and place on
   the plaque). Until they arrive — or if they cannot — the list from the
   last visit, and on a first visit the ones the app shipped with, in the
   same shape. */
const shipped = SHIPPED.map((d) => ({
  id: d.id,
  name: d.name,
  nameHi: d.nameHi,
  images: d.images.map((im) => ({
    id: im.f,
    src: `${import.meta.env.BASE_URL}deities/${im.f}`,
    temple: '',
    templeHi: '',
    location: '',
    locationHi: '',
    title: im.label,
    credit: creditLine(im),
  })),
}))
/* The console's list from the last visit, so a slow or failed load opens on
   the real temples rather than the shipped paintings (23 Oct 2026, Rahul's
   screenshot: "Mandir me abhi purani photos dikh rahi h"). */
const LIST_KEY = 'namo.darshan.list'
function rememberedList() {
  try {
    const rows = JSON.parse(localStorage.getItem(LIST_KEY))
    return Array.isArray(rows) && rows.length && rows.every((d) => d.name && Array.isArray(d.images)) ? rows : null
  } catch {
    return null
  }
}

/* A temple's live schedule when it is live every day (its timings start
   "Daily", or it streams round the clock); null otherwise, and the plate
   says it does not know. In the reader's language where the console has it. */
function dailySchedule(image, lang) {
  const hours = (image?.liveHours || '').trim()
  if (!/^daily|24 hours/i.test(hours)) return null
  return (lang === 'hi' && image.liveHoursHi?.trim()) || hours
}

const SHOWER = 36 // per tap — three times the 12 it was
const HINT_KEY = 'namo.puja.touched'
/* Where the gold band's two pendants hang, as a share of its width — the
   bells hang from them. Measured off `public/puja/gold-band.webp`. */
const BAND = { w: 1080, h: 345, body: 200, hooks: [0.144, 0.863], tip: 300 }
const bandCqw = (px) => `${((px / BAND.w) * 100).toFixed(3)}cqw`
/* The altar slab, `public/puja/marble-slab.webp`: its height as a share of
   its width, and where its top surface meets its front edge. The photo is
   drawn in two parts: the front face at half the photo's height (10 Oct
   2026, Rahul: it was an empty green band; 3/4 from 8 Oct, the owner's
   smaller table), and the top surface `depth` times deeper than that, so the
   samagri stand on the table rather than at its lip (10 Oct 2026, Rahul: the
   thali looked as if it were falling). `slabCqw(f)` is f of the whole
   slab's height, in the page's width units. */
const SLAB = { ratio: (225 / 865) * 0.5, edge: 100 / 225, depth: 1.8 }
const SLAB_FRONT = SLAB.ratio * (1 - SLAB.edge)
const SLAB_TOP = SLAB.ratio * SLAB.edge * SLAB.depth
const cqw = (x) => `${(x * 100).toFixed(3)}cqw`
const slabCqw = (f) => cqw((SLAB_FRONT + SLAB_TOP) * f)
/* Where the samagri stand: a third of the way back across the top surface
   (10 Oct 2026; it was a few pixels behind the front edge, and before 7 Oct
   the thali stood below the edge and hung over the front). `lift` is the
   button's own padding. */
const onCounter = (lift = 0) => `calc(${cqw(SLAB_FRONT + SLAB_TOP / 3)} - ${lift}px)`
const offeringLabel = (key) => offerings.find((o) => o.key === key).label

export default function Pooja() {
  const { showToast, lang, t } = useStore()
  const [deities, setDeities] = useState(() => {
    const last = rememberedList()
    return last ? dayFirst(last, (d) => d.name) : shipped
  })
  const [deityName, setDeityName] = useState(() => deities[0].name)
  const deity = deities.find((d) => d.name === deityName) ?? deities[0]
  const [pic, setPic] = useState(0)
  const [sheet, setSheet] = useState(false)
  // Sangeet (4 Oct 2026): the bhajans and mantras from Bhakti, played over
  // the puja. One <audio> for the screen, so starting one stops the other,
  // and leaving the shrine unmounts it and the music stops with it.
  const [musicOpen, setMusicOpen] = useState(false)
  const [library, setLibrary] = useState(null) // null = not fetched yet
  const [track, setTrack] = useState(null)
  const player = useRef(null)
  const [lit, setLit] = useState({ diya: false, incense: false })
  const [aarti, setAarti] = useState(false)
  const [ringing, setRinging] = useState(false)
  const [petals, setPetals] = useState([])
  const [ripples, setRipples] = useState([])
  const seq = useRef(0)
  const swipe = useRef(null)
  const pills = useRef(null)
  const goBack = useGoBack('/home')
  // The samagri glows until it is first touched, once per device.
  const [hint, setHint] = useState(() => {
    try {
      return !localStorage.getItem(HINT_KEY)
    } catch {
      return true
    }
  })

  useEffect(() => {
    ghanta = ghanta || new Audio(GHANTA_URL)
    ghanta.preload = 'auto'
    // Warm the flowers too, so the first shower does not fall as blanks.
    for (const b of BLOOMS) new Image().src = `${import.meta.env.BASE_URL}puja/${b.f}.webp`
  }, [])

  /* The bells ring once as you come in, swinging as they do when touched
     (12 Oct 2026, Rahul). The swing always shows; the sound plays when the
     browser allows it — after a tap in the app it does, and a darshan opened
     straight from a link, before any touch, swings in silence. */
  useEffect(() => {
    const strike = setTimeout(() => {
      ringGhanti()
      setRinging(true)
    }, 500)
    const still = setTimeout(() => setRinging(false), 1900)
    return () => {
      clearTimeout(strike)
      clearTimeout(still)
    }
  }, [])

  // A swipe can land on a deity whose pill is off the end of the row, so the
  // row follows. No `behavior: 'smooth'` — declined inside scroll containers
  // in this app; `block: 'nearest'` keeps it horizontal.
  useEffect(() => {
    pills.current
      ?.querySelector('[aria-pressed="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [deity])

  // The day's deity comes first and opens the shrine (23 Oct 2026, Rahul;
  // before, the console's first deity did), unless a chip was already
  // tapped or the shrine swiped while the list loaded. A failed load is
  // tried twice more, after 2 and 6 seconds.
  const moved = useRef(false)
  useEffect(() => {
    let gone = false
    let timer = null
    const load = (tries) =>
      fetchDarshan()
        .then((loaded) => {
          if (gone || !loaded.length) return
          try {
            localStorage.setItem(LIST_KEY, JSON.stringify(loaded))
          } catch {
            // private window or full storage: the next visit loads again
          }
          const rows = dayFirst(loaded, (d) => d.name)
          setDeities(rows)
          // A shared murti's link, `/darshan?murti=<id>` (24 Oct 2026), opens
          // on that temple.
          const wanted = new URLSearchParams(window.location.search).get('murti')
          const at = wanted ? rows.find((d) => d.images.some((i) => i.id === wanted)) : null
          if (at && !moved.current) {
            moved.current = true
            setDeityName(at.name)
            setPic(at.images.findIndex((i) => i.id === wanted))
          } else if (!moved.current) setDeityName(rows[0].name)
        })
        .catch((err) => {
          console.error('[darshan] load failed:', err.message)
          if (!gone && tries > 0) timer = setTimeout(() => load(tries - 1), tries === 2 ? 2000 : 6000)
        })
    load(2)
    return () => {
      gone = true
      clearTimeout(timer)
    }
  }, [])

  // Said once, the first time: nothing on the altar looks like a button.
  useEffect(() => {
    if (hint) showToast(t('puja.touchHint'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Swiping the shrine. Left for the next deity — the chip beside it, in the
   * chips' order, stopping at either end (22 Oct 2026, Rahul: "slide karne pe
   * next adjacent category"; a right swipe was next, and a swipe back from the
   * first deity wrapped round to the last) — up for the next murti of the
   * one you are on, as on Instagram (24 Oct 2026, Rahul; it was down); right
   * and down go back. The nameplate on the arch follows
   * along — its dots are the murtis, the stack a vertical swipe moves through.
   *
   * The rule that makes this safe to add is the `closest('button')` bail. Every
   * prop on the shrine is a button and two of them own gestures already — the
   * thali is dragged in circles, the rail is tapped — so a swipe that started
   * on one of those would fire twice. Starting a swipe is refused on any
   * control; the bare image is the only thing that swipes.
   *
   * `DOMINANCE` stops a sloppy diagonal doing both. A drag has to be clearly
   * one axis or it is ignored, which is better than guessing wrong and
   * changing the deity when someone meant the murti.
   */
  const SWIPE_MIN = 44
  const DOMINANCE = 1.4

  const startSwipe = (e) => {
    if (e.target.closest('button')) return
    // Record before capturing. setPointerCapture throws NotFoundError if the
    // pointer is not active, and it threw here — which killed the gesture
    // before the origin was ever stored. Capture only widens where the swipe
    // can finish; it is not worth the whole feature.
    swipe.current = { x: e.clientX, y: e.clientY }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* no capture: the swipe still works as long as it ends on the shrine */
    }
  }

  const endSwipe = (e) => {
    const from = swipe.current
    swipe.current = null
    if (!from) return

    const dx = e.clientX - from.x
    const dy = e.clientY - from.y
    const ax = Math.abs(dx)
    const ay = Math.abs(dy)
    if (Math.max(ax, ay) < SWIPE_MIN) return

    const wrap = (i, n) => ((i % n) + n) % n
    if (ax > ay * DOMINANCE) {
      const i = deities.findIndex((d) => d.id === deity.id)
      const j = i + (dx < 0 ? 1 : -1)
      if (j < 0 || j >= deities.length) return
      moved.current = true
      setDeityName(deities[j].name)
      setPic(0)
    } else if (ay > ax * DOMINANCE) {
      // Up for the next murti, as on Instagram (24 Oct 2026, Rahul: down was next).
      setPic((p) => wrap(p + (dy < 0 ? 1 : -1), deity.images.length))
    }
  }

  // Petals and ripples are one-shot animations; drop them once they finish so
  // the DOM does not fill up over a long session.
  useEffect(() => {
    if (!petals.length) return
    const timer = setTimeout(() => setPetals((p) => p.slice(SHOWER)), 6600)
    return () => clearTimeout(timer)
  }, [petals])

  useEffect(() => {
    if (!ripples.length) return
    const timer = setTimeout(() => setRipples((r) => r.slice(1)), 1000)
    return () => clearTimeout(timer)
  }, [ripples])

  const ripple = () => {
    seq.current += 1
    setRipples((r) => [...r, seq.current])
  }

  const offer = (key) => {
    if (hint) {
      setHint(false)
      try {
        localStorage.setItem(HINT_KEY, '1')
      } catch {
        /* private mode: it glows again next time, which is harmless */
      }
    }
    ripple()
    if (key === 'bell') {
      ringGhanti()
      setRinging(true)
      setTimeout(() => setRinging(false), 1400)
    }
    if (key === 'flower') {
      seq.current += 1
      const base = seq.current
      setPetals((p) => [
        ...p,
        ...Array.from({ length: SHOWER }, (_, i) => {
          const kind = BLOOMS[Math.floor(Math.random() * BLOOMS.length)]
          return {
            id: `${base}-${i}`,
            kind,
            left: 2 + Math.random() * 92,
            delay: Math.random() * 1.2,
            fall: 3.4 + Math.random() * 1.8,
            size: kind.size * (0.75 + Math.random() * 0.5),
            flutter: 1.3 + Math.random() * 0.9,
          }
        }),
      ])
    }
    if (key === 'diya') setLit((l) => ({ ...l, diya: !l.diya }))
    if (key === 'incense') setLit((l) => ({ ...l, incense: !l.incense }))
    // No sentence on screen for an offering (12 Oct 2026, Rahul): the bell,
    // the flame and the flowers say it.
  }

  /* Started INSIDE the tap, not from an effect after a re-render: phones
     only let a page make sound from the gesture itself, and an autoplay one
     render later is refused without a word. Mantras repeat until stopped. */
  const playTrack = (asset) => {
    const el = player.current
    if (!el) return
    // A bhajan or aarti from Sangeet takes over from the aarti's music.
    stopAartiSangeet()
    el.src = asset.url
    el.loop = asset.kind === 'mantra'
    el.play().catch(() => {
      setTrack(null)
      showToast(t('puja.cantPlay'))
    })
    setTrack(asset)
  }

  const stopTrack = () => {
    const el = player.current
    if (el) {
      el.pause()
      el.removeAttribute('src')
      el.load()
    }
    setTrack(null)
  }

  // A temple's YouTube darshan has its own sound: Sangeet stops while its
  // player is on screen, live or as a recording (from the frame:
  // `air.playing`). `watch`: the seeker tapped Live darshan (21 Oct 2026).
  const [air, setAir] = useState(null)
  const [watch, setWatch] = useState(false)
  const onYoutube = Boolean(air?.playing)
  const murtiId = deity.images[Math.min(pic, deity.images.length - 1)]?.id
  // The murti's catalogue row, shaped as a Bhakti picture for BhaktiActions.
  const shown = deity.images[Math.min(pic, deity.images.length - 1)]
  const murtiAsset = shown?.asset
    ? {
        ...shown.asset,
        kind: 'darshan',
        deity: deity.name,
        title: shown.temple || `Shri ${withJi(deity.name)} Mandir`,
        url: shown.src,
        pricePaise: null,
      }
    : null
  // Another murti, or the stream ending, goes back to the photo.
  useEffect(() => setWatch(false), [murtiId])
  useEffect(() => {
    if (air && !air.live) setWatch(false)
  }, [air])
  useEffect(() => {
    if (onYoutube) {
      stopTrack()
      stopAartiSangeet()
    }
  }, [onYoutube])
  // Leaving the shrine ends the aarti's music with it.
  useEffect(() => stopAartiSangeet, [])

  const openMusic = () => {
    setMusicOpen(true)
    if (library === null) {
      fetchAssets()
        .then((rows) => setLibrary(rows.filter((a) => (a.kind === 'bhajan' || a.kind === 'mantra') && a.url)))
        .catch(() => setLibrary([]))
    }
  }

  const toggleAarti = () => {
    // Beginning the aarti lights everything on the altar (4 Oct 2026): the
    // thali's lamp, both diyas and the agarbatti. Ending it leaves the diyas
    // and agarbatti burning — they go out from their own buttons.
    if (!aarti) setLit({ diya: true, incense: true })
    // Beginning an aarti counts today's sadhana (14 Oct 2026, Phase 15c).
    if (!aarti) markSadhana('aarti')
    // Ghanti and tabla while the thali turns (21 Oct 2026, Rahul), unless
    // Sangeet or the temple's own broadcast is already playing. Started in
    // the tap: a phone refuses sound that starts later.
    if (!aarti && !track && !onYoutube) startAartiSangeet()
    if (aarti) stopAartiSangeet()
    setAarti((a) => !a)
    ripple()
  }

  // The console can take a murti away while it is showing.
  const at = Math.min(pic, deity.images.length - 1)
  const image = deity.images[at]
  const hi = lang === 'hi'
  const templeName =
    (hi && image.templeHi) || image.temple || t('puja.mandirOf', { name: hi ? deity.nameHi : deity.name })
  const place = (hi && image.locationHi) || image.location

  return (
    /* relative, because the murti sheet is absolute against this screen
       rather than against the phone frame, so it covers the shrine and not
       the whole app — and does not cover the tab bar, which is under the
       shrine again since 5 Oct 2026 (owner's request; it was off the tab bar
       from 9 Sep). `h-full` is the scroller's content box, which already
       stops 56px short of the bottom for the nav. */
    <div className="darshan relative flex h-full flex-col">
      {/* ── Deity pills, with back and sangeet at the ends ───────────── */}
      {/* Gold behind, white pills (7 Oct 2026, Rahul: the white strip did not
          sit with the gold band under it). */}
      <div
        className="flex flex-none items-center gap-2 px-3 py-2"
        style={{
          background: 'linear-gradient(180deg, #f8df92 0%, #e3b44e 50%, #b98329 100%)',
          boxShadow: 'inset 0 -1px 0 rgba(110,64,8,.55)',
        }}
      >
        <ul ref={pills} className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto py-0.5">
          {deities.map((d) => {
            const on = d.id === deity.id
            return (
              <li key={d.id} className="flex-none">
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    moved.current = true
                    setDeityName(d.name)
                    setPic(0)
                  }}
                  // The type is every other chip's — Consult's, Bhakti's
                  // (8 Oct 2026, Rahul); the white-on-gold face stays.
                  className={`caps-sm block rounded-full bg-white px-4 py-2.5 transition duration-150 active:scale-95 ${
                    on
                      ? 'text-[#b4400a] shadow-md ring-2 ring-[#7a4a10]/55'
                      : 'text-[#4a3214] shadow-[0_1px_2px_rgba(90,50,0,.35)]'
                  }`}
                >
                  {lang === 'hi' ? d.nameHi : d.name}
                </button>
              </li>
            )
          })}
        </ul>
        {/* A cross, not an arrow (10 Oct 2026, Rahul): an arrow at the start
            of the chip row read as a button that scrolls the chips. At the
            right end since 17 Oct 2026 (Rahul). */}
        <BackButton onClick={goBack} icon="close" label="Close" />
      </div>

      {/* ── The shrine ────────────────────────────────────────────────── */}
      {/* Image scaling: `object-contain` keeps the whole murti, over a
          blurred, darkened copy of itself so the page is filled edge to
          edge. The cropped option went on 11 Oct 2026 (Rahul). */}
      <section
        className="relative min-h-0 flex-1 touch-none overflow-hidden bg-[#2a1a0e] [container-type:inline-size]"
        onPointerDown={startSwipe}
        onPointerUp={endSwipe}
        onPointerCancel={() => (swipe.current = null)}
      >
        {image.src && (
          <Pic
            key={`wash-${image.id}`}
            src={image.src}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full scale-110 object-cover"
            style={{ filter: 'blur(18px) brightness(.72) saturate(1.15)' }}
          />
        )}
        <span
          className="absolute inset-x-0 block"
          style={{ top: bandCqw(BAND.body - 30), bottom: slabCqw(0.62) }}
        >
          {/* A photo, a video or a temple's YouTube video (20 Oct 2026). */}
          <DarshanFrame image={image} alt={`${deity.name} — ${templeName}`} onAir={setAir} watch={watch} />
        </span>

        {/* Lamp light over the murti, always breathing. */}
        <span
          aria-hidden="true"
          className="animate-halo absolute left-1/2 top-[40%] block h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full mix-blend-screen"
          style={{ background: 'radial-gradient(circle, rgba(255,214,140,.45) 0%, rgba(255,214,140,0) 70%)' }}
        />

        {/* One ring per offering, from the centre. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          {ripples.map((r) => (
            <span
              key={r}
              className="animate-ripple absolute block h-28 w-28 rounded-full border border-gold-fill"
            />
          ))}
        </span>

        {/* The gold band across the top, its pendants carrying the bells. */}
        <img
          src={`${import.meta.env.BASE_URL}puja/gold-band.webp`}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 block w-full"
          style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.45))' }}
        />

        {/* Sangeet, low on the right, just above the pushpanjali bowl (8 Oct
            2026, owner; it was on the band's right corner). White, like the
            pills; gold while something plays. */}
        {!onYoutube && (
        <button
          type="button"
          onClick={openMusic}
          aria-haspopup="dialog"
          aria-label={track ? `${t('puja.nowPlaying')}: ${track.title}` : t('puja.sangeet')}
          aria-pressed={Boolean(track)}
          style={{ bottom: `calc(${onCounter()} + 70px)` }}
          className={`absolute right-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full shadow-md transition active:scale-90 ${
            track ? 'bg-gold-fill text-white' : 'bg-white text-[#b4400a]'
          }`}
        >
          {track ? <PlayingBars /> : <SangeetGlyph />}
        </button>
        )}

        {/* The mandir's plaque, on the band (8 Oct 2026, owner: up from where
            it hung under it). Tap: choose the murti. */}
        <span
          className="pointer-events-none absolute inset-x-0 flex -translate-y-1/2 justify-center px-3"
          style={{ top: bandCqw(BAND.body / 2) }}
        >
          <button
            type="button"
            onClick={() => setSheet(true)}
            aria-haspopup="dialog"
            aria-label={`${templeName}${place ? `, ${place}` : ''} · ${t('puja.chooseMurti')}`}
            className="pointer-events-auto max-w-full rounded-md px-4 py-1.5 text-center shadow-lg transition active:scale-95"
            style={{
              background: 'linear-gradient(180deg, rgba(40,26,14,.94) 0%, rgba(22,14,8,.94) 100%)',
              border: '1px solid rgba(214,172,74,.85)',
              boxShadow: 'inset 0 0 0 2px rgba(22,14,8,.94), inset 0 0 0 3px rgba(214,172,74,.45), 0 4px 10px rgba(0,0,0,.45)',
            }}
          >
            <span className="block truncate font-serif text-[17px] font-semibold leading-tight text-[#fff6e3]">
              {templeName}
            </span>
            {/* The temple's place when the console has one (with a pin, as
                on the owner's reference); otherwise what the photo shows. */}
            <span className="mt-0.5 flex items-center justify-center gap-1 text-[11px] leading-tight text-[#e9d6a8]">
              {place && <PinGlyph />}
              <span className="truncate">{place || image.title}</span>
              {deity.images.length > 1 && (
                <span className="flex-none opacity-80">· {at + 1}/{deity.images.length}</span>
              )}
              <Icon name="back" size={10} weight={2.4} className="flex-none -rotate-90 opacity-80" />
            </span>
            {/* Third line, the schedule (24 Oct 2026, Rahul: "Expected Live
                Schedule ... jisme roj live aate hai. Jinme roj live nahi aate
                unka Dont Know"); it was empty from 22 Oct. */}
            <span className="mt-0.5 block truncate text-[10.5px] leading-tight text-[#d9c08a]">
              {t('puja.schedule', { when: dailySchedule(image, lang) || t('puja.scheduleUnknown') })}
            </span>
          </button>
        </span>

        {/* Live darshan, under the plaque (21 Oct 2026, Rahul): only while
            the temple is live; tap to watch, tap again for the photo. */}
        {air?.choice && air.live && (
          <span
            className="pointer-events-none absolute inset-x-0 z-10 flex justify-center"
            style={{ top: `calc(${bandCqw(BAND.body)} + 14px)` }}
          >
            <button
              type="button"
              onClick={() => setWatch((w) => !w)}
              aria-pressed={watch}
              className={`pointer-events-auto inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold shadow-lg transition active:scale-95 ${
                watch ? 'bg-white text-[#b4400a]' : 'bg-[#d93025] text-white'
              }`}
            >
              {watch ? (
                <Icon name="back" size={12} weight={2.6} />
              ) : (
                <span aria-hidden="true" className="inline-block h-2 w-2 animate-pulse rounded-full bg-white" />
              )}
              {watch ? t('puja.backToPhoto') : t('puja.watchLive')}
              {!watch && <Icon name="back" size={12} weight={2.6} className="rotate-180" />}
            </button>
          </span>
        )}

        <HangingBell side="left" ringing={ringing} hint={hint} onRing={() => offer('bell')} label={t(offeringLabel('bell'))} />
        <HangingBell side="right" ringing={ringing} hint={hint} onRing={() => offer('bell')} label={t(offeringLabel('bell'))} />

        {/* Pushpanjali falls the whole height of the page — photographed
            marigolds and loose genda and rose petals (5 Oct 2026). A
            full-height lane falls; the flower at its top turns, and a loose
            petal also flutters over and back. Behind the green altar since
            12 Oct 2026 (Rahul): drawn before the slab, so the slab and the
            samagri on it cover the shower as it reaches them. Each one's
            speed and size differ, so a shower never falls in step. */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          {petals.map((p) => (
            <span
              key={p.id}
              className="animate-petal absolute top-0 block h-full"
              style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.fall}s` }}
            >
              <span
                className="animate-petal-spin block [perspective:200px]"
                style={{ animationDelay: `${p.delay}s`, animationDuration: `${p.fall}s` }}
              >
                <img
                  src={`${import.meta.env.BASE_URL}puja/${p.kind.f}.webp`}
                  alt=""
                  width={p.size}
                  className={`block h-auto max-w-none ${p.kind.petal ? 'motion-safe:animate-petal-flutter' : ''}`}
                  style={{
                    width: p.size,
                    animationDuration: `${p.flutter}s`,
                    filter: 'drop-shadow(0 2px 2px rgba(0,0,0,.35))',
                  }}
                />
              </span>
            </span>
          ))}
        </span>

        {/* The altar: a green marble slab across the whole width — the white
            slab's photo multiplied by green, so its veining stays (8 Oct 2026,
            owner). Top surface and front face are the photo's two parts,
            each stretched to its own height (see SLAB). */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 block"
          style={{ height: slabCqw(1), filter: 'drop-shadow(0 -6px 10px rgba(0,0,0,.35))' }}
        >
          {[
            { h: SLAB_TOP, at: 'top', from: '#4fa57c', to: '#41946c', part: SLAB.edge },
            { h: SLAB_FRONT, at: 'bottom', from: '#41946c', to: '#2f7d58', part: 1 - SLAB.edge },
          ].map((p) => (
            <span
              key={p.at}
              className="block"
              style={{
                height: cqw(p.h),
                backgroundImage: `linear-gradient(180deg, ${p.from} 0%, ${p.to} 100%), url(${import.meta.env.BASE_URL}puja/marble-slab.webp)`,
                backgroundSize: `100% 100%, 100% ${cqw(p.h / p.part)}`,
                backgroundPosition: `0 0, 0 ${p.at}`,
                backgroundRepeat: 'no-repeat',
                backgroundBlendMode: 'multiply',
              }}
            />
          ))}
        </span>

        {/* Like, comment, reshare and share for this temple's murti, down
            the right-hand side, a little above Sangeet ("Thoda upar kar do"),
            the reels' way (24 Oct 2026,
            Rahul; first on the altar's front, then "Right hand side
            vertically laga do. Jaise reels me lagate hai"). Keyed by the
            row, so the counts start again on each murti. */}
        {murtiAsset && (
          <div
            className="absolute right-3 z-20 flex w-10 flex-col items-center gap-4"
            style={{ bottom: `calc(${onCounter()} + 206px)` }}
          >
            <BhaktiActions key={murtiAsset.id} asset={murtiAsset} share rail />
          </div>
        )}

        {/* ── The altar, on the steps. Every piece of samagri is its own
            control (5 Oct 2026; there was a rail of round buttons down the
            pillar, which looked like an app laid over a mandir). They stand
            here whether or not they are lit — a diya that only exists once
            you light it makes the shrine look half-built. ──────────────── */}
        <Samagri
          label={t(offeringLabel('incense'))}
          pressed={lit.incense}
          hint={hint}
          onClick={() => offer('incense')}
          className="left-[4%]"
          style={{ bottom: onCounter(4) }}
        >
          <PujaPhoto name="dhoop" width={40} fallback={<Dhoop size={58} lit={lit.incense} />} />
          {lit.incense &&
            [0, 1.2, 2.4].map((d) => (
              <span
                key={d}
                className="animate-smoke absolute -top-2 left-1/2 block h-7 w-3.5 -translate-x-1/2 rounded-full bg-black/20 blur-[3px]"
                style={{ animationDelay: `${d}s` }}
              />
            ))}
        </Samagri>

        {['left', 'right'].map((side) => (
          <Samagri
            key={side}
            label={t(offeringLabel('diya'))}
            pressed={lit.diya}
            hint={hint}
            onClick={() => offer('diya')}
            // Further out than they stood (16% and 17%), and over the thali,
            // so a lit flame is never behind its rim on a narrow phone (12 Oct
            // 2026, Rahul: move the diyas, keep the thali's size).
            className={`z-10 ${side === 'left' ? 'left-[12.5%]' : 'right-[13%]'}`}
            style={{ bottom: onCounter(4) }}
          >
            {/* The left one mirrored, so the pair face the thali and its flame
                is not hidden behind the agarbatti stand. */}
            <span className="relative block" style={side === 'left' ? { transform: 'scaleX(-1)' } : undefined}>
              <PujaPhoto name={lit.diya ? 'diya-lit' : 'diya'} width={56} fallback={<Diya size={52} lit={lit.diya} />} />
              {/* The photo's flame is a few pixels at this size; this one
                  stands on the same wick (left spout) and flickers. */}
              {lit.diya && (
                <span className="absolute" style={{ left: '4%', top: '30%', transform: 'translate(-50%, -96%)' }}>
                  <LampFlame height={36} />
                </span>
              )}
            </span>
          </Samagri>
        ))}

        {/* Pushpanjali: a brass bowl heaped with genda and rose. */}
        <Samagri
          label={t(offeringLabel('flower'))}
          hint={hint}
          onClick={() => offer('flower')}
          className="right-[2%]"
          style={{ bottom: onCounter(4) }}
        >
          <PujaPhoto name="pushpa" width={54} fallback={<span className="block h-12 w-12" />} />
        </Samagri>

        {/* ── The thali. Tap to begin the aarti: it rises off the altar to in
            front of the murti and circles there, as a thali is moved in an
            aarti; tap again and it settles back. It never spins on the spot
            (5 Oct 2026, the owner's call) — it used to turn under a finger
            and settle to a whole turn, which read as a plate spinning. ─── */}
        <button
          type="button"
          onClick={toggleAarti}
          aria-pressed={aarti}
          aria-label={t(aarti ? 'puja.endAarti' : 'puja.aarti')}
          className="group absolute left-1/2 -translate-x-1/2"
          style={{
            bottom: aarti ? '30%' : onCounter(),
            transition: 'bottom .8s cubic-bezier(.2,.7,.3,1)',
          }}
        >
          <span className={`block ${aarti ? 'motion-safe:animate-aarti' : ''}`}>
            <span
              className="relative isolate block"
              style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,.45))' }}
            >
              {!aarti && <ContactShadow />}
              {/* One photograph for both states; lit, it glows from behind. */}
              {aarti && (
                <span
                  aria-hidden="true"
                  className="animate-halo absolute inset-[-30%] -z-10 rounded-full"
                  style={{ background: 'radial-gradient(circle, rgba(255,196,92,.65) 0%, rgba(255,196,92,0) 65%)' }}
                />
              )}
              <PujaPhoto name="thali" width={120} fallback={<Thali size={104} lit={aarti} />} />
              {/* The lamp on the thali, lit for the aarti: a flame on each of
                  its five wicks, travelling with the plate. */}
              {aarti &&
                THALI_WICKS.map(([x, y]) => (
                  <span
                    key={`${x}-${y}`}
                    className="absolute"
                    style={{ left: `${x * 100}%`, top: `${y * 100}%`, transform: 'translate(-50%, -92%)' }}
                  >
                    <LampFlame height={17} />
                  </span>
                ))}
            </span>
          </span>
        </button>
      </section>


      {/* Plays over the puja; unmounts with the screen, so the music stops. */}
      <audio ref={player} onEnded={() => setTrack(null)} className="hidden" />

      {musicOpen && (
        <SangeetSheet
          deity={deity}
          library={library}
          playing={track}
          onPlay={(asset) => {
            playTrack(asset)
            setMusicOpen(false)
          }}
          onStop={stopTrack}
          onClose={() => setMusicOpen(false)}
        />
      )}

      {sheet && (
        <MurtiSheet
          deity={deity}
          pic={at}
          onPick={(i) => {
            setPic(i)
            setSheet(false)
          }}
          onClose={() => setSheet(false)}
        />
      )}
    </div>
  )
}

/**
 * The murti picker, opened from the mandir's plaque (6 Oct 2026; for a day it
 * also chose the deity and the mandir — the deity is the pills now, and the
 * mandir frames went with the owner's reference).
 *
 * Also the only place the attribution lives, and that is not a detail to tidy
 * away: four of the Hanuman murtis are CC BY and three more across Durga and
 * Shani are share-alike. The licence needs a credit somewhere a person can
 * reach, and the shrine itself is not allowed to carry text. If this sheet
 * goes, the images have to go with it.
 */
function MurtiSheet({ deity, pic, onPick, onClose }) {
  const { lang, t } = useStore()
  return (
    <div role="dialog" aria-modal="true" aria-label={t('puja.chooseMurti')} className="absolute inset-0 z-30 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="animate-fade absolute inset-0 bg-black/45"
      />
      <div className="animate-fade-rise relative rounded-t-3xl bg-surface p-4 pb-6 shadow-xl">
        <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-10 rounded-full bg-black/15" />
        <p className="caps-sm t-faint">
          {lang === 'hi' ? deity.nameHi : deity.name} · {t('puja.murti')}
        </p>
        <ul className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
          {deity.images.map((im, i) => (
            <li key={im.id}>
              <button
                type="button"
                aria-pressed={pic === i}
                aria-label={im.temple || im.title}
                onClick={() => onPick(i)}
                className={`block h-24 w-[68px] overflow-hidden rounded-lg border transition ${
                  pic === i ? 'border-ink shadow-md' : 'border-stroke opacity-60'
                }`}
              >
                {im.src ? (
                  <Pic src={im.src} alt="" loading="lazy" className="h-full w-full object-contain" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-ink text-white">▶</span>
                )}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-snug t-faint">
          {[deity.images[pic].temple, deity.images[pic].location, deity.images[pic].title, deity.images[pic].credit]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
    </div>
  )
}

/* Whether a bhajan or mantra belongs to a deity. Bhakti's `deity` field is
   typed by hand when a file is loaded, so it is matched loosely, with the
   names people actually use, and the title is read too. */
const DEITY_WORDS = {
  Ganesh: ['ganesh', 'ganpati', 'ganapati', 'vinayak'],
  Shiva: ['shiv', 'mahadev', 'shankar', 'bholenath', 'rudra'],
  Lakshmi: ['lakshmi', 'laxmi'],
  Hanuman: ['hanuman', 'bajrang', 'maruti'],
  Durga: ['durga', 'devi', 'ambe', 'mata'],
  Mahavir: ['mahavir', 'navkar', 'jain'],
  Aadinath: ['aadinath', 'adinath', 'rishabh', 'navkar', 'jain'],
  Shani: ['shani'],
  // The temple-channel deities (20 Oct 2026).
  Krishna: ['krishna', 'krishn', 'kanha', 'govind', 'gopal', 'radhe', 'hare krishna'],
  Ram: ['ram ', 'raam', 'shri ram', 'siya', 'ramayan'],
  Balaji: ['balaji', 'venkatesh', 'govinda', 'vishnu', 'narayan'],
  Jagannath: ['jagannath'],
  'Sai Baba': ['sai'],
  'Khatu Shyam': ['khatu', 'shyam baba', 'shyam'],
  Saraswati: ['saraswati', 'sharada'],
}
function forDeity(asset, deity) {
  const hay = `${asset.deity ?? ''} ${asset.title ?? ''}`.toLowerCase()
  return (DEITY_WORDS[deity.name] ?? [deity.name.toLowerCase()]).some((w) => hay.includes(w))
}

/**
 * Sangeet — choose a bhajan or a mantra to play during the puja. The list is
 * Bhakti's own library (`bhakti_assets`, kinds bhajan and mantra), so a new
 * file loaded there appears here with no change to this screen.
 */
function SangeetSheet({ deity, library, playing, onPlay, onStop, onClose }) {
  const { t, lang } = useStore()
  const [tab, setTab] = useState(playing?.kind === 'mantra' ? 'mantra' : 'bhajan')
  const rows = (library ?? []).filter((a) => a.kind === tab)
  // The deity in the doorway's own bhajans and mantras, first (5 Oct 2026).
  const mine = (library ?? []).filter((a) => forDeity(a, deity)).slice(0, 4)
  const row = (a) => (
    <TrackRow key={a.id} asset={a} on={playing?.id === a.id} onPlay={onPlay} onStop={onStop} />
  )

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="animate-fade absolute inset-0 bg-black/45"
      />
      <div className="animate-fade-rise relative flex max-h-[80%] flex-col rounded-t-3xl bg-surface p-4 shadow-xl">
        <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-10 flex-none rounded-full bg-black/15" />
        <p className="caps-sm t-faint">{t('puja.sangeet')}</p>

        {playing && (
          <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white p-3">
            <span className="min-w-0 flex-1">
              <span className="block caps-sm gold">{t('puja.nowPlaying')}</span>
              <span className="mt-0.5 block truncate text-meta t-heading">{playing.title}</span>
            </span>
            <button type="button" onClick={onStop} className="pill caps-sm flex-none">
              {t('puja.stopMusic')}
            </button>
          </div>
        )}

        <div className="no-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto">
          {mine.length > 0 && (
            <section className="mb-4">
              <p className="caps-sm gold">{t('puja.forDeity', { name: lang === 'hi' ? deity.nameHi : deity.name })}</p>
              <ul className="mt-2 space-y-2">{mine.map(row)}</ul>
            </section>
          )}

          <div className="sticky top-0 z-10 flex gap-2 bg-surface pb-3">
            {[['bhajan', 'puja.bhajans'], ['mantra', 'puja.mantras']].map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
                className="pill caps-sm"
              >
                {t(label)}
              </button>
            ))}
          </div>

          {library === null && <p className="py-6 text-center text-meta t-faint">{t('puja.loadingMusic')}</p>}
          {library !== null && rows.length === 0 && (
            <p className="py-6 text-center text-meta t-faint">{t('puja.noMusic')}</p>
          )}
          <ul className="space-y-2">{rows.map(row)}</ul>
        </div>
      </div>
    </div>
  )
}

function TrackRow({ asset: a, on, onPlay, onStop }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => (on ? onStop() : onPlay(a))}
        aria-pressed={on}
        className={`flex w-full items-center gap-3 rounded-2xl border p-2 text-left transition ${
          on ? 'border-gold-fill bg-white' : 'border-stroke bg-white/60'
        }`}
      >
        {a.previewUrl ? (
          <img src={a.previewUrl} alt="" loading="lazy" className="h-10 w-16 flex-none rounded-lg object-cover" />
        ) : (
          <span className="h-10 w-16 flex-none rounded-lg bg-surface2" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-meta t-heading">{a.title}</span>
          {a.deity && <span className="block truncate text-[12px] t-faint">{a.deity}</span>}
        </span>
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gold-fill text-white">
          <Icon name={on ? 'pause' : 'play'} size={16} filled={!on} />
        </span>
      </button>
    </li>
  )
}

/** Three bars that move while sangeet plays — the button says it is on. */
function PlayingBars() {
  return (
    <span aria-hidden="true" className="flex h-[18px] items-end gap-[3px]">
      {[0, 0.25, 0.5].map((d) => (
        <span
          key={d}
          className="block w-[3px] rounded-full bg-current motion-safe:animate-pulse"
          style={{ height: d === 0.25 ? '100%' : '60%', animationDelay: `${d}s` }}
        />
      ))}
    </span>
  )
}

/** A ghanti on its chain, hung from a pendant of the gold band.
    Touching it rings it — both swing, as a struck bell shakes its pair. */
function HangingBell({ side, ringing, hint, onRing, label }) {
  return (
    <button
      type="button"
      onClick={onRing}
      aria-label={label}
      className={`absolute isolate origin-top rounded-full p-1 ${ringing ? 'animate-swing' : ''}`}
      style={{
        // From the pendant's tip; the button is the bell's 40px plus 4px
        // padding a side, so 24px puts its middle under the pendant. 40, not
        // 52: smaller on 8 Oct 2026 (Rahul).
        top: `calc(${bandCqw(BAND.tip)} - 6px)`,
        [side]: `calc(${((side === 'left' ? BAND.hooks[0] : 1 - BAND.hooks[1]) * 100).toFixed(1)}% - 24px)`,
        filter: 'drop-shadow(0 3px 5px rgba(0,0,0,.45))',
      }}
    >
      {/* On the bell's mouth, not its chain. */}
      {hint && <Glow top="78%" />}
      <PujaPhoto name="ghanti" width={40} fallback={<Ghanti size={78} hanging />} />
    </button>
  )
}

/** One piece of samagri on the altar, and the control for its offering. */
function Samagri({ label, pressed, hint, onClick, className, style, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className={`absolute isolate rounded-full p-1 transition-transform duration-150 active:scale-95 ${className}`}
      style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.4))', ...style }}
    >
      {hint && <Glow />}
      {/* At the photo's base, inside the button's 4px padding. */}
      <ContactShadow bottom="4px" />
      {children}
    </button>
  )
}

/** The soft dark where a thing meets the marble — without it, it floats. */
function ContactShadow({ bottom = '0px' }) {
  return (
    <span
      aria-hidden="true"
      style={{ bottom }}
      className="pointer-events-none absolute left-1/2 -z-10 block h-2.5 w-[80%] -translate-x-1/2 translate-y-1/2 rounded-[50%] bg-black/40 blur-[3px]"
    />
  )
}

/** The breathing gold light behind samagri that has not been touched yet. */
function Glow({ top = '50%' }) {
  // Placed by the outer span, breathed by the inner one: this app's `pulse`
  // animates transform, and would throw away a centring translate.
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 -z-10 block h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2"
      style={{ top }}
    >
      <span
        className="block h-full w-full rounded-full motion-safe:animate-pulse"
        style={{ background: 'radial-gradient(circle, rgba(255,150,30,.75) 0%, rgba(255,180,60,.35) 40%, rgba(255,180,60,0) 70%)' }}
      />
    </span>
  )
}

function PinGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="11" height="11" className="flex-none" fill="currentColor">
      <path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
    </svg>
  )
}

function SangeetGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </svg>
  )
}
