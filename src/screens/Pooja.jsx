import { useEffect, useRef, useState } from 'react'
import { creditLine, deities, offerings } from '../data/mock.js'
import { TopBar } from '../components/Chrome.jsx'
import Icon from '../components/Icon.jsx'
import { PopTag } from '../components/Pop.jsx'
import { Dhoop, Diya, Ghanti, LampFlame, Marigold, PujaPhoto, Thali } from '../components/PujaProps.jsx'
import { useStore } from '../store.jsx'
import { fetchAssets } from '../lib/bhakti.js'

/**
 * Mandir — e-puja only, and it does not scroll.
 *
 * That is the whole layout rule. You cannot perform an aarti while hunting for
 * the thali, so the shrine takes every pixel between the deity row and the tab
 * bar, and every prop — bells, offerings, thali, sangeet — sits on the image
 * rather than under it. Nothing on this screen is below the fold because there
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
/* ── The ghanti's voice (4 Oct 2026) ─────────────────────────────────────
   Synthesised, not a recording: a cast bell is a handful of INHARMONIC sine
   partials (hum, prime, tierce, quint, nominal — the ratios below), each
   struck at once and dying away on its own time, the low ones longest. Two
   of them are doubled a hair apart so they beat, which is the shimmer a
   brass bell has and a pure tone does not. No file to download, nothing to
   license, and it plays on the first tap.

   It must be called from inside the tap: a phone only lets a page make
   sound from the gesture itself. One AudioContext for the page — browsers
   cap how many can exist. */
let bellCtx = null
const BELL = [
  // [ratio to the strike note, loudness, seconds to die away]
  [0.5, 0.5, 3.4],
  [1, 0.9, 2.8],
  [1.004, 0.4, 2.8],
  [1.19, 0.45, 2.1],
  [1.5, 0.3, 1.7],
  [2, 0.42, 1.5],
  [2.006, 0.2, 1.5],
  [2.74, 0.22, 0.9],
  [3.76, 0.14, 0.6],
]
function ringGhanti() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    bellCtx = bellCtx || new Ctx()
    if (bellCtx.state === 'suspended') bellCtx.resume()
    const now = bellCtx.currentTime
    const out = bellCtx.createGain()
    out.gain.value = 0.28
    out.connect(bellCtx.destination)
    for (const [ratio, amp, decay] of BELL) {
      const osc = bellCtx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = 560 * ratio
      const env = bellCtx.createGain()
      env.gain.setValueAtTime(0.0001, now)
      env.gain.exponentialRampToValueAtTime(amp, now + 0.004)
      env.gain.exponentialRampToValueAtTime(0.0001, now + decay)
      osc.connect(env)
      env.connect(out)
      osc.start(now)
      osc.stop(now + decay + 0.05)
    }
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

