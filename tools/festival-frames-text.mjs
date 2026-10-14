// The second step of the built-in festival frames (see festival-frames.py):
// Chrome sets each frame's English and Hindi words over its decoration and
// writes public/frames/<name>.png. Chrome, because it shapes Devanagari
// correctly and this repo's Pillow does not.
//
//   node tools/festival-frames-text.mjs
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const art = join(here, 'frames-art')
const out = join(here, '..', 'public', 'frames')
mkdirSync(out, { recursive: true })
const text = JSON.parse(readFileSync(join(art, 'text.json'), 'utf8'))

const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync)
const port = 9334
const proc = spawn(chrome, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`,
  `--user-data-dir=${(process.env.TEMP || '/tmp')}/namo-frames`, 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let target
for (let i = 0; i < 40 && !target; i++) {
  await sleep(250)
  try {
    target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page')
  } catch { /* not up yet */ }
}
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) pending.get(m.id)(m.result)
})
const send = (method, params = {}) => new Promise((r) => { id += 1; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })) })

for (const [name, lines] of Object.entries(text)) {
  const png = readFileSync(join(art, `${name}.png`)).toString('base64')
  const expression = `(async () => {
    const img = new Image(); img.src = 'data:image/png;base64,${png}'; await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const x = c.getContext('2d'); x.drawImage(img, 0, 0)
    const lines = ${JSON.stringify(lines)}
    for (const l of lines) {
      const family = l.family === 'Georgia' ? 'Georgia, serif' : '"Nirmala UI", "Noto Sans Devanagari", sans-serif'
      x.font = 'bold ' + l.px + 'px ' + family
      x.fillStyle = l.colour; x.textAlign = 'center'; x.textBaseline = 'top'
      x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = 6; x.shadowOffsetY = 2
      x.fillText(l.text, c.width / 2, l.top)
    }
    return c.toDataURL('image/png').split(',')[1]
  })()`
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  const data = r?.result?.value
  if (!data) throw new Error(`no image for ${name}: ${JSON.stringify(r).slice(0, 300)}`)
  writeFileSync(join(out, `${name}.png`), Buffer.from(data, 'base64'))
  console.log(join(out, `${name}.png`))
}
ws.close()
proc.kill()
process.exit(0)
