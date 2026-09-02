# 06 — Implementation plan

The order things get built, and the condition each must satisfy before it counts
as done.

**This document owns sequence.** It names tables and endpoints but defines
neither — those are `05-BACKEND-SCHEMA.md` and `02-TRD.md`. Prices and scope are
`01-PRD.md`. The engineering rules every phase obeys are
`backend/INSTRUCTIONS.md`.

---

## How to read a phase

Each phase is an **end-to-end vertical slice**: schema, server, and the front-end
change that makes it visible, shipped together. Not "all the tables, then all the
functions".

Each carries a **done condition that fails if the logic breaks.** "It works when
I click it" is not one. Where the condition is a test, it is the smallest test
that would catch the failure.

**Every phase ends with walking the affected routes in a browser.** `npm run
build` passing is not evidence — the project has no linter and no type checker,
and an undefined identifier inside JSX compiles cleanly and throws at runtime.
That has shipped a blank screen twice.

---

## Phase 0 — Pre-work

Small repairs, each cheaper before it reaches a database than after.

| Item | Status |
|---|---|
| Fix the `ChatPanel` crash — `isPro` used but never defined, in two places | **Done** |
| Split deity `credit` into artist / licence / source, with one renderer | **Done** |
| Flag the two incomplete Bhaktamar verses rather than reconstructing them | **Done** |
| Reconcile the uncommitted working tree | **Done** |
| Walk every route in a browser, including the messages knob | **Done** — 22 Aug, 22 routes plus drill-ins, no errors. `HANDOFF.md` §4 |
| Choose the ephemeris reference chart | **Owed** — blocks phase 7, not phase 1 |

**Done when:** the tree is clean, the app has been walked end to end, and no
route throws.

---

## Phase 1 — Auth and profile

The smallest slice with real value: the app stops forgetting you.

**Build** — Supabase project. `profiles` with birth details, `legacy_id`, and the
IANA-zone columns. Phone OTP. RLS on `profiles`.

**Front end** — the four onboarding questions write a row at the end of the flow
instead of evaporating. Profile, Chart and Horoscope switch from the fixed mock
user to the signed-in one. A session check on load.

**This closes a real gap**: birth details are currently collected and then never
used — type a different date and nothing downstream changes.

**Done when:** you sign in, close the tab, reopen it, and your birth details are
still there. And a second account sees its own details, not yours.

**Watch:** `birth_time` is naive local plus an IANA zone, never a timestamp and
never a stored offset. Parsing `'14 November 1996'` and `'04:35 AM'` into real
date and time values happens here. Getting this wrong is invisible.

---

## Phase 2 — Wallet, and the async conversion

**Build** — `wallets`, `ledger`, both with the immutability trigger and no write
policy for anyone. A `security definer` debit function.

**Front end — this is the phase with the trap.** `spend()` and `addMoney()` keep
their names and their single home in the store, but their **return contract
changes**: a `boolean` becomes a `Promise<boolean>`, and `if (promise)` is
always truthy.

Five charging call sites must become `async`/`await` **in the same commit**:

```
src/components/CartSheet.jsx:20    if (spend(cartTotal, ...))
src/screens/Tarot.jsx:52           if (!spend(TAROT_PRICE, ...)) return
src/store.jsx:194                  if (spend(product.price, ...))   ← inside buyNow
src/screens/Reports.jsx:80         onClick={() => buyNow(r)}
src/screens/Shop.jsx:273, :347     onClick={() => buyNow(p)}
```

Miss one and it silently lets through a purchase the server refused. Each needs a
pending state on its button too, or a double-tap double-charges.

**Done when:**
1. Devtools cannot change a balance.
2. A debit larger than the balance is refused **by the server**, and the existing
   "Not enough balance" toast fires from that refusal.
3. **Replaying the ledger from zero reproduces the stored balance exactly.** This
   is the check worth writing — if it passes, most of the wallet is right.
4. Double-tapping *Buy now* charges once.

---

## Phase 3 — Payments in

**Build** — `payments`. Razorpay order creation. A webhook endpoint that verifies
the signature before trusting anything, then credits the ledger.

**Front end** — the wallet top-up sheet opens real checkout. The decorative
payment-method tags either become real or come out.

**Done when:**
1. A real ₹1 payment credits the wallet exactly once.
2. **Firing the identical webhook payload twice still credits once.** Verify by
   replaying it, not by reasoning about it.
