# 02 — Technical requirements

How Namo is built: the stack, what runs where, and the line between what a user
may decide and what a server decides.

**This document owns everything server-side that is not a table.** Table and
column definitions live in `05-BACKEND-SCHEMA.md`; this document names tables but
never their columns. Build order lives in `06-IMPLEMENTATION.md`. Prices and
product scope live in `01-PRD.md`. The eight non-negotiable engineering rules
live in `backend/INSTRUCTIONS.md` and are referenced here, not copied.

The backend is not built. This describes the target.

---

## 1. What exists today

A front-end-only SPA.

| | |
|---|---|
| Build | Vite 5, React 18.3, Tailwind 3.4, plain JSX — no TypeScript |
| Runtime deps | Three: `react`, `react-dom`, `react-router-dom`. No icon library, no state library, no UI kit |
| Routing | `HashRouter`, mounted **above** `AppProvider` in `src/main.jsx` so the store can call `useLocation()` |
| State | One context in `src/store.jsx` — a ~29-key `useMemo` with a hand-maintained dependency array |
| Data | 51 exports in `src/data/mock.js` plus `src/data/bhaktamar.js`. No network calls anywhere |
| Deploy | GitHub Pages on push to `main`. Hash routing means sub-routes need no server config |
| Tooling | No linter, no type checker, no tests. `npm run build` is the only automated check |

That last row matters more than it looks. **A green build proves almost nothing
here**: an undefined identifier inside JSX is a runtime error, not a compile
error. It has shipped a blank screen at least twice, and the `ChatPanel` crash
fixed during this planning work compiled cleanly while throwing on the first tap
of the messages knob. Every phase in `06` therefore ends with walking routes in a
browser, not with a passing build.

---

## 2. Three jobs, and only one is written by hand

The app looks like one backend problem. It is three, and conflating them is how
this gets expensive.

| Job | What it needs | Who writes it |
|---|---|---|
| **Remembering** | users, wallets, bookings, orders, chat, content | You. This is "the backend" |
| **Computing astrology** | a chart from date, time and place | Nobody. An ephemeris library |
| **Real-time and money** | video, voice, UPI, payouts | Nobody. Razorpay, 100ms or Agora |

Everything below is job 1 plus thin adapters to jobs 2 and 3.

---

## 3. The trust boundary

**The most important section in this document set.**

`spend()` in `src/store.jsx` is currently the entire money system, and it runs in
the browser. Anyone with devtools can set the balance to a crore. That is not a
bug in the code — it is the definition of client-side.

### The rule

> Anything a user would lie about is decided on a server they cannot reach.

For this product, exhaustively:

- wallet balance, and every debit and credit
- whether a booking slot is free — two people tap 11:00 at the same instant and
  the server picks one
- what anything costs
- whether the free weekly tarot pull is spent
- how many AI questions remain
- consultant earnings, fees and payout amounts
- whether a report was paid for before it renders
- whether the caller is actually a consultant, rather than merely standing on a
  `/pro/*` URL
- whether a consultant is approved, and whether they are blocked

### What stays client-side, and should

Which deity you swiped to, which murti, the thali's rotation, scroll position,
which Consult mode is selected, cart contents before checkout, every cosmetic
toggle. None of it is worth a round trip. **Do not over-secure the mandir.**

### The corollary that bites first

**The client never sends a price, an amount, or an identity.**

It sends `{ consultantId, serviceId, startsAt }`, `{ productId, qty }`,
`{ threadId, body }`. The server looks up price, cost and caller from the token
and the database. If a request body contains a number the user benefits from,
that is the bug.

This is currently *unobeyable* in one place, and it is worth naming: the Consult
booking sheet knows a consultant and a slot but has no identifier for what is
being bought. `consultant_services` supplies that missing noun — see
`05-BACKEND-SCHEMA.md` §4.3.

---

## 4. Architecture

### Supabase, plus a small set of server functions

Supabase provides Postgres, phone-OTP auth (what India expects), file storage for
consultant and admin uploads, Realtime for chat and presence, and row-level
security so "a user reads only their own wallet" is a **database rule** rather
than a route you might forget to guard.

Firebase is the same shape if preferred, but the wallet ledger and the booking
conflict check both want SQL transactions and a partial unique index, which
Firestore does not give you cheaply.

### The functions run on Supabase Edge Functions