export default function Pooja() {
  const { showToast, lang, t, hasFlag } = useStore()
  const fullImage = !hasFlag('setting:croppedDeityImage')
  const [deity, setDeity] = useState(deities[0])
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
  const [turn, setTurn] = useState(0)
  const [turning, setTurning] = useState(false)
  const seq = useRef(0)
  const turned = useRef(false)
  const swipe = useRef(null)
  const chips = useRef(null)

  /**
   * Swiping the shrine. Right for the next deity, down for the next murti of
   * the one you are on; left and up go back.
   *
   * The axes match the rows they mirror: the deity strip above the shrine runs
   * horizontally, so deities change horizontally. Murtis of one deity are a
   * stack behind the frame, so they change vertically.
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

  // Swiping past a deity whose chip is off the end of the row leaves you with
  // no way to tell which one you landed on, so the row follows the selection.
  // No `behavior: 'smooth'` — it is declined inside scroll containers in this
  // app and silently does nothing. `block: 'nearest'` keeps it horizontal.
  useEffect(() => {
    chips.current
      ?.querySelector('[aria-pressed="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [deity])

  /**
   * Circling the thali.
   *
   * An aarti is a plate moved in circles, so the plate follows the finger:
   * angle from the thali's centre to the pointer, accumulated across the
   * ±180° wrap so a full turn keeps counting instead of snapping backwards.
   *
   * Pointer events rather than touch — one code path covers finger, pen and a
   * mouse dragging on the desktop build. Capture is essential: without it the
   * gesture dies the moment the finger leaves the plate, which is immediately,
   * because the plate is 104px and a circle is bigger than that.
   */
  const startTurn = (e) => {
    const box = e.currentTarget.getBoundingClientRect()
    const cx = box.left + box.width / 2
    const cy = box.top + box.height / 2
    const angle = (ev) => (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI
    let last = angle(e)
    let moved = 0

    // Cleared here, not in the click handler. A drag that ends without
    // producing a click would otherwise leave the flag set and swallow the
    // next real tap — measured: after one circle, the following tap on the
    // thali did nothing. Every gesture now starts clean.
    turned.current = false
    setTurning(true)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* same as the swipe — a failed capture must not stop the listeners
         below from being attached, or the plate simply never turns */
    }

    const move = (ev) => {
      let d = angle(ev) - last
      if (d > 180) d -= 360
      if (d < -180) d += 360
      last += d
      moved += Math.abs(d)
      if (moved > 12) turned.current = true // past this it is a turn, not a tap
      setTurn((prev) => prev + d)
    }
    const end = (ev) => {
      ev.currentTarget?.releasePointerCapture?.(e.pointerId)
      ev.currentTarget?.removeEventListener('pointermove', move)
      ev.currentTarget?.removeEventListener('pointerup', end)
      ev.currentTarget?.removeEventListener('pointercancel', end)
      setTurning(false)
      // Settle to the nearest whole turn so it never rests crooked.
      setTurn((prev) => Math.round(prev / 360) * 360)
    }

    e.currentTarget.addEventListener('pointermove', move)
    e.currentTarget.addEventListener('pointerup', end)
    e.currentTarget.addEventListener('pointercancel', end)
  }

  // Petals and ripples are one-shot animations; drop them once they finish so
  // the DOM does not fill up over a long session.
  useEffect(() => {
    if (!petals.length) return
    const timer = setTimeout(() => setPetals((p) => p.slice(12)), 5200)
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

  const offer = (key, says) => {
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
        ...Array.from({ length: 12 }, (_, i) => ({
          id: `${base}-${i}`,
          left: 8 + Math.random() * 84,
          delay: Math.random() * 0.7,
          scale: 0.7 + Math.random() * 0.6,
        })),
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
       the whole app. It used to be phrased as "should not cover the tab
       bar"; there is no tab bar here since the shrine moved to `/darshan`
       on 9 Sep 2026, but the containment is still what we want.

       `h-full` needs `.darshan` on the scroller — see index.css. Every other
       screen reserves 56px at the bottom for the nav, and this route has no
       nav to reserve for. */
    <div className="darshan relative flex h-full flex-col">
      <TopBar
        title={t('nav.pooja')}
        back
        backTo="/home"
        right={<PopTag tone="gold">{t('puja.tag')}</PopTag>}
      />

      {/* ── Choose a deity ─────────────────────────────────────────────── */}
      <section className="flex-none px-2 pb-2 pt-2">
        <ul ref={chips} className="no-scrollbar flex gap-1 overflow-x-auto px-2">
          {deities.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                aria-pressed={deity.id === d.id}
                onClick={() => {
                  setDeity(d)
                  setPic(0)
                }}
                className="tile w-[72px]"
              >
                {/* The face is the murti, so the pressed-in "on" state cannot
                    show through it. Selection reads as full colour against
                    faded neighbours instead. */}
                <span className="tile-face !h-[52px] !w-[52px] overflow-hidden">
                  <img
                    src={`${import.meta.env.BASE_URL}deities/${d.images[0].f}`}
                    alt=""
                    loading="lazy"
                    className={`h-full w-full transition duration-200 ${fullImage ? 'object-contain' : 'object-cover'} ${
                      deity.id === d.id ? '' : 'opacity-50 saturate-50'
                    }`}
                  />
                </span>
                <span
                  className={`text-center text-[12px] font-semibold leading-tight ${deity.id === d.id ? 't-heading' : 't-body'}`}
                >
                  {lang === 'hi' ? d.nameHi : d.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* ── The shrine, taking whatever is left ────────────────────────── */}
      {/* Image scaling: `object-scale-down` by default maintains aspect ratio
          and fits within the container without distortion. The complete murti
          is shown, letterboxed if needed, responsive to any screen size.

          `setting:croppedDeityImage` (Profile → Settings) opts into `cover`,
          which fills the box and crops edges. The crop position is optimized
          for each device height. */}
      <section
        className="relative min-h-0 flex-1 touch-none overflow-hidden bg-[#e4ddd1]"
        onPointerDown={startSwipe}
        onPointerUp={endSwipe}
        onPointerCancel={() => (swipe.current = null)}
      >
        <img
          key={image.f}
          src={`${import.meta.env.BASE_URL}deities/${image.f}`}
          alt={`${deity.name} — ${image.label}`}
          className={`animate-fade absolute inset-0 h-full w-full ${fullImage ? 'object-scale-down' : 'object-cover'}`}
          style={fullImage ? { objectPosition: '50% 50%' } : { objectPosition: '50% 32%' }}
        />

        {/* Lamp light over the murti, always breathing. */}
        <span
          aria-hidden="true"
          className="animate-halo absolute left-1/2 top-[38%] block h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full mix-blend-screen"
          style={{ background: 'radial-gradient(circle, rgba(227,166,60,.5) 0%, rgba(227,166,60,0) 70%)' }}
        />

        {/* Petals fall the whole height of the shrine. */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          {petals.map((p) => (
            /* Marigold petals, not gold confetti — an ellipse tipped off
               axis reads as a petal at 8px where a circle reads as a dot. */
            /* A full-height lane falls; the petal at its top turns over. */
            <span
              key={p.id}
              className="animate-petal absolute top-0 block h-full w-2"
              style={{ left: `${p.left}%`, animationDelay: `${p.delay}s` }}
            >
              <span className="block" style={{ transform: `scale(${p.scale})` }}>
                <span
                  className="animate-petal-spin block h-3.5 w-2.5"
                  style={{
                    animationDelay: `${p.delay}s`,
                    borderRadius: '50% 50% 50% 50% / 62% 62% 38% 38%',
                    background: 'linear-gradient(160deg, #f7b733 0%, #e8871e 62%, #c25e10 100%)',
                  }}
                />
              </span>
            </span>
          ))}
        </span>

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

        <HangingBell side="left" ringing={ringing} />
        <HangingBell side="right" ringing={ringing} />

        {/* ── The offering rail ───────────────────────────────────────── */}
        <ul className="absolute left-3 top-1/2 flex -translate-y-1/2 flex-col gap-2.5">
          {offerings.map((o) => {
            const on = o.key === 'diya' ? lit.diya : o.key === 'incense' ? lit.incense : false
            return (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => offer(o.key, o.says)}
                  aria-pressed={on || undefined}
                  aria-label={t(o.label)}
                  className={`plinth ${on ? 'plinth-on' : ''}`}
                >
                  <OfferingProp kind={o.key} on={on} />
                </button>
              </li>
            )
          })}
        </ul>

        {/* Which murti. A knob rather than a caption, because a caption under
            the image is the one thing this screen is not allowed to have. */}
        <button
          type="button"
          onClick={() => setSheet(true)}
          aria-label={t('puja.chooseMurti')}
          className="plinth absolute bottom-4 left-3"
        >
          <Icon name="eye" size={19} />
        </button>

        <button
          type="button"
          onClick={openMusic}
          aria-label={t('puja.sangeet')}
          aria-pressed={Boolean(track)}
          className={`plinth absolute bottom-4 right-3 ${track ? 'plinth-on' : ''}`}
        >
          <SangeetGlyph />
        </button>

        {/* The altar. These stand on the step whether or not they are lit —
            samagri you have not touched yet is still samagri, and a diya that
            only exists once you light it makes the shrine look half-built. */}
        <span
          aria-hidden="true"
          className="absolute bottom-4 left-[19%]"
          // Mirrored, so the pair face the thali and the left one's flame is
          // not hidden behind the agarbatti stand.
          style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.4))', transform: 'scaleX(-1)' }}
        >
          <span className="relative block">
            <PujaPhoto name={lit.diya ? 'diya-lit' : 'diya'} width={58} fallback={<Diya size={52} lit={lit.diya} />} />
            {/* The photo's flame is a few pixels at this size; this one stands
                on the same wick (left spout) and flickers (4 Oct 2026). */}
            {lit.diya && (
              <span className="absolute" style={{ left: '4%', top: '30%', transform: 'translate(-50%, -96%)' }}>
                <LampFlame height={36} />
              </span>
            )}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="absolute bottom-4 right-[19%]"
          style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.4))' }}
        >
          <span className="relative block">
            <PujaPhoto name={lit.diya ? 'diya-lit' : 'diya'} width={58} fallback={<Diya size={52} lit={lit.diya} />} />
            {/* The photo's flame is a few pixels at this size; this one stands
                on the same wick (left spout) and flickers (4 Oct 2026). */}
            {lit.diya && (
              <span className="absolute" style={{ left: '4%', top: '30%', transform: 'translate(-50%, -96%)' }}>
                <LampFlame height={36} />
              </span>
            )}
          </span>
        </span>

        <span
          aria-hidden="true"
          className="absolute bottom-6 left-[13%]"
          style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.4))' }}
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
        </span>

        {/* ── The thali. Tap to begin the aarti: it rises off the altar to in
            front of the murti and circles there, as a thali is moved in an
            aarti (4 Oct 2026 — it used to light up and stay put). Tap again
            and it settles back. Dragging still turns it, either way. ───── */}
        <button
          type="button"
          onClick={() => {
            // A drag ends in a click too. Swallow that one, or finishing a
            // circle would put the aarti out. The flag is reset on the next
            // pointerdown, not here — see startTurn.
            if (turned.current) return
            toggleAarti()
          }}
          onPointerDown={startTurn}
          aria-pressed={aarti}
          aria-label={t(aarti ? 'puja.endAarti' : 'puja.aarti')}
          className="group absolute left-1/2 -translate-x-1/2 touch-none"
          style={{ bottom: aarti ? '30%' : '12px', transition: 'bottom .8s cubic-bezier(.2,.7,.3,1)' }}
        >
          <span className={`block ${aarti ? 'motion-safe:animate-aarti' : ''}`}>
            <span
              className="relative isolate block"
              style={{
                filter: 'drop-shadow(0 3px 6px rgba(0,0,0,.45))',
                transform: `rotate(${turn}deg)`,
                // No transition while a finger is on it — an eased follow lags
                // behind the thumb and feels like the plate is on elastic.
                transition: turning ? 'none' : 'transform .5s cubic-bezier(.2,.7,.3,1)',
              }}
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
          pic={pic}
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
 * The murti picker, and the only place the attribution lives.
 *
 * That is not a detail to tidy away: four of the Hanuman murtis are CC BY and
 * three more across Durga and Shani are share-alike. The licence needs a
 * credit somewhere a person can reach, and the shrine itself is not allowed to
 * carry text. If this sheet goes, the images have to go with it.
 */