3. A failed payment leaves a `payments` row and **no ledger row.**

**Watch:** idempotency is the unique index on the provider's own identifier, not
an application-level "have I seen this?" check — that check races with its own
write.

**Not here:** the "+2% cashback" label stays deleted. It was never applied, and
an unimplemented discount promise must not be on screen the day real money
starts moving. Reinstating it means pricing it first, in `docs/01-PRD.md` §4.8.

The top-up presets do return, at the amounts the PRD names.

---

## Phase 4 — Consultants, availability, approval

**Build** — `price_bands`, `consultants`, `consultant_services`,
`consultant_availability`, `consultant_time_off`, the `consultants_public` view,
and the slots source. **`bookings` and `bookings_view` move here from phase 5**
— the table only, not the transaction. Two reasons, neither stylistic: the slots
subtraction reads it, so without it the phase's own done-condition is
untestable; and the seed writes it, since seed trap 1 is about this table.
`order_id` is nullable, which is what lets it arrive a phase early — a seeded
booking carries no order because no money was ever taken for it.

**Front end** — Consult and the consultant profile read real consultants. The
consultant availability grid writes real rows. **Every caller switches to the
one slots source**, which fixes the disagreement where the consultant view
applied booked slots only on Thursday. `/pro` stops being exempt from the
session gate and is gated on a real `consultants` row instead, and the "I give
readings" card in onboarding becomes an actual application rather than a link
straight into somebody else's practice. Accept and decline stop being flag
toggles.

Approval ships here because `status` is the public-read predicate: an unapproved
consultant is invisible, unbookable and unable to earn.

**Seed happens here**, and it is the largest single task in the plan — see §Seed.

**Done when:**
1. Two consultants exist with different prices, and each sees only their own
   availability.
2. An unapproved consultant does not appear in search and cannot be reached by
   direct URL.
3. The seeker's booking sheet and the consultant's availability grid show
   **identical** open slots for the same day — every day, not just Thursday.
4. A consultant cannot approve themselves, and cannot price a session at
   anything but an active band.
5. Accepting a request survives a reload, and a second tap does not undo it.

**Not blocked any more:** the session duration question is answered — both
models, `01-PRD.md` §5.1. Per-minute is modelled here and metered in phase
5/11.

---

## Phase 5 — Bookings

The phase the whole v1 exists for.

**Build** — `orders` and `order_items`. `earnings_ledger`. The booking function: one
transaction doing price lookup, availability check, slot claim, wallet debit,
both ledger writes, order and line, booking insert, thread open. The status-change
endpoint, where a decline writes a **reversing** entry.

`bookings` itself already exists — phase 4 built the table and the partial
unique index that *is* the conflict check. What is missing is the transaction
that writes a row, and the client INSERT policy that deliberately does not
exist.

**Front end** — the booking sheet stops toasting and starts booking. The client
sends `{ consultantId, serviceId, startsAt }` and **never a price**.

**Per-minute sessions get their meter in phase 11 — decided, 30 Aug.** A meter
needs something to meter: a call that starts, runs and can be cut off, which is
`sessions` with join and leave timestamps and the SDK that produces them, and
all of that is phase 11's build. Metering here would mean inventing a session
lifecycle in this phase and replacing it in that one. Phase 5 refuses a
`per_minute` service by name instead of half-charging it, so the gap is a
message rather than a wrong number.

**Done when:**
1. **Two clients requesting the same slot at the same instant produce one
   booking, one named refusal, and no orphaned debit.** Test it by firing both
   concurrently, not sequentially.
2. A decline restores the seeker's balance via a new ledger row, and the original
   debit is unchanged.
3. The consultant's earnings ledger shows gross, fee and net for the booking, and
   `gross − fee = net` for every row.
4. A booking survives a page reload on both sides.

**Why `orders` ships now** despite sessions being the only thing sold:
retrofitting an order layer beneath a ledger that already holds live money is the
worst migration in this project. It costs about twenty lines today.

---

## Phase 6 — Metered chat

**The chat window question is answered — chat is per-minute, decided 1 Sep 2026**
(`01-PRD.md` §5.1). Not booking-bound, not a quota. That answer brings the meter
forward from phase 11, so **this phase is roughly twice what it was**: the
schema, the meter, and the room, shipped together.

