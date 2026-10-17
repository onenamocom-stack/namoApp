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

**No longer blocked on pricing.** §5.2 and §5.3 were decided 7 Sep 2026, the six
report prices are typed, and `REPORT_MULTIPLIER` is deleted — so seeding no
longer encodes a price that has to be unpicked.

**Still blocked on supply, for reports only:** the ephemeris vendor's Entry tier
generates two reports a month (`02-TRD.md` §8). Shop and Academy do not touch
it; the report SKUs cannot be sold until that tier changes.

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

## Phase 15 — A bhakti social network (approved 13 Oct 2026, in progress)

**Status: approved by the owner on 13 Oct 2026, all of 15a to 15d,** built
in order with no further approval between parts. It lifted two non-goals in
`01-PRD.md` §10 (a social network; pandit booking). Each deploy still waits
for "ship". The owner also said yes, the same day, to the three parts that
touch owner-only areas: the 15a sign-up change (the phone OTP login stays
as it is), 15b's private messages, and 15c's pandit-booking money rules
(written into `01-PRD.md` before they are built). Anything else in wallet,
payments, auth, secrets or production data still needs the owner's own yes.

**The position.** A social network for India's devotional and spiritual
life: bhakti, astrology, yoga, ayurveda and festivals, in the reader's own
language. The social side brings people back every day; consultations and
the shop earn the money. Do not try to be a general social network. That
means competing head on with Instagram, ShareChat and Moj.

**Already built:** the feed, reels, posts, blogs, comments, reshares with
words, follows, profiles, the personal feed (`apps/content/ranking.py`),
#hashtags that open Search, and notifications for comments and reshares.

### 15a — Positioning and signals (live 13 Oct 2026)

- Copy: the welcome heading, the Google title and description and the
  share preview read as a community, not as a kundli app.
- Notifications for a like and a follow, as comments and reshares already
  send. Likes are batched per post per hour, not one per tap.
- Sign-up: name, phone and photo, then three to five interests. Birth
  details move to the first time somebody opens a kundli, horoscope or
  match. The personal feed adds an interest term.
- `/tag/:tag`: a page per hashtag, newest and top.
- "People to follow": authors that people you follow follow, and active
  authors in your interests.

**Done when:** a new account that picked "yoga" sees yoga posts first with
no likes or follows yet; a like sends one notification an hour, not ten;
a kundli opened with no birth date asks for it and then shows the chart.

### 15b — Person-to-person messages (live 13 Oct 2026)

- Free direct messages between two people, on the chat system the paid
  consultations use, without the meter. A first message from somebody
  you do not follow arrives as a request.
- Block and report from the conversation.

**Done when:** a blocked person's message is refused by the server, and a
paid consultation still meters exactly as before (its tests unchanged).

### 15c — Communities and habits

- **Groups built 14 Oct 2026** (`03-APP-FLOW` Groups; public groups only). Groups: a mandir, a sampradaya or a city. Anyone creates one; the
  creator moderates it; posts go to the group and its members' feeds.
- Festival frames and stickers for a post on the festival's day. **Frames built 14 Oct 2026** (`03-APP-FLOW` Festival frames); stickers not started.
- A japa or sadhana streak on the profile. **Built 14 Oct 2026** (`sadhana_days`).
- **Held 14 Oct 2026 (Rahul: "abhi rahne do").** Experts beyond astrologers: pandit, yoga teacher, vaidya, vastu, life
  coach, each verified as astrologers are. Booking a pandit is the
  §10 reversal and needs its own rules in `01-PRD.md` first.

**Done when:** a removed member can no longer post to the group, and a
streak breaks after a missed IST day and not before.

### 15d — Safety and cost at scale (before any growth push)

- Video is compressed on upload. **Built 14 Oct 2026**, on the phone
  before it uploads (`02-TRD` Performance); it was stored as shot, so
  storage and bandwidth grew with every user.
- **Built 14 Oct 2026** (`01-PRD` reporting; console *Moderation queue*). A daily moderation queue a person clears in thirty minutes: reports,
  new accounts posting links, repeated text.
- Rate limits on posting, commenting and messaging. **Built 14 Oct 2026** (`02-TRD` Rate limits).

**Done when:** a 100 MB phone video is stored under 15 MB and still plays,
and an account posting twenty comments in a minute is stopped.

**Status (14 Oct 2026):** all three built. The comment limit is proven by
test. Compression is proven in desktop Chrome (17.2 MB, 20 s, 1080×1920 →
4.8 MB, 720×1280, plays); a real 100 MB video from a phone is not yet tried.

### Later