Deno, deployed per project, one folder each under `backend/functions/`. Decided
in phase 3, which is the first phase that needs a server function at all.

Vercel and Cloudflare Workers both run this code. Neither earns a second deploy
target, a second secret store and a second set of CORS rules for what is a
handful of functions sitting next to the database they exist to write. The
webhook needs the service-role key, which already lives here.

**Function secrets are a third store**, alongside `.env.local` and the GitHub
Actions secrets — set per Supabase project, so the dev project holds test
payment keys and production holds live ones with no path between them. §11.

**The exception is the ephemeris**, which is Python and does not fit a Deno
runtime. It stays a separate service.

### What must be a function rather than a policy

RLS answers "may this row be read or written by this caller". It cannot answer
anything spanning multiple rows atomically, and it cannot verify an external
signature.

| Function | Why it cannot be a policy |
|---|---|
| Create a booking | One transaction across six tables: price lookup, availability check, slot claim, wallet debit, both ledgers, thread open |
| Wallet credit | A credit is a ledger insert plus a balance update, and only after a verified payment |
| Razorpay webhook | The provider calls a public URL; the signature must be verified before anything is trusted |
| Booking status change | A decline writes a **reversing** ledger entry, never edits the debit |
| Slot availability | A three-way subtraction (rule − time off − bookings) that all three callers must compute identically |
| Chart computation | Calls the ephemeris service |
| Namo AI | The model key cannot reach a browser, the quota is money, and the free-question count is a number the browser must not own |

Everything else — reading your own bookings, your own ledger, your own threads,
the public consultant list — is a policy, not a function.

### Deliberately not built

- **Auth from scratch.** Sessions, OTP delivery, rate limits, recovery. Solved.
- **A custom realtime layer.** Postgres changefeeds cover chat at this size.
- **A queue, Redis, or GraphQL.** Add the first one that is measurably needed.
- **Server-side rendering.** The client is a static SPA and stays one.
- **An ORM with code-first migrations.** Numbered SQL files.

---

## 5. Auth

**Phone OTP.** Supabase Auth owns the identity; `profiles` extends it 1:1 by
primary key.

There are no passwords and no email flow in v1. That removes password reset,
credential stuffing and most of the account-recovery surface in one decision.

### Role is not stored, and is not a role

`isPro` is derived from the URL path in the client, and **must stay that way** —
a persisted role boolean can disagree with the address bar, which is the bug the
front-end handoff explicitly forbids reintroducing.

Server-side there is no role either. Consultant-ness is the existence of a
`consultants` row; admin-ness is a separate application (§7).

### There is no `/pro` authorization endpoint

Every consultant-side screen's data is a query scoped by the caller's own ID. A
seeker standing on `/pro/sessions` sees an **empty list, not a 403.**

This satisfies rule 4 in `backend/INSTRUCTIONS.md` by data scoping rather than by
a route guard that someone can forget to add to the fourteenth screen. It is the
cleanest available answer and it is not obvious, so it is stated here rather than
discovered.

---

## 6. API surface

Supabase client reads go direct through PostgREST under RLS. Everything that
moves money or claims a resource is an explicit endpoint.

### v1 endpoints

| Endpoint | Sends | Returns | Notes |
|---|---|---|---|
| `POST /functions/v1/razorpay-order` | a validated amount in paise | `{ order_id, amount_paise, key_id }` | The client chooses what to **pay**; the server decides what to **credit**, from the webhook |
| `POST /functions/v1/razorpay-webhook` | — | 200 | `verify_jwt = false` — the signature is the authentication. Idempotent by unique index, not by an application check |
| `POST /bookings` | `{ consultantId, serviceId, startsAt }` | booking, or a named refusal | One transaction. See below |
| `POST /bookings/:id/status` | `{ status }` | booking | Consultant only. Decline writes a reversing ledger entry |
| `GET /consultants/:id/slots?date=` | — | open slots | The single source for every caller. Built as `consultant_open_slots(uuid, date)`, a `security definer` Postgres function over RPC rather than an Edge Function: the three-way subtraction is pure SQL over tables next to it, and nothing it decides needs a secret. Definer because it subtracts other people's bookings, which RLS hides from the caller — it returns times, never rows. **Horizon 14 days, times IST**, both named in that function and nowhere else |

