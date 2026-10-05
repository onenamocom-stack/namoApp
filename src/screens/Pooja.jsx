import { useEffect, useRef, useState } from 'react'
import { creditLine, deities, offerings } from '../data/mock.js'
import { BackButton, useGoBack } from '../components/Chrome.jsx'
import Icon from '../components/Icon.jsx'
import {
  Dhoop,
  Diya,
  Ghanti,
  LampFlame,
  MANDIRS,
  PujaPhoto,
  TempleFrame,
  Thali,
  mandirCqw,
  mandirOpening,
} from '../components/PujaProps.jsx'
import { useStore } from '../store.jsx'
import { fetchAssets } from '../lib/bhakti.js'

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
const SHOWER = 36 // per tap — three times the 12 it was
const HINT_KEY = 'namo.puja.touched'
const MANDIR_KEY = 'namo.puja.mandir'
const offeringLabel = (key) => offerings.find((o) => o.key === key).label

export default function Pooja() {
  const { showToast, lang, t, hasFlag } = useStore()
  const fullImage = !hasFlag('setting:croppedDeityImage')
  const [deity, setDeity] = useState(deities[0])
  // Which mandir the page stands in, remembered per device.
  const [mandir, setMandirState] = useState(() => {
    try {
      return MANDIRS.find((m) => m.id === localStorage.getItem(MANDIR_KEY)) ?? MANDIRS[0]
    } catch {
      return MANDIRS[0]
    }
  })
  const setMandir = (m) => {
    setMandirState(m)
    try {
      localStorage.setItem(MANDIR_KEY, m.id)
    } catch {
      /* private mode: it resets next time */
    }
  }
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

  // Said once, the first time: nothing on the altar looks like a button.
  useEffect(() => {
    if (hint) showToast(t('puja.touchHint'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Swiping the shrine. Right for the next deity, down for the next murti of
   * the one you are on; left and up go back. The nameplate on the arch follows
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
      const next = deities[wrap(i + (dx > 0 ? 1 : -1), deities.length)]
      setDeity(next)
      setPic(0)
    } else if (ay > ax * DOMINANCE) {
      setPic((p) => wrap(p + (dy > 0 ? 1 : -1), deity.images.length))
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
    const { says } = offerings.find((o) => o.key === key)
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
    showToast(t(says))
  }

  /* Started INSIDE the tap, not from an effect after a re-render: phones
     only let a page make sound from the gesture itself, and an autoplay one
     render later is refused without a word. Mantras repeat until stopped. */
  const playTrack = (asset) => {
    const el = player.current
    if (!el) return
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
    setAarti((a) => !a)
    ripple()
    showToast(t(aarti ? 'puja.aartiEnded' : 'puja.aartiBegun'))
  }

  const image = deity.images[pic]

  return (
    /* relative, because the murti sheet is absolute against this screen
       rather than against the phone frame, so it covers the shrine and not
       the whole app — and does not cover the tab bar, which is under the
       shrine again since 5 Oct 2026 (owner's request; it was off the tab bar
       from 9 Sep). `h-full` is the scroller's content box, which already
       stops 56px short of the bottom for the nav. */
    <div className="darshan relative flex h-full flex-col">
      {/* ── The shrine is the whole page ─────────────────────────────── */}
      {/* Image scaling: `object-contain` by default keeps the whole murti and
          lets it grow to fill the doorway (6 Oct 2026; `object-scale-down`
          never drew a picture larger than its file, so small murtis sat
          small in a big doorway).
          `setting:croppedDeityImage` (Profile → Settings) opts into `cover`,
          which fills the doorway and crops the painting's edges. */}
      <section
        className="relative min-h-0 flex-1 touch-none overflow-hidden [container-type:inline-size]"
        style={{ background: 'radial-gradient(ellipse 75% 45% at 50% 58%, #7a4416 0%, #3a1f0b 55%, #1c0f06 100%)' }}
        onPointerDown={startSwipe}
        onPointerUp={endSwipe}
        onPointerCancel={() => (swipe.current = null)}
      >
        {/* The garbhagriha: the murti stands in the doorway, not behind the
            pillars. */}
        <span className="absolute block" style={mandirOpening(mandir)}>
          <img
            key={image.f}
            src={`${import.meta.env.BASE_URL}deities/${image.f}`}
            alt={`${deity.name} — ${image.label}`}
            className={`animate-fade absolute inset-0 h-full w-full ${fullImage ? 'object-contain' : 'object-cover'}`}
            style={{ objectPosition: fullImage ? '50% 70%' : '50% 32%' }}
          />
        </span>

        {/* Lamp light over the murti, always breathing. */}
        <span
          aria-hidden="true"
          className="animate-halo absolute left-1/2 top-[52%] block h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full mix-blend-screen"
          style={{ background: 'radial-gradient(circle, rgba(227,166,60,.5) 0%, rgba(227,166,60,0) 70%)' }}
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

        {/* The marble entrance (5 Oct 2026). Under the controls and the
            falling flowers, over the murti. */}
        <TempleFrame mandir={mandir} />

        {/* Pushpanjali falls the whole height of the page — photographed
            marigolds and loose genda and rose petals (5 Oct 2026). A
            full-height lane falls, in front of the marble, not behind it; the flower at its top turns, and a loose
            petal also flutters over and back. Each one's speed and size
            differ, so a shower never falls in step. */}
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


        {/* ── Back and sangeet in the top corners; the deity's nameplate
            centred on the band under the frieze (5 Oct 2026, both placed by
            the owner). Each mandir says where that band is. ─────────────── */}
        <BackButton dark onClick={goBack} className="absolute left-3 top-3 !h-11 !w-11" />
        {/* Centred by a wrapper, not a translate: `.plinth:active` sets
            transform, and would knock a translated nameplate sideways. */}
        <span
          className="pointer-events-none absolute inset-x-0 flex -translate-y-1/2 justify-center px-3"
          style={{ top: mandirCqw(mandir, mandir.plate) }}
        >
          <button
            type="button"
            onClick={() => setSheet(true)}
            aria-haspopup="dialog"
            aria-label={`${lang === 'hi' ? deity.nameHi : deity.name} · ${t('puja.chooseDarshan')}`}
            className="plinth pointer-events-auto min-w-0 !h-auto !w-auto gap-2 py-1 pl-1 pr-3"
          >
            <span className="block h-9 w-9 flex-none overflow-hidden rounded-full bg-black/30 ring-1 ring-white/40">
              <img
                src={`${import.meta.env.BASE_URL}deities/${deity.images[0].f}`}
                alt=""
                className="h-full w-full object-cover"
              />
            </span>
            <span className="min-w-0 text-left leading-tight">
              <span className="block truncate text-[15px] font-semibold">
                {lang === 'hi' ? deity.nameHi : deity.name}
              </span>
              {/* One dot per murti — the stack a vertical swipe moves through. */}
              {deity.images.length > 1 && (
                <span aria-hidden="true" className="mt-1 flex gap-1">
                  {deity.images.map((im, i) => (
                    <span
                      key={im.f}
                      className={`block h-1 rounded-full transition-all duration-200 ${i === pic ? 'w-3 bg-[#f4dc93]' : 'w-1 bg-white/40'}`}
                    />
                  ))}
                </span>
              )}
            </span>
            <Icon name="back" size={14} weight={2.2} className="flex-none -rotate-90 opacity-80" />
          </button>
        </span>
        <button
          type="button"
          onClick={openMusic}
          aria-haspopup="dialog"
          aria-label={track ? `${t('puja.nowPlaying')}: ${track.title}` : t('puja.sangeet')}
          aria-pressed={Boolean(track)}
          className={`plinth absolute right-3 top-3 ${track ? 'plinth-on' : ''}`}
        >
          {track ? <PlayingBars /> : <SangeetGlyph />}
        </button>

        <HangingBell mandir={mandir} side="left" ringing={ringing} hint={hint} onRing={() => offer('bell')} label={t(offeringLabel('bell'))} />
        <HangingBell mandir={mandir} side="right" ringing={ringing} hint={hint} onRing={() => offer('bell')} label={t(offeringLabel('bell'))} />

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
          className="bottom-5 left-[4%]"
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
            className={`bottom-3 ${side === 'left' ? 'left-[16%]' : 'right-[17%]'}`}
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
          className="bottom-4 right-[2%]"
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
          style={{ bottom: aarti ? '30%' : '12px', transition: 'bottom .8s cubic-bezier(.2,.7,.3,1)' }}
        >
          <span className={`block ${aarti ? 'motion-safe:animate-aarti' : ''}`}>
            <span
              className="relative isolate block"
              style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,.45))' }}
            >
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
          {/* The colours here are inline because every one of this app's
              palette entries is a CSS variable, and Tailwind silently drops an
              opacity modifier it cannot resolve — `bg-ink/70` painted nothing
              at all and left white caps on a cream wall. */}
          <span
            className="mx-auto mt-1 block w-fit rounded-full px-2.5 py-0.5 caps-sm text-white backdrop-blur-[2px]"
            style={{ background: 'rgba(14, 14, 16, 0.72)' }}
          >
            {t(aarti ? 'puja.endAarti' : 'puja.aarti')}
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
        <DarshanSheet
          deity={deity}
          pic={pic}
          mandir={mandir}
          onMandir={setMandir}
          // A deity tapped in the sheet shows in the doorway behind it at
          // once; the sheet stays open on its murtis.
          onDeity={(d) => {
            setDeity(d)
            setPic(0)
          }}
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
 * Darshan — which deity, then which murti, in one sheet (5 Oct 2026; it was a
 * row of deity chips above the shrine and an eye button for the murti).
 * Tapping a deity changes the doorway behind the sheet straight away and
 * leaves the sheet open on that deity's murtis; tapping a murti closes it.
 *
 * Also the only place the attribution lives, and that is not a detail to tidy
 * away: four of the Hanuman murtis are CC BY and three more across Durga and
 * Shani are share-alike. The licence needs a credit somewhere a person can
 * reach, and the shrine itself is not allowed to carry text. If this sheet
 * goes, the images have to go with it.
 */
function DarshanSheet({ deity, pic, mandir, onMandir, onDeity, onPick, onClose }) {
  const { lang, t, hasFlag } = useStore()
  const fullImage = !hasFlag('setting:croppedDeityImage')
  const name = (d) => (lang === 'hi' ? d.nameHi : d.name)
  return (
    <div role="dialog" aria-modal="true" aria-label={t('puja.chooseDarshan')} className="absolute inset-0 z-30 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="animate-fade absolute inset-0 bg-black/45"
      />
      <div className="animate-fade-rise no-scrollbar relative max-h-[85%] overflow-y-auto rounded-t-3xl bg-surface p-4 pb-6 shadow-xl">
        <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-10 rounded-full bg-black/15" />
        <p className="caps-sm t-faint">{t('puja.deity')}</p>
        <ul className="mt-3 grid grid-cols-4 gap-x-2 gap-y-3">
          {deities.map((d) => {
            const on = d.id === deity.id
            return (
              <li key={d.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onDeity(d)}
                  className="flex w-full flex-col items-center gap-1.5"
                >
                  <span
                    className={`block h-14 w-14 overflow-hidden rounded-full ring-2 ring-offset-2 transition duration-200 ${
                      on ? 'ring-gold-fill' : 'ring-transparent opacity-70'
                    }`}
                  >
                    <img
                      src={`${import.meta.env.BASE_URL}deities/${d.images[0].f}`}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </span>
                  <span className={`text-center text-[12px] font-semibold leading-tight ${on ? 't-heading' : 't-body'}`}>
                    {name(d)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <p className="mt-5 caps-sm t-faint">
          {name(deity)} · {t('puja.murti')}
        </p>
        <ul className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
          {deity.images.map((im, i) => (
            <li key={im.f}>
              <button
                type="button"
                aria-pressed={pic === i}
                aria-label={im.label}
                onClick={() => onPick(i)}
                className={`block h-24 w-[68px] overflow-hidden rounded-lg border transition ${
                  pic === i ? 'border-ink shadow-md' : 'border-stroke opacity-60'
                }`}
              >
                <img
                  src={`${import.meta.env.BASE_URL}deities/${im.f}`}
                  alt=""
                  loading="lazy"
                  className={`h-full w-full ${fullImage ? 'object-contain' : 'object-cover'}`}
                />
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-snug t-faint">
          {deity.images[pic].label} · {creditLine(deity.images[pic])}
        </p>

        {/* The mandir around the doorway (5 Oct 2026). Like a deity, it
            changes behind the sheet at once and the sheet stays open. */}
        <p className="mt-5 caps-sm t-faint">{t('puja.mandir')}</p>
        <ul className="mt-3 grid grid-cols-4 gap-x-2">
          {MANDIRS.map((m) => {
            const on = m.id === mandir.id
            return (
              <li key={m.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onMandir(m)}
                  className="flex w-full flex-col items-center gap-1.5"
                >
                  <span
                    className={`block h-[84px] w-14 overflow-hidden rounded-t-full rounded-b-md ring-2 ring-offset-2 transition duration-200 ${
                      on ? 'ring-gold-fill' : 'ring-transparent opacity-70'
                    }`}
                  >
                    <img
                      src={`${import.meta.env.BASE_URL}puja/mandir-${m.id}-thumb.webp`}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover object-top"
                    />
                  </span>
                  <span className={`text-center text-[12px] font-semibold leading-tight ${on ? 't-heading' : 't-body'}`}>
                    {t(m.label)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
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

/** A ghanti on its chain, hung from the arch at an edge of the doorway.
    Touching it rings it — both swing, as a struck bell shakes its pair. */
function HangingBell({ mandir, side, ringing, hint, onRing, label }) {
  return (
    <button
      type="button"
      onClick={onRing}
      aria-label={label}
      className={`absolute isolate origin-top rounded-full p-1 ${ringing ? 'animate-swing' : ''}`}
      style={{
        top: mandirCqw(mandir, mandir.apex + 73),
        [side]: `calc(${mandirCqw(mandir, mandir.side)} - 26px)`,
        filter: 'drop-shadow(0 3px 5px rgba(0,0,0,.45))',
      }}
    >
      {/* On the bell's mouth, not its chain. */}
      {hint && <Glow top="78%" />}
      <PujaPhoto name="ghanti" width={52} fallback={<Ghanti size={100} hanging />} />
    </button>
  )
}

/** One piece of samagri on the altar, and the control for its offering. */
function Samagri({ label, pressed, hint, onClick, className, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className={`absolute isolate rounded-full p-1 transition-transform duration-150 active:scale-95 ${className}`}
      style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.4))' }}
    >
      {hint && <Glow />}
      {children}
    </button>
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

function SangeetGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </svg>
  )
}
