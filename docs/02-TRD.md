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
| Ask AI | The model key cannot reach a browser, and the quota is money |

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
| Ask AI | Claude, behind a server proxy | The key cannot ship to a browser and the quota is money |
| Ephemeris | **Swiss Ephemeris** | The alternative is being subtly wrong forever |

### The ephemeris is a second service, in a second language

Swiss Ephemeris is the reference implementation and its best-maintained binding
is Python (`pyswisseph`). A ~200-line service taking a date, a time, a place and
a zone and returning planetary positions is a legitimate second process.

JavaScript ports exist and are less proven. Indian astrology is unforgiving about
ayanamsa and house system being exactly right, **and a wrong one is wrong
silently** — the chart renders, it is just not yours. Pick a reference birth
chart with an independently verified result *before* writing the service, or
there is nothing to test against.

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
| Chat window semantics — booking-bound or quota-bound | The chat phase |
| Refund and cancellation policy | The booking function |
| Charge at booking or at session start | The booking function. Recommending at booking |
| Whether the admin console needs its own auth provider or reuses phone OTP | Phase 4 |