Both payment endpoints shipped in phase 3 and are named for the runtime rather
than for a REST shape the SPA does not otherwise use. The webhook is the only
endpoint in the system that answers to an unauthenticated caller.

`POST /bookings` is effectively what v1 *is*; everything else is scaffolding
around it. It catches the unique-violation error from the slot-claim index and
converts it into a refusal, which is how two simultaneous requests for 11:00
produce one booking and one clear message rather than a lock.

### The refusal contract

A refusal is a **200-level, structured, human-readable reason** — not a bare 4xx
and never a silent failure.

```json
{ "ok": false, "reason": "insufficient_balance", "message": "Not enough balance" }
```

`message` is display copy. This is not new vocabulary: `spend()` already toasts
"Not enough balance" and the booking sheet already has a refusal path. **The
server's job is to make those existing strings true**, in the existing voice
(second person, present tense, no hedging, no exclamation marks).

Named v1 reasons: `insufficient_balance` · `slot_taken` · `consultant_unavailable`
· `not_approved` · `thread_closed` · `rate_limited`.

---

## 7. Admin isolation

**The admin console is a separate server-side application holding the
service-role key. It bypasses RLS entirely. There is no admin role in the
client's RLS.**

The alternative is `admin = true` plus an "or is admin" disjunction in every
policy: fourteen policies that can each be got wrong independently, and one
leaked admin JWT reading every wallet in the system. Isolating the elevated path
into a single server process keeps the blast radius somewhere you control.

**Tiers are enforced in the admin app, not in Postgres** — the service role has no
tiers. Support reads; Moderator removes content and blocks; Finance touches
payouts and refunds; Superadmin manages admins. Every action of every tier writes
an audit row. That is legal record, not a feature, and it is the only reason a
blocked consultant's appeal can be answered.

This does not contradict §5's "role is not stored". That rule governs routing
inside the seeker/consultant SPA. **Admin is a different application with a
different login**, and the two rules are not in conflict.

### Delivery

Admin makes `aether-mono` an actual monorepo, as the name has been promising:
`app/` (the phone SPA), `admin/` (the desktop console), `backend/` (schema,
functions, ephemeris). That restructure is phase 4 — moving `src/` today breaks
every import to gain nothing.

**Admin does not inherit the app's design system.** A 420px phone frame of
skeuomorphic tiles is the wrong instrument for 2,000-row tables with filters and
bulk actions. See `04-UI-UX.md`.

---

## 8. Third parties

| Need | Choice | Why not the obvious alternative |
|---|---|---|
| Payments in | **Razorpay** (Cashfree equivalent) | Stripe is awkward for domestic UPI, and UPI is most of the volume |
| Payouts | RazorpayX / Cashfree Payouts | Paying out is a different product from taking in, with its own KYC gate |
| Video / voice | 100ms or Agora — **TBD** | Raw WebRTC is a team, not a task |
| Namo AI | **Gemini Flash**, behind the API — *reversed from Claude, 21 Sep 2026* | The key cannot ship to a browser and the quota is money. Gemini won on cost at this shape: short answers over structured chart data, ~₹0.02 a question against ~₹0.06. `AI_PROVIDER` selects it, so the reversal costs one env var, not a rewrite |
| Ephemeris | **`freeastroapi.com`**, Entry tier — *reversed from Swiss Ephemeris as our own service, 1 Sep 2026* | Removes a second language and a second deploy. The "subtly wrong forever" risk does not go away, it moves: see below |
| Place search | **`freeastroapi.com`** geo endpoint — *replaced Open-Meteo, 2 Sep 2026* | Same tier, commercially licensed, returns the IANA zone. Open-Meteo's free geocoder was non-commercial and sat on the signup path |

### Charts come from a third-party API — decided 1 Sep 2026

**This replaces an earlier decision on this page** that Swiss Ephemeris would
run as our own Python service. It will not. Charts come from
`freeastroapi.com` (Entry tier: $8/month, 50,000 requests/month, 5 req/sec,
commercial use permitted), which covers natal charts in both traditions,
divisional charts, panchang, Vimshottari dasha, Ashtakoota matching and
personalised horoscopes.

What the reversal buys: no second language, no second service to deploy, no
hosting decision, and unlimited geo/timezone lookup — which retires the
Open-Meteo licence problem in `01-PRD.md` §8 rather than leaving it on the
signup path.