function MurtiSheet({ deity, pic, onPick, onClose }) {
  const { lang, t, hasFlag } = useStore()
  const fullImage = !hasFlag('setting:croppedDeityImage')
  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="animate-fade absolute inset-0 bg-black/45"
      />
      <div className="animate-fade-rise relative rounded-t-3xl bg-surface p-4 shadow-xl">
        <p className="caps-sm t-faint">
          {lang === 'hi' ? deity.nameHi : deity.name} · {t('puja.murti')}
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
      </div>
    </div>
  )
}

/**
 * Sangeet — choose a bhajan or a mantra to play during the puja. The list is
 * Bhakti's own library (`bhakti_assets`, kinds bhajan and mantra), so a new
 * file loaded there appears here with no change to this screen.
 */
function SangeetSheet({ library, playing, onPlay, onStop, onClose }) {
  const { t } = useStore()
  const [tab, setTab] = useState(playing?.kind === 'mantra' ? 'mantra' : 'bhajan')
  const rows = (library ?? []).filter((a) => a.kind === tab)

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="animate-fade absolute inset-0 bg-black/45"
      />
      <div className="animate-fade-rise relative flex max-h-[70%] flex-col rounded-t-3xl bg-surface p-4 shadow-xl">
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

        <div className="mt-3 flex gap-2">
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

        <div className="no-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto">
          {library === null && <p className="py-6 text-center text-meta t-faint">{t('puja.loadingMusic')}</p>}
          {library !== null && rows.length === 0 && (
            <p className="py-6 text-center text-meta t-faint">{t('puja.noMusic')}</p>
          )}
          <ul className="space-y-2">
            {rows.map((a) => {
              const on = playing?.id === a.id
              return (
                <li key={a.id}>
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
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}

/** A ghanti on its chain, hung in a top corner of the niche. */
function HangingBell({ side, ringing }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute top-0 origin-top ${side === 'left' ? 'left-[6%]' : 'right-[6%]'} ${
        ringing ? 'animate-swing' : ''
      }`}
      style={{ filter: 'drop-shadow(0 3px 5px rgba(0,0,0,.45))' }}
    >
      <PujaPhoto name="ghanti" width={60} fallback={<Ghanti size={116} hanging />} />
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

/** What the rail shows: the samagri itself, not a symbol for it. */
function OfferingProp({ kind, on }) {
  if (kind === 'bell') return <Ghanti size={26} />
  if (kind === 'flower') return <Marigold size={25} />
  if (kind === 'diya') return <Diya size={26} lit={on} />
  return <Dhoop size={26} lit={on} />
}