Live aarti and satsang (live video was deleted once for cost, Phase 11).
Finding friends from contacts (needs a privacy rule first).

**Risks.** People, not code: a social network is worth what its first
thousand regular users post. Moderation is a daily job for a person.
Video cost grows with use until 15d lands.

---

## Phase 16 — One app, and a calling app for Pros (approved 13 Oct 2026, revised 14 Oct, in progress)

**Approved by the owner on 13 Oct 2026; revised 14 Oct** (Rahul's proposal,
owner's yes). It replaced a plan in which a paid call rang on every screen
of one app: the call code works today and stays where it is. It touches
consultant sign-in and where a paid call rings, the two reasons it needed
the owner's yes.

Today a consultant runs a second app, pro.1namo.com (`--mode pro`,
`src/side.js`), with its own sign-in. After this phase:

- **The main app, 1namo.com,** holds everything else. Pros and Creators get
  **Dashboard** on their own page and Profile. A Pro's: Earnings, Studio,
  Insights and the profile. A Creator's: Studio and Insights.
- **The calling app, 1namo.com/desk, named Namo Consult,** holds only the online switch, the
  incoming call and chat requests, and the running session with its meter.
  It installs with its own icon. A Pro with it open is online; closed, offline.
  The ringing and heartbeat code moves there unchanged; the main app carries
  none of it.
- One sign-in: both are on 1namo.com, so they share it.
- pro.1namo.com forwards to 1namo.com/desk once /desk has carried a real
  call end to end.

**Progress (16 Oct 2026):** Dashboard and NAMO Desk live; Rahul tested a
call through `/desk`. pro.1namo.com is a redirect to 1namo.com/desk,
live (HANDOFF).

**Done when:** a Pro with /desk open receives a call request, hears it ring
and answers it, and the session meters exactly as before (the chat tests
unchanged); a Seeker's 1namo.com loads no pro code; a Creator opens Insights
from Dashboard; an old pro.1namo.com link lands on the same screen.

---

## Phase 17 — The Market: Pros and Creators sell (owner's yes 15 Oct 2026)

Approved by the owner on 15 Oct ("2 yes") on Rahul's terms (`docs/01`
§4.7). Step 1 is live: Shop and Academy are one Market page. Step 2a is
live: e-books through Razorpay. Steps 2b–2d are built (15 Oct, app
`apps/market`) and wait for "ship" and their migrations.

- **Step 2a — e-books through the gateway.** A priced e-book is paid in
  Razorpay's checkout, as a product is, not from the wallet (Rahul, 14 Oct:
  "code bana lo par live raghu ki yes ke baad").
- **Step 2b — sellers.** Pros and Creators list Downloads, Courses, Events
  and Products from Dashboard ("Sell on Market"): kind, name, picture,
  price or free, description, and the file, lessons, or date and seats.
- **Step 2c — approval.** A console queue, Approve or Reject with a reason;
  only approved listings reach the Market, each with its seller's name and
  tick.
- **Step 2d — money.** The buyer pays by gateway; the seller's share, less
  commission, joins the payout run (Phase 12).

**Built (15 Oct):** listing from Dashboard → Sell on the Market; the
console's Listings queue (approve with an optional commission %, or reject
with a note); a product becomes a shop row; gateway purchases through the
wallet's `listing` sku; seller earnings (`market_earnings`); the payout run
on the 7th (`market_payouts`, made when Finance opens the list, or
`manage.py market_payouts`); a Creator's bank account. Tests
`tests/test_market.py` (22).

**Not built:** where a seller sends product stock — the approval
notification tells them our team will call with the address; refunds of a
seller's sale (by hand, as a shop return is). An event's reminder is built
(15 Oct): an hour before, everybody booked and the host get a notification
opening its page (`market.remind_events`, run by the every-minute sweep).

**Done when:** a Creator lists a paid PDF, an admin approves it, a buyer
pays by gateway and opens it, and the Creator's share appears in their
earnings with Namo's commission taken.

---

## Phase 18 — Three modules: Creator, Pro, Seller (LIVE 16 Oct 2026, owner's yes)

Rahul's model, agreed on Telegram 16 Oct 2026. Each way of earning is a
**module**, and a person holds any number of them:

| Module | What it opens | Earns from |
|---|---|---|
| **Creator** | Posting video and reels; tags, links and the A code | Content earnings: qualified views + commission from tags and links |
| **Pro** | Bookable consulting: chat, calls, bookings, the rate card, Namo Consult | Consulting |
| **Seller** | Listing on the Market: products, downloads, courses, events | Market sales |

A Seeker holds none. Today a Pro or a Creator gets all three kinds of
earning at once; after this phase each is separate.