**What it does not buy is confidence in the numbers, and that is the part that
matters.** The original reasoning on this page still holds word for word:
Indian astrology is unforgiving about ayanamsa and house system being exactly
right, **and a wrong one is wrong silently** — the chart renders, it is just not
yours. The risk has moved rather than gone. With `pyswisseph` the ayanamsa was
ours to set and the danger was forgetting to; with a third-party API it is
theirs to default, we cannot see it, and it can change without a release note.
That API offers Placidus, Whole Sign, Equal and Koch, and tropical as well as
sidereal, so its default is emphatically not what this product wants.

Therefore, unchanged from the original decision and now load-bearing:

- **Pick a reference birth chart with an independently verified result BEFORE
  writing the integration**, or there is nothing to test against.
- **Pass ayanamsa and house system explicitly on every call.** Never rely on a
  default, and never assume one call's default is the next one's.

### What was settled when it was built — 2 Sep 2026

| | | |
|---|---|---|
| Ayanamsa | `lahiri` | Verified, not assumed — see below |
| House system | `whole_sign` | Twelve houses, one sign each, no split signs |
| Node type | `mean` | |
| Endpoints | `/api/v2/geo/search`, `/api/v2/vedic/chart`, `/api/v2/vedic/panchang`, `/api/v2/vedic/horoscope/daily/personal`, `/api/v2/vedic/match`, `/api/v2/vedic/muhurat/search`, `/api/v2/vedic/muhurat/personalized-search` | The seven with a screen. The reading is driven by the reader's own birth again since 22 Sep; matching and muhurat arrived the same day — see below |

All three settings are constants in `backend/functions/astro/index.ts` and are
merged into every outbound body. **There is no code path that omits them.**

**The reference chart is Indira Gandhi — 19 Nov 1917, 23:11, Allahabad
(25.4358 N, 81.8463 E).** Rodden AA, from a birth certificate, so it can be
checked without anyone's private details entering the repo. It is also pre-1945,
which is the third done-condition's case.

**And it was checked by arithmetic rather than against a website.** The
ascendant is spherical trigonometry on sidereal time — no ephemeris needed — so
it was computed independently and came out at 117.371°, against their 117.366°.
Five thousandths of a degree apart is Lahiri sidereal and nothing else; a
tropical answer would have been off by twenty-two degrees and Raman or KP by
tenths. That is the check to repeat if their numbers are ever doubted, and it
does not depend on them staying online.

**The historical-offset case passes and is worth stating, because it is the one
that fails silently.** A birth on 15 June 1943 in Kolkata returns an ascendant
of Leo 21.7°, which is the answer for **+06:30** — India's wartime offset. The
naive `+05:30` answer is Virgo 5.6°, a whole sign away. They resolve the zone
from historical tzdata, which is why `birth_zone` is stored as an IANA name and
never as an offset (`05-BACKEND-SCHEMA.md` §4.1).

**Geo search replaces Open-Meteo** on the signup path, which retires the licence
problem `01-PRD.md` §8 carried. One difference matters in the interface: their
ordering is relevance, and relevance puts a hamlet of a hundred people above the
city of three million with the same name. The Edge Function re-sorts by
population, because on the signup path a wrong pick is a wrong chart for the
life of the account.

**The panchang is computed at Ujjain for everybody — decided 4 Sep 2026.** It
was anchored on each reader's birth place, which cost a request per person per
day for an answer that barely varied. One anchor makes it one request a day at
any user count. Ujjain because it is the classical zero-longitude of Indian
astronomy, which makes the one arbitrary choice here defensible rather than
merely convenient. **Sunrise moves about two hours across India, so the city is
named on every screen that shows the almanac** — and the chart and the daily
reading stay per person, because those genuinely differ.

One consequence worth stating, because it is the failure this replaced: the
personal horoscope endpoint returns its own panchang, computed at the birth
place. Rendering that alongside the shared one would put two tithis for one day
on two screens and let them disagree at a transition — the mock's week-apart
calendars, reintroduced. So the reading's own almanac is discarded and every
screen reads the shared one.

**Every derivation is cached in one table** (`astro_cache`, `05-BACKEND-SCHEMA.md`),
with no TTL and no sweeper — every cache key carries every input that produced
its value, so a value cannot go stale, only go unused. Corrected birth details
produce a different key and therefore a miss.