**Build** — `sessions` with join and leave timestamps. **The meter**: a hold at
join, a per-minute debit while the room is live, and a cutoff when the wallet
cannot pay for the next minute. `threads`, `messages`, Realtime subscription.
Presence via Realtime, not a column.

The rate is the consultant's band rate, read on the server like every other
price — the client starts a session, it never says what a minute costs.

**Why the meter lands here rather than in 11.** It is the same machinery video
needs, and chat is the cheaper place to get it wrong: a metering bug in chat
costs a refund, the same bug in a video call costs the session as well. Phase 11
then adds an SDK on top of a meter that real sessions have already exercised.

**The hard part is the cutoff, and it is a money path.** A wallet that runs dry
mid-sentence must stop the session, not go negative and not keep serving. Every
debit is a ledger row, so a fifty-minute chat is fifty rows and the ledger is
still the truth. The reversing rules from phase 5 apply unchanged: a session the
platform failed to deliver reverses in full.

**Front end** — `ChatPanel` reads real threads. **The direction bug cannot be
expressed any more** — sender identity is a column and role is derived from the
thread, so the two flip helpers come out. Unread becomes a count of unread rows.
The room shows the meter running and what is left, because a charge nobody can
see accruing is a charge that gets disputed.

**Done when:**
1. A message sent from the seeker side appears on the consultant side without a
   reload, **attributed correctly on both.**
2. Nobody can read a thread they are not in.
3. Unread clears when the thread is opened, on the right side only.
4. **A ten-minute session debits ten minutes at the consultant's band rate** —
   not nine, not eleven — and the ledger replays to the balance.
5. **A wallet that runs out mid-session ends the session** rather than going
   negative, and the last minute charged is one the seeker actually got.
6. Both sides agree on the duration after a reload, and after one side drops
   their connection.

---

## ═══ The v1 line ═══

**After phase 6, a seeker can sign in, top up with real money, see real
consultants, book a real slot that charges them, and hold a paid per-minute chat
with them. Consultants get real requests, a real earnings ledger, and a second
revenue line that does not need a slot.**

Everything below is post-v1. Everything not yet touched — Shop, Academy, Pooja,
Tarot, Reports, Premium, Ask AI, Live, insights, referrals, payouts — **keeps
running on mock data with no front-end change at all.** That is the point of the
line.

**No admin console yet.** Approve a consultant, block one, remove a post: do it
in the database GUI. It is a marketplace with a handful of consultants. Build the
console when the GUI hurts.

---

## Phase 7 — Charts

**Build** — an Edge Function proxying `freeastroapi.com` (decided 1 Sep,
`02-TRD.md` §8 — **not** our own ephemeris service any more). Chart computation
from stored birth details, cached because a natal chart never changes. Panchang
for a real date.

**The key is a function secret and the browser never holds it** (rule 7). Every
call passes ayanamsa and house system **explicitly** — the API defaults to
tropical and offers four house systems, so a defaulted call returns a chart
belonging to nobody.

**Front end** — `placements`, `chartHouses`, `days` and `panchang` come out of the
mock.

**Done when:**
1. Two users with different birth details get **different** charts.
2. A known birth time reproduces a chart matching an independently verified
   source. **Choose that reference chart before writing the service** — otherwise
   there is nothing to test against.
3. A birth before 1945 computes with the correct historical offset for its
   place, not today's.

**Watch:** ayanamsa and house system must be explicitly set, not defaulted. A
wrong one is wrong *silently* — the chart renders, it just is not yours.

**Also fixes:** the mock's two calendars disagree — the panchang is dated a week
apart from the horoscope.

**Reference chart, chosen 2 Sep 2026:** Indira Gandhi, 19 Nov 1917, 23:11,
Allahabad. Rodden AA and pre-1945, so it answers conditions 2 and 3 together.
Settings and the arithmetic that verified them are `02-TRD.md` §8's.

**Conditions 2 and 3 pass at the API**, checked before any code was written:
independently computed ascendants agree to 0.005°, and a 1943 Kolkata birth
returns the wartime **+06:30** answer rather than the +05:30 one, a whole sign
apart. Condition 1 is a two-account walk on dev and is the outstanding one.

