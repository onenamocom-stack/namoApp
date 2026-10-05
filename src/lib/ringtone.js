/**
 * A phone ring, made in the browser (6 Oct 2026) — two tones together in
 * the classic ring cadence (on, off, on, then a pause), repeated until
 * stopped, with the phone vibrating in step. Used while a call waits for
 * the consultant and the app is open; with the app closed the push
 * notification rings instead (public/sw.js).
 *
 * No audio file: synthesised, like the ghanti on the Pooja screen. A
 * browser may refuse sound until the page has been touched once; the
 * vibration and the ringing bar still say it.
 */
let ctx = null
let timer = null

function burst(at, length) {
  for (const freq of [440, 480]) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(0.18, at + 0.03)
    gain.gain.setValueAtTime(0.18, at + length - 0.05)
    gain.gain.linearRampToValueAtTime(0, at + length)
    osc.connect(gain).connect(ctx.destination)
    osc.start(at)
    osc.stop(at + length)
  }
}

function cycle() {
  if (!ctx) return
  const now = ctx.currentTime
  burst(now, 0.4)
  burst(now + 0.6, 0.4)
  if (navigator.vibrate) navigator.vibrate([400, 200, 400])
}

export function startRinging() {
  if (timer) return
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  } catch {
    ctx = null
  }
  cycle()
  timer = setInterval(cycle, 3000)
}

export function stopRinging() {
  if (timer) clearInterval(timer)
  timer = null
  if (navigator.vibrate) navigator.vibrate(0)
}