**And cached again in the browser**, added 4 Sep 2026. The server cache protects
the API quota; it does nothing for the person holding the phone, who was paying
a network round trip on every mount. `/home` alone asked for the same reading
twice — the reading card and the horoscope overlay — and every reload asked
again. `src/lib/astro.js` now keeps answers in `localStorage`, stamped with the
IST day, and de-duplicates concurrent callers through an in-flight map.

Three rules it follows, each for a reason:

- **A chart never expires.** It is a function of a birth. Everything else dies
  with the IST day it was computed for.
- **Refusals are never cached.** `no_birth` stops being true the moment somebody
  adds their details; `upstream` stops being true when the service returns.
  Caching either would make a temporary answer permanent.
- **The user id is in the key, and sign-out clears the store.** `localStorage`
  outliving a session is the point — it is what makes a reload free — so a
  second person on a shared phone must not be one key lookup from the first
  one's chart.
- **Except the panchang, which carries no user at all.** It stopped being a
  function of one on 4 Sep. Keying it per person meant `/home` (which passes the
  signed-in id) and `/horoscope` (which passes none) wrote two entries for one
  answer, and a signed-out reader then refetched what the signed-in one already
  had.

`localStorage` rather than `sessionStorage` because `sessionStorage` dies with
the tab, and a new tab would then refetch a chart that cannot have changed.

### The daily reading is the reader's own — reversed back, 22 Sep 2026

**This replaces the 7 Sep decision that the reading should come from twelve
canonical births, one per rashi, and the 9 Sep correction that followed it.**
Both are gone, and the reasoning is kept here because the shape of the mistake
is worth remembering.

What 7 Sep bought was cost: a rashifal keyed on janma rashi meant twelve
readings answered everybody at any user count, against one per reader per day.
What it cost was the reading. 9 Sep read a live payload and found the invented
birth contaminating nearly all of it — the headline, the summary, every score,
every section, the remedy, the asserted lagna and Moon nakshatra, and every
influence, all of them functions of that person's dasha. The honest response
was to delete those fields, which left a mood sentence and four clock windows
that were **identical across all twelve signs**. A whole screen of the product
had become one shared paragraph.

So the reading is computed from the reader's own birth again, cached as
`horoscope:<user id>:<birth digest>:<date>`. Everything on it is theirs: the
headline, the six domain scores, the Vimshottari period, the transits, the
sections, the remedy.

**The cost is stated rather than avoided.** One upstream call per reader per
day. Entry's 50,000 a month is about 1,600 daily readers of the horoscope —
not 1,600 users, since a user who does not open it costs nothing. Past that the
High tier is $40 for 500,000, which is the answer; there is no third option
worth engineering around, and a per-rashi reading has now been tried twice.

| | Per day |
|---|---|
| Daily reading | one call per reader who opens it |
| Natal chart | one per account, ever |
| Panchang | one, total |
| Match | one per distinct pair of births, ever |
| Muhurat | one per purpose × place cell × month |

**What has not changed is the vendor.** There is still no sidereal sign-based
daily endpoint: every Vedic spelling of the path returns 404, and the sign
endpoint that does exist (`/api/v2/horoscope/daily/sign`) says in its own
documentation *"Western/tropical zodiac only. This is not compatible with
Vedic/sidereal systems."* **Adopting it is still refused** — a tropical sign
printed beside a Lahiri sidereal chart names two different signs for one person
on two screens, which is the silent wrongness this section exists to prevent.

**Gochara computed here is no longer the named successor.** It was, while the
reading had to serve twelve signs from one call. A per-reader reading does not
need it, and the vendor's own ruleset is better than one we would write.

**One consequence reaches the screen.** The reading's timing windows are
computed at the reader's BIRTH place, while the panchang card beside them is
Ujjain for everybody. Both are named on `/horoscope` — sunrise moves about two
hours across India, and an unnamed clock from somewhere you have never been is
wrong without looking wrong. The reading's own panchang block is still
discarded, for the reason 4 Sep gave: two tithis for one day on two screens.

**The twelve canonical births are deleted**, along with their charts, the
`canon-chart:` and `rashifal:` cache keys and the moon-drift check that guarded
them. `backend/functions/astro/` still contains them, commented out with the
rest of the retired JavaScript backend.

### Matching and muhurat — 22 Sep 2026

Three more endpoints from the vendor already being paid for, and no new
supplier. Both are free tools, like the horoscope and tarot (`01-PRD.md` §3).