**One thing this phase added that is not in the list above**, because the list
predates it: `birth_time_known` is honoured. `AskTime` offers "I do not know",
the onboarding write stops hardcoding `true`, and a chart without a time shows
planets and withholds the ascendant and houses (`03-APP-FLOW.md` §3,
`05-BACKEND-SCHEMA.md` §4.1). It belonged here because a chart is the first
thing that makes the difference visible.

---

## Phase 8 — Ask AI

**Build** — a server-side model proxy. `ask_messages`. `entitlements`, so the
question quota is a SUM rather than a number in a browser.

**Front end** — real replies. Question packs **charge the wallet** instead of
granting free questions. The hardcoded wallet figure in the pack sheet reads the
live balance.

**Done when:** the model key is absent from the network tab, a client faking its
remaining count is still refused at zero, and buying a pack moves money.

---

## Phase 9 — Reviews and content

**Build** — `content` (merging posts, articles, clips and live sessions),
`reviews`, `reactions`, `feed_pins`. Storage buckets and a real upload path.

**Front end** — the feed becomes a query. The consultant studio uploads instead of
toasting. `follow` / `save` / `like` move from the browser `Set` to real rows.

**Done when:** a consultant publishes something that a seeker sees; a follow
survives a reload and a different device; and a review can only be left against a
completed booking, with unverified reviews visibly distinguished.

**Accept here:** follower and like counts start honest and small. Ritu shows 0
followers, not 84,200.

---

## Phase 10 — Shop and Academy orders

**Build** — `products` with stock, `courses`, `academy_events`, `enrolments`,
fulfilment and shipping.

The most operationally expensive phase: physical goods bring stock, shipping,
returns and courier tracking, none of which the UI has today.

**Done when:** an order reserves stock, a sold-out product cannot be bought by
two people at once, and the frozen line price on an old order does not move when
the catalogue price changes.

**Blocked on:** the duplicate-SKU and report-price decisions (`01-PRD.md` §5.2,
§5.3). The multiplier must be deleted before anything is seeded.

---

## Phase 11 — Live video

**Build** — the SDK integration and the room lifecycle, on top of `sessions` and
the meter, **both of which phase 6 already built and proved on chat**. What is
new here is video: the SDK, the ringing, and a dropped connection that must not
keep charging.

**Done when:** a call actually rings, both parties connect, and the session's
actual duration is recorded — which is also what phase 14 measures.

**Blocked on:** the SDK choice. Compare pricing at expected minutes.

---

## Phase 12 — Payouts and KYC

Last of the money work, on purpose: the most regulated and the least urgent.

**Build** — `kyc_documents`, `payouts`, the payout provider integration, GST and
TDS handling.

**Done when:** no consultant can be paid before KYC clears, a payout draws from
the earnings ledger rather than by scanning bookings, and the tax treatment has
been checked by someone qualified.

**Gates, both hard:**
- **KYC clears before the first rupee leaves.** Legal, not a feature.
- **Talk to a CA before writing this code, not after.** You are a marketplace.

---

## Phase 13 — Admin console

**Build** — `admin/` as a second app, making the repo an actual monorepo
(`app/`, `admin/`, `backend/`). Service-role access, **no admin role in client
RLS**. `admin_users`, `admin_actions`. Its own layout system — the phone frame
does not transfer.

Capabilities in order of payoff: consultant approval (5) → moderation (6) →
search and spend history (8, nearly free) → marketplace (3) → academy and
ranking (1) → deity and tarot upload (2) → reviews audit (7) → reschedule (4).

**Done when:** every capability writes an audit row, a support-tier account
cannot block anyone, and no admin path depends on RLS.

**Watch:** capability 2 lets a non-developer upload deity art, which **reverses
the "static content ships as JSON" position** — recorded as a deliberate
reversal. Artist, licence and source are required fields on that form, or the app
accumulates unattributable assets that legally have to be deleted along with
anything derived from them.

**Blocked on:** the ranking formula (`01-PRD.md` §5.5) and the
blocked-consultant-with-pending-money policy (`01-PRD.md` §6).

---

## Phase 14 — Anti-fluking detection

**Build** — a materialized view over sessions, bookings and messages. A nightly
job writing `consultant_flags`. Thresholds as **editable rows, not code.**

Signals: connected duration against booked duration · calls attended against
requested · zero-message chat sessions · reply latency against target · repeat
declines.

**It flags; a human resolves.** No automatic penalties.