**Decided (Rahul):**
- Every module is **requested and approved**, no exceptions. Existing Pros
  request Creator and Seller like anybody else.
- **One badge: a blue tick.** For anybody holding any module (16 Oct);
  since 17 Oct (Rahul) for a Pro or Content step 2 only. The orange Pro
  tick and the separate Creator tick went on 16 Oct.
- Payout details are **one**, for all three, paid together on the 7th.

**Open (asked, not answered):** whether listings already live from somebody
who is not a Seller stay up (proposed: they stay; only new listings need
the module).

**What it changes for people on the day it launches** — why it needs the
owner's yes: an existing Pro keeps Consulting only, so until their Creator
and Seller requests are approved they cannot post video, their tags and
links stop earning, their new views stop qualifying, and they cannot list
on the Market. An existing Creator keeps Content only. Money already
earned is paid. Posts already up stay up.

### Build

1. **Grants.** Pro stays the approved `consultants` row. Creator stays
   `profiles.influencer`. Seller is new: `profiles.seller` (boolean,
   default false), granted only by approval.
2. **Gates.** `content._may_post_video` → Creator (or admin, or the
   `video_enabled` switch); `referrals.may_share` → Creator;
   `market.is_seller` → Seller; `content.qualify` and `content_earnings`
   count only for a Creator; consulting gates unchanged.
3. **Requests.** One table, `module_requests` (profile, module, answers,
   status pending / approved / rejected, review note, who and when); one
   pending request per person per module. Creator asks: what you post
   about, an Instagram or YouTube link, followers, one line on why. Seller
   asks: what you will sell (kinds), a sample or link, one line. Pro is the
   existing application (`ProApply`), brought into the main app; its row
   is the request.
4. **Console.** A *Module requests* queue (Creator, Seller): approve
   switches the module on; reject needs a note. The consultant queue gains
   *Reject with a note* (it has only Approve and Block today). Every
   decision writes the audit log and **tells the person** (the bell; there
   is no message on any approval today).
5. **App.** Profile settings → *Earn on Namo*: the three modules, which the
   person holds, and Request on the others (with *Waiting for approval* or
   the admin's note). Dashboard shows the sections of the modules held;
   the top table only their rows. Blue tick everywhere a tick is drawn
   (about 20 places read the old two).
6. **Launch.** A message to existing Pros and Creators a day before:
   request the modules you use. Then the switch: migrate `profiles/0008`,
   deploy the API and the console, ship both apps.
   **The Drive reels pipeline posts as `DRIVE_REELS_AUTHOR_ID`** (Rahul's
   account, a Pro): without the Creator module it can no longer post video,
   so that account's Creator request must be approved before the switch.

Tests: each gate per module, a request's life (send, one pending, approve,
reject with note, notify), the console actions. Docs: `01` §2 and §12
(who earns what), `03` (Earn on Namo, Dashboard), `04` (one tick), `05`
(`profiles.seller`, `module_requests`).

### Content in two steps, Studio, Engagement (Rahul, 17 Oct 2026 — built on branch `content-steps`, not deployed)

Rahul on Telegram, every answer his: three ways to earn (Content, Pro,
Market). Content has two steps (rules in `01` §2 and §12): **step 1**,
100 followers, 10 live videos, 30 days, granted automatically on asking:
tags, product links and the invite code earn, insights, no pay on views;
**step 2**, 500 followers, 10 videos and 1,00,000 views (all views) in 90
days, then a request the console approves: pay on views and the blue tick.
Today's Creators hold step 2. The ₹25 a sign-up becomes step 1's only (a
Pro or a Seller without it loses it); everybody else keeps the 3 AI
questions. The tick: Pro and step 2 only (Seller loses it). Dashboard is
**Studio** at `/studio` (`/dashboard/...` redirects). *Qualified views*
is **Engagement** in the app and the console. The income page is
unchanged: no separate referrals line (Rahul).

Built: `profiles.referrer` (`profiles/0009`), `apps/profiles/milestones.py`
(the counts and the bars), `modules.ask("referrer")` granting at once,
`modules.ask("creator")` gated on step 1 held and step 2 met,
`profile_services.may_refer` behind every referral gate, the tick
annotation on `influencer` only; app: `ContentCard` and `StepBars`
(`src/screens/Earn.jsx`) in Studio and on Content earnings, the
route rename. **What it changes on the day it goes live:** a Pro or a
Seller who is not a Creator stops earning ₹25 a sign-up; a Seller loses
the tick; nobody new can tag products until they reach step 1. Money
already earned is paid. Needs `profiles/0009` migrated on production and
Rahul's "ship".

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