| Op | Upstream | Cached as |
|---|---|---|
| Ashtakoota | `POST /api/v2/vedic/match` | `match:<digest>:<digest>` |
| Muhurat, public | `POST /api/v2/vedic/muhurat/search` | `muhurat:<purpose>:<lat>:<lng>:<zone>:<month>` |
| Muhurat, personal | `POST /api/v2/vedic/muhurat/personalized-search` | `muhurat-me:<user>:<digest>:<purpose>:<lat>:<lng>:<month>` |

**The order of a match is part of its key**, because Ashtakoota is not
symmetric — Tara and Vashya read differently from each side. Reversing the pair
is a different question and gets a different call.

**A match key holds two hashes and nothing else.** Either birth may have been
typed about somebody who never signed up, so no name, no date and no account id
goes into the key or the row, exactly as with a subject chart (`01-PRD.md`
§4.4).

**A muhurat is a function of a place**, so the coordinates are rounded to one
decimal — about 11 km, across which sunrise moves some two seconds — and the
ROUNDED values are what go upstream, so the payload stays a pure function of
its key. Everyone in a city shares one row. The search always asks for a whole
calendar month, never "from today", so the key does not change daily; windows
that have passed are dropped in the client. The vendor caps a search at 31
days, which one month satisfies.

**Both muhurat searches need a session**, unlike the panchang. The public one
is not per person, but its key space is large enough (purpose × cell × month)
that an anonymous caller could spend the month's quota by stepping coordinates.
The throttle is the only other guard; a per-user daily cap is the next move if
`astro-usage` ever shows one is needed.

**The personalised search often promotes no moment at all** and returns a
sentence saying why — its strict electional rules reject most sampled moments.
That sentence is the answer in that case, not an error, and `/muhurat` renders
it. The public search never promotes a moment.

Two consequences of a third party that a local service did not have:

- **The key is a secret** (INSTRUCTIONS.md rule 7). An Edge Function proxies
  every call — four CORS headers, key as a function secret. The browser never
  holds it.
- **Birth details leave this system.** Date, time and place for every user, sent
  to somebody else's server. That is a bigger version of the open question
  `01-PRD.md` §8 already carries about email, and it belongs in the same place.
- **Charts now depend on someone else's uptime**, so a failure has to be a
  stated answer rather than an empty screen. This project has already learned
  that a failed read and an absent row must not look alike.

---

## 9. The front-end seam

`src/store.jsx` is the single migration point. Screens reach data either through
`useStore()` or by importing `mock.js` directly, so the work is mechanical.

### The correction

An earlier draft of the backend notes claimed the store functions "keep their
exact signatures — callers do not change." **That is wrong, and it is
money-shaped.**

`spend()` returns a `boolean`. Awaited, it returns a `Promise<boolean>` — and
`if (promise)` is **always truthy**. Five charging call sites break silently,
each of them letting a purchase through that the server refused:

```
src/components/CartSheet.jsx:20    if (spend(cartTotal, ...))
src/screens/Tarot.jsx:52           if (!spend(TAROT_PRICE, ...)) return
src/store.jsx:194                  if (spend(product.price, product.name))   ← inside buyNow
src/screens/Reports.jsx:80         onClick={() => buyNow(r)}
src/screens/Shop.jsx:273, :347     onClick={() => buyNow(p)}
```

The **seam** survives — one file, same function names, same call sites. The
**return contract** does not. Every caller becomes `async`/`await`, and this is
an explicit step in `06-IMPLEMENTATION.md`, not an assumption.

### What else changes

- Screens importing `mock.js` swap to a fetch hook and grow **loading and error
  states**. That is the real work, it is UI work across roughly fifteen screens,
  and it is not backend work.
- `toggleFlag` keeps its optimistic-toggle behaviour and gains a rollback on
  failure. Sticky toggles that lie after a failed write are worse than slow ones.
- The store's hand-maintained dependency array must be updated in lockstep with
  its value object — the file says so, and adding async slices is exactly when
  that gets missed.

---

## 10. Non-functional requirements

### Timezones

Everything is UTC, stored as `timestamptz`. **Birth time is the single
exception** — naive local date and time plus an IANA zone, never a stored offset
and never a timestamp. An offset is a function of a zone *and an instant*, India
has changed its offsets, and applying today's `+05:30` to a 1962 birth shifts
every house cusp with no error raised. Rationale and the exact columns are in
`05-BACKEND-SCHEMA.md` §4.1. **Do not "fix" it to a timestamp.**

