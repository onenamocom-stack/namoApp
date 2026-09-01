# Handoff — Namo (aether-mono)

**What is actually true right now.** Front end and backend in one file, because
two files claiming to describe reality means neither gets trusted.

Updated 1 Sep 2026.

| Phase | State |
|---|---|
| 0 · pre-work | Done |
| 1 · auth and profile | Done |
| 2 · wallet | Done |
| 3 · payments in | **Built and deployed. One done-condition short**, blocked on Razorpay's website review. The site is now on `1namo.com` (the move Razorpay's review wanted — §6); registering that domain and its policy pages with Razorpay is the remaining step. Until it clears, live checkout is refused and **production wallets cannot be funded** |
| 4 · consultants, availability, approval | **Done.** Schema, seed and front end live on both projects; its check passes on both |
| **5 · bookings** | **Done and closed.** All four done-conditions pass on dev, walked in a browser. `012` and `013` are both on both projects |
| **6 · metered chat** | **Built, walked on dev, and deployed.** The meter, sessions, threads and messages. **Production's DATABASE has none of it** — `014`–`018` and `pg_cron` still to paste (§6) |
| **7 · charts** | **Next.** Third-party API chosen (§3); blocked on the reference chart, which the key does not unblock |

**Production has one real consultant**, who applied through `/pro/apply` and was
approved by hand — the entire approval flow until phase 13. The six seeded
consultants stay `pending` by decision (`01-PRD.md` §7): the marketplace
launches empty rather than furnished with invented people. The real one has **no
availability rows**, so nothing is bookable until somebody taps cells in
`/pro/consult`.

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

Three runnable checks live in `backend/schema/`. Run the ones whose area you
touched, in the **dev** SQL editor.

| File | Covers |
|---|---|
| `003_wallets_ledger_check.sql` | the wallet: balance cache, refusals, replay, double-tap |
| `006_payments_check.sql` | payments: idempotency, a failure leaving no ledger row |
| `009_slots_check.sql` | consultants: slots on all seven weekdays, approval, bands, grants |
| `012_bookings_transaction_check.sql` | bookings: the transaction, the refusals, the reversing credit, both books append-only, the new policies |
| `014_metered_chat_check.sql` | chat: the hold, the round-up, the cutoff, the sweeper, and the live-session gate on messages |

**Passing looks like a failure:** `ERROR: PHASE 2 CHECKS PASSED`, and the same
shape from the other three. Each raises on its last line to roll back every row it
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
library, no state library, no UI kit, **no linter, no type checker, no tests.**

Two sides in one codebase. Most values on screen still come from
`src/data/mock.js` and `src/data/bhaktamar.js`. Four things are real:

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
- **Sun, moon and rising are still seed for everyone**, on four screens
  (`Computing.jsx`, `HoroscopePanel.jsx`, `Shop.jsx`, and via the hook). They
  need the ephemeris service. **Phase 7 must change all four**, not just the hook.

### Screen-level facts that are not obvious from the code

- **Pooja swipe axes:** right/left = deity, down/up = murti. Guarded by
  `node tools/verify-pooja-swipe.mjs`.
- **Deity images are uncropped by default.** `setting:croppedDeityImage` is an
  **opt-in back to the crop**, so its absence is the common case.
- **Tarot is a guided flow**, deck then question then card, the first two as
  centred modal dialogs. Two free pulls a week, then the wallet is charged.
- **Three chart systems** — Vedic, South Indian, Western. `chartSystem` on the
  store, so Profile follows the choice made on `/chart`.
- **Hindi and English** via `src/data/i18n.js` and `t()`. Chrome, mandir and
  tarot are translated; the editorial copy in `mock.js` deliberately is not.
  Noto Sans Devanagari sits **after** Plus Jakarta Sans in the stack — browsers
  resolve per glyph, so Latin is untouched.
- **Pro nav is Earnings / Studio / Go Live / Consult / Profile.** Five tabs, no
  Feed — a consultant runs a practice, she does not browse the seeker feed. The
  route is `/pro/live`, **not** `/pro/golive`, which hits the catch-all and
  lands silently on Studio.