**Done when:** a deliberately gamed session is flagged within a day, a flag can be
resolved with a reason, and a threshold can be changed **without a deploy.**

**Not a machine-learning project.** It is three SELECTs behind a cron. Scope it
that way in writing or it grows.

---

## Seed

The largest single task, in phase 4.

**It runs against dev and production both**, from `backend/seed/seed.mjs`, with
the service-role key and a `--ref` the operator has to type. On production the
six land `status = 'pending'`: they are invented people with invented
credentials, and an approved consultant is bookable with real money by anyone
who finds the URL. Publishing them is one deliberate line.

**A seeded person needs an auth user first.** `profiles` rows are created by
`handle_new_user()` from `auth.users`, and `profiles.phone` is NOT NULL, so the
script mints accounts through the admin API. Their numbers start with 1, which
no Indian mobile does — nobody can ever sign in as a seeded consultant by
owning their number.

**No mock ID is ever migrated.** They collide across at least six entity families
— the same string is a wallet transaction and a warning, an article and a tarot
card, a clip and a review. Everything gets a fresh UUID plus `legacy_id` holding
the original, and the polymorphic references are re-pointed through that column.
Without the mapping they cannot be resolved at all.

**Roughly fifteen display-name joins do not resolve.** Only three real foreign
keys exist in the mock; everything else joins by name, and names like the six
booking clients, two of the session-history consultants and two product
recommenders **match no record anywhere.**

Rule: unmatched names create placeholder profiles flagged as such, and **the seed
prints the full list.** It fails loudly at seed time rather than as a foreign key
violation at 2am.

**Three specific traps:**

1. **`bookings` has no consultant reference.** Every row implicitly belongs to
   the first consultant. A verbatim seed silently attributes all seven bookings
   to one person, and it stays invisible until a second consultant signs in.
2. **Two Bhaktamar cards are incomplete** and flagged `partial: true`. A length
   check on the Devanagari fields fails on exactly two of 48 rows. It is a
   content gap needing a verified source, not an encoding bug.
3. **The report multiplier must not reach the database.** Six real prices get
   typed once. It has already compounded into one wrong ledger figure.

---

## Risk register

Highest first.

| Risk | Why it matters | Mitigation |
|---|---|---|
| **The trust boundary** | Until phase 2, the wallet is decorative and devtools can set any balance | Do not demo it as though it is not. Phase 2 is second for this reason |
| **Birth-time timezones** | A modern offset on an older Indian birth shifts every house cusp with **no error raised anywhere** | Store zone plus naive time. Test a pre-1945 birth explicitly in phase 7 |
| **The async return contract** | Five charging call sites let purchases through if missed | Convert all five in one commit; grep for `spend(` and `buyNow(` before merging |
| **Silent ephemeris misconfiguration** | Wrong ayanamsa renders a plausible, wrong chart | Pick the reference chart before writing code |
| **Front-end features outrunning the backend** | Already happening — two free tarot pulls, consultant metrics and course uploads were added as UI against assumptions the schema had not made | Every new front-end feature that implies persistence gets logged against a phase before it is built |
| **Referral fraud** | The per-join bounty is the largest per-action payout in the product and has no controls | Design the control before phase 9, not after the first abuse |
| **Blocking a consultant mid-obligation** | Their seekers have paid | Policy decision required before phase 13 |
| **Physical fulfilment** | Stock, shipping, returns and couriers are absent from the UI entirely | Sequenced late, deliberately |
| **Image licence drift** | Share-alike derivatives lose their attribution when a surface is redesigned | Licence is a required field; attribution stays reachable in the interface |

---

## Decisions blocking specific phases

**Phases 4 and 5 are no longer blocked by any of these.** The session ladder is
both models (`01-PRD.md` §5.1), and the money movement on a booking is decided
(§5.4): **charge at booking**, no hold, no self-service cancellation, no refund
for a session the seeker skipped — and a full reversing credit for a decline, a
no-show or a platform failure, which are not refunds.

| Decision | Blocks | Default if undecided |
|---|---|---|
| ~~Chat window semantics~~ | 6 | **Answered 1 Sep — per-minute live session** |
| Ephemeris reference chart | 7 | — |
| Report prices, and the duplicate SKUs | 8, 10 | — |
| Video SDK | 11 | — |
| Consultant ranking formula | 13 | — |
| Blocked consultant with pending money | 13 | — |
