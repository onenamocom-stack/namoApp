/**
 * The aarti's own music (21 Oct 2026, Rahul: "jab aarti ki plate chalti hai,
 * add a music of ghanti aur tabla mix devotional sangeet"), made in the
 * browser: a tabla playing keherwa, a tanpura's Sa and Pa underneath, a
 * manjira on the off-beats, and the temple ghanta — the same recording the
 * bells on the shrine ring (`public/puja/ghanta.mp3`) — on every bar's sam.
 *
 * No music file beyond the bell: no free recording of bells and tabla alone
 * was found, and a sung aarti would clash with the bhajans Sangeet plays.
 *
 * Start it from inside a tap; a phone refuses sound that starts later.
 * Starting twice does nothing; stopping fades it out.
 */
const BPM = 88
const BEAT = 60 / BPM
const SA = 138.6 // C#3: the tanpura's Sa; the dayan is tuned an octave up
const GHANTA_URL = `${import.meta.env.BASE_URL}puja/ghanta.mp3`

/* Keherwa, eight matras: Dha Ge Na Ti | Na Ka Dhi Na. */
const THEKA = ['dha', 'ge', 'na', 'ti', 'na', 'ka', 'dhi', 'na']

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
function slap(at, centre, level, length) {
  const src = ctx.createBufferSource()
  src.buffer = noise
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = centre
  band.Q.value = 1.2
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(level, at)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
  src.connect(band).connect(gain).connect(master)
  src.start(at)
  src.stop(at + length + 0.02)
}

/* The dayan's ring: its harmonic partials, as a tuned tabla has. */
const dayan = (at, level = 0.16, decay = 0.45) => {
  const f = SA * 2
  partial(at, f, level, decay)
  partial(at, f * 2, level * 0.5, decay * 0.7)
  partial(at, f * 3, level * 0.25, decay * 0.5)
  slap(at, 3200, level * 0.35, 0.02)
}
/* The bayan's boom, the pitch lifting under the palm. */
const bayan = (at, level = 0.32) => {
  partial(at, 82, level, 0.7, [104, 0.09])
  slap(at, 180, level * 0.2, 0.04)
}
const ti = (at) => {
  partial(at, SA * 4, 0.07, 0.09)
  slap(at, 2400, 0.08, 0.03)
}
const ka = (at) => slap(at, 260, 0.16, 0.06)

const BOLS = {
  dha: (at) => {
    dayan(at)
    bayan(at)
  },
  dhi: (at) => {
    partial(at, SA * 4, 0.12, 0.6)
    partial(at, SA * 6, 0.05, 0.4)
    bayan(at, 0.26)
  },
  ge: (at) => bayan(at),
  na: (at) => dayan(at, 0.13, 0.4),
  ti,
  ka,
}

/** The manjira: two small cymbals, inharmonic and bright. */
function manjira(at) {
  for (const [f, l] of [[2093, 0.025], [3136, 0.02], [4699, 0.012], [6271, 0.008]]) partial(at, f, l, 0.9)
  slap(at, 7000, 0.02, 0.05)
}

/** The tanpura: a filtered sawtooth plucked and left to sound. */
function tanpura(at, freq) {
  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.value = freq
  const low = ctx.createBiquadFilter()
  low.type = 'lowpass'
  low.frequency.value = 900
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(0.035, at + 0.08)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + BEAT * 2.4)
  osc.connect(low).connect(gain).connect(master)
  osc.start(at)
  osc.stop(at + BEAT * 2.5)
}

function ghanta(at) {
  if (!bell) return
  const src = ctx.createBufferSource()
  src.buffer = bell
  const gain = ctx.createGain()
  gain.gain.value = 0.45
  src.connect(gain).connect(master)
  src.start(at)
}

/* Pa, Sa, Sa, low Sa — the tanpura's cycle, one string every two matras. */
const STRINGS = [SA * 1.5, SA * 2, SA * 2, SA]

function schedule() {
  while (next < ctx.currentTime + 0.25) {
    const m = step % 8
    BOLS[THEKA[m]](next)
    if (m % 2 === 1) manjira(next)
    if (m % 2 === 0) tanpura(next, STRINGS[(step / 2) % 4])
    if (m === 0) ghanta(next)
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
