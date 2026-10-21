/**
 * The aarti's own music (21 Oct 2026, Rahul: "jab aarti ki plate chalti hai,
 * add a music of ghanti aur tabla mix devotional sangeet", then "sirf ghanti
 * and tabla ki koi fast"), made in the browser: a tabla playing a fast
 * keherwa with a tirakita fill every fourth bar, a hand ghanti rung on every
 * half beat, and the big temple ghanta on each bar's sam. Both bells are the
 * recording the shrine's bells ring (`public/puja/ghanta.mp3`), the hand
 * ghanti played faster so it sounds smaller. Nothing else plays.
 *
 * Start it from inside a tap; a phone refuses sound that starts later.
 * Starting twice does nothing; stopping fades it out.
 */
const BPM = 138
const BEAT = 60 / BPM
const SA = 138.6 // C#3; the dayan is tuned an octave up
const GHANTA_URL = `${import.meta.env.BASE_URL}puja/ghanta.mp3`

/* Keherwa, eight matras: Dha Ge Na Ti | Na Ka Dhi Na; every fourth bar ends
   on a fill instead. */
const THEKA = ['dha', 'ge', 'na', 'ti', 'na', 'ka', 'dhi', 'na']
const FILL = ['dha', 'ge', 'na', 'ti', 'dha', 'dha', 'tirakita', 'dha']

let ctx = null
let master = null
let timer = null
let next = 0 // when the next matra sounds, in ctx time
let step = 0
let bell = null // the decoded ghanta
let noise = null

function context() {
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  if (!noise) {
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate)
    const d = noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  if (!bell) {
    fetch(GHANTA_URL)
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => {
        bell = buf
      })
      .catch(() => {})
  }
  return ctx
}

/** A struck partial: a sine that rises fast and dies away. */
function partial(at, freq, level, decay, glide = null) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.setValueAtTime(freq, at)
  if (glide) {
    osc.frequency.linearRampToValueAtTime(glide[0], at + glide[1])
    osc.frequency.exponentialRampToValueAtTime(freq * 0.92, at + decay)
  }
  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(level, at + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + decay)
  osc.connect(gain).connect(master)
  osc.start(at)
  osc.stop(at + decay + 0.05)
}

/** A short burst of filtered noise: the slap of a palm or a finger. */
function slap(at, centre, level, length, q = 1.2) {
  const src = ctx.createBufferSource()
  src.buffer = noise
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = centre
  band.Q.value = q
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(level, at)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
  src.connect(band).connect(gain).connect(master)
  src.start(at)
  src.stop(at + length + 0.02)
}

/* The dayan's ring: its harmonic partials, as a tuned tabla has. */
const dayan = (at, level = 0.16, decay = 0.4) => {
  const f = SA * 2
  partial(at, f, level, decay)
  partial(at, f * 2, level * 0.5, decay * 0.7)
  partial(at, f * 3, level * 0.25, decay * 0.5)
  slap(at, 3200, level * 0.35, 0.02)
}
/* The bayan's boom, the pitch lifting under the palm. */
const bayan = (at, level = 0.34) => {
  partial(at, 82, level, 0.6, [106, 0.08])
  slap(at, 180, level * 0.2, 0.04)
}
const ti = (at, level = 0.07) => {
  partial(at, SA * 4, level, 0.08)
  slap(at, 2400, level * 1.1, 0.03)
}
const ka = (at) => slap(at, 260, 0.16, 0.06)

const BOLS = {
  dha: (at) => {
    dayan(at)
    bayan(at)
  },
  dhi: (at) => {
    partial(at, SA * 4, 0.12, 0.5)
    partial(at, SA * 6, 0.05, 0.35)
    bayan(at, 0.28)
  },
  ge: (at) => bayan(at),
  na: (at) => dayan(at, 0.13, 0.35),
  ti: (at) => ti(at),
  ka,
  // Four quick strokes in one matra.
  tirakita: (at) => {
    const q = BEAT / 4
    ti(at, 0.08)
    ka(at + q)
    ti(at + 2 * q, 0.08)
    dayan(at + 3 * q, 0.12, 0.2)
  },
}

function ghanta(at, rate, level) {
  if (!bell) return
  const src = ctx.createBufferSource()
  src.buffer = bell
  src.playbackRate.value = rate
  const gain = ctx.createGain()
  gain.gain.value = level
  src.connect(gain).connect(master)
  src.start(at)
}

function schedule() {
  while (next < ctx.currentTime + 0.25) {
    const m = step % 8
    const bar = Math.floor(step / 8)
    const bols = bar % 4 === 3 ? FILL : THEKA
    BOLS[bols[m]](next)
    // The hand ghanti on every half beat, the big ghanta on sam.
    ghanta(next, 1.8, 0.2)
    ghanta(next + BEAT / 2, 1.8, 0.12)
    if (m === 0) ghanta(next, 1, 0.45)
    next += BEAT
    step += 1
  }
}

export function startAartiSangeet() {
  if (timer) return
  try {
    context()
  } catch {
    return // no audio on this device; the aarti still turns
  }
  master = ctx.createGain()
  master.gain.setValueAtTime(0, ctx.currentTime)
  master.gain.linearRampToValueAtTime(0.8, ctx.currentTime + 1.2)
  master.connect(ctx.destination)
  next = ctx.currentTime + 0.1
  step = 0
  schedule()
  timer = setInterval(schedule, 80)
}

export function stopAartiSangeet() {
  if (!timer) return
  clearInterval(timer)
  timer = null
  const out = master
  master = null
  const now = ctx.currentTime
  out.gain.cancelScheduledValues(now)
  out.gain.setValueAtTime(out.gain.value, now)
  out.gain.linearRampToValueAtTime(0, now + 0.8)
  setTimeout(() => out.disconnect(), 1000)
}