- **`/pro` is gated on a real `consultants` row** as of phase 4 — it used to be
  exempt from the session gate entirely, which is how anyone who typed the URL
  became `consultants[0]`. No session, or no row, lands on `/pro/apply`. Still
  exempt are the two seeker routes it links out to: `/chart` (a booking row's
  "view kundli", prefilled from query params) and `/consult/:id` ("view your
  public page"). `/home` from "Switch to seeking" is **not** exempt — that one
  is genuinely asking for the seeker app. Note `/profile` starts with the four
  characters `/pro`, so the check is on a segment boundary.

---

## 2. Backend — phases 1 to 6

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
- **Onboarding never overwrites an existing birth record.** There is no
  sign-in-only route, so a returning user re-answers the questions to get a
  session; `Computing.jsx` waits for the profile to load and, if `birth_date` is
  already set, signs them in and leaves the row alone.

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

**PRODUCTION'S DATABASE HAS NONE OF THEM.** The front end is live and the tables
it talks to do not exist there, so chat is inert on production until `014`–`018`
and `pg_cron` are pasted in (§6). That is a deliberate order, not an oversight:
the front end going first is harmless, a metering bug on a live wallet is not.

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

**On production the six are `pending` and stay that way** — the marketplace
launches empty by decision, `01-PRD.md` §7. Publishing them is one reversible
statement: `update consultants set status='approved' where legacy_id like 'a_';`

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
- **Seeded consultants land unapproved on production**, and **the marketplace
  launches empty rather than seeded** — decided 26 Aug, reasoning in
  `01-PRD.md` §7. `/consult` says so and offers the application. Flipping the
  six on for a demo is one reversible statement; approving them for the public
  is a different decision and gets re-argued there, not here.
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
| Report prices and the duplicate SKUs | Phases 8, 10 |
| **Ephemeris reference chart** — still unchosen, and the key does not unblock it | Phase 7 |
| Ayanamsa and house system, to be passed explicitly rather than defaulted | Phase 7 |
| Whether onboarding can say the birth time is unknown — `birth_time_known` is hardcoded `true` | Phase 7 |
| Whether the API's geo endpoint replaces Open-Meteo | Phase 7, and `01-PRD.md` §8 |
| Video SDK — 100ms or Agora | Phase 11 |
| Whether a dropped connection stops the meter or grants a grace period | Phase 6 |
| Consultant ranking formula | Phase 13 |
| Blocking a consultant who has pending money | Phase 13 |
| Provenance of the 48 Bhaktamar card faces | Seed |

---

## 5. Known gaps

### Needs a person, not code

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

Reports writes to the cart with no way to
open it · question packs charge nothing · Ask AI shows a hardcoded wallet figure
· `/chart` has no back control · consultant metrics disagree with the warnings
citing them, 88% against 68% · **there is no sign-in-only route**, so a
returning user must re-answer the onboarding questions to get a session — the
consultant branch now routes through the same steps to `/pro/apply`, so the
gap is felt on both sides.

### Deliberate omissions

No audio anywhere — the mandir's sangeet button says so. The chosen murti does
not survive leaving the tab. Bhaktamar is the only deck with real faces. Shani
has three murtis where the rest have four, because pre-modern devotional art of
Shani as a single figure is thin on Commons.

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

## 6. Next — phase 7, charts

**Phase 6 is built, walked and deployed.** What is left of it is production, and
that is deliberate: a metering bug found in a browser is cheaper than one found
on a live wallet.

### Owed on phase 6, before real people use chat

1. **Paste `014`, `015`, `016`, `017`, `018` into the PRODUCTION SQL editor, in
   order.** No agent session can: the MCP is pinned to dev and there is no
   `psql`, no driver and no connection string on this machine.
2. **Enable `pg_cron` on production** and schedule the sweep:
   ```sql
   create extension if not exists pg_cron;
   select cron.schedule('session-sweep', '* * * * *',
                        $$select public.session_sweep()$$);
   ```
   **This is not optional.** Without the scheduler a session both parties walk
   away from never settles, and with no hold cap that is the seeker's entire
   balance held forever, silently.
3. Two done-conditions are still unproven in a browser: **unread clearing on the
   right side only**, and **both sides agreeing on duration after a mid-session
   reload**. The check covers the money; those two are UI behaviour.

### Phase 7 — decided, and what is still open

**Charts come from a third-party API, not our own ephemeris service — decided
1 Sep 2026.** `freeastroapi.com`, Entry tier: $8/month, 50,000 requests/month,
5 req/sec, commercial use permitted. This **reverses** `02-TRD.md` §8, which
chose Swiss Ephemeris as a second Python service; that section is rewritten
rather than extended.

What the tier covers, against surfaces this app already has:

| Surface | Endpoint |
|---|---|
| `/chart` — `placements`, `chartHouses` | Kundli/Rasi, planetary positions, divisional charts |
| Three chart systems (Vedic, South Indian, Western) | Vedic **and** Western natal, both included |
| Panchang — `tithi/nakshatra/yoga/karana/rahuKaal` | Panchang endpoint, same fields |
| Sun / moon / rising on four screens | Dedicated endpoints |
| `/synastry` | Western synastry **and** Ashtakoota kundli matching |
| Daily horoscope — `days` | Sign-based and personalised |
| Place → lat/lon/zone | **Unlimited geo city search on Entry** |

**The geo endpoint may be the most valuable thing in the tier.** `01-PRD.md` §8
records that Open-Meteo's free geocoder is non-commercial and this product is
not — a live licence problem sitting on the signup path since phase 1. This
retires it, with the same shape of data `AskPlace` already consumes.

**Still open, and none of it is unblocked by having the key:**

- **THE REFERENCE CHART.** Named in `01-PRD.md`, `02-TRD.md` §8 and
  `06-IMPLEMENTATION.md` phase 7, and still not chosen. It matters *more* with a
  third-party API than it did with our own ephemeris: with `pyswisseph` the
  ayanamsa was ours to set and the risk was forgetting; here it is theirs to
  default and we cannot see it. Pick a birth with an independently verified
  chart and check every position before believing anything.
- **Ayanamsa and house system, passed explicitly on every call.** The API
  supports Placidus / Whole Sign / Equal / Koch and tropical / sidereal — so the
  default is emphatically not what this product wants, and tropical + Placidus
  would render a beautiful chart belonging to nobody.
- **`birth_time_known` is hardcoded `true`** at `Computing.jsx:111`, and
  `AskTime.jsx` offers no "I don't know". The column exists because, as
  `05-BACKEND-SCHEMA.md` §4.1 puts it, a large share of Indian users do not know
  their minute of birth. All four production users are marked as knowing it and
  some are guessing. **Planets survive a rough time; the ascendant moves a whole
  sign every two hours,** so the houses are fiction while looking precise.
- **Birth details will leave this system.** Date, time and place for every user,
  sent to a third party. Belongs beside the email question in `01-PRD.md` §8.
- **Reports cannot be sold on Entry.** Two report credits a month, against a
  ₹4,041 Full Birth Chart. Phase 8/10's problem, but decide before listing a
  price.

**Two things to build in from the first commit**, both already paid for once:

- **The key never reaches the browser** (rule 7). An Edge Function proxies it,
  four CORS headers, key as a function secret — phase 3's lessons, unchanged.
- **Cache the charts.** A natal chart never changes. 50,000/month is generous,
  5 req/sec is not, and recomputing a constant on every screen visit is money
  and latency. Rule 8: store the input, compute the derivation — and a cached
  derivation carries `_cache` in the column name so it is obviously throwaway.
  Panchang caches per date, horoscope per user per day.

**Sequence: charts first.** Sun/moon/rising, reports and synastry all read the
same computation. Panchang and horoscope are independent and can follow.
Phase 7 must change **four** screens, not one — `Computing.jsx`,
`HoroscopePanel.jsx`, `Shop.jsx` and `useProfileFields()`. Changing only the
hook leaves three screens quietly lying.

### Still parked

**Razorpay's website review.** Applied for; nothing to do but wait. When it
clears, one ₹1 payment closes phase 3's last done-condition *and* proves the
webhook secret set on 31 Aug matches. Run
`backend/tools/reconcile-payments.mjs` straight after.

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

**`npm run build` passing proves almost nothing** — no linter, no type checker,
and an undefined identifier inside JSX compiles cleanly and throws at runtime.
It has shipped a blank screen twice. Walk the routes.
