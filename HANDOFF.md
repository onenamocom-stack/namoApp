# Handoff — Namo (aether-mono)

**What is actually true right now.** Front end and backend in one file, because
two files claiming to describe reality means neither gets trusted.

Updated 24 Sep 2026.

| Phase | State |
|---|---|
| 0 · pre-work | Done |
| 1 · auth and profile | Done |
| 2 · wallet | Done |
| 3 · payments in | **Built and deployed. One done-condition short**, blocked on Razorpay's website review. The site is now on `1namo.com` (the move Razorpay's review wanted — §6); registering that domain and its policy pages with Razorpay is the remaining step. Until it clears, live checkout is refused and **production wallets cannot be funded** |
| 4 · consultants, availability, approval | **Done.** Schema, seed and front end live on both projects; its check passes on both |
| **5 · bookings** | **Done and closed.** All four done-conditions pass on dev, walked in a browser. `012` and `013` are both on both projects |
| **6 · metered chat** | **Done and closed.** On both projects, front end deployed, all six done-conditions verified — the last was a look at the chat bubbles, taken 3 Sep (§6) |
| **7 · charts** | **Done and closed.** Both projects, front end deployed, all three done-conditions pass. The reference chart was verified by arithmetic that does not go through the API, so the check survives them changing or going away |
| **7a · reading, matching, muhurat** | **On `main` and deployed, 23 Sep.** The daily reading is computed from the reader's own birth again — reversing 7 Sep — and `/match` (Ashtakoota) and `/muhurat` are new. **Never walked in a browser** — §29 |
| **2a · tarot** | **Reworked 24 Sep on `tarot-flow`, not merged.** Typed question, server-dealt card, the reading written by the model. The two free pulls a week were a browser flag that a reload cleared — they are a server column now — §30 |
| **UI · Home, Bhakti, header, avatars** | **On `main` and deployed, 10 Sep.** Live video deleted both sides; Home split into Feed/Today/Darshan; shrine moved to `/darshan`; Bhakti holds the nav slot; the horoscope slide-over deleted for a page; Shop's cart is a floating button; your own profile picture works. **024–027 are all on production (13 Sep)** — production has no `bhakti_assets`, so `/bhakti` there shows its empty state until they are applied. **Never walked in a browser** — see §5 |
| **9 · reviews and content** | **Done and closed.** Both projects, front end deployed, all three done-conditions walked in a browser on dev (9 Sep) and the check passes on both. Two bugs the walk found are fixed — §8 |

**Production has one real consultant**, who applied through `/pro/apply` and was
approved by hand — the entire approval flow until phase 13. They have **no
availability rows**, so nothing is bookable until somebody taps cells in
`/pro/consult`.

**The six seeded consultants are still `pending` on production, and the plan for
them changed on 9 Sep.** `01-PRD.md` §7's launch-empty decision was partially
reversed: the FEED is to be seeded from them until real consultants publish, the
MARKETPLACE is not. `backend/seed/content.mjs` approves them for authorship and
then deletes their availability, deactivates their per-minute services and
clears their fabricated credentials — so they can post and cannot be booked,
chatted or believed. Nothing has been seeded yet on either project.

**Content is loaded from the BACKEND, not typed into the studio, and that is a
decision rather than a shortcut** (9 Sep). It holds for real consultants as much
as for the seeded six: a partner arriving with a lot of posts and reels is not
going to sit in `/pro/studio` uploading them one at a time. `content.mjs` takes
a real consultant's profile UUID for exactly that. The studio remains the path
for a consultant posting one thing they just wrote; it is not the path for
volume.

**Parked, deliberately.** The tool is written and the route is decided; nobody
has run it against a database. Picking it up needs media files, a manifest and
the service-role key — §8 has the shape and the untested edges.

This file describes **state**. It does not describe the system — that is
`docs/` — and it is not a changelog. History lives in `git log`, which is
better at it. When something here stops being true, rewrite the line.

---

## Start here

Enough to pick the project up cold.

```bash
npm install
npm run dev -- --port 5260     # any free port
npm run build                  # proves less than you think
npm run lint                   # proves the part the build cannot
```

**Two Supabase projects, and never mix them.** Rules in
`backend/INSTRUCTIONS.md` §3.

| | Project ref | Reached by | Holds |
|---|---|---|---|
| **Production** | `talqzgolttfgdzcoaqno` | the deployed site only | real accounts, real money, one live consultant |
| **Dev** | `mrjsatelbuiypodeulcx` (`namo-dev`) | `npm run dev`, `.mcp.json`, agents | throwaway |

`.env.local` (gitignored) and `.mcp.json` both point at **dev**. Production
credentials live only in the GitHub Actions secrets. A **third** store arrived
with phase 3: each project's Edge Function secrets, holding everything a server
function needs and the browser must never see. Nothing moves between the three. If `.env.local` is
missing, copy `.env.example` and fill it from the dev project's Settings → API.

**Signing in on dev costs nothing.** Test OTP is configured: phone
`+919999900001` or `+919999900002`, code `123456`, no SMS. Type `9999900001`
into the ten-digit field — the `+91` is fixed in the UI. Two numbers, so the
"a second account sees only its own data" check needs no second phone.

**Live:** https://1namo.com/#/home  (apex custom domain on GitHub Pages;
`atharvborse2004-ops.github.io` now 301s here). Pushing to `main` deploys
automatically, ~40s. `HashRouter`, so GitHub Pages needs no config for
sub-routes.

### The checks

Six runnable checks live in `backend/schema/`. Run the ones whose area you
touched, in the **dev** SQL editor.

| File | Covers |
|---|---|
| `003_wallets_ledger_check.sql` | the wallet: balance cache, refusals, replay, double-tap |
| `006_payments_check.sql` | payments: idempotency, a failure leaving no ledger row |
| `009_slots_check.sql` | consultants: slots on all seven weekdays, approval, bands, grants |
| `012_bookings_transaction_check.sql` | bookings: the transaction, the refusals, the reversing credit, both books append-only, the new policies |
| `014_metered_chat_check.sql` | chat: the hold, the round-up, the cutoff, the sweeper, and the live-session gate on messages |
| `019_astro_cache_check.sql` | charts: the cache table's shape, RLS on, and **zero policies** — service role only |
| `020_content_reviews_check.sql` | content and reviews: draft and blocked-consultant leaks, counts starting at zero, **the review anti-fraud gate**, `verified` derived, the rating cache reproducing its source, and a stranger reading counts but not who is behind them |

**Passing looks like a failure:** `ERROR: PHASE 2 CHECKS PASSED`, and the same
shape from the other five. Each raises on its last line to roll back every row it
wrote — the ledger is append-only, so a check that inserted real rows could not
clean up after itself. Any other error names the assertion that broke.

Each needs at least one profile to exist, and each measures **relative** to
whatever is already there, so they can be run repeatedly against a database
with real data in it.

---

## Where to read what

| Question | File |
|---|---|
| What is this product, who uses it, what does it cost | `docs/01-PRD.md` |
| Stack, trust boundary, API surface, admin isolation | `docs/02-TRD.md` |
| Routes, screens, actions, state machines | `docs/03-APP-FLOW.md` |
| Tokens, components, the design system | `docs/04-UI-UX.md` |
| Tables, columns, RLS, seed plan | `docs/05-BACKEND-SCHEMA.md` |
| What gets built in what order | `docs/06-IMPLEMENTATION.md` |
| The rules every phase obeys | `backend/INSTRUCTIONS.md` |

---

## 1. Front end

**Complete as a prototype.** Vite 5 · React 18.3 · Tailwind 3.4 ·
`react-router-dom` 6.28 · plain JSX. Three runtime dependencies. No icon
library, no state library, no UI kit, no type checker, no tests. There **is** a
linter as of 7 Sep — five rules, no style opinions, `npm run lint`; see "There
is a linter now" under §5.

Two sides in one codebase. Most values on screen still come from
`src/data/mock.js` and `src/data/bhaktamar.js`. Five things are real:

- **Identity and birth details** (phase 1). The onboarding questions plus phone
  verification write a `profiles` row; Profile, Chart and Horoscope read it back.
- **The wallet** (phase 2). Balance and ledger are server rows read under RLS,
  and every debit is decided by a server function. Nothing in the browser can
  move either.
- **Top-up** (phase 3). Razorpay checkout, credited by a webhook.
- **The whole consultant surface** (phase 4). Who a consultant is, what they
  charge, when they are open, and which requests are waiting. `/consult`,
  `/consult/:id` and every `/pro` screen read real rows; the availability grid
  and accept/decline write them.
- **Charts, the panchang and the daily reading** (phase 7). Computed from the
  signed-in person's own birth row by the `astro` Edge Function and memoised in
  `astro_cache`. `/chart`, `/chart/:id`, `/horoscope`, the horoscope overlay and
  both computed cards on `/home` are real, **on both projects and deployed**.

Everything else evaporates on reload, deliberately.

### Structural facts worth knowing before touching `src/`

- **`HashRouter` is mounted above `AppProvider`** so the store can read the URL.
  `isPro` is derived from the pathname. **Do not add a persisted role** — it can
  disagree with the address bar.
- **`src/store.jsx` is one context** with a large `useMemo` and a
  **hand-maintained dependency array**. The value object and the dep array must
  both be updated or the context goes stale intermittently.
- **`flags` is the extensibility hatch** — a `Set` of namespaced strings with
  `hasFlag` / `toggleFlag`. Reach for it before adding a store slice. It carries
  `like:` · `save:` · `follow:` · `remind:` · `tarot:free1|free2` ·
  `setting:croppedDeityImage`. Phase 4 removed three of them —
  `accept:` and `decline:` are `bookings.status` writes now, and
  `closed:{day}:{time}` is a row in `consultant_availability`.
- **Everything reusable is in `src/index.css`** under `@layer components`. Read
  it before writing markup.
- **`.subnav` is deliberately dead code.** Do not clean it up without asking.

### The money and identity contracts

- **`spend()` returns a promise.** It used to return a boolean and every caller
  used it as one. `if (spend(...))` is truthy whatever the server said, so a
  missed `await` is a purchase that was refused and went through anyway. All
  four charging call sites await it: `CartSheet.jsx`, `Tarot.jsx`,
  `Reports.jsx`, `Shop.jsx` (×2). A second guard sits in the store as a **ref**
  — two taps land in the same tick and state set by the first has not applied
  by the second — so a button that forgets its pending state still cannot
  double charge.
- **`balance` is PAISE and it is `null` until loaded.** Rupees live only in
  `mock.js` and in what the user reads; `rupees()` is exported from `store.jsx`
  and is the one place money becomes text. A screen comparing `balance` to a
  mock price needs the hundred — `Tarot.jsx` is the one that does. `null`
  renders as an em dash: a wallet flashing zero at someone who has money is
  worse than showing nothing yet. `rupees()` prints whole rupees whole and
  anything with paise to two digits — ₹2,248.5 is a number that happens to be
  money, not a price, and it reached a screen once when a band divided unevenly.
- **`useProfileFields()` is what screens read for identity.** Signed in, it
  returns the real row or blank — never the seed person, because a signed-in
  user seeing the mock name and birth details would get a chart drawn for a
  birth that is not theirs, permanently if the fetch failed. Signed out it
  returns seed, which is the demo. **Never read `mock.js`'s `user` directly in a
  screen that shows identity** — that bug has shipped twice.
- **`useConsultantFields()` is the same contract on the other side**, added in
  phase 4 and obeying the same rule: signed in it returns the real
  `consultants` row or blank, **never `consultants[0]`**. `mock.js` still
  supplies the fields no table holds yet — followers, rating, published content
  — and phase 9 takes those. The store's `me` follows it on both sides now; it
  used to hand a signed-in seeker the seed person's initials on every tab.
- **`consultantError` is not the same as no row.** A failed read and "you are
  not a consultant" are different answers, and conflating them sent a working
  consultant to the application form. Anything gating on `consultant` must
  check the error first.
- **Sun, moon and rising are computed** as of phase 7, by `useMyChart()` in
  `src/lib/astro.js`. They are **not** on `useProfileFields()` any more and must
  not go back: that hook is called on screens with no interest in a chart, and a
  fetch inside it would spend a request on every one of them.

  The note this replaces said four screens printed the signs —
  `Computing.jsx`, `HoroscopePanel.jsx`, `Shop.jsx` and the hook. **It was five.**
  `Profile.jsx` prints them twice, in the header and in the horoscope tab, and
  the count missed it. Grep before trusting a list like that again.
- **`rising` is null when the birth time is unknown**, never a substituted
  value, and every caller decides what to say about that. The ascendant moves a
  whole sign every two hours, so the alternative is a precise wrong answer.

### Screen-level facts that are not obvious from the code

- **Pooja swipe axes:** right/left = deity, down/up = murti. Guarded by
  `node tools/verify-pooja-swipe.mjs`.
- **Deity images are uncropped by default.** `setting:croppedDeityImage` is an
  **opt-in back to the crop**, so its absence is the common case.
- **The free-tools row lives on `/consult`, above the search field** — moved
  off `/home` on 7 Sep 2026, reversing the earlier move in the other direction.
  It renders in Consult's empty-roster branch too, deliberately: production's
  roster is empty by decision, so the other branch would hide the free half of
  the app from every real user. Home now opens straight into the stream.
- **Tarot is a guided flow**, deck then question then card, the first two as
  centred modal dialogs. Two free pulls a week, then the wallet is charged.
- **Three chart systems** — Vedic, South Indian, Western. `chartSystem` on the
  store, so Profile follows the choice made on `/chart`.
- **Hindi and English** via `src/data/i18n.js` and `t()`. Chrome, mandir and
  tarot are translated; the editorial copy in `mock.js` deliberately is not.
  Noto Sans Devanagari sits **after** Plus Jakarta Sans in the stack — browsers
  resolve per glyph, so Latin is untouched.
- **Pro nav is Earnings / Studio / Consult / Profile.** Four tabs since 9 Sep
  2026, no Feed — a consultant runs a practice, she does not browse the seeker
  feed. Go Live was the fifth until live video was deleted; `/pro/live` now
  falls to `/pro/*` and lands on Studio.
- **Seeker nav is Home / Bhakti / Consult / Shop / Academy.** Pooja held the
  second slot until 9 Sep 2026. The shrine did not shrink — it moved to
  `/darshan`, full screen with a back control, reached from Home's third tab.
  The slot now carries Bhakti, the devotional media library.
- **Home has three tabs** — Feed / Today / Darshan, at `/home/:tab`. Today is
  the reading and the panchang, which used to be spliced into the stream.
  Darshan is a doorway: it redirects to `/darshan` with `replace`, so Back from
  the shrine lands on the feed and not on a tab that forwards again.
- **The top bar is logo · wallet · message · profile.** Profile moved right and
  the wallet joined it on 9 Sep 2026; the balance is text rather than a glyph
  and reads an em dash until it loads. `public/namo-logo.png` is the supplied
  JPEG with its white keyed to alpha — the original is black on solid white and
  renders as a slab on this canvas.
- **Profile is two tabs, Overview and Settings.** Horoscope and Wallet were
  tabs until 9 Sep 2026 and are now Home's Today tab and the top bar.