Booking slots are IST (`Asia/Kolkata`) and the horizon is **14 days**. Both live
in `consultant_open_slots()` and nowhere else, so they are not invented
separately in three places.

A weekday derived in the browser is the trap here: an IST-anchored midnight is
half past six the previous evening in UTC, so reading the day off it is a day
early. Anchor at noon.

### Text and i18n

`utf8` throughout. Devanagari and IAST-with-diacritics are stored verbatim and
are never case-folded, normalised or transliterated. The app already ships an
en/hi toggle, and content that carries its own translation (deity names, tarot
traditions) keeps it as data rather than as an interface string.

**Sanskrit is never translated** — the `sa` field is scripture, the `iast` field
is its transliteration, and the `en` field is a rendering alongside, not a
replacement.

### Idempotency and retries

Payment webhooks arrive more than once by design. Idempotency is a **unique index
on the provider's own identifier**, not an application-level "have I seen this?"
check — the latter has a race between its read and its write.

Client retries of `POST /bookings` are safe because the slot-claim index refuses
the second one.

### Rate limits

OTP requests per phone per hour. Booking attempts per user per minute. AI
questions per user, which is a quota rather than a rate limit and is enforced
server-side because it is money.

### Performance

The app ships **9.4 MB of images** — 5.8 MB of tarot faces and 3.6 MB of murtis
— referenced by filename rather than imported, so they stay out of the bundle
graph and only the one on screen is fetched. That property must survive the
move to a storage bucket: signed or public URLs, still lazy, still one at a
time.

The JS bundle is ~458 kB raw / ~142 kB gzipped today. Adding a Supabase client
and a payment SDK is the first real growth; watch it rather than assume it.

### Accessibility

Existing behaviour is the floor, not the ceiling: visible focus rings,
`prefers-reduced-motion`, `prefers-reduced-transparency`, ARIA on every icon-only
control, and contrast ratios documented per token **with the surface named**.
Loading and error states added during the backend migration must carry the same.

Note honestly: the high-contrast mode described in the old design doc **does not
exist**. See `04-UI-UX.md`.

### Legal and compliance

- **Consultant KYC gates the first payout.** A legal gate, not a feature.
- **Marketplace tax** — GST and TDS on consultant payouts. Talk to a CA before
  writing payout code, not after.
- **Image licences are a compliance query**, not a credit line. Share-alike art
  is processed into derivatives that inherit the obligation.
- **Astrology advertising is regulated** — disclaimers, and no medical or
  financial claims. The existing copy voice, which promises nothing, already
  helps.

---

## 11. Environments and secrets

| | |
|---|---|
| Local | Vite dev server against the dev project. Functions live under that project's URL, so `VITE_SUPABASE_URL` switches the database and the API together — there is no second base URL to keep in step |
| Staging | Its own Supabase project. **Never point a dev front end at production data** — the first destructive mistake is always this one |
| Production | GitHub Pages for the SPA; functions deployed to the production Supabase project; admin deployed separately |

Secrets live in three places and never move between them: `.env.local` for the
dev front end, gitignored, with a committed `.env.example` carrying the keys and
no values; the GitHub Actions secrets for the production front end; and each
Supabase project's function secrets for anything a function needs. Payment
keys, model keys and the service role key only ever appear in the third.

**The Supabase anon key is the one credential meant to be public**, and it is only
safe because RLS is on. **A table with RLS disabled is a public table.** Service
role keys, payment secrets and model keys are server-side only and never reach a
bundle.

**CORS** is met on day one: a static SPA on `github.io` calling an API on another
origin. Allowed origins are an explicit list, not a wildcard.

---

## 12. Open questions

| Open | Blocks |
|---|---|
| Video SDK — 100ms or Agora | The live phase. Compare pricing at expected minutes |
| Ephemeris reference chart | The chart service. Pick it *before* writing code |
| ~~Chat window semantics~~ | **Answered 1 Sep: neither. Chat is a per-minute live session — `01-PRD.md` §5.1** |
| Refund and cancellation policy | The booking function |
| Charge at booking or at session start | The booking function. Recommending at booking |
| Whether the admin console needs its own auth provider or reuses phone OTP | Phase 4 |
