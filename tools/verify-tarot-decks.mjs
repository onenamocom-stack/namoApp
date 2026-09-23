/**
 * Do the two card lists still agree?
 *
 *   node tools/verify-tarot-decks.mjs
 *
 * The server deals the card (`apps/ai/tarot_decks.py`) and the client draws
 * the face (`src/data/`). That means the same deck is written down twice,
 * and a card the server can deal but the client cannot name renders as a
 * blank plate with an id under it — on a pull somebody paid ₹11 for.
 *
 * The duplication is deliberate: the server must not take a card from the
 * client (rule 3), and the client must not ship 48 shlokas to the model.
 * This is the price of that, paid once here instead of on a live pull.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

/* ── the client's decks ──────────────────────────────────────────────────── */

const mock = read('../src/data/mock.js')
const bhaktamar = read('../src/data/bhaktamar.js')

/** Ids and names out of an array of `{ id: 'x', name: 'y' }` objects.
 *
 *  The closing quote is matched by backreference, not by "either quote":
 *  "The First Jina's Glory" is double-quoted around an apostrophe, and a
 *  looser pattern truncates it there and reports a mismatch that is the
 *  regex's fault rather than the data's. */
function cardsIn(source) {
  const out = new Map()
  const re = /id:\s*(['"])([a-z]\d+)\1,[\s\S]{0,400}?name:\s*(['"])((?:\\.|(?!\3)[^\\])*)\3/g
  let match
  while ((match = re.exec(source))) out.set(match[2], match[4].replace(/\\(.)/g, '$1'))
  return out
}

/** One deck's slice of `tarotDecks`: from its key to the next deck's, or to
 *  the end of the array. An unbounded slice swallows whatever data happens
 *  to come after it in the file. */
function deckSlice(key) {
  const start = mock.indexOf(`key: '${key}'`)
  assert.notEqual(start, -1, `${key} is in DECKS but not in src/data/mock.js — renamed?`)
  const next = mock.indexOf("key: '", start + 10)
  const close = mock.indexOf('\n]', start)
  const end = next !== -1 && next < close ? next : close
  return mock.slice(start, end)
}

/* ── the server's decks ──────────────────────────────────────────────────── */

const python = read('../backend-django/apps/ai/tarot_decks.py')

function pythonDeck(constant) {
  const start = python.indexOf(`${constant} = [`)
  assert.notEqual(start, -1, `${constant} is gone from tarot_decks.py — renamed?`)
  const body = python.slice(start, python.indexOf('\n]', start))
  const out = new Map()
  const re = /\(\s*"([^"]+)",\s*"((?:[^"\\]|\\.)*)"/g
  let match
  while ((match = re.exec(body))) out.set(match[1], match[2].replace(/\\"/g, '"'))
  return out
}

/* Only the decks in `DECKS` — a card list can sit in that file unreachable
 * while its art is drawn (the Vedic Kipper six do, as of 24 Sep 2026), and
 * a deck nothing can deal is not a deck the client has to name. */
const live = python.slice(python.indexOf('DECKS = {'))
const serverDecks = Object.fromEntries(
  [...live.matchAll(/"(\w+)":\s*\{[\s\S]*?"cards":\s*(\w+),/g)]
    .map(([, key, constant]) => [key, pythonDeck(constant)]),
)
assert.ok(Object.keys(serverDecks).length > 0, 'no decks in DECKS — is the map gone?')

/* Bhaktamar's cards live in their own file with the scripture; every other
 * deck is an entry in `tarotDecks`. */
const clientDecks = Object.fromEntries(
  Object.keys(serverDecks).map((key) => [
    key, key === 'bhaktamar' ? cardsIn(bhaktamar) : cardsIn(deckSlice(key)),
  ]),
)

/* ── they must match ─────────────────────────────────────────────────────── */

for (const deck of Object.keys(serverDecks)) {
  const server = serverDecks[deck]
  const client = clientDecks[deck]

  assert.ok(server.size > 0, `${deck}: the server deck is empty`)
  assert.equal(
    client.size, server.size,
    `${deck}: ${server.size} cards on the server, ${client.size} in src/data`,
  )

  for (const [id, name] of server) {
    assert.ok(
      client.has(id),
      `${deck}: the server can deal "${id}" (${name}) and the client cannot name it — ` +
      'that card renders as a blank plate on a pull somebody paid for',
    )
    assert.equal(
      client.get(id), name,
      `${deck}/${id}: "${client.get(id)}" in src/data, "${name}" on the server`,
    )
  }
}

// The yes/no deck answers a closed question, so every card must carry one.
const verdicts = [...read('../backend-django/apps/ai/tarot_decks.py')
  .slice(python.indexOf('YESNO = ['))
  .matchAll(/"(Yes|No|Maybe)"\),/g)]
assert.equal(
  verdicts.length, serverDecks.yesno.size,
  'a yes/no card with no verdict: that deck exists to answer, and a card that ' +
  'cannot is a horoscope',
)

const total = Object.values(serverDecks).reduce((n, d) => n + d.size, 0)
console.log(`tarot decks OK - ${total} cards across ${Object.keys(serverDecks).length} decks, both lists agree`)