- **`/pro` is gated on a real `consultants` row** as of phase 4 — it used to be
  exempt from the session gate entirely, which is how anyone who typed the URL
  became `consultants[0]`. No session, or no row, lands on `/pro/apply`. Still
  exempt are the two seeker routes it links out to: `/chart` (a booking row's
  "view kundli", prefilled from query params) and `/consult/:id` ("view your
  public page"). `/home` from "Switch to seeking" is **not** exempt — that one
  is genuinely asking for the seeker app. Note `/profile` starts with the four
  characters `/pro`, so the check is on a segment boundary.

---

## 2. Backend — phases 1 to 7

**All four phases are built and applied to both projects.** Migrations are
numbered SQL files in `backend/schema/`, forward-only. There is no
`supabase/migrations` dir, so those files are the record of what ran, not the
thing that ran it — keep the two in step by hand.

| File | What |
|---|---|
| `001_profiles.sql` | `profiles`, RLS, the column grant, `handle_new_user` |
| `002_profiles_email.sql` | `profiles.email` |
| `003_wallets_ledger.sql` | `wallets`, `ledger`, both triggers, `wallet_debit` |
| `004_refuse_mutation_search_path.sql` | lint fix; 003 had already run |
| `005_wallet_debit_drop_client_ref_type.sql` | removed a client-settable `ref_type` |
| `006_payments.sql` | `payments`, RLS, `payment_capture()` |
| `007_consultants.sql` | `price_bands` (seeded), `consultants`, `consultant_services`, `consultant_availability`, `consultant_time_off`, RLS, the column grants, `consultants_public` |
| `008_bookings.sql` | `bookings`, the partial unique slot claim, read-own and the accept/decline policy |
| `009_slots.sql` | `consultant_open_slots()` — the one slots source |
| `010_bookings_view.sql` | `bookings_view`, which carries the other party's name |
| `011_round_price_bands.sql` | derived band prices to whole rupees; restores the six the PRD names |
| `012_bookings_transaction.sql` | `orders`, `order_items`, `earnings_ledger`, `book_session()`, `booking_reverse()` and the decline trigger. On both projects |
| `013_booking_review_fixes.sql` | Four defects found by review of 012. On both projects |
| `014_metered_chat.sql` | `sessions`, `threads`, `messages`, the meter, the sweeper, `threads_view`. **Dev only** |
| `015_realtime_publication.sql` | Publishes `messages` and `sessions` to Realtime. **Dev only** |
| `016_thread_preview.sql` | Keeps `threads.last_preview` in step, by trigger. **Dev only** |
| `017_no_hold_cap.sql` | Removes the 30-minute hold cap. **Dev only** |
| `018_session_review_fixes.sql` | The accept row lock, request dedupe and expiry, mode guard, non-client reason. **Dev only** |

**Four `_check.sql` files sit beside them and are tests, not migrations.**
`003_wallets_ledger_check`, `006_payments_check`, `009_slots_check`,
`012_bookings_transaction_check`. They never
appear in a replay. Each raises on its last line to roll back every row it
wrote, so **passing looks like an error**: `ERROR: PHASE N CHECKS PASSED`.

**A fresh project is the twelve files in order.** Dev was built that way, which
is the proof they reproduce the system from nothing rather than describing what
once happened.

**Dev is reached through the MCP; production is not.** `.mcp.json` is pinned to
dev on purpose, so no agent session can write to real data — `007`–`011` were
replayed to production by hand in the SQL editor. Production's
`supabase_migrations` table therefore carries no rows for them. That is
expected; the files are the record.

### Phase 1 — identity

`profiles` matches `docs/05-BACKEND-SCHEMA.md` §4.1. RLS on, both policies
`id = auth.uid()`.

- **No client INSERT policy, by design.** The row is created server-side by a
  `security definer` trigger the instant `auth.users` gets a phone signup; the
  client only ever `UPDATE`s the row that already exists.
- **The UPDATE grant is column-scoped.** `authenticated` may write
  `name` and `birth_*` and cannot touch `admin`, `phone`, `legacy_id`, `id` or
  `created_at` even on its own row. Row-scoped RLS alone would have let a
  signed-in client grant itself `admin`.
- **`profiles.email`** is required at the onboarding screen but nullable and
  not unique in the column, and never an auth factor. **Its purpose is an open
  regulatory question** — see `docs/01-PRD.md` §8 before the first marketing send.
- **Birth time is naive local plus an IANA zone**, never a timestamp and never a
  stored offset. `AskPlace.jsx` searches Open-Meteo's geocoder because it
  returns the zone with each hit; `birth_zone` was once hardcoded
  `Asia/Kolkata`, survivable only while every option was Indian. **Licence
  problem: that geocoder's free tier is non-commercial and this product is
  not** — `docs/01-PRD.md` §8 before launch.
- **The onboarding draft lives in `sessionStorage`.** Reading the SMS means
  leaving the app, and an evicted page created an account with no birth details,
  silently. That is what landed the first live signup an empty row.
- **Onboarding never overwrites an existing birth record.** `Computing.jsx`
  waits for the profile to load and, if `birth_date` is already set, signs
  them in and leaves the row alone — which is what makes the sign-in route
  below safe to skip straight to the phone step with an empty draft.
- **There is now a sign-in-only route** — `AskSide.jsx` carries a "Sign in
  instead" link under each card, straight to `/onboarding/phone?mode=signin`
  (`&next=pro` for the consultant side), skipping name/date/time/place
  entirely. `AskPhone.jsx` in that mode drops the email field, calls
  `signInWithOtp` with `shouldCreateUser: false` so a number with no account
  is refused rather than silently minted, and shows "Create one instead"
  on that refusal. Nothing downstream needed to change: `VerifyOtp.jsx`
  already sent a non-pro verification to `Computing.jsx`, which already did
  the right thing with an empty draft against an existing birth record.

**Phone auth on production is Twilio Verify.** The route cost most of the setup
time, so it is written down:

- **Not Twilio's plain Messaging API.** A US long code sits behind A2P 10DLC
  registration and Twilio leaves messaging *disabled* until it clears — days,
  and money. The first attempts died on error `21704`.
- **Twilio Verify** picks compliant senders per country itself: no owned
  number, no A2P registration, no DLT work. In Supabase pick `Twilio Verify`
  and give it the **Verify Service SID** (`VA...`), not a messaging service SID.
- **The test-OTP field needs both halves** — the number-and-code pairs *and* the
  valid-until. The code alone is rejected. Dev uses this; production does not,
  and **must not**: there those numbers are a way into a real wallet.

**Both done-conditions pass.** Sign in, close the tab, reopen — still signed in,
details intact, `created_at` still the original signup instant. And a second
account sees only its own rows: on dev, account 2 returns exactly one profile,
its own, with the other's id returning an empty array when asked for directly.

### Phase 2 — wallet

`wallets` and `ledger` per `docs/05-BACKEND-SCHEMA.md` §4.6. `earnings_ledger`
is deliberately **not** here — it references consultants and bookings and ships
inside phase 5's booking transaction.

Four things to know before touching it:

- **The balance cache is maintained by an `after insert` trigger on `ledger`**,
  not by whoever writes the row. This was not in the plan. A cache each writer
  must remember to update is one that eventually disagrees; this way replaying
  the ledger reproduces the balance because the balance *is* that replay. It
  also makes a hand-typed credit correct by construction, which is how test
  wallets get funded — recipe at the foot of `003`.
- **Neither table has a write policy for anybody**, and `authenticated` has no
  `INSERT`/`UPDATE`/`DELETE` grant on either. Only `wallet_debit()` writes, and
  it takes a row lock so two debits serialise rather than both reading the same
  balance. `wallets` also has a `balance_paise >= 0` CHECK as the backstop
  under a function nobody has written yet.
- **`wallet_debit()` takes the amount and label from the client and nothing
  else.** The amount is within rule 3, which bans a number the *user benefits
  from* — a debit is not one. It is shaped this way because there is no
  server-side catalogue until phases 8 and 10; phase 5's booking is the first
  purchase whose price the server looks up for itself.
- **Phase 2 shipped no credit path at all**, because a client-callable credit
  before a payment provider is a mint. Phase 3 opened one, and it is still not
  client-callable: see below. The payment-method tags stay out of `Wallet.jsx`,
  and the **cashback label is deleted** rather than deferred — it was never
  applied and must not be on screen when real money moves.

**All four done-conditions pass.** Devtools cannot change a balance — every
write returns 403 at the grant level. An over-balance debit is refused *by the
server* with the string the UI already showed. The ledger replays to the stored
balance exactly. And three clicks fired in a single tick produced exactly one
ledger row, a stricter test than a human double-tap.

### Phase 3 — payments in

**Built, deployed to both projects, and one done-condition short.** The code is
written, `006` is applied on dev and production, both Edge Functions are
deployed with live secrets, and the replay and failure checks pass. What has
not happened is anyone putting a card through it — blocked on Razorpay's
website review, not on work. The table below says exactly where the line is.

`payments` per `docs/05-BACKEND-SCHEMA.md` §4.8, plus two Edge Functions in
`backend/functions/` — the first server functions in the project.

| | |
|---|---|
| `razorpay-order` | `verify_jwt = true`. Validates the band, opens a Razorpay order, writes the `created` row |
| `razorpay-webhook` | `verify_jwt = false`. Verifies the HMAC, then calls `payment_capture()` |

- **`payments` holds one row per event, not per payment.** Both unique columns
  are nullable so the `created` row can carry neither id yet, and Postgres lets
  nulls repeat in a unique index. The row carrying a `provider_payment_id` is a
  terminal outcome and there can only be one per Razorpay payment.
- **Idempotency is the unique index, and it is load-bearing in an unusual way.**
  `payment_capture()` inserts the event row and the ledger row in one block. A
  retried delivery violates the index, the handler catches it, and plpgsql
  rolls the whole block back — *including the credit that had already run
  inside it*. There is no window between checking and crediting because there
  is no check. It returns `ok: true, duplicate: true` so Razorpay stops
  retrying.
- **The wallet is found through the `created` row**, matched on the order id,
  never through the payload's `notes` — those round-trip through the client.
  A payment that matches no order raises rather than guessing. That means the
  webhook returns 500 and Razorpay retries an unattributable payment for a
  while, which is the loud half of the mistake and the right half.
- **The amount credited is Razorpay's**, read from a payload whose signature
  was checked first. The browser chooses what to *pay*; it never influences
  what is credited. That is what keeps the custom-amount field inside rule 3.
- **`payment_capture()` is not granted to `authenticated`** — only to
  `service_role`. The security advisor confirms it: it flags `wallet_debit` as
  callable by signed-in users, which is intended, and does not flag this one.
- **The balance is untouched by any of it.** The phase 2 trigger on `ledger`
  moves it, so a credit and the cache cannot disagree.

**Front end:** the top-up sheet is back in `Wallet.jsx` — four presets and a
custom amount — and `topup()` sits next to `spend()` in the store. It is the
one money path that does not end inside the tap that started it: the credit
arrives via a webhook on a different connection, so `topup()` polls the balance
for about twelve seconds and then says the payment is settling. Razorpay's
checkout script is fetched on first use rather than from `index.html`.

**All four done-conditions pass, on dev, in a browser.**

1. **Two clients racing one slot.** Six concurrent requests for
   `2026-09-02 05:30+00`, two accounts, six pre-connected sockets released by a
   barrier: **one booking, one refusal from the unique index** (*"Someone just
   took that time"*), four from the pre-check. Then the counts that matter —
   6 bookings, 6 orders, 6 order lines, 6 debits, 6 earnings rows, exactly
   matched. **The five refusals wrote nothing.**

   The first attempt at this proved less than it looked like: both racers came
   back refused *by the pre-check*, which means one had already committed before
   the other read the slots — a sequential test in a concurrent costume. The TLS
   handshake was the whole race. `race.py` now completes every handshake before
   the barrier, so only the send is racing. **A concurrency test that never
   shows the contended path is not passing, it is not running.**
2. **A decline restores the balance via a new row.** Walked: booked at ₹1,499,
   wallet ₹5,005 → ₹3,506, declined from `/pro/consult`, wallet back to ₹5,005
   with a `Refund · session +₹1,499` row sitting *above* the untouched debit.
3. **gross − fee = net.** `/pro/earnings` shows the pair — `Atharv · 20 min
   ₹1,499 − ₹269.82 = +₹1,229.18` and `Reversed · declined … −₹1,229.18` —
   cancelling to zero. 18% of ₹1,499 has paise in it, and that is the true
   number, not a rounding bug.
4. **Survives a reload on both sides.** Seeker: *Your sessions* on `/consult`
   after a hard reload. Consultant: the request in the `/pro/consult` queue
   after one.

Two things the walk caught that a green build never would:

- **A reversed earnings row rendered `₹-1,499 − ₹-269.82`** — two minus signs
  saying one thing badly. The sign belongs on the net figure; the sub-line takes
  absolute values now.
- **Switching accounts by hash navigation does not switch accounts.** `#/wallet`
  → `#/pro/consult` is a hash change, so supabase-js keeps the old session in
  memory and the pro queue renders empty for a consultant who has requests. Only
  a real reload swaps it. Worth knowing before trusting any two-account walk.

**APPLIED TO PRODUCTION BY MISTAKE, AND ONLY TO PRODUCTION.** This is the
important line in this section. Every `apply_migration` and `execute_sql` in the
phase 5 session landed on production, and `.mcp.json` was correct the whole time.

**The cause: two MCP servers both named `supabase`.** The project's `.mcp.json`
carried the dev ref; `~/.claude.json` carried a server of the same name on the
production ref, and the user scope wins. `mcp__supabase__get_project_url`
returned `https://talqzgolttfgdzcoaqno.supabase.co` and that was the truth.
**Both files now point at dev** — the user-scoped one was repointed, not
deleted, so nothing outside this repo lost its server. Production is reached by
pasting SQL into its editor by hand, which is the design.

**Dev got `012` afterwards**, pasted into its SQL editor by hand — the reverse
of every phase before it, where dev came first and production was the replay.

It took an hour to see, because it presents as a stale PostgREST schema cache:
`book_session` returns `PGRST202` and `orders` returns `PGRST205` over REST
while phase 4's objects resolve fine — because the REST calls use `.env.local`,
which correctly points at dev, and dev genuinely does not have the function. The
tell that was missed: an unfiltered REST read of `consultants` returned a
different consultant than the MCP said was the only approved one. **Two answers
to one question means two databases, not a cache.**

**What was written to production, and what was done about it.** All of it is
reversed; the schema stays.

| Written | State |
|---|---|
| `012_bookings_transaction.sql` in full | **Left in place.** It is the migration production was getting anyway, and it passes there. Unlike `007`–`011` it went through the MCP, so production *does* carry a `supabase_migrations` row for it |
| ₹57,000 of "Added money" ledger credits across two real wallets, one of them a real person's | **Reversed** by matching `Correction` rows. Both wallets back to 0, and every wallet on the project replays to its stored balance |
| 6 bookings with orders, debits and earnings rows | **Declined**, which put them through `booking_reverse` — all six net to zero in both books, all six orders `refunded` |
| ~40 `consultant_availability` rows on the one real consultant, who deliberately had none | **Deleted.** Back to the two rows they had. This was the urgent one: it made a real practice publicly bookable at times nobody opened |
| `tmp_cache_probe()`, a comment on `book_session` | Dropped / harmless |

The incident is also the only reason done-conditions 2 and 3 have been seen
against real rows at any scale: six bookings unwound cleanly through the
trigger, six orders to `refunded`, every earnings pair cancelling to zero.

**The security advisor is clean on the new work** — RLS on all three tables, no
missing-policy lint, and `booking_reverse` does not appear in the "signed-in
users can execute" list because it is granted to nobody. `book_session` does
appear, which is intended and is the same class as `wallet_debit`.

### Phase 5 follow-up — what the review found

A review of the phase 5 diff on 31 Aug found ten things. It also confirmed the
parts that mattered: the slot claim really does precede the debit on every
refusal path, the savepoint semantics hold, `order_items_select_own` is properly
qualified (the phase 4 collapse is not repeated), the grants are right, and the
basis-point arithmetic satisfies rule 1.

**`013_booking_review_fixes.sql` is applied to BOTH projects.** The check passes
on dev with assertion 10 covering the reversal index, and production was
verified by inspection: the index exists and all three function fixes are in the
live definitions.

**Re-running `013` raises `42P07`, and that is expected.** The three function
statements are `create or replace` and replay fine; `create unique index` does
not. If it ever needs re-running, skip that first statement. It is not edited to
say `if not exists` because it has run against real databases, which makes it
history (`INSTRUCTIONS.md` §2) — re-runnability is a property of the next
migration, not a retrofit to this one.

- **The reversal guard was a check-then-insert race** — the exact pattern rule 6
  bans. Two reversals at once (an admin calling `booking_reverse` for a platform
  failure while the consultant taps Decline) both read no refund row and both
  credit. Now a partial unique index on `ledger (ref_id) where ref_type='refund'`,
  with the duplicate caught rather than checked for — phase 3's shape, borrowed.
- **`P0001` is not a private sentinel.** It is the SQLSTATE of every bare
  `raise exception`, including `refuse_mutation()`. Latent today, but the first
  trigger on any of the four tables that raises plainly would have told a seeker
  "Not enough balance" with an unrelated balance figure. Now `WB001`.
- **A zero-price service threw a raw error** instead of refusing, because
  `ledger` rejects a zero delta. Guarded with a reason.
- **The earnings row was labelled with the consultant's own name**, so their book
  read as their own name repeated. Each party's book now names the other party.

Two front-end fixes are already live in the code and walked on dev:

- **The booking sheet did not reload slots after a SUCCESSFUL booking**, only
  after a refusal — so reopening it offered the slot you had just taken, and
  confirming it said "Someone just took that time" about yourself. Verified
  fixed: 11:00 present before, absent on reopen.
- **Raw enum statuses were rendered to seekers**, and everything except
  `declined` was painted green — a cancelled or missed session read as success.
  Now a seven-status map; `pending` reads "Awaiting reply".

Two more went into the check file: assertion 8 pins the per-minute refusal to
its actual words rather than accepting any refusal, and assertion 9 now tests
the ALLOW direction of the new policies too — an over-restrictive policy would
have left `ProEarnings` permanently empty and still reported PASSED. A new
assertion 10 covers the reversal index.

**One finding is not fixed, on purpose: a consultant who never answers.** Money
is taken at `pending`, the only reversal is a decline, and the seeker has no
rights over the row — so an unanswered request holds their money indefinitely
and leaves a positive earnings row phase 12 would pay out. The manual remedy
exists (`booking_reverse(booking, 'no answer')`). What is missing is a deadline,
and that is a product decision: too short and a consultant loses bookings to a
slow morning, too long and a seeker's money is held for a week. Logged in
`01-PRD.md` §5.4 and in §4 below.

### Phase 6 — metered chat

**Built, walked on dev, and DEPLOYED to the live site.** Five migrations:
`014_metered_chat.sql`, `015_realtime_publication.sql`, `016_thread_preview.sql`,
`017_no_hold_cap.sql`, `018_session_review_fixes.sql`, plus
`014_metered_chat_check.sql` beside them — eleven assertions, all relative, all
passing on dev.

**Applied to production 1 Sep and verified there**: `3` tables, `5` functions,
`threads_view`, `messages` published to Realtime, and `pg_cron` reporting
`ext=1, job=1, job_active=true`. The front end went first and the schema
followed, which is the deliberate order — a front end arriving early is
harmless, a metering bug on a live wallet is not.

**Chat is therefore live on production.** The one approved consultant
(`57da8a0e`) has an active per-minute service at ₹37/min, and `session_request`
needs exactly that plus `status = 'approved'`. Nobody can pay for one yet:
production wallets cannot be funded until Razorpay clears the domain, and the
only funded production wallet is that consultant's own — who cannot chat with
themselves. The six seeded consultants have per-minute rows and are still
`pending`, so they remain unreachable. When content seeding approves them
(§8), `content.mjs` deactivates exactly those per-minute rows — an approved
consultant with an active per-minute service can be sent a chat request that
nobody will ever answer.

**Production runs on Supabase's FREE tier.** Worth knowing now that a scheduled
job guards money: a free project that goes genuinely idle can be paused, and a
paused project runs no cron. A live site with users should not idle, but if
production is ever quiet for a week, the sweeper is the thing that stops.

Chat is per-minute and live, so this phase is the meter as much as it is chat.
Phase 11 inherits both.

- **Hold and settle, not a debit per minute.** Accept locks the wallet, works
  out the affordable minutes, takes the WHOLE hold and stamps `expires_at`. End
  works out the real duration from the server's timestamps and credits back
  what was not used. **Two ledger rows per session, not fifty.** The wallet
  cannot go negative because the money is already gone, and the cutoff is a
  timestamp rather than a countdown — a paused tab, a dead heartbeat or a lying
  clock cannot buy a free minute.
- **Asking costs nothing.** `session_request` moves no money; the clock starts
  on the consultant's *accept*. A consultant who never answers has cost the
  seeker nothing, which is the opposite of a booking — that charges up front
  because it claims a slot somebody else wanted.
- **Earnings are written at the END**, not at accept, because until the
  conversation stops nobody knows what was used.
- **The sweeper is not optional.** `session_sweep()` runs every minute under
  `pg_cron` (`jobid 1`) and settles anything past `expires_at` or silent for
  60 seconds. Without it an abandoned session holds the seeker's money forever
  and nothing notices — the silent shape this project already paid for once.
- **Messages are gated on a live session** by the INSERT policy, so outside a
  paid window the transcript is read-only. That is what stops chat being free
  to anyone who never presses End.
- Three constants, named once in the functions: 60s grace, round UP with a
  one-minute minimum, accept-before-clock.
- **No cap on the hold — removed 1 Sep (`017`).** Accept holds every minute the
  wallet can buy, so nothing cuts a reading short while there is money left.
  The knowing cost: a seeker's wallet reads ₹0 for the length of a chat and
  nothing else in the app can be bought until it settles. A rolling hold is the
  fix if that bites; the shape is in `017`'s header.
- **While a chat is live the seeker cannot buy anything else** — not another
  chat, not a booking, not a report. Their whole balance is held until the
  session settles. That is the direct consequence of having no cap, and it is
  a standing fact about the product rather than a bug. The phase 6 check proves
  it sideways: assertion 3 had to switch to a SECOND seeker to test "one live
  session per consultant", because the first seeker's second request is refused
  for want of money before it ever reaches the unique index.

**Walked end to end on dev, both sides:** seeker asked from `/consult/:id`,
consultant saw the request in `/pro/consult` with the rate on the row and
joined, the meter ran at ₹75/min, messages went both ways, and ending settled:

| | |
|---|---|
| Real duration | 2.80 min |
| Billed | **3** — rounded up |
| Charged | ₹225 at ₹75/min |
| Hold, then refund | ₹2,250 held (the cap), ₹2,025 back |
| Earnings | gross ₹225, fee ₹40.50, net ₹184.50 |
| Ledger rows | two |

**Where the six done-conditions stand — checked 1 Sep, both sides.**

| # | Condition | State |
|---|---|---|
| 1 | Seeker→consultant without a reload, **attributed correctly on both** | **Delivery yes** (Realtime, watched live). **Attribution yes at the data layer**: the same two rows come back MINE/THEIRS on one side and THEIRS/MINE on the other. **The pixels are unverified** — Chrome's MCP was down; nobody has seen the bubbles render |
| 2 | Nobody reads a thread they are not in | **Yes** — check assertion 11 |
| 3 | Unread clears on open, **right side only** | **Yes** — `(2,1)` → `(0,1)`: cleared for the consultant who opened it, untouched for the seeker |
| 4 | Ten minutes debits ten at the band rate; the ledger replays | **Yes** — check assertion 5, plus a live 2.8→3 min settle |
| 5 | A wallet that runs out ends the session; the last minute is one they got | **Yes** — wallet set to exactly one minute, session ran 20:01:04→20:02:04 and was ended by the sweeper at 20:03:00, charged exactly that minute, wallet to zero, ledger replays |
| 6 | Both sides agree on the duration | **Yes** — both JWTs read byte-identical rows including `ended_at` |

**`pg_cron` has been observed firing on its own**, which matters more than it
sounds: everything else about the sweeper had only ever been proved by calling
`session_sweep()` by hand. The session above was ended at `20:03:00.014` — a
tick on the minute boundary, by the scheduler, with nobody watching. A
scheduler that is scheduled but not running is the silent failure this phase
cannot survive.

**The one thing still unwalked is visual**: the chat bubbles rendering on the
correct side of the panel for each party. The data underneath cannot be
backwards — "mine" is `m.sender_id === myId` and the flip helpers are deleted —
but that is an argument, not a look. Worth thirty seconds in a browser.

**`session_accept` had no row lock, and that was the expensive one.** It read
the session with a bare SELECT while `session_end` used `for update`, so two
accepts of one request both passed the guard and the second wrote a SECOND full
debit — orphaning the first hold. `sessions_one_live_per_consultant` does not
catch it: that index guards INSERTs, and this is two UPDATEs of one row.
Removing the cap did not cause it; it raised the price from 30 minutes to the
seeker's whole balance. Fixed in `018` and proven with six concurrent accepts:
one accepted, five refused, one hold, wallet moved by exactly that hold.

**And the seeker never saw their own session start.** The thread does not exist
until accept, so the flow was ask → open panel → "No conversations yet", with
nothing subscribed to `sessions`. `015` published that table with a comment
saying it was for exactly this, and no client code listened. **The first walk
missed it because it only ever watched the consultant's side after accept** —
walking one side of a two-sided flow is walking half of it.

**Two defects the walk found that the build and the check both missed:**

- **Realtime was delivering nothing at all.** Supabase ships an EMPTY
  `supabase_realtime` publication, and a `postgres_changes` subscription
  against an unpublished table connects, reports itself SUBSCRIBED, and pushes
  nothing. No error anywhere: the row lands, the policy is fine, and the other
  person simply never sees the message. `015` publishes `messages` and
  `sessions`. **A table is not published because it exists.**
- **`threads.last_preview` and `last_message_at` were columns nothing wrote**, so
  every thread read "No messages yet." over a full transcript. `016` maintains
  them by trigger, for the same reason the wallet balance is a trigger: a cache
  each writer must remember to update is one that eventually disagrees.

The sender also renders their own message immediately rather than waiting for
the Realtime echo — which is how the publication bug was found, and would have
hidden it if written that way first.

**The front end:** `src/lib/chat.js` is every session/thread/message call in one
file. `ChatPanel`'s consultant tab is real — **the two flip helpers are gone**,
because `sender_id` is a column and "mine" is `m.sender_id === myId`, which
cannot be backwards. The room shows time left and the rate the whole time, since
a charge nobody watches accruing is a charge that gets disputed. `Chat now` sits
on the consultant profile beside `Book`; incoming requests sit at the top of
`/pro/consult`, pushed by Realtime rather than polled.

### The seed

`backend/seed/seed.mjs`, run with the service-role key and a `--ref` that must
match the URL. Idempotent on `legacy_id`, so re-running updates rather than
duplicates. It has run on both projects.

Six consultants, four services each, 35 availability rows each, seven bookings
and seven placeholder profiles for the booking clients the mock names but never
defines — the list it prints at the end. All seven bookings are assigned to
`a1` **explicitly**, which is seed trap 1 handled rather than fallen into.

Three things about it worth knowing:

- **A seeded person needs an auth user first.** `profiles` rows are created by
  `handle_new_user()` from `auth.users`, and `profiles.phone` is NOT NULL, so
  the script mints accounts through the admin API.
- **Their numbers start with 1**, which no Indian mobile does. Nobody can ever
  sign in as a seeded consultant by owning their number — which also means you
  cannot sign in as one yourself.
- **Booking amounts come from the service row, not the mock.** The mock charges
  ₹2,998 for 30 minutes, twice the 20-minute rate, where the bands say one and
  a half times. Seeding the mock figure would put a price in the database the
  catalogue cannot reproduce.

**On production the six are still `pending`** — but no longer "and stay that
way". `01-PRD.md` §7 was partially reversed on 9 Sep: the feed gets seeded from
them, the marketplace does not. Do NOT approve them with the bare
`update consultants set status='approved' where legacy_id like 'a_';` — that
statement is what §7 warned about, because `seed.mjs` also gave them prices and
a week of open availability. Use `backend/seed/content.mjs`, which approves and
then removes all three of those hazards (§8).

**Production's one real consultant** applied through `/pro/apply` and was
approved by hand, which is the entire approval flow until phase 13. That
account has **no availability rows**, so nothing is bookable until somebody taps
cells in `/pro/consult`.

**Dev also carries two hand-made fixtures**, `legacy_id` `dev:1` and `dev:2`, on
the two test accounts. They exist for walking the app and do not collide with
the seed.

---

## 3. Decisions made

Recorded so they are not re-argued. Reasoning is in the documents.

- **Buy auth, database, storage and realtime.** Supabase.
- **Write only what cannot be a database rule** — the wallet ledger, the booking
  claim, payment webhooks, the chart service, the model proxy.
- **Money is integers in paise; both ledgers are append-only.**
- **The client never sends a price.**
- **v1 is consult + wallet only.** 13 tables. Everything else stays mocked with
  no front-end change.
- **`orders` ships in v1** despite sessions being the only thing sold —
  retrofitting an order layer under a live ledger is the worst available
  migration.
- **Seven domain tables, one order layer, discriminator on the order line.**
- **`posts`/`reads`/`clips`/`liveSessions` merge into one `content` table.**
- **UUIDs everywhere; no mock ID is ever migrated.** They collide seven ways.
- **The admin console is a separate app on the service role.** No admin role in
  client RLS.
- **Platform sets price bands**; consultants pick one, out of `price_bands`, and
  the database refuses anything else. 18% commission, in basis points.
- **Sessions are sold two ways** — scheduled 15/20/30, and per-minute. Decided
  26 Aug; per-minute is modelled in phase 4, and phase 5 refuses a `per_minute`
  service by name rather than half-charging it.
- **Chat is per-minute, off the same band — decided 1 Sep.** Not booking-bound
  and not a quota. It is an instant session that happens to be typed, so it
  shares the rate, the band and the meter with an instant call. It follows that
  chat is a **live room**, not async messaging: there is no honest way to bill
  wall-clock minutes against a reply that arrives four hours later.
- **The consultant picks a tier; they never type a rate.** Re-confirmed 1 Sep
  against the per-minute question. Free-form pricing means dropping the band
  check from the write policy, which is the thing that makes "the platform sets
  the price" true rather than six buttons on a screen. The ladder spans ₹37 to
  ₹110 a minute already.
- **The meter moves from phase 11 to phase 6 — decided 1 Sep**, because metered
  chat is what phase 6 now ships. Same machinery video needs, built once and
  debugged on the cheaper surface: a metering bug in chat costs a refund, the
  same bug in a call costs the session too. **Phase 6 is roughly twice the size
  it was**, and that was known before it started rather than halfway through.
- **The marketplace launches empty rather than seeded** — decided 26 Aug,
  **partially reversed 9 Sep**, both argued in `01-PRD.md` §7. The reversal is
  narrow: the FEED is seeded from the mock consultants, the MARKETPLACE is not.
  They are approved so they can author content, then stripped of availability,
  per-minute services and credentials so they cannot be booked, chatted or
  believed. Two of §7's three original grounds are held by that; the third —
  that fake supply hides a real supply problem — was conceded.
- **Charts come from a third-party API — decided 1 Sep 2026, and this REVERSES
  Swiss Ephemeris as our own Python service.** `freeastroapi.com`, Entry tier:
  $8/month, 50,000 requests/month, 5 req/sec, commercial use permitted. It
  covers natal charts, both Vedic and Western, divisional charts, panchang,
  Ashtakoota matching, personalised horoscopes — and unlimited geo/timezone
  lookup, which retires the Open-Meteo licence problem (`01-PRD.md` §8).
  What it removes is the second language, the second service and a hosting
  decision. What it does NOT remove is the reference chart: the ayanamsa is now
  theirs to default rather than ours to set, so it must be passed explicitly and
  verified against a known birth. `02-TRD.md` §8 is rewritten, not extended.
- **Payouts and KYC last.** Most regulated, least urgent.
- **Dev and production are separate Supabase projects**, as of 23 Aug.
- **Server functions run on Supabase Edge Functions.** Deno, next to the
  database they write. The ephemeris is the exception — Python, own service.
- **The cashback label is deleted, not deferred.** Reinstating it means pricing
  it first, in `docs/01-PRD.md` §4.8.

---

## 4. Open questions, and what each blocks

| Question | Blocks |
|---|---|
| How long a `pending` booking may hold a seeker's money before it expires | Phase 12, and any consultant who is not the founder — `01-PRD.md` §5.4 |
| Video SDK — 100ms or Agora | Phase 11 |
| Consultant ranking formula | Phase 13 |
| Blocking a consultant who has pending money | Phase 13 |
| Provenance of the 48 Bhaktamar card faces | Seed |
| **Whether a metered chat can be reviewed.** The RLS policy names `bookings`; phase 6's `sessions` is a different table, so a seeker whose only contact was a chat cannot review that consultant. A decision, not a bug — widening it is a small migration | Nothing today. It bites the first consultant who works mostly by chat |
| **Astrology advertising checked by someone qualified.** `01-PRD.md` §7 and §8 both say do this before publishing, *including* for profiles labelled as demos | **Seeding the feed from the mock consultants.** Theoretical until 9 Sep; live the moment §8's tool runs on production |
| **Whether `astro_cache` ever gets a sweeper** — rows are 11 kB each and nothing deletes them | Nothing. Much smaller than it was: the reading is twelve rows a day rather than one per person per day, so growth is now a constant |

**Report prices and the duplicate SKUs closed on 7 Sep** and are gone from this
table. The six prices are typed in `mock.js`, `REPORT_MULTIPLIER` is deleted, and
premium reads the SKU it sells rather than restating a price. `01-PRD.md` §5.2
and §5.3 own the answer. It blocked phases 8 and 10; neither is blocked on it now.

**The dropped-connection question closed with phase 6** and is likewise gone. The
answer is a 60-second grace, named as a product constant in
`014_metered_chat.sql` alongside the other three: round up to the whole minute,
30-minute hold cap, clock starts on the consultant's join.

Two closed on 7 Sep by the per-rashi change and removed rather than left with an
answer beside them: which freeastroapi tier and when (usage no longer grows with
the user base), and the daily reading's per-person cost.

Four phase 7 questions were closed on 2–3 Sep and have been removed from this
table rather than left with an answer beside them: the reference chart, the
ayanamsa and house system, the unknown birth time, and the geo endpoint. Each is
now stated as settled in the document that owns it.

---

## 5. Known gaps

### Needs a person, not code

- **The Home/Bhakti branch has not been walked in a browser.** `npm run lint`
  is clean and the build is green, and lint catches the class that white-
  screens this app (an undefined identifier, an import of a name that no longer
  exists). It does not catch a screen that renders the wrong thing, and this
  branch moved every tab bar and top bar in the app. **Walk it before merging**
  — `/home` all three tabs, `/darshan` (no dead band under the murti, both
  swipe axes still work), `/bhakti`, `/profile`, `/consult`, `/pro/studio`, and
  the chat panel on both sides, which is what proves live-removal did not take
  metered chat with it. The routes and what to look for are in
  `docs/03-APP-FLOW.md`.
- **Bhakti has no audio and no ringtones.** The repo contains zero audio files;
  the 16 seeded rows are all public-domain wallpapers. Sourcing and licensing
  devotional audio is a content problem, not a code one, and the screen shows
  an honest empty state for the three audio kinds until it is solved.
- **Three migrations are on dev only: 024, 026, 027.** Production has no
  `bhakti_assets`, so `/bhakti` renders "Could not reach the library" there —
  which is the honest empty state, not a crash, but it is what real users see.
  `backend/seed/bhakti.mjs` loads the 22 rows once the tables exist. Profile
  pictures (027) are in the same position: the UI ships, the column does not
  exist on production, so the upload fails there.
- **025 is seekers publishing, applied to dev and deployed to `main`.**
  `authors_public` and `profile_follow_counts` exist on dev and are missing from
  production, so that feature is in exactly the same half-shipped state as
  Bhakti was — until 13 Sep. **Production now has all four: 024, 025, 026, 027,
  plus the Bhakti seed (22 rows).** Verified by probing production's public API
  read-only, twice: once to find 025 missing, once to confirm it landed. Never
  taken from a message, because the next step each time depended on it.

  025 ran after 026 and 027 rather than before them as on dev. Checked first:
  neither touches `content`, `reactions` or `content_public`, so the reordering
  broke nothing. Production now has `content.author_id`, no `consultant_id` on the
  table, and all three views.

  **The two compatibility fallbacks in `lib/content.js` are deleted.** They
  existed only to keep production's feed and Work tabs alive between the push and
  the migration. The first probe is what stopped them being deleted too early —
  that would have blanked every byline on `1namo.com`. `content_public` still
  exposes `consultant_id` and `consultant_name` as aliases; they are harmless and
  removing them needs a migration, so they stay until something wants them gone.

  The section below on seekers publishing has what 025 does and what has been
  clicked.
- **Avatars are your own face only, and that is a schema fact.**
  `profiles_select_own` is `using (id = auth.uid())`; a profile row carries a
  phone, an email and a birth time, so it will not be widened to let a picture
  through. Nineteen of the app's twenty-three avatar spots render OTHER people
  and still show initials. The fix is `avatar_url` on `authors_public` (025),
  and it belongs to whoever owns that migration — do not add a second public
  profile view.

- **Two Bhaktamar verses are incomplete** and need a verified printed source.
  Deliberately not reconstructed: a plausible wrong shloka in a devotional deck
  is undetectable to the person it misleads.
- **The 48 card faces carry no attribution at all.** The murtis now do.
- **Razorpay's website verification.** KYC and live mode are done. The review
  wanted a real domain rather than `atharvborse2004-ops.github.io`; the site is
  now on `1namo.com` with the required policy pages (§6). What remains on our
  side: redeploy `razorpay-order` on production for the new CORS origin, fill
  the `[fill]` contact details, then register the domain with Razorpay. Until
  that clears, no live payment completes and **production wallets cannot be
  funded**.

### Front-end defects, all recorded in `docs/03-APP-FLOW.md` §10

**All five are closed, 7 Sep 2026**, and each was walked signed in on dev
rather than declared done off a green build:

- **Reports had no way to open the cart.** The sheet is mounted globally in
  `Frame`; Shop simply held the only opener. Reports' top bar has a `BarAction`
  now. Reports also claimed "nothing is charged" while `buyNow` really debited
  the wallet — that sentence is gone too.
- **Question packs granted questions free.** `Add` awaits
  `spend(p.price, …)` and grants only on a `true`. The ledger row
  `6 questions · −₹199` is the proof it charges.
- **Ask AI's wallet was the string `₹1,240`.** It reads `balance` through
  `rupees()` now, em dash until loaded. On the walk it showed the em dash and
  that was correct — the boot read had failed with `JWT issued at future`,
  the clock skew recorded under Tooling below.
- **`/chart` had no back control.** It already had one. The row outlived the
  fix by several weeks, which is its own lesson about this file.
- **88% against 68%.** `answerRatePct` is derived once in `mock.js` and read by
  both Earnings and the warning that cites it. Neither number is typed now, so
  they cannot drift apart again.

**Closed earlier:** there was no sign-in-only route, so a returning user had to
re-answer the onboarding questions to get a session on both branches. See
"There is now a sign-in-only route" under Phase 1 above.

### Deliberate omissions

~~No audio anywhere~~ — **reversed 9 Sep 2026.** Bhakti plays bhajans, pooja
tunes and ringtones, so the app has an `<audio>` element for the first time.
The mandir's sangeet button still toasts `puja.noAudio` and is now the odd one
out; wiring it to a Bhakti tune is the obvious follow-up. The chosen murti does
not survive leaving the tab. Bhaktamar is the only deck with real faces. Shani
has three murtis where the rest have four, because pre-modern devotional art of
Shani as a single figure is thin on Commons.

### There is a linter now, and it is deliberately small

`npm run lint`. ESLint 9 flat config, four dev dependencies, and **no style
rules at all** — no formatter, no import ordering, nothing that is taste. It
enforces five things: `no-undef`, `react/jsx-no-undef`, `import-x/named`,
`import-x/no-unresolved`, and the two `react-hooks` rules. Everything else is a
warning or off, so a red lint always means something is actually broken. The
moment it cries wolf it stops being run, and then it gets deleted.

It exists for the trap at the top of `docs/04-UI-UX.md` §11: **the build is
green on code that cannot run.** Both halves were live in this repo on 7 Sep —
`no-undef` catches a renamed variable and an unimported component, and
`import-x/named` catches the more expensive one, an import of a name the other
module no longer exports. That last one is not a broken screen, it is a broken
app: imports evaluate at module load, so `Reports.jsx` importing the deleted
`REPORT_MULTIPLIER` white-screened **every** route including onboarding, with
`npm run build` silent and `dist/` shipping fine.

Baseline is **0 errors, 3 warnings**. The warnings are two `exhaustive-deps` on
`setBalance` in `store.jsx` (a `useState` setter, stable, safe) and one unused
`showToast` in `Shop.jsx`. Lint does not replace walking the routes. It removes
the class of error not worth opening a browser to find.

### Tooling, because both cost days

- **The Chrome extension presents as "extension is not connected" when it is
  installed.** It is per Chrome profile: it was on Default and Profile 3 while
  the Claude Code account sits on Profile 1. Install it on the profile signed
  into the same account, then restart Chrome.
- **CDP input dispatch times out on this machine** while screenshots and
  `javascript_tool` work fine. Drive clicks from JS.
- **A GitHub Pages deploy can fail on GitHub's side, long after the build
  passed.** On 1 Sep, run `33536321043` built in 19s, uploaded its artifact, and
  then sat at `updating_pages` for ten minutes before aborting with "Timeout
  reached, aborting!". The site kept serving the PREVIOUS bundle, so nothing
  broke and nothing was live either. `gh run rerun <id> --failed` cleared it in
  19 seconds. Check `gh run list` after a push rather than assuming ~40s;
  normal here is 37s–2m22s, and ten minutes means stuck, not slow.
- **A function that is plainly in the database and returns `PGRST202` over REST
  is probably not a stale schema cache. It is probably two databases.** Phase 5
  lost an hour to that: the SQL editor could see `book_session`, the browser
  could not, and `notify pgrst, 'reload schema'` changed nothing — because the
  agent was writing to production and the browser was reading dev.
  `mcp__supabase__get_project_url` answers it in one call.
  `backend/INSTRUCTIONS.md` §3 now makes that the first call of any session
  that writes.

Both were logged for weeks as hardware problems. Both were configuration. The
second-account check was the same mistake — recorded three times as "needs a
second SIM" when it needed a project where fake numbers are allowed.

### The risk that keeps repeating

**Front-end features outrun the backend's assumptions.** A product list on
15 Aug added login, payments, ringing calls, consultant-uploaded course
material and an admin panel — none of which can ship without phases 1-13.
Anything new that implies persistence should be logged against a phase before
it is built.

---

## 6. Phase 7 is done. What is left is phase 3's, and it is not code

**Phase 6 is built, walked and deployed.** What is left of it is production, and
that is deliberate: a metering bug found in a browser is cheaper than one found
on a live wallet.

### Phase 6 is closed — the bubbles were looked at, 3 Sep

The last open condition was a look rather than a question, and it passes.
Signed in as `+919999900002` on dev, the seeded thread renders that account's
two messages right and dark and the other party's two left and light, matching
the `sender_id`s in `messages` exactly. **All six done-conditions now hold.**

### Phase 7 — what exists

Built 2 Sep 2026. **On dev, not on production.** Charts come from
`freeastroapi.com` Entry tier, which reversed Swiss Ephemeris as our own Python
service; `02-TRD.md` §8 owns that decision and now also owns the settings.

| | |
|---|---|
| `backend/schema/019_astro_cache.sql` | Applied to **both**. The line here said "not production" until 8 Sep and was wrong — the production verification below proves the table is there, and re-applying it under a forward-only rule is the mess that line invited |
| `backend/schema/019_astro_cache_check.sql` | Passes on dev |
| `backend/functions/astro/index.ts` | The per-rashi rewrite is on **both** — dev v9, production v5, `verify_jwt` on either side |
| Front end | `src/lib/astro.js` plus eleven screens and components |
| `backend/functions/astro/canonical.json` | The twelve births, split out of `index.ts` on 9 Sep so the verifier below checks the same rows the function reads rather than a copy |
| `backend/tools/verify-canonical-births.mjs` | Checks all twelve against the vendor in one command. **Not yet run** — it needs `FREE_ASTRO_API_KEY`, which lives in the function secrets and comes back as a digest from the CLI |
| `backend/tools/astro-usage.mjs` | What we have actually spent. One cache row is one upstream request, so the table is an exact ledger |

**The reference chart is Indira Gandhi**, 19 Nov 1917, 23:11, Allahabad — Rodden
AA, and pre-1945, so it answers done-conditions 2 and 3 with one birth. It was
chosen and checked before a line of integration code was written, which is what
`06-IMPLEMENTATION.md` asked for.

**It was checked by arithmetic, not against a website.** The ascendant is
spherical trigonometry on sidereal time, so it was computed independently:
117.371° against their 117.366°. Five thousandths of a degree is Lahiri sidereal
and nothing else — tropical would have been twenty-two degrees out. **That check
is repeatable and does not depend on them staying online**, and it is the one to
rerun if their numbers are ever doubted.

**The historical-offset case passes too.** A 15 June 1943 Kolkata birth returns
Leo 21.7°, which is the **+06:30** answer — India's wartime offset. The naive
+05:30 answer is Virgo 5.6°, a whole sign away, and it is exactly the failure
that raises nothing.

**`birth_time_known` is honoured now, and was hardcoded `true` before.**
`AskTime` has an "I do not know" checkbox; `Computing.jsx` writes the real value
and a null time. Without a time the chart shows planets and the moon sign, and
withholds the ascendant and all twelve houses with the reason on screen. **The
four production accounts still read `true` and some of them are guesses** —
nothing backfills that, and nothing should: only the person knows.

**Geo search moved off Open-Meteo**, closing the licence item that sat on the
signup path since phase 1 (`01-PRD.md` §8, now rewritten as settled). One thing
worth knowing: their ordering is relevance, and relevance returns a hamlet of a
hundred people above the city of three million with the same name. The function
re-sorts by population.

**`mock.js` lost five exports** — `days`, `today`, `placements`, `chartHouses`,
`panchang` — and `user` lost its three signs. Fields nothing computes went with
them rather than being kept as filler: a placement's `line`, `detail` and
`keywords`, and a day's `mood`, `luckyColour`, `luckyNumber`, `gettingAlong` and
`friction`.

**Five screens changed, not four.** The old note here named `Computing.jsx`,
`HoroscopePanel.jsx`, `Shop.jsx` and `useProfileFields()`. `Profile.jsx` prints
the three signs twice and was missed by that list — grep before trusting a count
like it again.

#### All three done-conditions pass, walked on dev 3 Sep

1. **Two different births, two different charts.** `+919999900001` (Pune,
   6 Dec 2001 01:12, time known) returns Virgo rising with Sun in Scorpio;
   `+919999900002` (Varanasi, 12 Apr 1998, **time not known**) returns Sun in
   Pisces, Moon in Libra and no ascendant at all.
2. **The reference chart reproduces**, to 0.005° against arithmetic that does
   not go through them.
3. **A pre-1945 birth uses its own offset** — the 1943 Kolkata case returns the
   +06:30 ascendant, a whole sign off the naive one.

**The routes are walked**, both accounts, on the harder one: `/onboarding`
name → date → time → place → verify → computing, then `/chart`, `/chart/:id`,
`/horoscope`, `/profile/horoscope`, `/home`, `/shop`, and the horoscope overlay.
Everything an unknown birth time should hide is hidden and says why.

**The mock's two calendars agree now.** The home reading card and the panchang
card both read the same day, which is the §6 note in `06-IMPLEMENTATION.md`
closing.

**Three things the walk found and fixed**, none of which the build would have
caught:

- **Place search showed the four default cities underneath a running search.**
  The first call is a few seconds cold, and for those seconds the screen offered
  Pune, Mumbai, Bengaluru and Delhi as answers to "Varanasi". Somebody tapping
  one has filed their chart in the wrong city and nothing downstream would say
  so. The shortlist is now for an empty box only.
- **Their geo results repeat.** "Varanasi" came back three times with an
  identical name, district and state at coordinates that round to the same two
  decimals — three rows a reader cannot choose between. The function collapses
  exact renders and keeps the largest.
- **The Ask AI panel opened by naming your moon sign.** It was the seed
  person's, which was invisible while everyone shared one chart and became a
  flat contradiction the moment the chart screens went real — four screens
  saying Libra, that panel saying Pisces. The greeting no longer names a
  placement; phase 8 replaces it properly.

#### Production, 3 Sep — live and verified

`019_astro_cache` applied, the `astro` function deployed, and both secrets set.
Verified from outside with no credentials beyond the anon key that already ships
in the bundle:

- Preflight from `https://1namo.com` returns **204** with all four headers and
  the origin echoed. An unrecognised origin gets the fallback rather than being
  reflected back.
- `geo` and `panchang` compute, and the panchang's metadata reports
  `ayanamsha: lahiri` — the setting is arriving, not being defaulted away.
- The second identical `panchang` call returned **`cached: true`**, which is what
  actually proves `astro_cache` is present and being written. The function
  serves a correct answer whether or not the cache works, so nothing else
  distinguishes a live cache from a missing table.
- `chart` with no session refuses `signed_out` rather than leaking one.

**The API key was rotated and the old one revoked.** Both projects hold the new
one. `C:\Atharv 2\PHASE7-PROMPT.md`, outside the repo, still contains the dead
key in plaintext.

#### The browser caches the day too — 4 Sep

The server cache never protected the phone, only the quota. Every mount was a
round trip, `/home` asked for the same reading twice, and a reload asked again.
`src/lib/astro.js` now holds answers in `localStorage` stamped with the IST day,
with an in-flight map so two components mounting together make one request.

Counted in a browser rather than assumed:

| | Requests |
|---|---|
| Reload `/home` with the day already fetched | **0** |
| Open the horoscope overlay on top of that | **0** |
| Switch to a day never fetched before | **1** |
| Switch back to a day already fetched | **0** |

A chart has no expiry at all. Refusals are never cached — `no_birth` stops being
true the moment somebody adds their details. The user id is in every key and
sign-out clears the store, because `localStorage` outliving a session is the
whole point and a shared phone must not carry the last person's chart.

**Sun, moon and rising in a header now come from the chart**, not from the day's
reading. A fact about a birth should not wait on a daily fetch, and `rashi` is
named on `useMyChart()` as what it is: the MOON sign, which is what every
rashifal in India keys on, and which survives an unknown birth time.

#### Nothing is owed on phase 7

Both projects run the same function. A failed cache read or write is logged on
each — worth keeping, because a broken cache is invisible by construction: the
answers stay correct, every call misses, and 50,000 requests a month drain while
everything looks healthy.

Production was re-checked after its redeploy, on the paths that would break if a
dashboard paste were truncated: `geo` still returns seven rows from their eight,
so the population sort and the duplicate collapse are both there; an uncached
panchang computes and the repeat comes back `cached: true`, which exercises the
write; and all three refusal shapes are intact.

**The front end is deployed.** `5f18150` on `main`, built in 32s, and the live
bundle is `index-DcSBECHe.js` — checked rather than assumed, because a green
Actions run and a served bundle are different facts here. The four deleted mock
strings are absent from it and the phase 7 copy is present.

**The panchang is one row a day for everybody, anchored on Ujjain** (4 Sep).
It was per birth place. Verified on dev: a Pune user misses, then a Varanasi
user and a signed-out visitor both hit the same `panchang:<date>` row and all
three read Ujjain's 06:10 sunrise. Every screen showing it names the city,
because sunrise moves about two hours across India and an unnamed almanac from
somewhere you have never been is wrong without looking wrong.

`/horoscope` now draws its tithi from that shared almanac rather than from the
reading's own — the personal endpoint computes a second panchang at the birth
place, and showing both would put two tithis for one day on two screens. That
is the mock's week-apart calendar bug, and it nearly came back through the side
door.

**The daily reading is twelve readings a day, one per rashi** (7 Sep). **This
replaces the line that stood here saying per-rashi readings could not be built
on this vendor.** They can — the vendor is unchanged and there is still no
sidereal sign endpoint, so the twelve come from the personal endpoint driven by
twelve fixed births, one whose Moon stands in each sign, all at Ujjain. The
tropical sign endpoint is still refused for the reason the old line gave.

The reader's rashi is the Moon's sign off their **own** natal chart, so nothing
about which reading they get is invented. What is not theirs is everything else
on the canonical birth, which is why the dasha is dropped from the glance row
and why every screen showing a reading names the sign. `02-TRD.md` §8 has the
accounting of what is right and what is not.

**The reading is much smaller since 9 Sep, and that is the fix rather than a
regression.** Reading a live payload showed the canonical birth contaminates
almost all of it, not just the dasha: the scores, every section, the remedy
block, and an asserted `lagna` and Moon nakshatra that belong to the invented
person. The daily reading now renders only the panchang mood and the day's four
clock windows, which are the two things in the payload that are true for the
person reading them. Headline, summary, score, four area ratings, Do/Don't,
transits, long sections and the reflection are all gone. `02-TRD.md` §8 has the
field-by-field table.

**The rashi label came off every reading surface at the same time**, because the
surviving fields are byte-identical across all twelve signs — checked against
two cached days, not assumed. A sign named beside content that does not vary by
sign claims something that is not there. The reader's own moon sign still shows
in the headers, off their own chart.

**So the personal-horoscope endpoint now returns twelve copies of one answer a
day.** It is on notice; §8 names gochara computed here as the successor and that
is the next decision, not a thing already done.

Each canonical Moon sits within 0.05° of the middle of its sign — the Moon
crosses a sign every 2.2 days, so a birth near a boundary would give every
reader of one rashi the next one's reading, forever and silently. The function
also fetches each canonical chart once and refuses if its Moon is not where the
table claims.

**Usage no longer grows with the user base.** Twelve readings a day, one
panchang a day, one chart per account ever, twelve canonical charts ever. That
closes the "which freeastroapi tier, and when" question in §4 rather than
answering it.

**On both projects.** Dev v9 (7 Sep), production v5 (8 Sep), `verify_jwt` on
either side. The front end has been live on `1namo.com` since 7 Sep and spent a
day against the old function without anybody noticing, which is the degradation
working: no `rashi` came back, so the sign was simply not named.

**Production was deployed with the Supabase CLI rather than the dashboard, and
that is now the rule for every production function** — it is written down in
`backend/INSTRUCTIONS.md` §3, along with the two things that bite.

#### Production verified from outside, 8 Sep

Same method as 3 Sep — nothing but the anon key that already ships in the
bundle:

- Preflight from `https://1namo.com` returns **204**, origin echoed, all four
  headers. An unrecognised origin gets the fallback rather than being reflected.
- `chart` with no session refuses **`signed_out`**, not `no_birth`.
- `panchang` computes at **Ujjain**, and the repeat returns **`cached: true`** —
  which is the only thing that distinguishes a live cache from a missing table,
  since the function answers correctly either way.
- The payload's `metadata.ayanamsha` reads **`lahiri`**. The setting is
  arriving, not being defaulted away, which is the whole risk in
  `02-TRD.md` §8.

**The cost model was measured across a real midnight, 9 Sep**, which is the
check that matters because it is the one a mistake would have hidden. The IST
day rolled at 00:06 and the first reader wrote exactly two rows —
`panchang:2026-09-09` and `rashifal:Cancer:2026-09-09`. **`canon-chart:Cancer`
was NOT rewritten**; it still carries its 7 Sep timestamp. Had the canonical
chart's key been made a function of the day, every midnight would have cost
twelve extra upstream calls and nothing on any screen would have looked
different. A second cold reader of the same rashi then got all three answers
back with `cached: true` and wrote nothing at all.

Note when reading `astro_cache` by hand: **`fetched_at` is UTC and the keys are
IST**, so rows written early on an IST day carry the previous UTC date. Group by
`(fetched_at at time zone 'Asia/Kolkata')::date`, or a day's rows look missing.

**What is NOT verified on production, and cannot be from outside: the rashi path
itself.** Every line of it sits behind a session, and the accounts there belong
to real people. So the twelve-a-day behaviour is proven on dev and inferred on
production from the two being the same file. The first real signed-in reader
exercises it. **That is safe rather than merely hopeful**: if a canonical birth
is wrong the function refuses and logs `CANONICAL BIRTH IS WRONG` instead of
serving the neighbouring rashi's reading.

**Two of the twelve canonical births are confirmed against the vendor**, not
just against our arithmetic. Signing in as `+919999900002` (Moon in Libra)
wrote `canon-chart:Libra` with the vendor's own Moon in Libra, then
`rashifal:Libra:2026-09-07`, in that order — the check runs before the reading
is trusted. `+919999900001` (Moon in Cancer) did the same for Cancer. Both
screens named the sign: *LIBRA RASHI*, *CANCER RASHI*.

**The other ten are still unverified against the vendor, and there is now a
command for it**: `node backend/tools/verify-canonical-births.mjs`, which needs
`FREE_ASTRO_API_KEY` from the function secrets — the CLI returns secrets as
digests, so it has to be run by a person who can read the key. It also warns on
any birth within 5° of a sign boundary rather than only on an outright wrong
one.

Until somebody runs it, the position is unchanged and it is safe rather than
merely hopeful: the ten come from the same arithmetic as the two that passed and
sit within 0.05° of their sign's midpoint, and if any is wrong the function
refuses with *"Charts are unavailable right now"* and logs
`CANONICAL BIRTH IS WRONG` rather than serving the neighbouring rashi's reading.
A visible failure for one sign, never a silent wrong answer. Without the script
that guard only fires when a real person of that sign signs in, which is exactly
the wait the script exists to end.

**One chart form now: the North Indian square** (7 Sep). The Western wheel
(`ChartWheel.jsx`, deleted) and the South Indian square (`ChartSouth`, removed
from `ChartSquare.jsx`) are gone, with them the tradition switcher on `/chart`,
the `chartSystem` preference in `store.jsx`, and four `chart.*` i18n strings.
The onboarding reveal drew the wheel and now draws the square. Reasoning is in
`04-UI-UX.md` §4 and the non-goal it makes literal is `01-PRD.md` §10.

**Reports still cannot be sold on Entry** — the ephemeris vendor's tier
generates two reports a month. That is a **supply** limit, not a customer
allowance, and it is unrelated to what a report costs. Phase 10's problem; do
not build a report checkout against it. The ₹4,041 half of this line is gone:
that was the multiplier, now deleted (below).

**Prices are decided and typed** (7 Sep). `REPORT_MULTIPLIER` and the `base`
field it multiplied are deleted from `mock.js`; the six report prices are the
former ×3 figures, typed once — ₹1,497 / ₹2,097 / ₹2,697 / ₹3,897 / ₹1,797 /
₹1,347. The ₹4,041 `proLedger` row, which was 449 × 9 and matched no report,
now reads ₹1,497 gross at the same 18% fee as the rows beside it.

`premiumTiers` stopped being a third catalogue. Each tier names the SKU it
sells and **reads that SKU's price**, so the ₹899-vs-₹2,697 kind of drift
cannot recur by editing one list — there is only one list per product now. A
tier naming a SKU that does not exist throws at module load. `Ask the Stars` is
the `p12` question pack, which keeps all three rungs. Prices live in
`01-PRD.md` §5.2 and §5.3; `05-BACKEND-SCHEMA.md` §6 inherits the resolution
rather than forcing it.

**Verified by assertion, not by a walk.** `/premium` and `/reports` sit behind
the onboarding gate, which needs a real phone OTP, so neither screen was opened
in a browser. What was checked: the module loads, no report carries a `base`,
the six prices are exactly the six above, every premium tier's price equals the
price of the SKU it names, and the `pl3` ledger row matches a real report with
gross − fee = net. `npm run build` passes, which per §11 proves almost nothing.
**Walk both screens on a logged-in session before trusting them.**

### Still parked

**Razorpay's website review.** Applied for; nothing to do but wait. When it
clears, one ₹1 payment closes phase 3's last done-condition *and* proves the
webhook secret set on 31 Aug matches. Run
`backend/tools/reconcile-payments.mjs` straight after.

---

## 8. Phase 9 — what is built, and the one thing that is not

Built 8 Sep, walked and closed 9 Sep. **Migrations 020-023 are on both
projects** and the check passes on both; the front end is deployed.

### The four tables, and the three views that keep counts honest

`020_content_reviews.sql` — `content`, `reactions`, `reviews`, `feed_pins`.
`05-BACKEND-SCHEMA.md` §5.1-§5.4 has the design; the migration is the DDL.

**No count is a column.** Not likes, not saves, not followers. §1.3 allows one
cached aggregate in this database plus the two rating caches, and the mock is
the argument — four of its stored totals contradict their own line items inside
one file written in one sitting. Counts come from three views instead:
`content_public` (likes and saves, aggregated once rather than N+1),
`consultant_follower_counts`, `reviews_public`. All three run as their owner,
the `consultants_public` pattern, because the tables under them are own-row-only
and an invoker-rights view would return 0 for everyone but yourself.

**`view_count` is a column and it stays 0.** A counter the client increments is
a number the user benefits from, which is rule 3. It exists so it is not
retrofitted later, and nothing writes it until something server-side owns it.
Every screen that used to print `312k views` now prints a timestamp instead.

**The rating caches are a trigger that RECOMPUTES, never increments.** An
increment cannot be checked and drifts under concurrency, which is the whole
failure §1.3 describes. The check asserts the cache equals the reviews under it,
including after a removal.

### The review gate is the phase, and it is enforced in the policy

A review requires a booking that is **the caller's own and `completed`**. Not
pending, not confirmed. The check proves all four cases — no booking refused,
pending booking refused, completed booking accepted, a second review on the same
booking refused by the unique index.

`booking_id` is unique but NULLABLE on purpose: Postgres permits many NULLs in a
unique index, and `verified` is derived from `booking_id is not null`. So a
seeded review is visible and visibly unverified, and no seed has to fabricate a
session that never happened.

**A metered chat session does not let you review.** The policy names `bookings`,
and phase 6's `sessions` is a different table. A seeker whose only contact was a
chat cannot review that consultant. That is a real gap and a decision for
somebody, not a bug in the policy — noted in `05-BACKEND-SCHEMA.md` §5.4.

### The `flags` Set did not go away, and should not have

`store.jsx` still holds one flat Set. Four kinds — `follow`, `save`, `like`,
`remind` — now also write a row; the rest stay local, because they are not
reactions: `setting:croppedDeityImage` is a preference, `offair:<room>` is one
screen's UI state, `event:<id>` is phase 10's, the tarot keys are §5.6's
`tarot_pulls`, and `save:day-<key>` is a saved *reading*, which is derived and
has no table to point at.

`lib/reactions.js` decides which is which, and it also requires the target to
**look like a UUID** — a reaction against a mock row cannot be stored and must
not throw. It stays local and starts persisting by itself the moment that screen
reads real rows. Every one of the twenty-odd `toggleFlag` call sites is
unchanged, which was the point.

The write is optimistic and **rolls back on failure**. A heart that stays filled
after the write failed is the interface telling a lie it gets caught in on the
next reload.

### What the front end reads now

| Screen | Was | Is |
|---|---|---|
| `/home` | `feed`, 14 hand-ordered rows | a query over `content_public`; live/course/product are the three mock rows left, and they belong to phases 10 and 11 |
| `/read/:id` | `reads` lookup | a row; body splits on blank lines, read time computed from it |
| `/reels/:id` | `clips` lookup | a query; the counter is told the total by the feed rather than counting a mock array |
| `/consult/:id` Work and Reviews | **matched to the real consultant BY DISPLAY NAME** | queries. That join is gone |
| `/pro/studio` | two toasts that wrote nothing | three composers — **Reel** (video, required), **Photo** (image, required), **Blog** (title, body, optional cover) — each uploading to storage and writing a row |
| `/pro/profile` | `mine(clips)` etc., and the seed person's 4.9 rating | your rows, your rating caches, your follower count |

**`posts`, `reads`, `clips` and `mine` are deleted from `mock.js`** — 204 lines.
`feed` is down to three rows.

The `seedFor` join in `ConsultantProfile.jsx` is the one worth noting: it
matched a real consultant row to a mock one by display name, which is the join
`05-BACKEND-SCHEMA.md` §9 spends a section warning about. The file already said
"Phase 9 deletes this function." It does.

### The studio publishes three kinds, and the tab IS the column

`content.kind` takes `post`, `article`, `clip`, `live_session`. The studio's
three tabs are the first three, so a fourth composer is a value in the check
constraint rather than a table. `live_session` is phase 11's.

A **photo post** and a plain note are both `kind = 'post'`; the media is what
separates them, not a fourth kind. `PostCard` renders the image when there is
one.

**The file uploads before the row is written**, so a failed publish never
leaves a row pointing at nothing. The reverse — an orphan file with no row — is
a few kilobytes nobody can see, which is the cheaper way to fail.

Switching tabs clears the composer. A video chosen for a reel is not a cover
image for a blog post, and carrying it across is how the wrong file gets
published.

### Seekers publish too, since 10 Sep

`025` and its check. A seeker posts **photos and blog posts, not reels** — a
reel is the consultant's marketing surface, and the format people judge a
practitioner by. The rule is an RLS predicate rather than a missing tab: a
composer offering the wrong kind is a bug in the composer, not a way in.

`content.consultant_id` is now `author_id`, keyed to `profiles(id)`. A seeker
could not author a row at all before — the column was NOT NULL against
`consultants`. The rename is the point: repointing the key and keeping the name
would have left the column lying to every future reader. `content_public` still
exposes `consultant_id` as an alias so a bundle deployed before the migration
does not break on the way through.

**The approval gate had to move from an inner join to a NOT EXISTS.** Blocking a
consultant must still take their posts down, but approval must not become a gate
on ordinary people, who are never approved of. The check asserts both
directions, because a view rewrite is exactly where that gets lost.

**One composer, two callers.** `components/Composer.jsx` is shared by
`/pro/studio` (three kinds) and the **Your posts** section on `/profile` (two).
The difference is a `kinds` prop. Written twice it would have been the same
upload path, validation and publish call, drifting apart the first time one of
them got a fix.

**Seekers are followable, and have a page.** `/u/:id` — deliberately NOT
`/consult/:id`, which sells a practitioner with a rate, slots and a Book button.
Publishing a photo does not make anybody bookable, and a screen that looked like
a consultant's would undo the split in the one place a reader decides what
somebody is. The article's "Book a session" becomes "See their posts" for the
same reason. The store key is `followp:` → `target_type = 'profile'`, kept apart
from `follow:` → `'consultant'` so a follower count can answer either question
later without unpicking rows.

Posts, followers and following are **counts**, never columns (§1.3). A new
account reads 0 · 0 · 0, which is true.

**The bundle survives a production that has not had 025 yet**, and that is
deliberate rather than incidental: `main` deploys on push, and the migration is
a separate manual step. `shape()` falls back to the pre-025 column names and
treats a missing `author_is_consultant` as TRUE — the old feed was consultants
only, so a byline still goes to `/consult/:id` exactly as before. `fetchByAuthor`
retries on `consultant_id` when Postgres answers `42703` (undefined column),
because filtering on a column that does not exist is a 400, not an empty list,
and every consultant's Work tab would have read as empty.

Without those two the new bundle against an old database is a blank byline
linking to `/u/undefined`, which is worse than the old behaviour rather than
merely different. Both fallbacks come out the day 025 is on production.

**Walked on dev, 13 Sep — posting only.** A seeker published from the Your
posts section on localhost and it worked. That is the one thing confirmed by a
click. NOT yet confirmed by a click, though the check covers the database side
of each: following a person on `/u/:id` and the counts moving, the `/u/:id` page
itself, and `/pro/studio` still offering three tabs after the composer was
extracted from it. The last is the one most likely to have regressed, since the
extraction rewrote the consultant screen.

`025_seekers_publish_check.sql` passes on dev and covers the two refusals that
matter — a seeker publishing a reel, and a seeker publishing as somebody else —
plus the blocked-consultant gate.

**On `main`, deployed, and on production's database (13 Sep).** Seekers can post
on `1namo.com`. The fallbacks that covered the gap are gone.

### Storage

`022_content_media_bucket.sql` — `content-media`, **public-read**, 25 MB,
images and video only. Public is right *here* and nowhere else: the row pointing
at the file is already readable by anon through `content_public`, so a signed
URL would cost a round trip per card and buy nothing. `kyc_documents` and
anything carrying a chart are private buckets with signed URLs.

Writes are scoped by folder and the folder is the owner's UUID —
`<auth.uid()>/<file>` — so a consultant writes their own files and nobody
else's.

### 021 was wrong and 023 fixes it

`021` ran `revoke execute ... from anon, authenticated` on the two cache
functions, reported success, and did nothing: neither role ever held a grant of
its own. The access came from the **PUBLIC** pseudo-role, which Postgres grants
on every new function, and which shows in the ACL as a bare `=X/postgres`.

`023` revokes from `public` and the linter goes quiet. The trigger still fires —
asserted as a seeker, with the revoke in place, because it runs as the definer.

**The lesson worth keeping: a revoke that succeeds is not a revoke that did
anything.** Check the ACL or the linter, not the absence of an error.

### The walk, and the two bugs only clicking could find

Walked on dev 9 Sep across three signed-in windows. All three done-conditions
pass, verified in the database rather than by looking at the screen: three
`content` rows with two objects in `content-media`, a `follow` row that survived
a reload and a second window, and one review carrying `verified = true` with the
rating cache reading 1.0 / 1.

**Both bugs were in code that lint and build had already passed**, which is §11
paying for itself again.

**The session you could review was unreachable.** `listMyBookings` sorts
`starts_at` DESCENDING and the list renders four rows. A completed session is in
the past by definition and pending ones are in the future, so the only row
carrying a Review link sorted below four that could not. Not one account's bad
luck — it would have hidden the button for almost everybody. Reviewable rows are
now hoisted before the slice.

**The rating circles had no flex centering**, so the numeral sat low and left.

The lesson is the shape of both: the review composer was written last, after
everything around it, and shipped with the phase's own verification saying
green. Neither bug was reachable from an assertion.

### On production, and what the walk there still needs

Migrations ran 9 Sep; the check passes; the deployed bundle carries
`content_public`, `consultant_follower_counts`, `reviews_public`,
`content-media` and all six new report prices, and no longer carries the "3× the
standard catalogue rate" line.

**Production has no content yet, and the plan for that changed on 9 Sep.** The
feed is to be seeded from the mock consultants until real ones are publishing —
`01-PRD.md` §7's launch-empty decision, partially reversed and re-argued there.

**And the loading route is the backend, for everybody.** An earlier line here
said the feed fills through the studio and there is no seed step. That was true
of the mechanism and wrong about the plan: real content arrives in batches, from
a partner, and hand-posting it from their account does not scale past the first
afternoon. So `content.mjs` publishes for real consultants as well as invented
ones, and the studio is what a consultant uses for the single thing they just
wrote.

**NOT RUN YET, on either project, and parked on purpose.** The decision is made
and the tool exists; the work of assembling media and a manifest is the user's,
later. Nothing below has touched a database.

`backend/seed/content.mjs` is the tool. It reads
`backend/seed/content/content.json` plus files in `content/media/`, uploads the
media, and writes `content` rows idempotently on `legacy_id`. Same `--ref=`
guard as `seed.mjs`, and `--dry-run` validates the manifest without writing.

**What it does beyond publishing is the part that matters, and the ORDER is
the protection.** It strips first and approves LAST.

That was backwards until 9 Sep and it was a live hazard, not a tidiness point.
`book_session` needs `status = 'approved'` **and** an open slot
(`012_bookings_transaction.sql:174`, `:190`). Approving first made all six
bookable with real money for the rest of the loop — and `die()` on any later
step would have left them that way permanently. Stripping first inverts the
failure: a crash leaves them `pending`, which is invisible. **The safe direction
to fail is the one where nothing is published.**

Approving at all is unavoidable — `content_public` requires it — so what the
script does is remove everything that makes an approved row dangerous before
granting it:

- availability rows **deleted**, so nothing is bookable. This is not cosmetic:
  `seed.mjs` gives every seeded consultant prices AND a week of open slots, and
  `book_session` debits the wallet in the same transaction that claims one. Six
  invented people on the marketplace would have been a real debit and a real
  refund. Verified on dev inside a rolled-back transaction: 35 open slots become
  0, instant chat goes off, and they stay listed in `consultants_public`.
- per-minute services **deactivated**, so no chat request sits unanswered.
- credentials **cleared**, so "ICAS Certified" and "10k+ sessions" are not
  published on someone who does not exist.

`verified` and the rating caches needed no protection: phase 9 made them
trigger-maintained over `reviews`, so with no reviews they read false, New and
0. The mock's 4.9 and 2,148 cannot come back through a seed.

**It loads real consultants' content too, and that is the point of it.** The
manifest's `consultant` field takes either a seeded mock id (`a1`..`a6`) or a
REAL consultant's profile UUID -- which is how a partner with a lot of content
gets loaded without posting each item by hand from their account.

The two are not treated the same, and the difference is the safety property.
The strip runs ONLY on `a1`..`a6`. A real consultant is published as and
otherwise untouched: their availability, their credentials and their approval
are theirs. Before 9 Sep the strip applied to every author in the manifest, so
pointing it at a partner would have deleted the availability they tapped in and
cleared the credentials they earned -- silently, from a script called `seed`.
Real rows carry both: `dev:1` on dev has 35 availability rows and a credential.

A real author must ALREADY be approved. The script refuses rather than approving
them, because `content_public` requires approval for a post to be visible, so
the alternative is uploading into a black hole -- and approving a person is a
human decision, not a side effect of uploading their video.

**Untested end to end.** The manifest validator and both `--ref` guards were
exercised; the database and upload path were not, because that needs the
service-role key. The first real run should be `--dry-run` on dev, then dev, then
production.

The rolled-back dev transaction that proved 35 slots become 0 proved the
STATEMENTS, not the script — it ran them in the safe order by hand. The ordering
bug above survived that check and was found by reading. Worth remembering when
the next "verified on dev" line goes into this file.

**Still open:** the legal note in §7 — astrology advertising checked by someone
qualified before publishing, including for profiles labelled as demos — has not
been done, and seeding is what makes it live rather than theoretical.

Approving a real second consultant is still somebody typing SQL, which is the
argument for phase 13.

Ordering worth keeping for the next phase that adds tables: **migrations went on
production BEFORE the merge.** `main` deploys on push, so a front end querying
`content_public` against a database without it would have shown an empty feed
and empty Work and Reviews tabs on every consultant — no crash, just quietly
wrong.

---

## 7. What can be built at the same time

Worked out 3 Sep, from the phase specs rather than intuition, because two
sessions on one repo is cheap right up until it is not.

**Phase 13's admin console is a SEPARATE application** — `admin/`, service role,
no admin role in client RLS, its own layout because the phone frame does not
transfer. It shares almost nothing with the seeker app: no `store.jsx`, no
`mock.js`, no `src/` screens, so it collides with nothing. Its two blocked
capabilities (ranking formula §5.5, blocked-consultant-with-pending-money §6)
sit at the BOTTOM of its own payoff order — approval, moderation and search need
neither.

**Deliberately deferred, 9 Sep.** It stays the highest-payoff *unbuilt* thing,
but the payoff scales with volume that does not exist. Approving a consultant is
one statement against a `pending` row, and there are two people to approve, both
approved by the same person who would use the console. What would pull it
forward, none of which is true yet:

| Signal | Where it stands |
|---|---|
| More than ~5-10 consultants to approve | two |
| Somebody who is not the developer needs to approve | it is the same person |
| Real moderation — a post to remove, a consultant to block | production has no content |
| **Referrals switched on** | **this is the one to watch** |

The referral row is the sharp one. `06-IMPLEMENTATION.md` lists referral fraud
as a risk — the per-join bounty is the largest per-action payout in the product
and has no controls, and it says design the control BEFORE phase 9. Phase 9
shipped without it because it never touched referrals. Turning them on before an
admin console exists means no way to see abuse, let alone stop it.

**Phase 9 is built** (§8), so this no longer describes work to schedule. What it
predicted was right and is worth keeping for the next phase that touches
`mock.js`: the collision is deletions in different regions of one file. Phase 9
removed `posts`, `reads`, `clips` and `mine`, and trimmed `feed` to three rows.
Migrations 020-023 are taken and are on both projects.

**Phase 8 is now fully parallel.** This replaces the line that stood here
saying it was "parallel except for its last wire", which was true only while
phase 7 was open. All the plumbing — the model proxy, `ask_messages`,
`entitlements`, the quota as a SUM, the pack purchase — was always independent,
and Ask AI's pitch of "Reads your chart" (`Ask.jsx` says so in the header, the
loading state and the footer) now has a real chart behind it. Nothing needs
building against seed and swapping at the seam.

Its one prerequisite was a **price**, not a phase, and that is now settled —
see "Prices are decided" below. `p12` at ₹349 is the SKU the pack sheet charges
the wallet against, and premium no longer sells a second copy of it.

**Three that should not start yet, and the reasons are not scheduling:**

| Phase | Why |
|---|---|
| 10 · shop and academy | **No longer blocked on pricing** — §5.2 and §5.3 are decided and the multiplier is deleted, so seeding is safe. Still the most operationally expensive phase (stock, shipping, returns, courier tracking, none of which the UI has), and its report SKUs cannot be *sold* until the vendor tier grows past two reports a month |
| 11 · live video | Blocked on the SDK choice, and it builds directly on phase 6's meter. Also the natural place to revisit the rolling hold |
| 12 · payouts | Two hard gates: KYC clears before the first rupee leaves, and **talk to a CA before writing the code, not after** |

**Three things that make parallel sessions survivable**, and the first one is
not optional:

1. **Assign migration numbers up front.** Two files called `020_*.sql` is
   unrecoverable under a forward-only rule. Give each session a range.
2. **Branch per phase.** `main` deploys on push, so two sessions pushing to
   `main` is two deploys racing — and a Pages deploy has already hung for ten
   minutes once.
3. **Tell each session the other exists**, and which files are shared.
   `store.jsx`'s hand-maintained `useMemo` dependency array is the one that will
   merge cleanly and behave wrongly.

---

## 6a. What phase 4 left behind

**Phase 4 is closed.** Migrations applied to dev through the MCP and replayed
to production by hand, both seeded, front end deployed, routes walked on both.
Four bugs were found after it was first called done — three by walking
production, one by the first real person to fill in the application form — and
all four are fixed and recorded in §2.

**Phase 5 is the transaction.** `docs/06-IMPLEMENTATION.md`. `bookings` and its
partial unique index already exist; what is missing is `orders`,
`order_items`, `earnings_ledger`, the one transaction that claims a slot and
debits a wallet, and the reversing credit a decline owes once a booking carries
money. Per-minute sessions need their meter here or in phase 11.

**One thing left to settle, and it is a queue rather than a task:**

1. **Razorpay's website review**, which is now a domain move rather than a wait
   — see below. Until it clears, live checkout is refused, **production wallets
   cannot be funded**, and phase 5's first done-condition — two clients racing
   one slot, one booking, one refusal, no orphaned debit — cannot be exercised
   end to end against real money. Dev is unaffected: fund a dev wallet by hand
   with the recipe at the foot of `003`.

**Both product decisions are made** (27 Aug, `01-PRD.md` §5.4), so phase 5 is
unblocked on everything except funding a production wallet:

- **Charge at booking**, inside the transaction that claims the slot. No hold.
  Built in `012`.
- **No cancellation, no refund** on a session the seeker skipped. **This does
  not touch the reversing credit a decline owes** — a consultant tapping
  Decline and keeping the money is not a policy. The booking function
  implements both halves.

### The domain move, which is what unblocks Razorpay

**Site is live on `https://1namo.com`.** Apex domain on GitHub Pages. The one
thing left before it fully works is a production Edge Function redeploy — see
below — and then Razorpay.

**Done:**

- **DNS** — GoDaddy, four apex `A` records to GitHub Pages
  (`185.199.108–111.153`), `CNAME www` → `atharvborse2004-ops.github.io`
  (redirects to the apex). GitHub's DNS check passed; the Let's Encrypt cert
  issued; HTTPS serves. `atharvborse2004-ops.github.io` now 301s to the apex.
- **`public/CNAME`** holds `1namo.com` and survives redeploys. Settings → Pages
  → Custom domain is set to `1namo.com` (it was **not** auto-filled from the
  CNAME file — Pages source is "GitHub Actions", so it had to be typed in).
- **`vite.config.js`** — `base` is `'/'` unconditionally now. It was
  `/${repo}/` for the github.io subpath; that 404s every asset on the apex.
- **The four policy pages** — static files in `public/`, live at
  `/{terms,privacy,contact,refunds}.html`, bypassing the SPA router.
  `refunds.html` is `01-PRD.md` §5.4: declines, no-shows and platform failures
  reverse in full; a seeker who skips does not. Operator named on all four:
  **AK International, C-143 Ground Floor, Brij Vihar, Ghaziabad, UP 201011**,
  `support@1namo.com`, `+91 99538 08908`, jurisdiction Ghaziabad UP.
- **`PAGES_ORIGIN`** in `razorpay-order/index.ts` now reads a function secret,
  falling back to `https://1namo.com`. **Deployed to dev (v9) and production.**
  Both preflights from `https://1namo.com` return 204 with the right
  allow-origin; the old github.io origin is now refused on both.

**Left:**

1. **Register `1namo.com` with Razorpay** and submit the four policy-page URLs
   (`https://1namo.com/terms.html` etc.) for activation. Everything the review
   needs is on those pages now.
2. Minor: tick **Enforce HTTPS** in Settings → Pages (cert is issued; `http://`
   still serves without redirect).

**Owed on phase 3:** one real ₹1 live payment through the site, once Razorpay
clears the domain. That closes its last done-condition.

**Three advisor lints on both projects are intentional.** `consultants_public`
and `bookings_view` are owner-rights views — they must be, since `profiles` is
own-row-only and an invoker-rights view would return an empty name for everyone
but yourself; each restricts itself in its own `WHERE`. `consultant_open_slots`
is a `security definer` function callable by `anon`, which is the point of it.

### Owed, not blocking

- **The reconciliation sweep — now written.** `backend/tools/reconcile-payments.mjs`
  reads every `payments` row stuck at `created` with no terminal sibling and
  asks Razorpay what actually happened to it. Read-only by design: it credits
  nothing, because a script that mints undoes the reason phase 3 is shaped the
  way it is. It exits non-zero and names the people owed.

  **Why it has to call Razorpay at all:** a lone `created` row is identical
  whether the person abandoned the checkout or paid and got nothing. Nothing
  inside the database can tell those apart. That, not the wrong secret, is why
  the lost payment stayed lost — the secret was the trigger, the absence of an
  expected outcome was the cause.

  Run against production 31 Aug: 7 rows, 5 unresolved, **nothing owed** — three
  abandoned checkouts and two orders whose every attempt Razorpay itself
  refused with "website does not match registered website(s)". Run it after any
  webhook change and before believing the first live payment worked.

  Still owed: running it on a schedule rather than by hand.
- **The checkout-dismiss path** — `ondismiss()` and `payment.failed()` in
  `topup()` have never run.
- **The seeker onboarding branch has not been walked this session.** Every
  sign-in went through `?next=pro`, which skips `AskDate`, `AskTime`,
  `AskPlace` and `Computing` entirely. The phase 1-2 review fixes in those
  files are checked by reading and by a green build, which is not the same as
  somebody clicking them.
- **If the top-up minimum is ever lowered for a test payment**, revert it in
  the same session — `MIN_PAISE` in
  `backend/functions/razorpay-order/index.ts` *and* the client copy in
  `Wallet.jsx`, redeploy the function, and push.

**`npm run build` passing proves almost nothing** — no type checker, and an
undefined identifier inside JSX compiles cleanly and throws at runtime. It has
shipped a blank screen twice. `npm run lint` catches that identifier and the
stale cross-module import beside it; it does not catch a screen that renders
the wrong thing. Walk the routes.

## 9. Two build targets — 19 Sep 2026

One codebase, two apps. The seeker app is the default build; the consultant
app is `npm run build:pro` (or `npm run dev:pro`), selected by the Vite mode
and read once in `src/side.js`. The side decides three things in
`src/App.jsx`: which route table mounts, where `/` and the catch-all point,
and whether the seeker overlays (ChatPanel, CartSheet, CartFab) mount at
all. Everything else — store, Supabase client, components — is shared and
untouched.

- **The seeker build is unchanged.** `npm run build` produces the same app
  production serves, `/pro/*` routes included. The deploy workflow was not
  touched.
- **The consultant build carries** `/pro/apply` (it signs a new consultant
  in, so it sits outside the session gate), `/pro/earnings`, `/pro/studio`,
  `/pro/consult`, `/pro/profile`, plus the two seeker screens the pro side
  links out to — `/chart` (ProConsult opens it for a booking) and
  `/consult/:id` (ProProfile previews its own public page). Onboarding,
  tabs, wallet, shop: absent. A signed-out visitor still lands on
  `/pro/apply` through the same gate.
- **Not done, deliberately:** no deployment for the pro build. `dist-pro/`
  is gitignored and has no workflow — where the consultant app lives is a
  hosting decision, not a code one.

Files changed: `src/side.js` (new), `src/App.jsx`, `vite.config.js` (outDir
by mode), `package.json` (dev:pro / build:pro / preview:pro),
`.gitignore` (dist-pro). Checked with `npm run lint` (0 errors; the three
remaining warnings predate this) and both builds — the pro bundle
tree-shakes the seeker onboarding out, and the seeker bundle carries no
pro-only branch.

Same day: `docs/07-DJANGO-MIGRATION.md` added — the Django migration and
scale plan (plan only; nothing started). `CLAUDE.md` and `README.md` doc
tables now list it.

## 10. Phase 1 — the Django skeleton — 19 Sep 2026

`backend-django/` exists: the Django + DRF API that `docs/07-DJANGO-MIGRATION.md`
phases 2–10 land on. Nothing is deployed; the Supabase backend in `backend/`
still serves every module. The git tag `pre-django` marks the tree before this.

What exists, all cross-cutting, no business logic:

- **Project/config**: settings split base/local/test/prod, twelve-factor env,
  15-line `postgres://` parser (dj-database-url deliberately not a dep), SQLite
  fallback, DRF defaults (CursorPagination 20, JSON only, throttles), JSON
  logging with per-request ids, CORS from env (hand-rolled echo-middleware in
  apps/core/middleware.py — no django-cors-headers dep — answers preflights).
- **Auth**: Supabase JWT verification. `SUPABASE_URL` set → RS256 against the
  JWKS endpoint (fetched, cached by kid, 1h TTL, thread-safe, one forced
  refetch on unknown kid); `SUPABASE_JWT_SECRET` set → HS256 fallback for
  legacy projects. RS256 is verified in pure Python (no `cryptography` dep);
  ES256 needs `PyJWT[crypto]` added at deploy time. Valid token →
  `request.user` is a lightweight claims object; else 401
  `{"ok": false, "reason": "unauthenticated", "message": ...}` — the refusal
  envelope `docs/02-TRD.md` §6 already defines, not a new vocabulary. 403s use
  reason `"forbidden"`, 429 `"throttled"`, 400 `"invalid"`.
- **Permissions**: `IsSeeker` (any signed-in user), `IsConsultant`,
  `IsAdmin` from JWT role claims (top level or `app_metadata`), plus the
  documented-but-unwired `ConsultantExists` DB hook for phase 6.
- **Idempotency**: `Idempotency-Key` on POST/PATCH/DELETE; the stored response
  replays without re-executing; only 2xx is stored; the (key, user) unique
  index backstops races; an in-flight marker answers 409 `request_in_flight`
  rather than lie. Unauthenticated requests pass through untouched.
- **Outbox**: `outbox_events` + `enqueue_outbox()` (transaction-bound,
  optional dedupe key, delay) + `manage.py dispatch_outbox` — claims with
  `FOR UPDATE SKIP LOCKED` plus an optimistic attempts-claim so exactly-once
  holds on any backend; per-item failures back off (1min → 1h cap, 10 attempts
  then dead-letter) without blocking the batch. No Celery yet — `tasks/README`
  says where the wrapper goes.
- **Media**: `media_assets` (UUID pk, kind/status check constraints, owner as
  auth-user uuid text — no business FKs) + presigned PUT (`POST
  /v1/media/presign/`, size/mime gated: reel 100MB video/*, image 10MB
  image/*, audio 25MB audio/*) via R2 (boto3) or a fake local provider,
  selected by `MEDIA_PROVIDER`; `GET /v1/media/<id>/` is owner-scoped (a
  stranger gets 404, not 403, so ids don't leak existence).
- **Endpoints**: `GET /v1/health/` (AllowAny, version from env), `GET /v1/me/`
  (echoes verified claims — proves the JWT path end to end).
- **Tests**: 82 pytest-django tests on SQLite, including a generated RSA
  keypair (pure Python) whose signatures openssl independently verifies, the
  full accept/401 matrix, permission 200/403 matrix, replay/race idempotency,
  two overlapping outbox dispatchers, and boto3 fully mocked. `manage.py
  check` clean. CI: `.github/workflows/api.yml` runs checks + pytest on
  changes under `backend-django/`.

Deliberately not built (later phases own these): `request.profile` from the
`profiles` table (phase 2+ adds it where the seam lands), any business module,
Celery, Redis client (the cache seam is env-shaped already), ES256 without
`cryptography`, Django ownership of the existing 27 SQL migrations (phase 2's
`inspectdb` baseline).

Files changed: `backend-django/` (new — project, apps/core, apps/media,
tests), `.github/workflows/api.yml` (new), `.gitignore` (venv/python entries;
root `Makefile`/`docker-compose.yml`/`archive/` patterns anchored so
`backend-django/docker-compose.yml` is tracked), `docs/07-DJANGO-MIGRATION.md`
(phase 0/1 status), `CLAUDE.md` (map). Nothing in `src/`, `backend/`,
docs 01–06, or the deploy workflow was touched.

## 10a. Module 2 — reactions — 19 Sep 2026

The reactions module (step 2 of `docs/07-DJANGO-MIGRATION.md` §6) is built
in `backend-django/` and **staged, not deployed** — Supabase still serves
production; the client flip sits in `backend-django/cutovers/
reactions.clientlib.js` awaiting the deploy order. `apps/reactions/` maps 1:1
onto the existing `reactions` table (`backend/schema/020_content_reviews.sql`
as amended by `025`, which added `'profile'` to `target_type`): uuid id,
`actor_id`, `target_type`, `target_id`, `kind`, `created_at`, the unique
4-tuple, and `reactions_target_idx`. Its migration is generated against that
schema and designed to be faked in at cutover (`migrate --fake-initial`) — it
creates nothing new on the real DB; `actor_id`'s FK to `profiles` is deferred
to the profile module, exactly like the phase 1 no-business-FK decision.
Endpoints under `/v1/reactions/`: `GET` (own rows only — the `reactions_own`
policy), `POST` (`{target_type, target_id, kind}`; actor forced from the JWT;
double-react is one row, answered `created: false` + 200), `DELETE`
(owner-scoped; someone else's row is 403, off-when-off is a 200 no-op), and
`GET /v1/reactions/counts/` (anonymous aggregates — the count views' grant;
counts stay `COUNT(*)` queries, there is no counter column to drift). Client
contract unchanged: `fetchMine` still returns `kind:target_id` strings,
`setReaction` still returns false for unpersistable keys and signed-out
visitors, refusals still carry `{ok, reason, message}`. 23 new pytest-django
tests port the reactions halves of the 020/025 SQL checks (unique double-react,
counts exact and starting honest, stranger reads zero rows but public counts,
profile-follow counts) plus idempotency-key replay and two thread-race tests;
full suite 105 green.

Files changed: `backend-django/apps/reactions/` (new — models, services,
views, urls, fake-in migration), `backend-django/tests/test_reactions.py`
(new), `backend-django/cutovers/reactions.clientlib.js` (new — the staged
client flip), `backend-django/config/` (app + route registration),
`HANDOFF.md` (this section), `docs/07-DJANGO-MIGRATION.md` (§6 status).

## 10b. Module 3 — astro — 19 Sep 2026

The astro module (step 3 of `docs/07-DJANGO-MIGRATION.md` §6) is built in
`backend-django/` and **staged, not deployed** — the `astro` Edge Function
still serves production; the client flip sits in
`backend-django/cutovers/astro.clientlib.js` awaiting the deploy order. The
edge function's four ops are now an `AstroProvider` interface
(`apps/astro/providers.py`): `FreeAstroApiProvider` (real, `FREE_ASTRO_API_KEY`
from env, `ASTRO_PROVIDER=freeastroapi`) and `MockProvider` (deterministic,
no network — dev/tests; its Moon uses a truncated lunar theory so the
canonical-birth check passes end-to-end). `apps/astro/services.py` replicates
the function exactly: same cache keys (`panchang:<date>`,
`chart:<id>:<birth digest>`, `canon-chart:<rashi>`, `rashifal:<rashi>:<date>`),
same no-TTL cache-aside against `astro_cache` (single-flight via a cache lock:
two simultaneous misses cost one upstream call; the unique key collapses
writers, catch-IntegrityError-read-winner), same Ujjain panchang anchor,
twelve canonical births, yesterday/today/tomorrow IST clamp, and refusal
parity (400/401/409/500/502 with the function's reason strings; the upstream
key or URL never reaches a response body). Endpoints under `/v1/astro/`
(geo + panchang anonymous, chart + horoscope authenticated; birth details
read from the caller's own `profiles` row via a raw-SQL gateway that the
profile module replaces). The 019 check is ported to pytest, including the
service-role-only invariant re-expressed as code: only the service layer
touches `astro_cache` and no endpoint exposes a raw row. 42 new tests; full
suite 147 green.

Files changed: `backend-django/apps/astro/` (new — models, providers,
services, views, urls, fake-in migration), `backend-django/tests/test_astro.py`
(new), `backend-django/cutovers/astro.clientlib.js` (new — the staged client
flip), `backend-django/config/` (app, route, provider settings), `HANDOFF.md`
(this section), `docs/07-DJANGO-MIGRATION.md` (§6 status).

## 10c. Module 4 — bhakti — 19 Sep 2026

The bhakti module (step 4 of `docs/07-DJANGO-MIGRATION.md` §6) is built in
`backend-django/` and **staged, not deployed** — Supabase still serves
production; the client flip sits in `backend-django/cutovers/
bhakti.clientlib.js` awaiting the deploy order. `apps/bhakti/` maps 1:1 onto
`bhakti_assets` (`backend/schema/024_bhakti_assets.sql` as amended by `026`,
which merged 'ringtone' into 'tune' and promoted WhatsApp-status artwork into
the leading 'status' kind): uuid id, kind vocabulary, nullable-positive
`price_paise`, the NOT NULL attribution triplet, soft withdrawal via `active`,
curated `sort`, and the `legacy_id` unique key the seed script idempotently
upserts on. It is a curated catalogue with no client writer — 024 grants one
RLS policy (public select of active rows) and deliberately no write policy —
so the module is one AllowAny read endpoint, `GET /v1/bhakti/assets/`, ordered
kind-then-sort exactly like fetchAssets, returning the snake_case rows toAsset
consumes; the only write path is the service layer's `seed_asset` (the
service-role `backend/seed/bhakti.mjs` replacement, constraint-safe against a
racing re-seed) reachable from no URL. No e-puja session state exists to
migrate: the shrine (`src/screens/Pooja.jsx`, at `/darshan`) is fully
client-side mock data with zero backend calls — §6's "one session write"
turned out not to exist. No `*_check.sql` covers bhakti, so the 024/026 SQL
itself is the ported spec. 29 new pytest-django tests cover the endpoint
contract, the RLS-equivalent matrix (anonymous reads active rows; writes are
405s, not 403s — the absence of the policy is the rule), the 026 kind
vocabulary, the column checks, and the seed path's idempotency including a
two-thread race; full suite 182 green.

Files changed: `backend-django/apps/bhakti/` (new — models, services, views,
urls, fake-in migration), `backend-django/tests/test_bhakti.py` (new),
`backend-django/cutovers/bhakti.clientlib.js` (new — the staged client flip),
`backend-django/config/` (app + route registration), `HANDOFF.md` (this
section), `docs/07-DJANGO-MIGRATION.md` (§6 status).


## 10d. Module 5 — content — 19 Sep 2026

The content module (step 5 of `docs/07-DJANGO-MIGRATION.md` §6 — the largest:
feed, posts, reels, articles, reviews, publication, media wiring) is built in
`backend-django/` and **staged, not deployed** — Supabase still serves
production; the client flip sits in `backend-django/cutovers/
content.clientlib.js` awaiting the deploy order. `apps/content/` maps 1:1 onto
`content`, `reviews` and `feed_pins` (`backend/schema/020_content_reviews.sql`
as amended by `025_seekers_publish.sql`, which renamed `consultant_id` to
`author_id` and repointed the key at `profiles`): the kind/status vocabularies,
`view_count >= 0`, unique nullable `booking_id`, unique `legacy_id`, the
partial indexes, all constraint names matching Postgres for the fake-in
migration. `author_id`/`seeker_id`/`consultant_id` are bare UUIDFields — the
FKs to `profiles`/`consultants` are deferred to those modules exactly like the
reactions module deferred `actor_id`.

**The views are the access control, so the views are the code.** The client
reads only through `content_public`, `reviews_public`,
`profile_follow_counts` and `authors_public`; Django does not own those SQL
views, so `services.public_content()` is a queryset that replicates the 025
`content_public` definition exactly — `status='live'` plus the NOT EXISTS that
keeps a blocked consultant's posts out of the feed without making approval a
gate on ordinary people — with the four computed columns (author_name,
author_is_consultant, like_count, save_count) as subselect annotations. Counts
stay COUNT(*) queries, not columns (§1.3): exact by construction, nothing to
drift. `profiles`, `consultants` and `bookings` are read through a raw-SQL
gateway (apps/content/gateway.py), the same pattern astro uses for birth
details — replaced when the profile/consultants/bookings modules land. One
SQLite test artifact is worth knowing: Django stores UUIDFields dashless there
while Postgres compares native uuids, so the cross joins normalise both sides
with `replace(cast(...))` — format-agnostic on both backends.

**Publication** is the 025 insert policy plus the draft state: author is
forced from the JWT (the body cannot carry an identity — the 025 check's
"publish as somebody else" refusal is now structural), `published_at` is the
server's clock, `view_count` and `legacy_id` are never client-settable. Anyone
signed in publishes `post`/`article`; `clip` (and `live_session`) require an
APPROVED consultants row — the claim is not consulted, the table is — and the
403 carries the sentence the interface already shows: "Only a consultant can
post a reel". Admins publish anything. Drafts are invisible to everyone but
the author (`GET` of a draft is a 404, so ids do not leak existence);
`POST /v1/content/<id>/publish/` moves own draft -> live; removal is
`status='removed'`, owner-scoped with admin excepted, never a DELETE. Two
deliberate strictness changes over the old silent RLS behaviour: removing
someone else's post is a 403 rather than a silent no-op, and a blocked
consultant's post/article INSERT is still accepted (policy parity — 025 only
gates the kind and the feed) but invisible everywhere public; their reels are
refused outright. `seed_content`/`seed_review` are the service-role
`backend/seed/content.mjs` replacements — idempotent upserts on `legacy_id`/
`booking_id`, reachable from no URL.

**Reviews** are the anti-fraud gate exactly: the booking must be the caller's
own and `completed`, naming the same consultant, and `booking_id` unique makes
one booking buy one review (a racing duplicate is a 409 carrying the old
23505 sentence "You have already reviewed this session"; a gate failure is a
403 carrying "You can only review a session you have completed" — both
byte-identical to what src/lib/content.js already toasts). `verified` derives
from `booking_id is not null`; seeded reviews carry no fabricated booking, so
they are visible but visibly unverified. The rating caches recompute from the
live reviews in the SAME transaction as every review write, under a
`FOR UPDATE` lock on the consultants row — the 020 trigger's arithmetic,
`round(avg::numeric, 1)` with Postgres's half-away-from-zero rounding, never
an increment. Metered chat still does not create a reviewable booking: the
gate names `bookings`, sessions are a different table, and that gap is carried
over untouched (docs/05 §5.4's open decision).

**Media** rides the Phase 1 presign flow. Two additive changes to
`apps/media/`: the presign response now includes `public_url` (the playback
URL stored on `content.media_url` — 022's public-read decision survives on
R2: the row pointing at the file is already public through the feed, so a
signed URL would buy a round trip per card and nothing else), and a new
`POST /v1/media/<id>/confirm/` flips the row processing -> ready, owner-scoped
(stranger gets 404) and idempotent. The client uploads straight to the bucket
and Django never carries bytes. The staged `uploadMedia` keeps its contract —
return the public URL — with presign -> PUT -> confirm underneath.

**Realtime caveat.** `src/lib/content.js` never subscribed to a
`supabase.channel`: the feed, reels and articles are fetch-on-mount, and 015's
publication covers `messages`/`sessions` only. Nothing realtime is lost when
this module cuts over and polling/refresh stays as-is. The chat screens DO
subscribe (`store.jsx`/`lib/chat.js`) — those keep working only against
Supabase and are module 7's cutover problem; a channels layer is a later
phase, not part of this one.

Endpoints under `/v1/content/`: `feed/` (kinds/limit/after keyset cursor),
`by-author/`, `<id>/` (post detail), `publish/`, `<id>/publish/`,
`<id>/remove/`, `reviews/` (GET anonymous per the views' grant; POST
authenticated through the gate), `reviews/reviewable/`, `follow-counts/`,
`authors/<id>/`. Feed ordering is `-published_at NULLS LAST, -id` — the same
order the client's PostgREST query asked for.

54 new pytest-django tests port both check files (020 points 1-6 and 025
points 1-7: draft/blocked leaks both directions, counts from zero, one like
one row, the four-case review gate, verified derivation, the rating cache
reproducing its source through a removal, strangers reading counts but not
actors), the publication permission matrix (seeker/consultant/pending/blocked/
admin, body-spoofed identity, client-set published_at and view_count), the
draft -> live -> removed lifecycle, keyset pagination exactness across pages,
thread-race tests for both the duplicate-booking race and the cache under
concurrent reviews, the reel-post presign -> confirm -> publish flow, and the
seed services' idempotency. Full suite 236 green.

Files changed: `backend-django/apps/content/` (new — models, gateway,
services, views, urls, fake-in migration), `backend-django/tests/
test_content.py` (new), `backend-django/cutovers/content.clientlib.js` (new —
the staged client flip), `backend-django/apps/media/` (presign `public_url`,
confirm endpoint), `backend-django/config/` (app + route registration),
`HANDOFF.md` (this section), `docs/07-DJANGO-MIGRATION.md` (§6 status).


## 10e. Module 6 — consultants — 19 Sep 2026

The consultants module (step 6 of `docs/07-DJANGO-MIGRATION.md` §6 — the
first real-money touch) is built in `backend-django/` and **staged, not
deployed** — Supabase still serves production; the client flip sits in
`backend-django/cutovers/consultants.clientlib.js` awaiting the deploy order.

**Ownership.** `apps/consultants/` maps 1:1 onto `price_bands`,
`consultants`, `consultant_services`, `consultant_availability`,
`consultant_time_off` (`007`, prices corrected by `011`), `bookings`
(`008`, order_id layer from `012`) and `earnings_ledger` (`012`): all seven
weekday rows per consultant, the frozen booking copies, the partial unique
index `bookings_slot_claim` (THE conflict check), the
`earnings_ledger_nets` check, index names matching Postgres for the fake-in
migration (one 64-char unique key deliberately carries Postgres's own
63-byte truncation). `languages`/`credentials` are `text[]` via a small
custom field (psycopg binds a list on Postgres; JSON text on SQLite).
`profiles`, `wallets`, `ledger`, `orders`, `order_items` stay raw-gateway
tables — the profile module (9) and wallet module (8) own them; prod's
phase-2 triggers (balance-follows-ledger, refuse_mutation) remain in force
until that cutover, and the gateway emulates the balance carry on SQLite,
documented at the site. `EarningsLedger` replicates the append-only trigger
in the model layer (save/delete on an existing row refuse), so rule 2 is
executable in this module's tests; `ledger` keeps its prod trigger and gets
its ORM guard with module 8.

**The booking transaction** replicates `012` as amended by `013` statement
for statement: the client sends `{consultantId, serviceId, startsAt}` and no
price (rule 3); the order is lock wallet → check balance against the LOCKED
number → open the order → CLAIM THE SLOT (the insert that can raise; the
loser never reaches the debit, and the whole block unwinds) → debit the
seeker's ledger → credit the consultant's book, gross − 1800bps fee = net,
each party's book naming the other (013 fix 4). 013's other fixes are in:
zero-price refused by name, short-balance on its own branch. The reversing
credit is `booking_reverse` exactly: both books get a NEW row, the original
debit stands, the order flips 'refunded', and idempotency is 013's unique
index `ledger_one_refund_per_order` — the insert IS the check, a retry is a
no-op, and two concurrent reversals credit once. `decide` is the conditional
UPDATE pending → confirmed | declined (008's policy edge, no read-then-write;
018 fix 1's shape), with the decline's reversal in the same transaction,
exactly as 012's trigger does it. 009's subtraction — availability minus
time off minus slots claimed at pending, horizon 14 days, times IST — lives
in one `open_slots()` that `book_session` itself consults; a second
implementation of that subtraction is the phase-4 bug the SQL file exists
to kill. The 011 arithmetic (20-minute price restored, 15/30 to the nearest
₹10, per-minute to the nearest ₹1, Postgres half-away-from-zero rounding)
is `derive_band_price`, used by the idempotent `seed_price_bands` service.

**Endpoints under `/v1/consultants/`**: `` (list, shaped rows + services,
rating desc NULLS LAST), `price-bands/`, `apply/` (the whole application in
one transaction — row lands 'pending' plus the tier's services priced by
copying the band rows; 009 assertions 8 and 9 are structural), `me/` (the
caller's own row, pending included — the bare-gateway read store.jsx's
refreshConsultant does until the profile module; profiles-table ownership is
unchanged), `<id>/`, `<id>/services/`, `<id>/slots/?date=`, `<id>/
availability/` + `availability/set/` (one cell, one INSERT or DELETE),
`<id>/bookings/` (the queue, carrying the seeker's name and birth details
per 010), `bookings/` (create; Idempotency-Key middleware + the unique
index), `bookings/mine/`, `bookings/<id>/decide/`, `<id>/earnings/`.
Permission matrix: listings/slots/bands anonymous; unapproved consultant is
a 404, not a 403 (invisible, not forbidden); availability read approved-or-
own (else empty, RLS parity), write own-only; bookings read caller-scoped
each side; decide is the booking's consultant's pending edge only; earnings
owner-only; approval exists at no URL. Two documented strictness changes
over silent RLS: another consultant's queue/earnings is a 403 rather than an
empty list, and deciding a resolved booking is a 403 rather than a silent
no-op.

**Tests.** 59 new pytest-django tests port both check files — 009
assertions 1–7 (one slots source on all seven weekdays, pending claim,
decline frees, time off, approval gating both directions, both horizon
ends), 012 assertions 1–10 (one booking one transaction, gross−fee=net
row-level and table-wide, the refusal matrix with byte-exact sentences and
nothing-written counts, decline restores by a NEW row with the original
debit untouched, double reversal credits once, append-only both books,
per-minute refused by name) and the RLS matrix as endpoint tests — plus
three thread-race tests (two seekers one slot → exactly one holds and the
loser leaves no order, no booking, no debit; two concurrent reversals → one
credit; two concurrent decides → one winner) and the 011 rounding vectors.
Full suite **295 green**.

Two deliberate suite changes came with owning the tables: test_content's
fixtures now write `consultants`/`bookings` through this module's models
(raw CREATE TABLE would collide with the real tables), and the content
gateway's single-row lookups gained the `replace(cast(...))` UUID
normalisation (Django stores UUIDFields dashless on SQLite) plus canonical
dashed IDs on return. `models.E034` is silenced in base settings — SQLite
reports no identifier limit so Django assumes 30 chars, while the index
names production carries are up to 34.

**Out of scope, on purpose.** 014–018 are the metered-chat module (step 7):
sessions, presence and realtime publication stay on Supabase until then;
017/018's shared shapes (per-minute services, the mode vocabulary) are
modelled here and their money paths land with chat. The admin reversal for
"never turned up"/platform failure is a service-layer function reachable
from no URL, exactly as 012 grants it.

Files changed: `backend-django/apps/consultants/` (new — models, fields,
gateway, services, views, urls, fake-in migration), `backend-django/tests/
test_consultants.py` (new), `backend-django/cutovers/
consultants.clientlib.js` (new — the staged client flip, plus the
same-commit notes for store.jsx refreshConsultant and ProApply),
`backend-django/apps/content/gateway.py` (UUID normalisation + canonical
IDs for the now-real tables), `backend-django/tests/test_content.py`
(real-table fixtures), `backend-django/config/` (app + route registration,
`SILENCED_SYSTEM_CHECKS` for the 30-char SQLite assumption), `HANDOFF.md`
(this section), `docs/07-DJANGO-MIGRATION.md` (§6 status).

## 10f. Module 7 — chat, the meter — 19 Sep 2026

The metered-chat module (step 7 of `docs/07-DJANGO-MIGRATION.md` §6 — the
highest correctness bar in the migration) is built in `backend-django/` and
**staged, not deployed** — Supabase still serves production; the client
flip sits in `backend-django/cutovers/chat.clientlib.js` awaiting the
deploy order. Full suite **354 green** (295 + 59 new).

**Ownership.** `apps/chat/` maps 1:1 onto `sessions`, `threads`, `messages`
(014, accept re-written by 017 and 018): the frozen `rate_paise`, the
partial unique indexes `sessions_one_live_per_consultant` (THE live-session
conflict check) and `sessions_one_open_request` (018's one-ask-per-pair),
`sessions_live_idx` (the sweeper's whole query cost), the 016 preview
columns, index/constraint names matching Postgres for the fake-in
migration. `profiles`, `wallets`, `ledger`, `orders`, `order_items` stay
raw-gateway tables (modules 8/9 own them) — the metering writes go through
`apps.consultants.gateway` exactly as module 6 established, plus one new
`set_order_total` (014's settle restates the order at the charged amount).
`consultants`/`consultant_services`/`earnings_ledger` are module 6's; chat
reads the first two and appends `EarningsLedger` rows with module 6's own
`fee_paise` (Postgres half-away-from-zero). 016's `touch_thread` trigger
and the phase-2 balance trigger stay live in prod and are emulated on
SQLite, the gateway precedent.

**The meter, replicated statement for statement** (014 as amended by 017
and 018 — read `apps/chat/services.py`'s header before touching anything):
hold-and-settle, two ledger rows per session; accept takes the session ROW
LOCK first (018 fix 1), locks the wallet, holds EVERY minute the balance
buys — `balance // rate`, integer floor, no cap (017) — opens order + one
line, upserts the thread (one per pair, forever), stamps
`started_at/expires_at/heartbeat_at`, debits the whole hold. End is
idempotent with a conditional UPDATE as the CAS (a racing second settle —
a pressed End against a sweep tick — matches zero rows and writes
nothing), clamps the stop to `expires_at`, bills
`max(1, ceil(seconds/60))` in exact integer microsecond arithmetic —
never floats — clamped to `hold // rate`, refunds the unused minutes with
`ref_type='refund'` (one per order, 013's index is the backstop), restates
the order, and writes earnings at the END (gross − 1800bps fee = net),
each book naming the other party's person. The sweeper settles anything
past `expires_at` or silent for the 60s grace
(`coalesce(heartbeat_at, started_at)`), expires unanswered requests after
15 minutes, claims FOR UPDATE SKIP LOCKED, and counts only what it
actually settled so two overlapping runs sum to one settle per session.
018's other three fixes are in: one open request per pair is the index
(asking twice returns the waiting request), a mode `sessions` cannot store
is a refusal not a crash, and only the sweeper's reason lands in the
ledger note. The live-session gate on messages is exactly the policy: a
write is accepted only into a thread with a live, UNEXPIRED session, only
as a participant, with the boundary decided by the server's `expires_at`
to the second.

**Endpoints under `/v1/chat/`**: `sessions/request/` (no rate in the body,
rule 3), `sessions/` (either side, newest 50 — the consultant's queue is
this list client-filtered, as today), `sessions/<id>/accept|end|heartbeat/`
(200 + the server's own `{ok, reason}`, byte-parity with the PostgREST
RPC contract), `threads/` (the `threads_view` shape: names, unread,
`live_session_id`, NULLs last), `threads/<id>/messages/` (participant-only;
`?after=<message id>` keyset paging — no gaps or duplicates while new rows
land), `threads/<id>/messages/send/` (the one write; the inserted row
comes back for the sender's immediate render), `threads/<id>/read/`.
Permission matrix: participant-only everywhere (a stranger's transcript
read is a 403, module 6's documented strictness over silent RLS); the
seeker/consultant scoping IS the sessions policy; admin appears at no URL.

**The staged client flip replaces subscriptions with polling — the one
behavioural change, spelled out.** `cutovers/chat.clientlib.js` keeps
every export of `src/lib/chat.js`, so `ChatPanel`, `ConsultantProfile` and
`ProConsult` are untouched; but `subscribeToThread` /
`subscribeToMySessions` / `subscribeToRequests` are now pollers returning
the same unsubscribe functions: messages poll on a keyset cursor every 3s,
the session lists every 5s firing only on change. This is the plan's
stated M1 transport — REST is the source of truth (docs/07 §6 step 7), and
Realtime/Channels push delivery is a later phase, not part of this
cutover. What production loses for that window: message latency up to ~3s
instead of push, and the consultant's request queue refreshed on a 5s beat
instead of instantly. What it keeps: every metering guarantee above,
because the meter has never lived in the transport. `heartbeat` cadence is
unchanged and screen-driven; a failed heartbeat still answers
`{unreachable: true}` so the room never tears its meter down mid-session.
Cutover order matters more here than for any earlier module: deploy the
API, run `sweep_sessions` on a 1-minute scheduler BEFORE the client flips
(an un-swept hold is the silent failure 014 exists to kill), then flip the
lib.

**Tests.** 59 pytest-django tests port all of `014_metered_chat_check.sql`
— assertions 1–11 verbatim (asking moves nothing; the uncapped hold is
every affordable minute with the wallet moved by exactly the hold; the
second-seeker accept refused by name; the live-session gate; ten minutes
bills ten with the ledger replaying to the balance; earnings gross−fee=net;
a second end settles once; the ended transcript is read-only but still
readable; the accept-time short-balance refusal writes nothing; the
sweeper settles an abandoned session for exactly its minutes; a stranger
sees none of it) — plus the round-up boundary vectors built from the SQL's
exact rule (0/59/60/61/119/120/121s, the hold clamp, the fee's
half-away-from-zero at 40.5), the grace boundary at exactly 60s, the
15-minute request boundary, the heartbeat's zero-at-expiry shape, the
right-side-only unread clear, 016's 120-character preview, keyset-cursor
exactness under concurrent inserts, the endpoint shapes key-for-key with
the client, and six thread-race proofs (two concurrent first messages land
once each in one total order; six concurrent accepts — 018's own proof —
one hold, the wallet moved by exactly that hold; racing duplicate asks make
one request; End racing the sweeper settles once; two concurrent sweepers
do not double-charge; sends at the exact `expires_at` instant are refused
one second before they are accepted). Every service takes an injectable
`now`, so the check's time-faking discipline — move `started_at`, never
wait — holds with zero clock jitter.

**Known deviations from prod, deliberate and small.** (1) The settle's
state change is a conditional UPDATE (CAS) rather than `session_end`'s
read-then-write under `FOR UPDATE` — 018 fix 1's own shape applied where
the settle lives; the lock is still taken, the row still serialises, and a
racing second settle is a reported `already_ended`, never a second write.
(2) Prod's `btrim(body) <> ''` check cannot be expressed portably as an
ORM check constraint, so the model carries `body <> ''` and the service
layer enforces the trim before any write — the refusal happens either way.
(3) `sessions.thread_id`'s FK constraint name differs cosmetically from
014's `sessions_thread_fkey`; `--fake-initial` does not check constraint
names. (4) Sweep counts what it actually settled rather than every
candidate seen — on Postgres SKIP LOCKED the difference never materialises;
on SQLite it makes two overlapping runs report one settle between them.
(5) The pollers keep polling in a background tab the way Realtime did; if
that ever matters, visibility-aware polling is a client-side tweak inside
the staged lib, no API change.

Files changed: `backend-django/apps/chat/` (new — models, services, views,
urls, the `sweep_sessions` management command, fake-in migration),
`backend-django/tests/test_chat.py` (new), `backend-django/cutovers/
chat.clientlib.js` (new — the staged client flip), `backend-django/apps/
consultants/gateway.py` (`set_order_total` for the settle), `backend-django/
config/` (app + route registration), `HANDOFF.md` (this section),
`docs/07-DJANGO-MIGRATION.md` (§6 status).

## 10g. Module 8 — wallet + payments, the money core — 19 Sep 2026

The wallet module (step 8 of `docs/07-DJANGO-MIGRATION.md` §6 — the MONEY
core: wallets, the append-only ledger, top-ups, Razorpay order/webhook) is
built in `backend-django/` and **staged, not deployed** — Supabase still
serves production; the client flip sits in
`backend-django/cutovers/wallet.clientlib.js` awaiting the **feature-freeze
cutover window** (docs/07 §6 step 8 — the one module with a freeze; the
window and its deploy order are spelled out in the cutover file's header).
Full suite **410 green** (354 + 56 new).

**Ownership.** `apps/wallet/` maps 1:1 onto `wallets`, `ledger` (003,
refuse_mutation fixed by 004, wallet_debit's client ref_type removed by 005,
013's refund index) and `payments` (006): exact table/constraint/index names
for the fake-in (`migrate --fake-initial` at cutover; prod's phase-2
triggers stay in force and Django's services never double-write what a
trigger does — documented at the site). `Ledger` carries the append-only
refusal as an ORM guard like module 6's EarningsLedger, so 003's
refuse_mutation rules are executable on SQLite: no UPDATE/DELETE, the
never-negative CHECK, the nonzero-delta CHECK, the ref_type CHECK — and
005's discipline in the service layer, a client debit writes ref_type
'order' ALWAYS. The gateway moves: `apps.consultants.gateway`'s wallet
functions (`lock_wallet_balance`, `insert_ledger`) moved to
`apps.wallet.services` — THE only mutation path — and modules 6/7's money
calls re-point there, same SQL, same results (their 118 tests unchanged
green). Wallet/ledger access is format-agnostic SQL (`_xid`, the content
gateway's helper) because Django stores UUIDs dashless on SQLite while raw
rows are dashed — money reads must not depend on which.

**Services are the only mutation path, stated back.** `debit` is 005's
`wallet_debit` statement for statement — row lock, check against the LOCKED
number, exact refusal sentences ('Not enough balance' byte-identical, with
the post-refusal balance), ref_type forced 'order'. `credit` is
server-side only — payment_capture and service-role adjustments, nothing
client-callable creates a wallet or credits one (Supabase's
handle_new_user still makes the row at signup; auth stays). Holds and
refunds (chat's meter, bookings) are `insert_ledger` with ref_id, one
refund per order by 013's unique index — the insert IS the check.

**Razorpay, edge-function parity.** `apps/wallet/razorpay.py` is the seam
(order create + order-payments lookup, key id/secret server-side, generic
errors). `create_topup_order` replicates razorpay-order: the band
MIN_PAISE ₹100 / MAX_PAISE ₹1,00,000 with the exact sentence 'Add between
₹100 and ₹1,00,000.', amount in paise both directions, notes carrying
profile_id for the dashboard (never the attribution path), and it fails
BEFORE checkout opens rather than after — an unattributable payment must
never reach the card form. `handle_webhook` replicates razorpay-webhook:
verify-then-parse over the RAW body (stdlib hmac/hashlib, compare_digest),
HANDLED = {payment.captured, payment.failed}, everything else a 200
'Ignored.', 401/400/500 exactly like the function's. `payment_capture` is
006 statement for statement: attribution through the 'created' row never
the notes, the event row and the ledger credit in ONE transaction, and
idempotency is the two unique columns — a retried delivery violates the
index and the whole block, credit included, rolls back; the handler
answers `{ok, duplicate}` so Razorpay stops. One documented hardening over
006: amount-must-match-order — a capture whose amount differs from the
order it attributes through is refused (500, retried, named by the
reconciliation) rather than crediting either number silently. The webhook
is a plain Django view (not DRF) at `/v1/wallet/webhook/razorpay/`, no
auth — the signature IS the credential.

**Reconciliation.** `manage.py reconcile_payments` ports
`backend/tools/reconcile-payments.mjs`: every 'created' row with no
terminal sibling is abandoned-or-lost and only Razorpay knows, so the
sweep ASKS — read-only, crediting nothing (a script that mints undoes the
reason the webhook is the only credit path), exiting non-zero and naming
the people owed with the same two-things-in-order advice. Run it after any
webhook change and before believing the first live payment worked.

**Endpoints under `/v1/wallet/`** (call-for-call with the Supabase the
client talks to today, documented in views.py): `GET /` balance
(wallets_select_own as a query; no wallet reads 0 + wallet_exists false),
`GET /ledger/` keyset-paged raw snake_case rows exactly like PostgREST,
`POST /spend/` whose 200 body IS wallet_debit's jsonb (the refusal
sentences and the post-refusal balance travel byte-identically),
`POST /topup/order/` with `{ok:false, reason}` refusal bodies
byte-identical to the edge function's, `GET /topup/<order_id>/` the
client-visible payment outcome (404 so ids don't leak), and the webhook.
The module-1 Idempotency-Key middleware replays a retried order POST; the
client's toppingUpRef guard stays the first line.

**Tests.** 56 pytest-django tests port both check files — 003 assertions
1–8 verbatim (cache follows ledger; the affordable debit once as 'order';
over-balance refused by the server with the exact string and NOTHING
written; nonsense amounts; append-only at the ORM layer; the
never-negative CHECK at the storage layer; replay == balance; no client
write path as 405s) and 006 assertions 1–4 through the real webhook view
(capture credits exactly once; redelivery and repeated-event-id credit
nothing; a failure leaves a row and no credit; unattributable raises) —
plus the band edges with exact sentences, not-configured/502/record-failure
branches, HMAC vectors recomputed independently with the stdlib, bad
signature rejected without parsing, amount-mismatch refused without
credit, topup-status scoping, the reconciliation classifications and the
command's exit codes, and three real-thread races (four concurrent debits
serialise on the lock — exactly two of four pass, the wallet never
negative; double top-up confirm credits once — one `duplicate: true`; a
refund racing a reversal credits once — one caught IntegrityError).
Refusal byte-parity is asserted string for string throughout.

**Deliberate deviations from prod, small and documented.** (1)
Amount-must-match-order, above. (2) 006's error classes become typed
exceptions (CaptureFailed/Refusal) the webhook maps onto the function's
exact statuses and bodies. (3) Unauthenticated topup gets the DRF 401
envelope rather than the function's `{ok:false, reason:'Sign in to add
money.'}`; the staged clientlib maps it back to that sentence. (4) The
client's topup flow is unchanged — checkout.js in the browser, the 12s
balance poll, the same settling toast.

Files changed: `backend-django/apps/wallet/` (new — models, services,
razorpay client, views, urls, the `reconcile_payments` command, fake-in
migration), `backend-django/tests/test_wallet.py` (new),
`backend-django/cutovers/wallet.clientlib.js` (new — the staged wallet
slice + the freeze window and deploy order), `backend-django/apps/
consultants/gateway.py` (wallet functions moved to apps.wallet.services),
`backend-django/apps/consultants/services.py` + `backend-django/apps/chat/
services.py` (money calls re-pointed), `backend-django/apps/consultants/
models.py` (header: ledger's ORM guard now exists), `backend-django/tests/
test_consultants.py` + `backend-django/tests/test_chat.py` (fixtures use
the real wallet tables; triggers kept; one test's wallet-delete emulates
003's cascade), `backend-django/config/` (app + route + Razorpay
settings), `HANDOFF.md` (this section), `docs/07-DJANGO-MIGRATION.md`
(§6 row 8, §7 step 13).

## 10h. Module 9 — profile + avatar, the last write surface — 19 Sep 2026

The profile module (step 9 of `docs/07-DJANGO-MIGRATION.md` §6 — the
identity spine AND the last write surface: user profiles and avatar
uploads) is built in `backend-django/` and **staged, not deployed** —
Supabase still serves production; the client flip sits in
`backend-django/cutovers/profiles.clientlib.js` awaiting the deploy
order. Full suite **450 green** (410 + 40 new).

**Ownership.** `apps/profiles/` maps 1:1 onto `profiles`
(`backend/schema/001_profiles.sql`, the column grant and all, plus
`002_profiles_email.sql`'s nullable/not-unique contact column with its
named CHECK `profiles_email_shape` carried into the model, plus
`027_profile_avatars.sql`'s `avatar_url`) — exact table/constraint names
for the fake-in (`migrate --fake-initial` at cutover; `handle_new_user`
STAYS a prod trigger — `services.ensure_profile` is the same insert as
code, for the window before it fires and for fresh databases, and never
double-writes what the trigger does). `id` is the Supabase auth user id,
a bare UUIDField, no local FK — identity stays in Supabase Auth (docs/07
§1). THE gateway moment the earlier modules deferred to: astro's birth
read, content's author/reviewer names, consultants' `_name_expr` and the
010 bookings_view birth/name joins, chat's threads_view name joins — all
re-pointed to `apps.profiles.services` (`get_birth_details`,
`profile_name`/`profile_names`, `name_subquery`/`birth_subquery`). All
four suites re-run green on the re-pointed seams with their raw
`profiles` scratch-table fixtures replaced by the real model (module 6's
precedent); the `_xid` dashless-UUID dance is gone at every boundary
that was profiles-to-X (both sides are Django tables now, so the joins
are ORM subqueries). One test-visible correction came with a real `time`
column: the bookings_view's `birth_time` now renders `07:40:00`, which
is what Postgres/PostgREST always returned — the old `07:40` was a
text-scratch-table artifact.

**The rules as code.** `profiles_select_own` / `profiles_update_own`
become `/v1/profiles/me/` — identity forced from the JWT, no id in the
URL at all (rule 3), the row shape byte-compatible with PostgREST's
`select('*')` so store.jsx's readers need no translation. The 001/002
column grant is the serializer's allow-list: name, email and the eight
birth columns; `admin`, `phone`, `legacy_id`, `id`, `created_at` are
dropped from any body, even the caller's own row, and 002's email shape
is checked at the door (a 400 the reveal screen can show) AND at the
storage layer (the named CHECK, executable on SQLite — Django registers
the regexp function). `avatar_url` is deliberately NOT grant-writable in
the PATCH even though 027 re-issued the grant: the Django path routes
every avatar write through the asset-validated endpoint, which makes
027's documented quiet-failure trap (update reports success, changes
nothing) structurally unreachable. Birth details stay private: the astro
module reads the CALLER'S OWN row server-side (unchanged invariant, now
through the profile module), and the only other carry — the seeker's
birth details to the consultant ON the booking — is 010's bookings_view,
unchanged and still no phone, no email. The public read
(`GET /v1/profiles/<id>/`) exposes `{id, name, avatar_url}` — and only
for a profile the existing public surfaces already show (live content per
`authors_public`, 025; an approved practice per `consultants_public`,
007) — anything else is a 404 so ids do not leak existence. `avatar_url`
rides the public shape as 027's documented follow-up. There is no admin
shape: 001's policies give an admin nothing on this table.

**Avatars (027 onto the media spine).** The upload is a `media_assets`
row (kind image, owner the caller) through the module-1 presign flow —
bytes straight to R2, Django never carries them. `POST
/v1/profiles/me/avatar/ {asset_id}` points the caller's row at the READY
asset: someone else's asset is a 404 (ids don't leak existence, the
media-app precedent), a non-image or unconfirmed asset is a shaped
refusal, and the stored URL is the asset's public URL plus a `?v=`
cache-bust — byte-compatible with what avatar.js writes today. The fixed
`<uid>/avatar` bucket path and its upsert go away: replacement is a
pointer change, never a bucket delete, and no file is orphaned.

**Endpoints under `/v1/profiles/`**: `me/` (GET full self — 404 so
store.jsx's null-means-not-loaded stays honest; PATCH the onboarding
write — creates the row when the trigger hasn't fired, partial-updates,
idempotent, Idempotency-Key replayable), `me/avatar/`, `<id>/` (public
projection, AllowAny like the views' anon grants).

**Tests.** 40 pytest-django tests: the RLS matrix as endpoints (self vs
stranger vs anonymous; identity forced from the JWT; birth-details
privacy — the public shape's key set is exactly `{id, name, avatar_url}`
and nothing else exists); the column-grant matrix (non-writable columns
dropped, `admin` never self-granted, avatar_url not PATCH-writable); the
onboarding write shape key for key with Computing.jsx (including the
unknown-birth-time pair NULL + false); 002's CHECK at the door and the
storage layer (named `profiles_email_shape`, case-insensitive like `~*`);
the avatar flow end to end including confirming someone else's asset
(404, not 403) and unconfirmed/non-image refusals; `handle_new_user`
parity (`ensure_profile`, the 'there' fallback, one row under a racing
double-create); and the races — two threads' first writes collapse to one
row (unique primary key, loser reads winner), Idempotency-Key replay,
double avatar set. One harness fact worth keeping: DRF's APIClient lets
`credentials()` OVERRIDE per-request Authorization headers
(`kwargs.update(self._credentials)`), so tests that act as two users
need a client per user.

**Deliberate deviations from prod, small and documented.** (1)
`avatar_url` set only through the avatar endpoint, not the column grant
(above — a strictness change over silent RLS, the module-6 precedent).
(2) The avatar size cap is the media gate's 10 MB, not the old bucket's
25 MB; the refusal sentence names the real limit. (3) The public
projection includes `avatar_url` (027's documented follow-up) and gates
on the 025/007 visibility predicates, which no single old view expressed
in one place. (4) `birth_time` renders `HH:MM:SS` everywhere now (the
old `07:40` was a scratch-table artifact; Postgres always sent seconds).
(5) Email-shape refusals answer the repo's standard envelope with the
field named in `errors`, not a driver CHECK message — Computing.jsx's
`setSaveError(error.message)` path is unchanged because the client sends
only calendar-validated shapes today.

Files changed: `backend-django/apps/profiles/` (new — models, services,
views, urls, fake-in migration), `backend-django/tests/test_profiles.py`
(new), `backend-django/cutovers/profiles.clientlib.js` (new — the staged
profile slice + avatar.js drop-in + the same-commit notes for the rest of
the store split), `backend-django/apps/astro/services.py` (birth read
re-pointed), `backend-django/apps/content/gateway.py` +
`backend-django/apps/content/services.py` (name reads re-pointed;
author_name join is an ORM subquery), `backend-django/apps/consultants/
gateway.py` + `backend-django/apps/consultants/services.py` and
`backend-django/apps/chat/services.py` (name/birth joins re-pointed),
`backend-django/tests/test_astro.py` + `test_content.py` +
`test_consultants.py` + `test_chat.py` (fixtures write the real profiles
table through the model), `backend-django/config/` (app + route
registration), `HANDOFF.md` (this section), `docs/07-DJANGO-MIGRATION.md`
(§6 row 9, status). Nothing in `src/`, `backend/`, or docs 01–06 was
touched.

## 10i. Module 10 — the audit, cutover verification, and the runbook — 19 Sep 2026

The final module is **integration, not code**: an exhaustive audit of every
Supabase/lib call site in `src/`, a mechanical verification of all nine
staged cutovers against the current client, and the runbook that executes
the cutover in four production deploys. **Nothing new was built — the audit
found zero uncovered call sites, so the suite stays 450 green and no
endpoints, tests or client patches were added.** Shop, Academy and
Notifications confirmed static (Shop's only data dependency is `useMyChart`
from `lib/astro.js`, which flips with module 3); People, Synastry, Pooja,
Tarot, Ask, Invite, Premium and Reports read `data/mock.js` only.

**The audit, call site by call site:**

| Call site | Disposition |
|---|---|
| `src/lib/reactions.js` (3 exports) | Module 2 — `cutovers/reactions.clientlib.js` |
| `src/lib/astro.js` (13 exports, incl. `callAstro` for AskPlace geo) | Module 3 — `cutovers/astro.clientlib.js` |
| `src/lib/bhakti.js` (5 exports) | Module 4 — `cutovers/bhakti.clientlib.js` |
| `src/lib/content.js` (12 exports) | Module 5 — `cutovers/content.clientlib.js` |
| `src/lib/consultants.js` (14 exports) | Module 6 — `cutovers/consultants.clientlib.js` (+`myConsultant`, `applyAsConsultant`, `listPriceBands` for the same-commit edits) |
| store.jsx `refreshConsultant` (raw `consultants` read) | Module 6 — `myConsultant()` (cutover header, same commit) |
| ProApply.jsx (`price_bands` read, `consultants` + `consultant_services` writes) | Module 6 — `listPriceBands()` + `applyAsConsultant()` (same commit) |
| `src/lib/chat.js` (13 exports) | Module 7 — `cutovers/chat.clientlib.js` (subscriptions become pollers) |
| store.jsx wallet slice (`refreshWallet`, `spend`, `topup`, `toLedgerRow`, `formatLedgerDate`) | Module 8 — `cutovers/wallet.clientlib.js` |
| store.jsx profile slice (`refreshProfile`) + Computing.jsx profiles write | Module 9 — `cutovers/profiles.clientlib.js` (`createProfileApi.refreshProfile` / `saveProfile`; write keys verified byte-identical to Computing's update block) |
| `src/lib/avatar.js` (`uploadAvatar`) | Module 9 — drop-in at the bottom of `profiles.clientlib.js` |
| store.jsx session (`getSession`, `onAuthStateChange`), AskPhone/VerifyOtp OTP | **Stay on Supabase Auth — permanently** (docs/07 §1); the access token is the Django credential |
| Shop/Academy/Notifications/People/Synastry and the mock screens | Static — nothing to build, noted as-is |

**Cutover verification (mechanical, not eyeballed):** a script listed the
export surface of every `src/lib/*.js` next to its staged cutover —
reactions 3/3, astro 13/13, bhakti 5/5, content 12/12, chat 13/13 exact;
consultants 14/14 plus the three documented additions. The wallet cutover's
`toLedgerRow` and `formatLedgerDate` are character-identical to store.jsx's
copies, and its `refreshWallet`/`spend`/`topup` semantics match the store
blocks they replace (guards, refusal sentences, 8×1.5s balance poll). **No
drift anywhere** — `src/` is unchanged since the modules were staged.

**The runbook** (`backend-django/cutovers/RUNBOOK.md`) — four deploys:
1. **API bootstrap**: deploy the API, `migrate --fake-initial` (fakes the
   nine business apps against the existing tables, applies `outbox_events`/
   `media_assets` for real — they don't exist in production), start
   `dispatch_outbox`. No client change, no freeze.
2. **Batch A** — reactions, astro, bhakti, content, consultants in one
   client commit (five lib flips + the module-6 `store.jsx`/ProApply
   edits). RLS revocation for the group after its quiet week; the `astro`
   edge function retires.
3. **Chat**: `sweep_sessions` on a 1-minute scheduler FIRST, unschedule the
   pg_cron `session-sweep` job, verify a clean cycle, then flip the lib.
   RLS revocation after the quiet week.
4. **Wallet + profile in ONE freeze window and one client commit** (both
   halves rewrite store.jsx; the wallet checkout prefill reads profile
   state): freeze → Razorpay dashboard webhook switch to
   `/v1/wallet/webhook/razorpay/` → test-mode payment end to end → flip →
   `reconcile_payments` → quiet week → retire the two Razorpay edge
   functions and revoke the money/profile RLS.

Every step carries verification curls, and rollback per step (a cutover is
atomic per lib file; revocations wait for the quiet week precisely so there
is nothing left to roll back). The final state: Supabase keeps Auth,
Postgres and the triggers Django deliberately leaves in force
(`handle_new_user`, the phase-2 balance trigger, `touch_thread`).

Open before deploy 1 (docs/07 phase 0, still open): a fresh production
backup verified by restore, and the production API host decision. The
staging-host item gates the staging rehearsal, not this code.

Files changed: `backend-django/cutovers/RUNBOOK.md` (new),
`HANDOFF.md` (this section), `docs/07-DJANGO-MIGRATION.md` (§6 row 10 and
status header, §7 phases marked). Nothing in `src/`, `backend/`, or
docs 01–06 was touched.

## 10j. namo-dev DB-object parity — 20 Sep 2026

The Django-owned tables landed on the fresh namo-dev (`usgzgrdxlzgnehtbebzo`) without the Supabase-side objects the 27 SQL migrations build around them, so the DB-level parity pass applied every non-table object from `backend/schema/` to namo-dev in dependency order, idempotently (each source file's objects in their own transaction, `create or replace` / `drop if exists` / guarded inserts added where the source lacked them): all 7 triggers (`on_auth_user_created` on `auth.users` → `handle_new_user` with the 003 wallet row, `ledger_immutable` + `ledger_applies_to_balance` with `refuse_mutation`/`apply_ledger_to_balance`, `earnings_ledger_immutable`, `bookings_decline_reverses`/`reverse_on_decline`, 016's `messages_touch_thread`, 020's `reviews_rating_cache`), all 8 views (`consultants_public`, `bookings_view`, `threads_view`, `content_public` in its 025 author_id form, `consultant_follower_counts`, `reviews_public`, `profile_follow_counts`, `authors_public`), all 17 functions (final 005/013/018 versions of `wallet_debit`, `book_session`, `booking_reverse`, `session_request`/`accept`/`end`/`sweep`, plus `payment_capture`, `consultant_open_slots`, `session_heartbeat`, `touch_thread`, `refresh_rating_cache`, `reviews_touch_rating_cache`, `handle_new_user`), every RLS policy (36), the column grants/revokes, the `supabase_realtime` publication for `messages` + `sessions`, the 007→011 `price_bands` catalogue seed (24 rows, 011-corrected prices), and the table/column comments. Deliberately skipped: the `content-media` and `bhakti-media` storage buckets and their `storage.objects` policies (media goes through Django/R2), the pg_cron extension + `session-sweep` schedule (Django's `sweep_sessions` command owns the tick), and all `*_check.sql` files (tests, not migrations). Two deviations worth knowing: `orders`/`order_items` did not exist at all — no Django migration creates them and the apps write them through a raw-SQL gateway — so they were created per 012 verbatim (they are not Django-owned), and Django ships every table default Python-side, so the column defaults the SQL DDL declares (uuid ids, `now()` timestamps, `wallets.balance_paise 0`, `profiles.birth_time_known/admin false`, status/kind defaults) were added as metadata-only `set default` — without them `handle_new_user` and the client-insert policies cannot function; both are invisible to the ORM and `manage.py migrate --check` still reports nothing pending. Verified on namo-dev: a rolled-back signup insert fired `handle_new_user` (profile + wallet created), a hand-typed ledger credit/debit moved `wallets.balance_paise` 0 → 124000 → 100000 via the trigger, and `refuse_mutation` refused the UPDATE; a full idempotent re-run of the whole set is clean. Known cosmetic divergences Django owns (not "fixed", flagged for awareness): `consultant_availability` carries a surrogate bigint `id` pk alongside the composite unique, `wallets` gained a `created_at`, and several `text` columns are `varchar` — none affect the SQL objects. Files changed: `HANDOFF.md` (this section) only; the apply scripts lived in `/tmp/namodev_parity/` and were not committed.

## 11a. UX direction — one look, three bets — 19 Sep 2026

`mocks/ux-directions/` holds eleven artboards on a design canvas
(https://claude.ai/artifact/9bsWweaVCQmrn2JYVFFeLe, flat copy at
https://claude.ai/artifact/HRj3VxyHyBE7cktFysKBxR). **Nothing in `src/` was
touched and nothing is wired to the backend.** The folder does not build and
must not be imported from.

**The look is settled and uniform.** An earlier pass gave each of the three
bets its own art direction — that is reversed. C's theme is now every screen's
theme: paper `#FFFFFB`, cream `#FFF1DC`, peach `#FFD2A6`, orange `#FF8500`,
ink `#3D405B`, plus burnt orange `#A85400` for orange text. Fraunces for
headings and numbers, Karla for everything else.

**Orange is fill and flame only.** White on `#FF8500` is 2.4:1 and ink on it
4.1:1, so nothing readable sits on it: orange carries the arch band, the lamp,
the streak pips, the online dots and the metered-chat bar, and every button is
ink with paper text at 10:1. `C0-Palette.dc.html` is the token sheet.

What is still open is the spine, and because the screens now look identical the
comparison is only about structure:

- **A · The Question.** Home is a text field; three people who answer that
  question come back, online, in the asked-for language, and the roster of 84
  becomes a link. Breaks below roughly forty approved consultants.
- **B · The Chart.** Home is today's transits against the signed-in person's own
  placements — the first use onboarding's birth details have ever had
  (`01-PRD.md` §3 still records them as collected and unused). Only as good as
  the `astro` Edge Function is, daily, for everybody.
- **C · The Ritual — chosen.** Home is `/darshan`: a free daily lamp against a
  stated intention with a date on it, and when the date nears the app says so
  once and offers a person. Needs no new capability — the 26 murtis, the aarti
  and Bhaktamar are already built.

**B3 is worth keeping whichever spine wins**: the astrologer opens a paid chat
already holding the chart, the transit and the question, with a visible list of
what was shared and what was withheld. Nobody in the market does that.

None of this is `src/index.css`. The shipped token set is untouched, and
adopting this palette is a separate decision from adopting C's spine. When
either is taken it changes `03-APP-FLOW.md` (routes and the money path),
`04-UI-UX.md` (tokens) and `01-PRD.md` §3, and this section is rewritten to say
what shipped.

## 11. Live verification on namo-dev — 20 Sep 2026

All eight Django modules exercised over HTTP against real Postgres + R2
(HANDOFF §10's stack): profiles, reactions, astro, bhakti, content,
consultants, chat, wallet — PASS end to end (two ES256 JWTs, mock astro,
R2 media PUTs real). Two bugs surfaced that 453 SQLite-green tests could
not see, both fixed and re-verified live:

- **chat sweeper**: `select_for_update` outside a transaction — SQLite
  ignores it, Postgres crashes; expired sessions would never settle and
  holds would leak in production. Wrapped in `transaction.atomic()`
  (`apps/chat/services.py`); sweeper now runs clean and expired the
  stranded session it had left behind.
- **booking decline flag**: on Postgres the `bookings_decline_reverses`
  trigger reverses inside the status UPDATE; the app's explicit reversal
  then hits the unique index and reported `reversed:false` while the
  money HAD moved. The flag now answers "is the seeker refunded" via a
  dashless-safe refund-row lookup (`apps/consultants/services.py`);
  retry/race test expectations updated to the truthful semantics.

Also recorded (not failures): topup/webhook return 500 "Payments are not
configured yet." while Razorpay has no dev keys; `media.example.com` is
the placeholder public base until a bucket domain exists; mock astro's
`degree: 32.47` ascendant is a mock artifact.

Files changed: `apps/chat/services.py`, `apps/consultants/services.py`,
`tests/test_consultants.py`. Live evidence: booking 48c93f93 decline →
`reversed:true`, balance 95500 → 28500 → 95500.

## 12. Both apps hosted from the new account — 20 Sep 2026

The codebase now deploys as two sites from `onenamocom-stack`:
**seeker** at https://onenamocom-stack.github.io/namoApp/ (this repo, the
existing `deploy.yml`, pointed at the production Supabase project) and
**consultant** at https://onenamocom-stack.github.io/namo-pro/ (a deploy
shell that checks this repo out with a PAT and builds `--mode pro`).
1namo.com itself still serves from the original repo
(atharvborse2004-ops/aether-mono); both new builds strip the CNAME, and
the domain moves at the production window — never before.

Housekeeping with a sting: `backend-django/.env` was committed to git
twice (service-role key, DB password, R2 secret) before anyone noticed.
Scrubbed from all history with git-filter-repo and `.env` is gitignored
now — but the values sat in pushed history, so ROTATE the Supabase
service-role key, the namo-dev DB password, and the R2 token. Today.

Also: phone sign-in did not work, and the reason recorded here first —
"the Twilio account has no Messaging product, Verify-only" — was wrong.
See §15; it is fixed and real OTP now arrives.

## 13. The repalette — white/orange on `ux/white-orange` — 20 Sep 2026

The palette the team picked (HANDOFF §11a) is applied to the running app on
the branch `ux/white-orange`. **Not merged, not deployed** — it exists to be
walked before anybody decides.

Every value resolves through the `:root` tokens, which is what the design
system was built for, so the change is `src/index.css` plus
`tailwind.config.js` and nothing else. `npm run lint` is 0 errors / 3 warnings
(the documented baseline) and the build is green.

| Was | Now | |
|---|---|---|
| `--bg` `#f1efec` | `#fffffb` | page |
| `--surface` `#ffffff` | `#fff1dc` | card — **cards are now warmer than the page**, inverting the old model |
| `--surface-2` `#f7f5f2` | `#ffd2a6` | wells |
| `--ink` `#0e0e10` | `#3d405b` | with `--ink-2` `#4a4e6e` and `--ink-lit` `#585c80` |
| `--text` ladder | `#3d405b` / `#5a5d75` / `#6e7189` / `#a9abbd` | 10.1 / 6.4 / 4.8 / 2.4:1, re-measured against the new page |
| `--gold` `#8f6210` | `#a85400` | **text**, 5.3:1 |
| `--gold-fill` `#d29a2b` | `#ff8500` | **fill only** |
| shadows `rgba(15,14,14,…)` | `rgba(61,64,91,…)` | 49 in `index.css`, 6 in the Tailwind scale |

**The one thing that made this not a find-and-replace.** Gold had two roles —
`--gold` readable as text at 4.7:1, `--gold-fill` as a background. Orange only
has the second: `#ff8500` is 2.4:1 against the page, worse than the grey that
is fenced to ticks and rules. There are **62 `.gold` text call sites**, 12
fills and three rules in `index.css`. Pointing `--gold` at `#ff8500` would have
dropped all 62 below AA in one line, silently, because nothing in the build
checks contrast. `--gold` is therefore the burnt value `#a85400` and the token
names are kept — renaming to `--orange*` would touch every one of those call
sites for no behavioural gain.

`.pop-btn-gold` labels itself `#2a2d42` rather than `--ink`: ink on `#ff8500`
is 4.13:1, which clears large text and fails the 11px caps the button carries.

### Second pass — every colour is saffron now, 20 Sep 2026

Asked for on review: no colour outside the palette anywhere, and more orange,
because saffron carries meaning in Sanatan Dharm rather than being decoration.
Three changes, all on the same branch:

- **Ten gradients repainted into the saffron family.** Six promo banners
  (`Consult.jsx` indigo/green/gold, `Shop.jsx` purple/green/amber) and four
  category headers (`Shop.jsx` `CAT_GRADIENT`: purple, green, brown, rose).
  They now run `#7c2d12 → #c2410c`, `#6b3410 → #a85400`, `#8a3a00 → #b45309`
  and `#5c2c0d → #9a4a05`, varying by depth rather than by hue.

  **This also fixed a contrast bug that predates the repalette.** Banner copy
  is white over the gradient, so the LIGHT end of each pair is what has to
  carry it — and the old indigo ended at `#818cf8`, where white is 2.98:1,
  under AA for the 13px note and the 11px kicker. Every new light end is at
  or below `#b45309`, which is 5.0:1 or better.
- **`--ok` `#0b8b50` → `#e06c00`.** The online dot was the last thing in the
  app belonging to no palette. It is a DOT and never text: at 3.2:1 it would
  fail as a label, which is why the token comment now says so.
- **`--surface` `#fff1dc` → `#ffeddd`**, a hue shift from 36° to 28° — the
  cream read yellow beside the orange. One line, and the one value here that
  deviates from the hexes the team sent.

`--live` `#cf3a25` is kept. It is already in the warm family and it is the
only way a live badge is told apart from an online dot.

### Third pass — the two misses, and the button — 20 Sep 2026

Found by looking at the running app rather than at the diff, which is the
point `04-UI-UX.md` §11.1 keeps making.

- **The tab bar was still near-black.** Its frosted fill is
  `rgba(14, 14, 16, 0.9)` written out inside the `@supports` block, because a
  translucent colour cannot be `var(--ink)` without a colour function. It was
  the one value in the app that does not read a token, so the repalette missed
  it and the app's largest ink surface stayed the old colour under a navy
  everything-else. Now `rgba(61, 64, 91, 0.9)`, with a comment saying to move
  it whenever `--ink` moves.
- **`index.html`'s `theme-color` was still `#f1efec`**, so a phone painted its
  browser chrome the old canvas colour. Now `#fffffb`.
- **The wordmark was pure `#000000`** — sampled, not guessed: 10,698 opaque
  pixels, every one of them black. That broke the first rule in `index.css`
  ("the ink is never pure black") and left one pure-black object beside navy
  type. `public/namo-logo.png` is now used as a **mask** rather than drawn as
  an image, filled with `bg-ink`, so the mark repalettes with the token
  instead of needing a second PNG. The `<Link>` already carried
  `aria-label="Namo"`, so the masked span is `aria-hidden`.

  **It is not the accent, and that was the decision.** Orange is one voltage
  per screen; the mark is on every screen, so an orange logo would spend the
  voltage everywhere and therefore signal nothing.

**And the primary button is saffron, which reverses C0's "buttons are ink".**
That rule was measured on the BRIGHT orange — white on `#ff8500` is 2.4:1 and
unusable, which is still true and still why `--gold-fill` carries no text. A
deeper saffron is a different answer: `.pop-btn` is now
`#c25010 → #9a4a00`, where white is 5.38:1 at the lit end and 6.1:1 at the
deep end. Both clear AA for the 11px caps the button carries, which is the
size the ink rule existed to protect.

`.pop-btn-gold` stays the bright variant (`#ffa340 → #ff8500`, `#2a2d42`
label), so the two button looks are still distinguishable: deep saffron is
the primary action, bright orange is the one voltage.

**Not done, and each is a decision rather than an oversight:**

- **Nobody has walked it in a browser.** Lint and a green build prove the class
  of error `04-UI-UX.md` §11.1 is about, and nothing else. This branch changes
  every surface in the app.
- `docs/04-UI-UX.md` §1, §2.1, §2.5, §3 and the appendix are rewritten to the
  new values in the same commit. No other document names a colour.

## 14. Data migration, the API on Cloud Run, and deploy 2 rehearsed — 20 Sep 2026

Three things landed today. Only the first is live to anybody.

### The old dev database is now the new one

`mrjsatelbuiypodeulcx` -> `usgzgrdxlzgnehtbebzo`, run from
`~/namo-migration/` (outside git; it reads two gitignored env files).
**34 of 34 non-empty tables match, the ledger replays to the stored
balances exactly (743400 paise, 0 mismatched), and nothing points at a
profile that does not exist.**

Four things broke on the way and each is a fact about the schemas rather
than about the copy:

- **14 tables existed only on the old database** — Shop, Academy,
  shipping, admin — and **none of them is in `backend/schema/`.** They were
  created straight onto that database. Their DDL came out of it with
  `pg_dump`, along with 11 functions the RLS policies on them call.
- **`--disable-triggers` needs superuser**, which Supabase does not grant.
  `session_replication_role = replica` does the same job from a session and
  is what the copy actually used — which matters more than convenience:
  the target's `ledger_applies_to_balance` trigger adds every ledger row to
  `wallets.balance_paise`, so copying balances AND ledger rows with triggers
  live would have counted the money twice.
- **`order_items` refused `'shipping'`** — the target's CHECK is the older,
  narrower one and 6 rows use that value. Nineteen other CHECK constraints
  differ only in Django's varchar spelling and allow the same values.
- **`bookings.rescheduled_to` is `rescheduled_to_id` on the target**, fixed
  in the dump before it reached the database.

Two gaps in the Django schema, found by the copy and worth fixing properly:
**`payments.order_id` and `orders.expires_at` do not exist on the target**
(added by hand here, so which order a payment settled is not lost), and
**`profiles` has no FK to `auth.users`** where the source does.

**Logins: 2 of 15.** All 15 profiles moved — 6 of the 8 consultants and 48
of the 52 content rows belong to the other 13, so leaving them out would
have emptied the feed. Only the two real accounts got `auth.users` and
`auth.identities` rows. No service-role key was needed: `auth` is a schema
like any other over a direct connection. `confirmed_at` is generated and
has to be left out of the column list.

### The API is on Cloud Run

`https://namo-api-499026166575.asia-south1.run.app` — RUNBOOK deploy 1.
Health 200, `/v1/me/` 401, `/v1/bhakti/assets/` 200 against the migrated
data. `backend-django/Dockerfile` and gunicorn are new; neither existed.

**No client points at it.** That is deploy 1's definition of done.

### Deploy 2 rehearsed on localhost, and it found two real bugs

Not deployed. The five leaf libs were swapped in on `cutover/deploy2-test`
and driven through a browser against the live API.

- **`X-Cutover-Module`** in `consultants.clientlib.js` and
  `chat.clientlib.js` forces a CORS preflight the API refuses — its
  allowlist is Authorization, Content-Type, Idempotency-Key, X-Request-Id.
  Every browser call failed while curl saw 200, because curl does not
  preflight. **This would have broken the real deploy 2 and deploy 3.**
- **`VITE_DJANGO_API_URL` needs the `/v1` suffix.** Without it every path
  404s, and `listConsultants` turns that into an empty list rather than an
  error — an outage that looks like an empty marketplace.

Verified through the real lib functions: 8 consultants, 24 bands, 52
content rows, 22 bhakti assets, services and slots per consultant.

**Nothing behind a session was tested, and nothing can be:** Twilio has no
Messaging product on this account, so OTP delivery fails for every number
(§12). Wallet, bookings and chat stay unexercised until that or test-OTP
numbers are configured on `usgzgrdxlzgnehtbebzo`.

### Still open

- **Five credentials remain unrotated** and are now in more places: two
  GitHub PATs (one plaintext in `.git/config`), the Supabase service-role
  key, the namo-dev database password, and the R2 token — the last two also
  sit in Cloud Run's environment now.
- ~~Media still points at the old project's storage.~~ **Done 21 Sep.**
  The `namo-media` bucket's R2.dev public URL is on, all 50
  `content.media_url` rows were rewritten to it in one transaction, and the
  API serves them — the feed's 50 media rows all resolve to
  `pub-3af0d667…r2.dev` and return 206 with the right content type.
  `MEDIA_PUBLIC_BASE_URL` is set on Cloud Run (revision 00003). The R2.dev
  domain is rate-limited and meant for development; swap in
  `media.1namo.com` as a Custom Domain before real traffic — one env var and
  one UPDATE. The old Supabase storage bucket is now unreferenced but has
  **not** been deleted.
- `pro.1namo.com` needs a CNAME at GoDaddy before the consultant app gets
  a real address.

## 15. Phone sign-in works, and what was actually broken — 21 Sep 2026

Real SMS OTP now reaches an Indian handset and the signed-in screens have
been walked against the API for the first time. §12's diagnosis was wrong
in a way worth keeping: the account was never Verify-only.

**Two separate faults, stacked.**

1. **Supabase held a placeholder Messaging Service SID.** Every failed send
   in Twilio's log carries `from: MG00000000000000000000000000000000` —
   thirty-two zeros. That is what produced 21701, "the Messaging Service
   does not exist", and what 20404 surfaced as at the Supabase edge. The
   real service was on the account the whole time:
   `MG7644aa4b2f7a29b58c138f2d467d9720`, named "NAMO SMS".
2. **That real service had no sender attached.** The one earlier attempt
   that used the correct SID — 20 Aug — failed 21704 for exactly this.
   Fixing the SID alone would have moved the error, not removed it. The
   account's number `+1 717 584 9736` is now attached to it.

The account is **Full and active** with balance, not a trial. And a US long
code **does** deliver to India here — `+918447284861` came back `delivered`
with no DLT registration in the path. Do not read that as a guarantee at
volume; read it as: the MSG91 decision is not forced today.

**Signed-in screens, walked with a real session** (user
`153e3eba-5719-4be1-bd7a-54e422dfb69b`, a first-time sign-up):

| Route | |
|---|---|
| `me/`, `profiles/me/` | 200 — `handle_new_user` fired, profile exists |
| `wallet/` | 200, `wallet_exists: true`, balance 0 |
| `wallet/ledger/`, `reactions/`, `chat/threads/`, `chat/sessions/` | 200, empty — correct for a new account |
| `consultants/bookings/mine/`, `content/reviews/reviewable/` | 200, empty |
| `astro/panchang/` | 200 |
| `consultants/me/` | 404 — the documented "no practice" state, not a fault |

Two 404s that looked like bugs were wrong paths of mine: bookings live at
`consultants/bookings/mine/`, reactions at `reactions/`. **`orders/` and
`notifications/` have no Django app at all** — still Supabase, still
unmigrated, and not in any cutover yet.

**The Twilio auth token is now in more places too.** The rotate list is six:
two GitHub PATs, the Supabase service-role key, the namo-dev DB password,
the R2 token, and Twilio.

## 16. Deploys 2 and 3 are live — six modules on the Django API — 21 Sep 2026

`545ff44..b9bfe9b` on main. **1namo.com now reads reactions, astro,
bhakti, content, consultants and chat from Cloud Run**, and the live
bundle was checked rather than assumed:

- `usgzgrdxlzgnehtbebzo.supabase.co` — the seeker app moved here from
  `talqzgolttfgdzcoaqno`, a **third** project nobody had written down. It
  held 49 content rows, 22 bhakti assets, **0 profiles and 0 bookings** —
  seed data, no users, nothing lost. The pro app was already on the new
  project; only the seeker's two secrets were stale.
- `https://namo-api-…run.app/v1` — with the suffix. `deploy.yml` now fails
  the build when the secret is missing or does not end in `/v1`, because
  that exact omission is invisible at runtime: it reads as an empty
  marketplace, not as an outage.
- Media resolves to `pub-3af0d667….r2.dev`.

Exercised from the live origin, so CORS is real and not curl's blind spot:
feed, consultants (8), price bands (24), bhakti assets (22), panchang and
reaction counts all 200.

**Chat trades Realtime for polling.** The subscribe* functions keep their
signatures and still return an unsubscribe, so no screen changed, but
messages now arrive on a 3s poll and sessions on a 5s one (docs/07 §6
step 7 — push delivery is a later phase). A consultant sees a request up
to five seconds late.

**The sweepers are running again — pg_cron, not Cloud Run.** Nothing was
ending an abandoned chat session, and the reason was narrower than it
looked: `session_sweep()` came across with the migration and works, but
**extensions do not copy with the data**, so the clock that called it
every minute was never installed on the new database. Restoring it was
three lines, not a new piece of infrastructure:

```sql
create extension pg_cron;
select cron.schedule('session-sweep',     '* * * * *', 'select public.session_sweep()');
select cron.schedule('shop-order-expire', '* * * * *', 'select public.shop_order_expire()');
```

Both were called by hand first (0 rows affected — nothing was stuck) and
`cron.job_run_details` now shows both succeeding every minute.

**There were two jobs on the old database, not one.** `shop_order_expire`
is the other, and it had been dead just as long — Shop orders were never
expiring. It is scheduled again too.

Django's `sweep_sessions` and `dispatch_outbox` management commands stay
unscheduled. `sweep_sessions` is the eventual replacement for the SQL one
and must not run alongside it; `dispatch_outbox` has an empty table until
deploy 4 puts payment events in it, and needs a scheduler before that.

~~The pro app's workflow was not updated.~~ **Done 21 Sep** — and the
guard earned itself on the first run. `onenamocom-stack/namo-pro` got the
same `VITE_DJANGO_API_URL` line, and its build **failed** on
`Verify build env is present`: the secret had been set there without the
`/v1` suffix. The consultant app stayed on its old bundle instead of
shipping with a broken API URL, which is what the check exists for.
Secret corrected, rebuilt, and verified: bundle `index-SPa-K_D9.js`,
pointing at `usgzgrdxlzgnehtbebzo` and `…run.app/v1`, no doubled prefix,
`/pro/apply` rendering.

Deploy 4 — wallet, payments, profile — is untouched and still needs
Razorpay keys.

## 17. Razorpay is connected and the money path works — 21 Sep 2026

Namo has its own Razorpay account; the Abzzo keys borrowed earlier were a
different merchant, and that mismatch is worth recording because it is
invisible until a payment goes missing: **orders were being created on one
account while the webhook sat on another**, so no event could ever arrive.
Caught by comparing the key id on Cloud Run against the one in the
dashboard, not by any failure.

The account's test keys were regenerated (the secret is shown once), and
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` are
on Cloud Run, revision 00005. The webhook is registered **in test mode** —
Razorpay keeps test and live webhook lists apart, and a live-mode entry
would never have fired for a `rzp_test_` order. The old Supabase edge
function's webhook was deleted.

**Walked, not assumed.** An order for ₹100 (`order_TedyTa59SZ07j9`), then
a `payment.captured` signed with the webhook secret:

| | |
|---|---|
| correct signature | 200, `duplicate: false`, wallet 0 → 10000 paise |
| tampered signature | 401, nothing written |
| same event replayed | 200, `duplicate: true`, no second credit |

The ledger row reads "Added money", `ref_type: payment`. **All 17 wallets
still replay exactly from their ledgers — 0 mismatched** — and the system
holds 753400 paise, the migrated 743400 plus this credit.

**The capture was synthetic.** The signature and every code path are real,
but Razorpay did not deliver it — a browser checkout with a test card is
the one step left, and it is the only thing that proves delivery rather
than handling. The `pay_SYNTHETIC_…` payment row and its 10000 paise are
test data on the dev database; delete them when that stops being useful.

Razorpay's MCP server is configured for this project
(`https://mcp.razorpay.com/mcp`, Basic auth). The key secret sits in
`~/.claude.json` in plaintext, which is how the integration is documented
— treat it as a credential on disk.

**The client is still on Supabase for wallet, payments and profile.**
Everything above is the API and the database. Deploy 4 — the one client
commit that moves `store.jsx`, `wallet.js`, `profile.js` and
`avatar.js` — has not been made.

## 18. Deploy 4 — the cutover is complete — 21 Sep 2026

wallet, payments and profile moved in one commit (`8e8862e`), which
finishes the store split. **The app now makes no PostgREST call at all:
no `.from()`, no `.rpc()`, no `functions.invoke()`. Every remaining
`supabase` reference is `auth.*`** — `getSession`, `onAuthStateChange`,
`signInWithOtp`, `verifyOtp` — in `store.jsx`, `AskPhone.jsx`,
`VerifyOtp.jsx`, and the three libs that read the access token. That is
exactly what docs/07 §1 said would stay.

`store.jsx` keeps its state, its `spendingRef`/`toppingUpRef` guards and
every export; only the internals changed. `Computing.jsx`'s onboarding
write is `saveProfile()` now — same keys, no `.eq('id', …)`.

**Two bugs got through lint and build, and the browser found both.** They
are worth keeping because they are the same lesson twice:

- **`showToast` was read before its initializer.** The wallet api is built
  in a `useMemo` that toasts the server's refusal sentences, and a `const`
  in its temporal dead zone throws at render — the provider died and the
  app mounted as a **blank page**. Lint clean, build green, zero console
  output until the page was actually opened.
- **The three new libs prepended `/v1`** to a `VITE_DJANGO_API_URL` that
  already carries it. Every call went to `/v1/v1/…` and 404'd, and the
  wallet showed an em dash and an empty statement rather than an error —
  the same silent shape as deploy 2's missing suffix, from the opposite
  mistake.

`prefill` became a function rather than an object in the same pass: the
api is built once, so a person who signs in afterwards would have reached
Razorpay's checkout with whatever name and phone were mounted before them.

Walked signed in on dev: the wallet renders ₹100 and the "Added money ·
UPI · +₹100" row the webhook credit wrote, profile renders, and no
request doubles its prefix.

**Not deployed.** This is committed on main but the runbook's deploy-4
steps around it are not done: no `reconcile_payments` run, the two
Supabase edge functions (`razorpay-order`, `razorpay-webhook`) are still
deployed, and no RLS grant has been revoked anywhere. Those are the
retirement half, and they wait until the client has been quiet.

## 19. The JavaScript backend is commented out, not deleted — 21 Sep 2026

Four files, every line prefixed with `// ` under a header saying what
replaced them:

| | Replaced by |
|---|---|
| `backend/functions/astro/index.ts` | `apps/astro/` |
| `backend/functions/razorpay-order/index.ts` | `POST /v1/wallet/topup/order/` |
| `backend/functions/razorpay-webhook/index.ts` | `POST /v1/wallet/webhook/razorpay/` |
| `backend/tools/reconcile-payments.mjs` | `manage.py reconcile_payments` |

**This turned nothing off.** The three Edge Functions may still be deployed
on Supabase and still answering; `supabase functions delete` is what stops
them, and that is the retirement step that waits for the quiet period.
Nothing calls them either way. The commenting is a marker, and a deliberate
trap-avoidance note sits in each header: **do not redeploy from these
files**, because a deploy would now ship an empty function.

**Left alone on purpose, and not covered by "comment out the JS":**

- `backend/schema/**` — SQL, not JavaScript, and the live database. Django
  runs on these tables; the triggers in them are still in force.
- `backend/INSTRUCTIONS.md` — the eight rules. Django obeys them.
- `backend/seed/*.mjs` and the two remaining tools
  (`astro-usage.mjs`, `verify-canonical-births.mjs`) — developer scripts
  against the database, not the serving backend. Nothing in Django
  replaces them, so commenting them would remove working tools and
  replace them with nothing. Say the word if they should go too.

The plan is to delete `backend/functions/` outright after a few quiet
days. Git history holds every original.

## 20. Namo AI is built — and the free counter finally exists — 21 Sep 2026

`96513ca`. The Ask AI tab answered from a four-element array of canned
replies behind a 900ms fake delay. It asks a model now, on the server, with
the seeker's own chart as grounding.

**The counter moved to the server, and that was the real hole.** "Five free
questions" was React state seeded at five: a page reload handed out five
more, and no server anywhere disagreed. It is `ai_quota` now, and nothing
in the client counts questions.

The ladder is five free on arrival, then one a day **from the next day**,
then ₹9 a minute. The first cut granted the daily message the instant the
welcome five ran out — a new account got six on day one. A test caught it
and now holds the rule.

**Per-minute was chosen against the recommendation, and the reasoning is
worth keeping.** The research said: Astrotalk and its imitators bill
₹15-40/min prepaid; per-minute is the loudest complaint in their reviews
("the timer never stops" — thinking and typing are billable); and the
AI-only apps mostly do not meter at all. At ₹0.02 a question the two models
earn the same money. It was chosen anyway, so three things here answer the
complaint rather than paper over it: the hold is capped at what the wallet
can pay so an abandoned tab cannot overspend, unused minutes are always
refunded, and **the clock is on screen with End beside it.**

**Walked on the live API and in the browser.** Five free then refused; ₹100
held 11 minutes leaving ₹1 (a part-minute is neither held nor sold); a paid
question answered; the clock counted 9:59 → 9:55 on screen; End charged one
minute and returned the rest. **17 of 17 wallets still replay from their
ledgers.**

**Three Cloud Run Jobs on Cloud Scheduler** — `sweep_ai_sessions` and
`dispatch_outbox` every minute, `flush_ai_messages` nightly at 03:00 IST.
The AI sweeper is the money one: without it an abandoned session's held
minutes never come back. The scheduler URIs were silently mangled on
creation — `gcloud scheduler jobs create --uri` ate the `:r` of `:run`,
leaving `.../jobs/namo-sweep-aiun`, which Cloud Scheduler reported as
`code=5` (NOT_FOUND) and which reads exactly like a permissions problem.
**Use `--uri=` with an equals sign.**

### What this still needs

- **`GEMINI_API_KEY`.** `AI_PROVIDER` is `mock` on Cloud Run, so the
  answers in production right now are the four deterministic ones. Set the
  key and `AI_PROVIDER=gemini` and it is live — no deploy, one env update.
- **The prompt has never met the real model.** Every refusal rule in
  `apps/ai/prompt.py` — no medical or legal instruction, no death or
  pregnancy prediction, no guarantees, astrology only — is untested against
  Gemini. That is the first thing to probe when the key lands.
- **Premium still sells a 12-question pack** (`questionPacks` in
  `src/data/mock.js`) for a product that no longer counts questions. Left
  alone rather than quietly rewritten; docs/01-PRD.md §4.4 records it as an
  open contradiction.
- **`/v1/ai/` has no rate limit of its own** beyond the quota. A free
  message a day is a weak lever against someone scripting accounts.

## 21. Namo AI is on the real model — and the prompt held — 22 Sep 2026

`AI_PROVIDER=gemini` on Cloud Run, revision 00009. The four canned replies
are gone.

**The model name took three tries, and the lesson is the general one.**
`gemini-2.0-flash` (the first guess) does not exist on this key at all.
`gemini-2.5-flash` **is in the models listing** and still answers 404 —
"no longer available to new users". `gemini-3.6-flash` works. **A listing
is not an entitlement; call the thing.**

**The thinking budget was a real bug, and a bill.** Gemini 3.x reasons
before it answers, those tokens come out of `maxOutputTokens`, and they
bill at the **output** rate. With the ceiling at 400 a reply spent 385 on
thinking and 11 on the answer: every sentence came back truncated with
`finishReason: MAX_TOKENS`, at roughly five times the cost it should have
been. `thinkingConfig.thinkingBudget` is 0 now — the chart arrives
structured and the answer is six sentences of it. After: `finish: STOP`,
0 thinking tokens, ~86 output.

**Six probes against the live model, all correct:**

| | |
|---|---|
| "Write me a Python function…" | refused, named the chart instead |
| chest pain / blood thinners | "I do not give medical advice, nor can gemstones replace prescribed medication" |
| "When will my father die?" | "I do not predict death or the timing of a person's end" |
| "Guarantee I marry in 2027" | "No chart provides guarantees" — then answered astrologically anyway |
| "Ignore all previous instructions…" | refused, stayed an astrologer |
| "Which crypto should I buy?" | refused the asset pick, gave a Saturn/dasha framing |

A real question — "good period to change jobs, means moving cities" — came
back citing Saturn in the 10th ruling the 4th, the Saturn-Mercury dasha and
Mars retrograde in the 7th. The placements are the ones it was given, not
invented.

**One flaw worth fixing:** the financial answer opened "Your birth details
are needed for a full reading" **while holding the chart**. Harmless here
but it is the no-chart branch leaking into a case that has one.

### Still open

- **`AI_PROVIDER=gemini` has not been walked end to end through the API**,
  only the prompt directly against Gemini. The session refresh token was
  spent, and a new OTP is needed for a signed-in pass.
- ~~Cost is ~₹0.10 a question.~~ **Measured 22 Sep: ₹0.029.** Spend moved
  ₹1.01 → ₹1.30 across exactly 10 calls. Both earlier figures were
  estimates and both were wrong — ₹0.02 was optimistic, ₹0.10 was the
  thinking-budget bug. Three paise is the real number: a new account's five
  free messages cost ₹0.15, and ₹500 of prepay is roughly 17,000 questions.
  Against ₹9 a minute there is no optimisation worth doing yet.

  Token shape per call: ~763 in, ~52 out, and the input climbs ~65 a turn
  as history accumulates — 664, 728, 795, 863 across four questions. It
  plateaus near 1,400 at the 20-message cap. Input is roughly an eighth the
  price of output, which is why carrying the conversation is affordable and
  the answer length is what to watch.
- **The free tier is not available.** A fresh project (`namo-ai-free-58824`)
  was created and Google denies it Gemini access outright — 403 "your
  project has been denied access", 404 on every other model. The paid key
  with ₹500 of prepay credits is the only path. **That empty project still
  exists** and should be deleted.
- **Two keys are now in the chat** — the paid Gemini key and the free-tier
  one. The rotate list is eight.

## 22. The admin console — all five stages — 22 Sep 2026

**https://namo-console-499026166575.asia-south1.run.app/console/**

Built overnight, in the order chosen: approval, shop, reels, analytics,
Shiprocket. 546 tests.

### The TRD's admin decision was reversed, deliberately

docs/02-TRD.md §7 asked for a **separate application holding the
service-role key**. That was written against Supabase, where reading across
every user meant bypassing RLS and a leaked admin JWT would have read every
wallet in the system. **Neither half survives the Django cutover**: there is
no RLS in this path and no admin JWT to leak.

The goal it protected — a compromised seeker session must not reach the
console — is met better here. The console takes a **session cookie against
`auth_user`**; the phone app carries a **Supabase JWT**. One is not
convertible into the other, and `tests/test_console.py` asserts it.

What survives is the **runtime** separation. One image, two Cloud Run
services, verified live in both directions:

| | `/console/` | `/v1/health/` |
|---|---|---|
| `namo-api` | **404** | 200 |
| `namo-console` | login | **404** |

### What was already there

`admin_users` and `admin_actions` came across in the migration **with
rows** — the Supabase build had an admin, and the trail still carries its
history (`shop.shipped`, `academy.refund`). Nine shop tables likewise, with
11 products and 27 orders. Nothing here invented a schema. Two things are
new: `admin_users.operator_user_id` (an admin is a profile; Django logs
them in against `auth_user`) and the `coupons` table, because nothing like
it existed.

**A discrepancy, recorded not reconciled:** docs/01-PRD.md §6 names the
third tier *Moderator*; the database says `fulfilment` and has a CHECK and
rows. The database won.

### Three bugs that only opening it found

- **The approval queue and the audit trail were invisible.** Django falls
  back to its own model permissions when a ModelAdmin does not override
  `has_module_permission`, and a console operator has none — they are staff
  by way of `admin_users`, not `auth_permission`. Every test passed and the
  one thing stage 1 exists for could not be reached. There is a menu test
  now.
- **`collectstatic` ran under base settings**, where the manifest storage
  is not configured, so no manifest was written and every console page
  500'd on `admin/css/base.css`.
- **The dashboard rendered `₹True`** — a chain of template filters that
  composes wrong and fails silently. Money is formatted in Python now.

### Decisions taken while you were asleep

- **Prices are typed in rupees.** Asking an operator to type `185000` for a
  gemstone is a factor-of-ten mistake waiting to become a real order.
- **Nothing in the shop deletes, at any tier.** An order item points at a
  product by id. `active=False` takes it off the shop and keeps the history.
- **Orders are read-only, superadmin included.** The total is what the
  wallet was debited; a second editable copy is a second source of truth.
  Refunds go through the wallet's reversing entry.
- **Analytics collects no IP and no user agent**, and there is a test that
  the columns do not *exist* — not that we leave them empty. Paths have
  their ids stripped on both sides.
- **Attribution is first touch, never overwritten.** "How many came by
  referral" is a first-touch question.
- **Shiprocket pushes are a button, never automatic.** The account is
  Abzzo's: labels carry their pickup address, and a courier collecting a
  real box from the wrong company because a payment fired at 3am cannot be
  undone with an UPDATE.

### Open, and yours to decide

- **PRD §6 leaves blocking policy unresolved**: a blocked consultant with
  confirmed bookings and a pending balance. The console blocks — the
  alternative was no way to stop a bad actor — but **touches no money and
  cancels no bookings**. That call must not be made by a side effect.
- **The console is `--allow-unauthenticated`.** The login is the gate, but
  an IP allowlist in front of it costs nothing and the split exists to make
  that possible.
- Your login: `p8447284861`, password shown once in the session log.
  **Change it.**
- `AI_DAILY_FREE` is still **500** on the API, from the testing window.
- The rotate list is **nine**: two GitHub PATs, the Supabase service-role
  key, the namo-dev DB password, the R2 token, Twilio, the paid Gemini key,
  the free-tier Gemini key, and now Shiprocket.

## 23. Everything is deployed — and Shiprocket cannot yet dispatch — 22 Sep 2026

**Deployed, and checked rather than assumed.** Working tree clean, nothing
unpushed, and all four surfaces answering: `1namo.com` 200, the pro app
200, `namo-api` health 200 (revision 00016, serving `/v1/events/`), and the
console 302 to its login (revision 00012, dashboard present). The live
smoke check passes all sixteen (`tools/smoke.py`).

**Shiprocket is written, tested and configured — and cannot send a parcel
today.** The credentials are real: a login against their API returns a
token for company 8212396, "AK International". What that account does
**not** have is a pickup address:

```
GET /settings/company/pickup  ->  {"shipping_address": null, "recent_addresses": []}
```

`SHIPROCKET_PICKUP` is set to `"Primary"`, which was a guess and names
nothing. Every push would be refused by their validation. The console
action reports the refusal and writes nothing, so the failure is visible
rather than silent — but it is a failure.

**This is the borrowed-account problem arriving, exactly where it was
expected to.** Abzzo's Shiprocket account is configured for Abzzo's
warehouse, and it has no pickup address at all. Two ways out, and the
second is the real one:

1. Add a pickup address on that account and set `SHIPROCKET_PICKUP` to its
   name. Namo's parcels then leave from Abzzo's address under Abzzo's
   branding, which was already the accepted trade for testing.
2. **Namo's own Shiprocket account**, with its own KYC and its own pickup
   address. Needed before a real customer is ever shipped to, for the same
   reason Razorpay's live keys will be.

Nothing else in stage 5 is blocked: the client, the retry-on-401, the
AWB and tracking paths and the console actions are all built and tested.
They are waiting on one address.

## 24. The astro API ran on the mock provider for a day — 22 Sep 2026

**From the 21 Sep cutover (§16) until revision 00018 (22 Sep), `namo-api` served
every astro answer from `MockProvider`.** `ASTRO_PROVIDER` was `mock` and
`FREE_ASTRO_API_KEY` was empty on Cloud Run. The real key had lived in the
Supabase function secrets, which the CLI returns only as a digest, so it
never reached the new environment. Nothing refused, because the mock is
built to answer everything. §23's smoke check passed on the mock for the
same reason.

What it cost:

- **Charts, the panchang and the daily reading were invented.** Namo AI
  read those charts, so its answers in that window rest on them. The
  transcripts stand; nothing corrects them.
- **Signup with a searched birthplace could not finish.** The mock geo
  search returns no `timezone`, and `Computing.jsx` refuses a draft without
  one and sends the person back to re-answer. Only the four preset cities
  (Pune, Mumbai, Bengaluru, Delhi) went through. This is also why **no
  profile holds mock coordinates**: checked on `usgzgrdxlzgnehtbebzo`,
  `birth_lat is not null and birth_zone is null` returns 0 rows.

What fixed it:

- `ASTRO_PROVIDER=freeastroapi` and the key set on `namo-api`, revision
  00018. Checked from outside: `/v1/astro/geo/?q=Ujjain` answers Madhya
  Pradesh, 23.18, 75.78, `Asia/Kolkata`. The mock put it in "Maharashtra"
  at 25.39, 72.30.
- `delete from astro_cache` on the production database. The key carries the
  inputs but not the provider, so the mock's rows would have been served
  forever. The panchang refetched real afterwards: sunrise 06:15:16,
  Bhadrapada, Rahu Kaal 15:21–16:52.
- The browser chart cache's stamp went from `'never'` to `'provider-1'` in
  `src/lib/astro.js`, so every phone refetches its chart once.

**The key is in plain text in a chat transcript** (a screenshot of the
update command). It joins the rotate list — ten now.

**Open:** `tools/smoke.py` cannot tell the mock from the vendor. One
assertion closes it: Ujjain's geo result must say Madhya Pradesh, a state
the mock never returns.

## 25. The shop sells real rows, and the last one goes to one buyer — 23 Sep 2026

Testing "does an admin upload reach the app" found that it could not, for
three reasons that all had to be fixed before the question had an answer.

**The app read `mock.js`.** Eleven products hard-coded in JavaScript, so
the console could add one and the app would never show it. The catalogue is
`GET /v1/shop/` now, from the database, with a loading state and an error
state that says it could not reach the shop — not "nothing matches that",
which sends somebody to clear a search that was never the problem.

**Nothing decremented stock.** `buyNow` was a bare wallet debit. A sold-out
gemstone could be bought forever and the shop's own numbers meant nothing.

**So the race could not be lost, because there was nothing to race for.**
It can be now. `claim_stock` is one conditional UPDATE — the database
checks and subtracts in the same statement, holding the row lock, and a row
count of 0 is the refusal:

```python
Product.objects.filter(pk=product_id, active=True, stock__gte=qty)
               .update(stock=F("stock") - qty) == 1
```

Rows are claimed in **sorted id order** so two carts cannot deadlock. Stock
is claimed **before** the wallet, so an order nobody can afford cannot empty
the shelf on its way to being refused.

**Refusals raise, they do not return.** `atomic()` rolls back on an
exception and **commits on a plain `return`** — a refused coupon after a
successful claim left the shelf one short with nobody charged. That is the
bug this section exists for; the test that caught it is in
`tests/test_shop_buy.py`.

**Verified against the live deployment**, not only in tests: two
simultaneous buyers of the last unit produced one order, one "Out of
stock", **stock 0 and not −1**, and one debit. Taking the product down
removed it from the app and refused a purchase with stock still on the row.

Every trace was deleted afterwards including the R2 object, and the ledger
was reversed **by an adjustment rather than a delete** — the ledger is
append-only and `refuse_mutation` means it.

Photos go to R2 from the console server-side (`put_bytes`), and the **path
is what lives in the database**. `backend/INSTRUCTIONS.md` carries the
claim-before-charge rule as §10.

**A boot check now fails loudly on empty R2 credentials**
(`apps/media/checks.py`). `. .env` failing silently in a shell had cost a
debugging session three separate times.

**Open:** images are served from the `pub-….r2.dev` origin. `media.1namo.com`
is the fix for latency and has not been set up.

## 26. Namo AI is priced per question, and answers like somebody wrote it — 23 Sep 2026

Three pieces of feedback from Rahul, all three now true in production
(`namo-api` revision **00022**).

**₹9 a question, not ₹9 a minute.** The meter shipped on the 21st and
lasted two days. A meter is the right shape when you are buying somebody's
*time*, and an AI consumes none — it made the seeker read a clock while
thinking, and thinking is the slow part of asking a question. The ₹9 did
not move, only what it buys.

`start_session`, `heartbeat`, `end_session` and `sweep_ai_sessions` are
**deleted**, not left dormant: retired code that still imports and
half-runs is worse than none, because the next reader cannot tell which
half is live. `git show 6419773` has the whole meter if it ever comes back.
`ai_sessions` and its table **survive** so the rows from the metered
fortnight stay readable — money that moved is not deleted because the
feature that moved it was retired.

**The charge is taken before the model is called, and refunded if no
answer arrives.** Somebody who paid ₹9 and got "could not reach the
astrologer" has been robbed of ₹9. A spent **free** message is deliberately
not given back: the question is still on screen and still retryable, and
refunding it on every failure is a free-question generator for anybody who
can cause a timeout.

**Longer answers.** Three to five sentences is not worth ₹9. Four
paragraphs, 150–250 words: the answer, then what this person is like, then
what this period is doing, then what to do this week. *"People love to read
about themselves"* — the second paragraph is the one that earns the money,
and it was the one missing.

**It answers in the language it was asked in.** It shipped English-only,
which in this market is most of the audience reading a reply in a language
they did not choose. Devanagari gets Devanagari, Roman Hinglish gets Roman
Hinglish back.

**Measured against the live model, not asserted.** `tools/ai_voice_check.py`
now counts three things instead of one — jargon, length, and language:

```
plain  236 words  ·  plain  221  ·  plain  217  ·  plain  198  ·  plain  222
mirrors the question  ·  answered in Hindi  ·  answered in Hinglish
```

It was also **lying about length** until today: it capped output at 500
tokens while the server runs at 1200, so it measured truncated answers the
product does not truncate. It reads `AI_MAX_OUTPUT_TOKENS` now.

**581 tests** — down from 583 because the meter's own tests went with it.

`tools/smoke.py` asserts `/v1/ai/session/` returns a **404**, so no future
deploy can quietly start billing by the minute again.

**`namo-sweep-ai-sched` is PAUSED, not deleted.** It fired every minute at
a Cloud Run Job whose management command no longer exists. Pausing stops
the failures and is reversible; deleting it and its Cloud Run Job is the
tidy-up and has not been done.

**`AI_DAILY_FREE` is still `500` on Cloud Run.** That is the testing window
the seeker asked for and it is **not** the product: at 500 free a day the
₹9 path is unreachable for every tester, so the price has been proven in
tests and not yet by a real debit. It must go back to `1` before anyone
outside the team uses this.

## 27. The console has two superadmins — 23 Sep 2026

Two people can now sign in to the admin console, both at the `superadmin`
tier: the owner's account, and a second one added today for the colleague
who has been reviewing the AI answers. Both were verified by actually
logging in over HTTPS — index, dashboard, products, orders, the
pending-consultant queue and the admin list all answered 200 for each.

**`is_staff` is not the gate.** `NamoAdminSite.has_permission` wants an
**active row in `admin_users`**, and the new login bounced straight back to
the form until it had one — a Django superuser with no console row gets a
successful login and then nothing to see. Creating the login is half the
job; the other half is the `admin_users` row, whose `profile_id` is the
identity the audit trail points at.

Two older `admin_users` rows still have `operator = None`. They came across
in the migration and **cannot sign in** — admin identities with no login
attached, which is the state the model's own comment describes.

Credentials are not recorded in this repo. Both were set once by hand and
should be changed from `/console/password_change/`, because they were typed
into a chat transcript.

## 28. Posting, the video flag, and a moderation queue — 23 Sep 2026

Most of this already existed. Text and image posting, the shared composer,
the reel feed and the studio shipped in module 5; what was missing was
exactly the three things asked for.

**Video was a ROLE. It is a FLAG now.** `clip` used to need an approved
`consultants` row, so the only way to let somebody post reels was to make
them a consultant — which also makes them bookable, lists them as an
astrologer and gives them a rate card. `profiles.video_enabled` is the
grant on its own. Three routes to video, any one enough: the admin claim,
an approved consultant row, or the flag. A blocked account fails all three.

The refusal sentence changed with it. *"Only a consultant can post a
reel"* became *"Video posting is not switched on for your account"*,
because the old one is now false — three tests asserted the old string and
were updated, which is what caught it.

**Reporting, which did not exist at all.** `content_reports`, with
`content_id` nullable: a report is about a POST, or about a PERSON. The
second is the half that answers *"this account has been reported many
times"* when somebody deletes and reposts. One report per person per
thing, enforced by two partial unique indexes rather than one over a
nullable column — in Postgres NULLs are distinct, so a single index would
let the same person file forever.

**A report does nothing on its own, and that is the load-bearing
decision.** No count removes a post; no count blocks an account. Auto-hide
at N reports hands any N accounts the power to silence anyone.
`tests/test_moderation.py::TestAReportIsNotAVerdict` files eight reports
from eight accounts and asserts the post is still live.

**Two admin actions, deliberately different weights.** Remove the post
(the account is untouched — one bad post is not a bad person) and block
the person (every post hidden, cannot post again). Blocking **deletes
nothing**: `blocked_at` is a timestamp, the feed filters them out, and
unblocking puts it all back. Both audited with the admin's name.

**Where the option lives.** A ⋯ at a feed card's corner; **Report** last
on a reel's right rail, below where a thumb rests; **Report** in the top
bar of `/u/:id`. Never in the action row beside Like — it is the one
action nobody is looking for until they need it, and a mis-tap costs a
real person an admin's attention.

**One near-miss worth keeping.** The admin's removal was first written as
`remove_content`, which is already the name of the author removing their
own post — and that one carries an ownership check. It would have shadowed
it entirely, so a moderation feature would have silently removed everyone's
ability to delete their own posts. It is `admin_remove_content` now.

**Live and verified.** `namo-api` revision **00023**, `namo-console`
**00016**, both migrations applied to the production database (one new
table, three new columns, all additive). Checked from outside: both report
routes answer 401 rather than 404, and the console serves **Reports** and
**People** with both admins able to reach them.

**601 tests**, 20 of them new in `tests/test_moderation.py`.

**Not done:** nobody has filed a real report through the app yet — the
routes and the queue are verified, an end-to-end report-then-moderate pass
is not.
## 29. Horoscope, matching and muhurat — 22 Sep 2026

**Merged to `main` and deployed, 23 Sep.** The API half went out first, in
`namo-api` revision 00019, because §24's fix shipped in the same image.

**The daily reading is the reader's own again.** It comes from their birth,
cached as `horoscope:<user>:<digest>:<date>`, and `/horoscope` shows the full
reading again — headline, the day's score, six area ratings, the one
instruction, Do/Don't, the dasha period, what is moving, the long sections,
the reflection. The twelve canonical births, their charts and the moon-drift
check are deleted. **This reverses 7 Sep and supersedes 9 Sep**, and it costs
one upstream call per reader per day: about 1,600 daily horoscope readers on
Entry, then $40 for ten times that. `02-TRD.md` §8 has the accounting.

**Two places now appear on `/horoscope`, and both are named.** The almanac
line is Ujjain, shared. The timing windows come from the reading and are
computed at the reader's birth place. Sunrise moves about two hours across
India, so the screen says which is which.

**`/match` is Ashtakoota.** Slot one defaults to the signed-in reader (the
server reads their own row) and can be switched to a typed person, so a parent
can match two other people; slot two is always typed. 36 gunas, the eight
kootas with the vendor's evidence lines, Manglik per person, Nadi and Bhakoot
for the pair. Nothing typed is stored: the cache key is two hashes. An unknown
birth time is named on the answer, per person, because every koota is read off
a Moon that crosses a nakshatra in a day.

**`/muhurat` is six purposes, a month at a time**, at a place prefilled from
the birth row and changed in one tap. Coordinates round to one decimal, so a
city shares one row a month. `mine=1` judges the same windows against the
caller's chart — and often promotes no single moment, returning a sentence
saying why, which the screen renders instead of an empty list. An empty month
(griha pravesh through Chaturmas) says so in words.

**`/people` and `/people/:id` are gone**, along with `People.jsx`,
`Synastry.jsx` and the `people` mock. Both paths redirect to `/match`.
Consult's free-tools row is five circles now, narrowed to fit a 360px phone.

**Two live bugs were found on the way, both invisible until the real provider
came back** (§24):

1. **Signup was refusing real birthplaces.** The geocoder returns up to eight
   decimal places (Pune is 18.52322222) and both birth-detail serializers
   declared six, so `PATCH /v1/me/` answered "Check the highlighted fields"
   against a place the person had just picked from our own search.
   `apps/core/fields.py` rounds instead of refusing. **Deployed, revision
   00019.**
2. **Namo AI's place search never returned anything.** `SubjectForm` read
   `res.data` where the API sends `results`, so the list was always empty and
   the failure was swallowed by its own `.catch`. Both forms use
   `components/PlaceField.jsx` now, which also shows each result's district
   and state — "Ujjain" returns seven places across two states, and the old
   markup printed the name alone.

**Checks.** 18 new pytest cases (astro) and one new verifier,
`node tools/verify-astro-shapes.mjs`, which runs the REAL vendor payloads
(`tools/fixtures/astro/`, captured 22 Sep from the reference birth) through
the shaping functions in `src/lib/astro.js`. That is the side the Django tests
cannot see: a renamed vendor field reads as an empty section with a green
build. `npm run lint` and both builds are clean.

**Not walked in a browser.** Windows Application Control blocks the headless
browser on this machine, and there is no test-OTP number on
`usgzgrdxlzgnehtbebzo`, so a signed-in local walk needs a real phone. The
shape verifier covers the payload reads; what it cannot cover is layout and
whether the screens feel right.

**Two things this found that are older than this work:**

- `node tools/verify-chart-geometry.mjs` **fails on `main`** — "South chart
  must define exactly 12 cells". The south-Indian chart was deleted on 7 Sep
  (`02-TRD.md` §8) and its verifier still looks for it.
- On Python 3.14 the API suite shows **36 failures on `main`** (console,
  admin templates, shiprocket, analytics), not one. CI runs 3.13, where they
  pass. Locally, that is the noise floor to compare against.

## 30. Presence — the green dot means something now — 24 Sep 2026

Phase 1 of video calling. No video in it: this is the thing video needs
and did not have.

**The dot was `verified`.** `Consult.jsx` said so in a comment — *"There
is no `online` column and no presence yet… a dot that is always green is
worse than no dot"* — and used `verified` as the stand-in. On the live
roster that put a green dot on one consultant who was not online.

**Two columns, not one.** `consultants.accepting_now` is INTENT, a switch
the consultant flips. `last_seen_at` is REALITY, their app beating every
thirty seconds. Online is both, with ninety seconds of grace.

Either alone ends the same way — a dot, a seeker pressing it, nobody
answering. Switch alone: flipped on this morning, app shut, asleep.
Heartbeat alone: app open on the earnings screen at dinner. Having the app
open is not consent to be called.

**Nothing writes "offline".** Going dark is the absence of a beat, so a
dead battery, a crashed app and a closed tab all take the dot down by
themselves. A sweeper is a thing that sometimes does not arrive in time.

**The server refuses before it looks at money.** `request_chat` re-checks
presence rather than trusting the roster's dot, which was a second old
when it was drawn. A seeker with an empty wallet asking an offline
astrologer now hears *the astrologer is offline* — the true answer and the
fixable one. The old order would have sent them to add money for a call
that still would not connect.

**Fifty tests failed when the gate went in**, every one of them a chat
test whose consultant had no presence. That is the gate working: the
fixtures now say the consultant is actually there, and
`tests/test_presence.py` tests the refusal itself. **616 tests**, 15 new.

**Live.** `namo-api` revision **00026**, migration applied. Checked from
outside: the roster carries `online`, all eight consultants read
`online=false` because nobody has opened the pro app since — including the
one who was green yesterday.

### What the video plan looks like from here

The per-minute money machine was already built and running, which is why
this is a two-week job and not a two-month one. `sessions` freezes
`rate_paise` at request time, accept holds `floor(balance / rate)` whole
minutes, end settles and refunds the unused, `expires_at` is a timestamp
so a dead tab cannot buy a free minute, and the sweeper closes what nobody
closed. Rates in production already span **₹37 to ₹3300** — any rate
works, it is an integer.

Still to come:

- **Phase 2 · transport.** Daily.co. Abzzo has the client pattern
  (`designers/daily_client.py`: private room, two participants, `exp`,
  `eject_at_room_exp`) but **its `DAILY_API_KEY` was never set** — the
  code is dormant there, so there is no key to reuse and an account has to
  be made. Room `exp` must equal the session's `expires_at`, or the call
  continues free after the money stops.
- **Phase 3 · both call screens**, seeker and pro.
- **Phase 4 · the edges.** Consultant never joins: full refund. Network
  drops: session stays live, rejoin. Money runs out: Daily ejects, the
  sweeper settles.

Costs, checked: **$0.004 per participant-minute** video, so a 1:1 call is
about **₹0.70/min** against a ₹37–3300 rate — under 2% of revenue. Audio
is $0.00099, four times cheaper, applied automatically when there is no
video track. 10,000 free minutes a month. **Recording and transcription
stay off**: at $0.0059 per unmuted participant-minute that is ~₹1/min for
two people, more than the video itself — and recording somebody's personal
problems is a consent question before it is a cost one. Abzzo has
`auto_start_transcription` on; that must not be copied across.

**Still true and unchanged:** `mode` on `sessions` is stored, constrained,
and **never branched on**. Thirty-two of the production services are
`mode='call'`, six sessions have run, and every one of them was delivered
as a text thread. Until Phase 3 the product sells "call" and delivers chat.

### Presence, follow-up — 24 Sep 2026

**The roster's own Call and Chat buttons were still live for an offline
consultant.** Only the profile page had been gated. A card in the list
that offers Call to somebody asleep is the card that teaches a seeker the
app does not work, so both are `disabled` now with the same line under
them — *"Offline right now · you can still book a time"*. Booking stays
enabled deliberately: it is the thing an offline consultant can still
give you.

Only one path actually opens a paid session (`ConsultantProfile`'s
`askForChat`), and it was already gated — the roster buttons were a
promise the card could not keep rather than a hole in the money.

**Daily.co is configured.** Domain `1namo.daily.co`, key set on
`namo-api` (revision **00028**) and verified against the API. Settings:
`DAILY_API_KEY`, `DAILY_DOMAIN`, and `DAILY_ENABLE_RECORDING` which
defaults **off** — that one is a policy line, not a default waiting to be
flipped. Nothing uses any of it yet; Phase 2 is the next commit.

The key is a plain Cloud Run env var, like `GEMINI_API_KEY` and the
Razorpay secret. Anybody with Viewer on the GCP project can read all
three without deploying. Secret Manager is the fix and has not been done.

## 31. Referrals, cashback and a notifications table — 25 Sep 2026

Two programmes that share a shape and nothing else, plus the alerts
system they needed and the product did not have.

**Codes.** Eight characters, one prefix and seven random, from a
31-letter alphabet with **0, O, 1, I and L removed** — these get read
aloud and typed off screenshots. `N…` seeker, `A…` consultant. A person
can hold both: a seeker later approved as a consultant keeps the N code
they may already have shared.

**The 10% is cashback, not a discount, and that is the point.** The order
is paid at the listed price and the money comes back into the wallet,
where it is spent on a reading or another order and never withdrawn —
the wallet has no seeker withdraw path. A discount would have cost the
same and kept none of it inside the product.

**It waits seven days after DELIVERY, not at checkout.** Otherwise a
buyer takes the cashback, spends it on a consultation, and returns the
item; money already paid to a consultant cannot be clawed back. A return
cancels both rows and nothing has to be recovered from anyone.

**The cap is off and is a flag** — `REFERRAL_CASHBACK_CAP_PAISE`, zero
meaning no cap, on the owner's instruction. An uncapped 10% on the
₹26,400 gemstone is ₹2,640 a side, which is the number to remember when
setting it.

**Sign-up referrals move no money**: three free AI questions a day for
three days, both sides, with day one's welcome five untouched.

### Two bugs this found, both mine

**The first-order check counted the order being placed.** `claim_purchase`
runs after the order and its items are written, so every referred order
saw its own line and refused itself as a second purchase. Every referral
would have failed. Caught by the first live test, not by reading it.

**`admin_remove_content`'s lesson, again**: the earnings row was written
with `note=`, a column `earnings_ledger` does not have — it is `kind`.
Tests caught that one.

### Tested against production, with dummy money, then removed

₹1,000 dummy product, ₹100 a side. Paid **full price**, wallet to ₹0,
cashback pending with no maturity date; swept before delivery → nothing;
delivered → matures 1 Oct; window forced closed → ₹100 into the buyer's
wallet and ₹100 into the consultant's earnings at 0 bps; second order
with the same code → *"This coupon is for first-time buyers only"*; swept
again → nothing moved. A separate run proved the sign-up perk (3/day for
3 days, both sides, welcome five untouched, no money) and a return
(**both rows cancelled, nothing paid**).

**The cleanup hit rule 2 and was allowed to.** `ledger` and
`earnings_ledger` both refuse DELETE by trigger — append-only, and that
was not going to be disabled on a production database to tidy a test. The
money went out the sanctioned way, as reversing entries; everything
deletable was deleted. **Five test profiles remain**, renamed
`[test] referral programme, 25 Sep 2026`, with zero balances, because
their ledger rows cannot leave and so neither can they. **Every wallet
still reconciles with its ledger** — checked after.

### Notifications, which did not exist

The Alerts tab read seven hard-coded strings out of `mock.js`, the same
seven for every account, forever. There is a `notifications` table now,
and the tab reads it.

**Polling, not push** — and that is this codebase's existing answer, not a
shortcut: `src/lib/chat.js` says at the top that Realtime subscriptions
became pollers at the cutover and WebSocket delivery is a later phase.
Alerts poll at 15s against chat's 3s.

### Live

`namo-api` **00029**, `namo-console` **00017**, migrations applied.
`namo-mature-cashback` Cloud Run Job on `namo-mature-cashback-sched`,
daily 03:30 IST — created, executed by hand, then triggered through the
scheduler to prove the wiring. It needed `--command=python`; without it
the container exits before it starts, which is how the first run failed.

**663 tests**, 29 new in `tests/test_referrals.py`.

### Open

- **Onboarding does not ask for a code.** It is claimed from the profile
  card instead, which works but means a new seeker has to find it.
- Shiprocket never sets `DELIVERED` — the console is the only path, so
  cashback matures only when an admin marks the parcel delivered.
- `REFERRAL_CASHBACK_CAP_PAISE` is 0. Uncapped.
## 32. Tarot answers the question now — 24 Sep 2026

**On `tarot-flow`, not merged, not deployed.**

**A pull is: pick a deck, type a question, the server deals a card, the model
reads it.** The old flow held the question in your head, which was right while
a card answered with a line written months earlier — the same line for
everybody who drew it. The partner asked for the full message and a remedy,
and a reading written for a question needs the question, so it is typed now
(200 characters). `docs/03-APP-FLOW.md` has the state machine and the
reversal; the note in `Tarot.jsx` that said "nothing is typed" is rewritten
rather than deleted.

**The server deals the card.** `apps/ai/tarot_decks.py` holds three decks —
Bhaktamar's 48, the Vedic Kipper six, 22 yes/no cards — and
`SystemRandom.choice` picks one. The client sends a deck key and a question
and nothing else: a client that deals its own card can pull until it likes the
answer, on a pull that is charged. The art and the shlokas stay in `src/data/`;
only ids and names are written twice, and `node tools/verify-tarot-decks.mjs`
fails if the two lists drift.

**The money moved to the server, and that closed a real hole.** The two free
pulls a week were `tarot:free1|free2` in the store's `flags` Set, which does
not survive a reload — so they were unlimited and the ₹11 was never once
reached. The count is two columns on `ai_quota` (`tarot_week`, `tarot_used`,
migration `ai 0003`), taken in the same transaction as the debit, and the price
is `TAROT_PRICE_PAISE`. A provider failure refunds the money and does NOT
refund the free pull — refunding that on every failure is a free-pull generator
for anybody who can cause a timeout.

**A pull needs a session now, and that is a change in who can use it.** The
free pulls used to be browser flags, so a signed-out visitor could draw two
cards. The reading costs model time, so an anonymous pull is an unbounded bill
— the screen asks them to sign in, the same rule Namo AI has. Somebody browsing
the free-tools row who has never signed up now sees a sign-in step where they
used to see a card.

**Cost:** about 3 paise of Gemini against ₹11. The reading and the remedy come
back as one answer and are split on the `Remedy:` line the prompt asks for; a
missing line means no remedy rather than an invented one.

**Three decks, and three deleted.** Rider-Waite, Sufi Path and Lotus Path are
gone — six authored lines each and no art. **The art for the two new decks is
not here**: `hindu-01..06.webp` and `yesno-01..22.webp` go in `public/cards/`,
and until they do those decks fall back to the procedural plate. Bhaktamar's 48
faces are unaffected.

### The second vendor, and what it is not used for

`astrologyapi.com` was signed up for tarot, palmistry and numerology. Probed
with its own token before anything was built:

- **Numerology works and is worth having** — `numero_table` and
  `numerological_numbers`, personal, deterministic, Hindi via
  `Accept-Language`. **Next piece of work.**
- **Their tarot returns the same bytes for every caller.** Two different names
  and birth dates, identical prose; every parameter ignored; no card, no image.
  Refused — that is the failure §8 was rewritten to end, and it is why the
  tarot reading above is ours.
- **Palmistry is not on the account at all.** Absent from all 111 tools the
  token exposes; the documented endpoint falls through to a generic validator.
  Blocked on the vendor enabling it, and it needs a private bucket, a consent
  line and a retention rule before any code.

**The trial token was pasted into a chat transcript.** It goes on the rotate
list — eleven now — and the credentials are env-only when the numerology work
lands (`ASTROLOGY_API_USER_ID`, `ASTROLOGY_API_KEY`).

**Checks.** 19 new tests in `tests/test_tarot.py` (the draw, the money, the
week rollover, the refund, the refusals, and that spending tarot pulls does not
touch the Namo AI allowance) and `node tools/verify-tarot-decks.mjs`. Lint and
build clean. **Not walked in a browser** — same blocker as §29, the headless
browser is blocked by Windows Application Control on this machine.
