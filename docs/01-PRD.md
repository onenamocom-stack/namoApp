# 01 — Product requirements

What Namo is, who uses it, what it sells, and what ships first.

**This document owns every rupee amount in the product.** No other document
names a price. It owns no schema, no endpoints and no column names — those are
`05-BACKEND-SCHEMA.md` and `02-TRD.md`. Build order is `06-IMPLEMENTATION.md`.

---

## 1. What this is

An astrology marketplace for India. A seeker asks a question; a consultant
answers it, live, for money. Around that sit the things people who ask such
questions also want: a daily reading, a birth chart, a shrine, a tarot deck,
remedial products, and courses.

Two apps in one phone-shaped codebase, plus a desktop console:

| Surface | Who | Where |
|---|---|---|
| **Seeker** | someone who wants a reading | Home · Pooja · Consult · Shop · Academy |
| **Consultant** | the astrologer | Feed · Sessions · Studio · Earnings · Profile, under `/pro/*` |
| **Admin** | you, then support staff | A separate desktop console |

The product has an unusual amount of character for a prototype and it is
deliberate. The copy voice — second person, present tense, imperative, blunt
rather than reassuring — is most of what distinguishes it. *"A stone does not fix
a transit. It is a reminder you paid for."* That voice is a product requirement,
not decoration, and it is also useful compliance cover: copy that promises
nothing is copy that cannot overpromise.

---

## 2. Users

### The seeker

Has a question with a deadline — a job offer, a marriage, a court date, an
illness. Wants an answer from a person, quickly, without a subscription or an
account-creation ordeal. Pays per session from a wallet rather than per
transaction, because UPI friction per ₹1,499 booking is worse than one top-up.

Does not necessarily know their birth time to the minute. A large share of
Indian users do not, and the product must not treat that as a failure state.

### The consultant

Runs their practice on the platform. Cares about three things in order:
**bookings arriving**, **getting paid**, and **being seen** — which is why the
consultant side is a feed, a session queue, a studio and an earnings screen
rather than a settings panel.

Sets nothing about their own price except which band they sit in (§4.1). Is
invisible until approved.

### The admin

Approves consultants, moderates content, manages the catalogue, and answers "what
happened to this person's money". Needs to search across all users, which is a
capability no other actor has and the reason the console is a separate
application entirely.

---

## 3. Feature inventory

Status is honest: **UI** means the screen exists and is wired to mock data;
**Real** means it is backed by a server; **None** means it does not exist.

### Seeker

| Feature | Status | Note |
|---|---|---|
| Onboarding — name, birth date, birth time, place | UI | Four questions, one per screen. Collected into the store and then **not used** — Profile, Chart and Horoscope all read a fixed mock user |
| Seeker/consultant fork | UI | `AskSide`. The consultant branch skips the birth questions entirely |
| Login / accounts | **None** | Blocks everything |
| Home feed | UI | One stream, seven card kinds. Daily reading and panchang hoisted to the top |
| Daily horoscope, 3-day switcher | UI | Fixed content for all users |
| Birth chart — table, wheel, placement detail | UI | Fixed placements for all users |
| Panchang | UI | Fixed; its date disagrees with the horoscope's |
| Consult — search, filter, four modes | UI | Call · Chat · Live · Booking as modes, not routes |
| Booking a session | UI | Shows a price, **charges nothing**, books nothing |
| Chat with a consultant | UI | Canned replies after 900 ms |
| Voice / video call | **None** | Every call button toasts "prototype only" |
| Ask AI | UI | Canned replies; free-question counter |
| Tarot — 5 decks, 48 painted Bhaktamar faces | UI | **Charges the wallet for real** |
| Pooja — animated mandir, 7 deities, 26 murtis | UI | E-puja only. Nothing books a pandit, nothing is charged |
| Shop — categories, cart, checkout | UI | **Charges the wallet for real** |
| Reports | UI | **Charges the wallet for real** |
| Premium tiers | UI | Shows a price, grants nothing |
| Academy — courses, events, downloads | UI | Enrol toasts. Course links go to YouTube *search* URLs |
| Wallet — balance and ledger | **Real** | Server-owned. Debits only — top-up waits for payments |
| Payments | **None** | Payment-method tags are decorative |
| People / synastry | UI | Fixed |
| Notifications | UI | No read state, no deep links |

### Consultant

| Feature | Status | Note |
|---|---|---|
| Feed | UI | Renders the *seeker's* Home, including the free-tools row and shop cards |
| Session requests — accept / decline | UI | Toggles a flag |
| Availability grid | UI | 7 × 6, closures held in a browser Set |
| Channels — chat / live / call per booking | UI | Chat opens the panel; call toasts |
| Studio — publish reel / article / go live | UI | Publishes to a toast. **No upload path exists anywhere in the app** |
| Earnings, ledger, payouts | UI | Withdraw toasts; the balance never moves |
| Performance metrics | UI | Real numbers in mock; needs deriving from sessions and messages |
| Insights | UI | Fixed |
| Referrals | UI | Header total disagrees with its own list |
| KYC | **None** | Legal gate on payouts |
| Approval before going live | `consultants.status`, phase 4 | Was: anyone typing a `/pro` URL was a consultant |

### Admin

Nothing exists. All nine capabilities in §6 are unbuilt.

---

## 4. Money

Every amount in the product. Seven revenue lines, **all of them real** — the
business is not a single take-rate with decoration around it.

### 4.1 Sessions — the primary line

**The platform sets price bands; consultants choose one.** They do not type a
number. This keeps quality legible to seekers, keeps margin predictable, and
means a price change is a catalogue edit rather than a migration.

Current consultant prices, which become the seed bands:

| ₹749 | ₹899 | ₹999 | ₹1,299 | ₹1,499 | ₹2,200 |
|---|---|---|---|---|---|

**Platform commission: 18%**, expressed in basis points everywhere it is stored.
A ₹1,499 session pays the consultant ₹1,229 and the platform ₹270.

Each band carries the three bookable lengths and a per-minute rate for instant
calls — **§5.1, decided.** The bands are rows in `price_bands`, and a
consultant's price is refused by the database if it does not match one.

### 4.2 Tarot

**₹11 per pull, after two free pulls a week.** The cheapest thing in the app and
deliberately so — it is the habit-forming line, not a margin line.

The "week" is currently two booleans in browser memory and resets on reload.

### 4.3 Reports

Six reports. **Their prices are an open decision (§5)** because the current
numbers are a placeholder multiplied at load time:

| Report | Base | Currently shown |
|---|---|---|
| Natal | ₹499 | ₹1,497 |
| Career | ₹699 | ₹2,097 |
| Love | ₹899 | ₹2,697 |
| Synastry | ₹1,299 | ₹3,897 |
| Transits | ₹599 | ₹1,797 |
| Remedial | ₹449 | ₹1,347 |

### 4.4 Question packs — Ask AI

6 questions ₹199 · 12 questions ₹349 · 20 questions ₹499.
Five free questions on arrival. **Packs currently grant questions without
charging.**

### 4.5 Premium tiers

₹349 · ₹899 · ₹1,299. **Overlaps §4.3 and §4.4 — see §5.**

### 4.6 Shop

Physical remedial goods: gemstones, maalas, rudraksha, remedies.
**₹640 to ₹26,400**, with strike-through MRPs from ₹1,200 to ₹24,000 driving a
computed discount badge. Two products are sold out.

Physical goods bring stock, shipping, returns and courier tracking — none of
which the current UI has. This is the most operationally expensive line and it is
sequenced late.

### 4.7 Academy

Courses ₹1,999 · ₹2,499 · ₹3,499 · ₹4,299.
Events ₹0 · ₹499 · ₹1,499 — **₹0 is how free is expressed**, and one event is
sold out by seats rather than by a flag.

Consultant-uploaded course material — PDFs and video links, free or paid — is a
requested capability with **no upload path in the app today**.

### 4.8 Wallet

Everything is paid from a wallet rather than per transaction.

The balance and the ledger are real and live on the server, and since phase 3
money can move both ways. The top-up presets are **₹500 · ₹1,000 · ₹2,000 ·
₹5,000**, with custom amounts **₹100 to ₹1,00,000**. The band is enforced on
the server; the copy of it in the browser only exists so the refusal arrives
before the card form does.

Money is credited on Razorpay's word, never the browser's — the amount that
reaches the wallet is the amount the provider reports it captured.

The **"+2% cashback" label is deleted**, not deferred. It appeared on ₹2,000
and above and was never applied, and an unimplemented discount promise must not
be on screen the day real money starts moving. Reinstating it means pricing it
first, here.

There is no opening demo balance. A new account starts at **₹0**, the same
call as showing a consultant 0 followers rather than a fabricated 84,200.

### 4.9 Referrals

**₹2,000 per consultant who joins.** The single largest per-action payout in the
product and it currently has no fraud control.

### 4.10 Where money actually moves today

Four paths, all decided on the server:

Cart checkout · Shop *Buy now* · Reports *Buy now* · Tarot pull.

Top-up was a fifth and was the only one that added money. It is withdrawn until
there is a payment behind it.

Everything else that displays a price charges nothing — including **every booking
flow**, which is the primary revenue line.

---

## 5. Pricing decisions still open

Not guessed at. Each one changes what gets seeded.

### 5.1 Session length — decided, phase 4

**Both models are real.** A seeker either books a scheduled session of 15, 20 or
30 minutes at a fixed price, or starts an instant call billed **per minute**
against their wallet. They are two products, not two opinions about one.

| | |
|---|---|
| Scheduled | 15 / 20 / 30 minutes, one price each, paid up front, claims a slot |
| Instant | Per minute, no slot, the wallet drains live |

Both come from the same band. Choosing a tier gives a consultant all four
prices — three lengths and a rate — so there is still exactly one pricing
decision to make and it is still the platform's ladder they pick off.

The 20-minute price is the one everything is quoted against; the other two are
rounded to the nearest ₹10 rather than derived exactly, because ₹2,248.50 is
not a price. See `05-BACKEND-SCHEMA.md` §4.3.

**Per-minute is modelled but not metered.** Phase 4 gives it a row and a rate.
The meter — a balance hold, a per-minute debit, a mid-session cutoff — is phase
5/11, and it is the reason instant sessions cannot be sold before then.

What this replaces: the three incompatible ladders in the mock. `SESSION`'s
flat 20 minutes survives as the quoted length. The booking records' ₹2,998 for
30 minutes does not — it was twice the 20-minute rate where the bands say one
and a half times.

### 5.2 The duplicate SKUs — TBD

The same products are sold twice at different prices:

| Product | As a premium tier | As a report | Ratio |
|---|---|---|---|
| The Relationship Report | ₹899 | ₹2,697 | 3× |
| Eros — for two | ₹1,299 | ₹3,897 | 3× |

And **Ask the Stars at ₹349 is the same SKU as the 12-question pack at ₹349** —
identical price, identical grant, sold from two places.

Whichever price wins, one of those lists loses rows. Premium becomes a
*merchandising view* over reports and question packs rather than a third
catalogue, which is what forces this to be resolved rather than encoded.

### 5.3 The report multiplier — decide, then delete

Report prices are `base × 3`, computed when the module loads. It is a placeholder
that was never replaced.

It has **already compounded once**: a consultant ledger row bills a "Natal
report" at ₹4,041, which is 449 × 9 — the multiplier applied twice, to the
*Remedial* base rather than Natal's. That number matches no report in the
catalogue.

Six real prices get typed once, and the multiplier is deleted before anything
reaches a database.

### 5.4 Money movement on a booking — decided, 27 Aug

**Charge at booking, not at session start.** The wallet is debited in the same
transaction that claims the slot. One write, and no hold — a hold is a second
state that can leak, expire wrongly, or be reconciled against nothing when a
session never happens.

It also settles what a slot is worth: a claimed slot the seeker has not paid
for is inventory somebody else could have had.

**No cancellation and no refund on a session the seeker chose not to attend.**
Booking debits the wallet; the seeker cannot cancel it back and does not get the
money returned. Say it on the booking sheet, before the tap, not in a policy
page nobody opens.

**This is not the same as "money never comes back", and the difference is the
whole of it.** A refund is for a session that happened, or that the seeker
simply skipped. These are not refunds and they are not optional:

| What happened | What the ledger does |
|---|---|
| Consultant declines the request | **Reversing credit, in full.** Nothing was delivered |
| Consultant never turns up | **Reversing credit, in full.** Same reason |
| Platform failure — no room, no call, our fault | **Reversing credit, in full** |
| Seeker does not attend | Nothing. This is the policy |
| Seeker asks to cancel beforehand | Nothing self-service. An admin may still write a reversing entry |

`03-APP-FLOW.md` §8.1 already has `declined` writing a reversing credit, and
that stays. **A policy of "no refunds" must never be implemented as "declines
do not reverse"** — that is a consultant tapping Decline and keeping a
stranger's money.

`cancelled` stays in the `bookings` status check for admin use. There is no
client transition into it.

**Open, and found by review of the phase 5 code on 31 Aug 2026: a consultant
who never answers.** Money is taken at `pending`. The only reversal is a
decline, and the seeker has no update rights at all — so an unanswered request
holds the seeker's rupees indefinitely, and leaves a positive `earnings_ledger`
row that phase 12 would pay out for a session that never happened. That is the
same failure this section already refuses to accept from a decline.

The remedy exists and is manual: an admin calls
`booking_reverse(<booking>, 'no answer')`, which is the same function all three
reversing cases use. What is missing is a **deadline** — how long a request may
sit before it expires and reverses itself. That is a product decision, not a
review fix: too short and a consultant loses real bookings to a slow morning,
too long and a seeker's money is held for a week. **Decide it before the first
consultant who is not the founder takes bookings.**

**Two things this obliges before launch, both outside the code.** A published
cancellation and refund policy page is a Razorpay activation requirement, so it
has to exist on the domain either way — §8. And a blanket no-refund term does
not override a service that was not delivered, which is exactly why the table
above exists; **get it read by someone qualified** rather than taking this
document's word for it.

### 5.5 Consultant ranking formula — TBD

Admin capability 1 includes controlling where consultants appear. What feeds the
score — rating, reply time, completion rate, recency, a manual boost, or paid
placement — is a product decision with revenue implications, and paid placement
in particular changes what the ranking *means* to a seeker.

---

## 6. Admin capabilities

Nine, none built. All read across every user, which is why the console is a
separate application.

| # | Capability | Notes |
|---|---|---|
| 1 | **Academy CMS and consultant ranking** | Two things. Content ordering is small; ranking affects who earns |
| 2 | **Deity images and tarot decks** | Upload with **artist, licence and source as required fields**. Reverses the "static content ships as JSON" position, deliberately |
| 3 | **Marketplace** | Products, images, stock, orders, fulfilment |
| 4 | **Reschedule a session** | Money does not move — the original charge stands |
| 5 | **Approve consultant signups** | A queue. Until approved: invisible, unbookable, cannot earn |
| 6 | **Remove posts, block consultants** | **Soft delete only.** A removed post in a dispute is evidence. Blocking a consultant with confirmed bookings and a pending balance needs a policy — see below |
| 7 | **Reviews, with admin audit and consultant analytics** | Reviews tied to completed bookings carry a verified badge |
| 8 | **Search users and consultants, spend history, analytics** | The most privacy-sensitive capability. Every lookup is audited |
| 9 | **Detect consultants gaming calls and messages** | Flags for human review — never automatic penalties |

### Permission tiers

**Support** reads and searches. **Moderator** removes content and blocks.
**Finance** touches payouts and refunds. **Superadmin** manages admins.

Least privilege from the first day, because retrofitting tiers later means
auditing every call site that assumed god mode. **Every action of every tier is
audited**, which is what makes an appeal answerable.

### On capability 9

It measures things that already exist as consultant metrics: median reply time,
calls attended against calls requested, sessions completed, connected duration
against booked duration, zero-message chat sessions.

**It is a scheduled query, not a machine-learning project.** Thresholds live as
editable rows so they tune without a deploy.

**It flags; a human decides.** Heuristic detection has false positives, and
auto-penalising someone's livelihood on a threshold produces appeals that cannot
be answered. This is a product decision as much as a technical one: an accused
consultant must be able to see the flag and respond to it.

### Unresolved admin policy

**What happens when a consultant with confirmed bookings and a pending balance is
blocked?** Their seekers have paid. Options are refund-and-cancel, honour the
bookings then block, or hold the balance pending review. Needs an answer before
capability 6 ships.

---

## 7. Scope — v1

**A seeker signs in, tops up, sees real consultants, books a real slot with real
money, and chats about it.**

That is the revenue path and roughly a third of the surface. Everything else
keeps running on mock data with **no front-end change at all**.

### In

Login · profile with birth details that survive a reload · wallet with real
money · Razorpay top-up · real consultant list · availability · booking that
charges and reserves · chat that persists · consultant approval · consultant
earnings ledger.

### Out, and still mocked

Shop · Academy · Pooja · Tarot · Reports · Premium · Ask AI · live video ·
payouts · KYC · notifications · referrals · insights and earnings charts · the
admin console.

### Launch supply — decided, 26 Aug

**The marketplace launches empty rather than seeded.** The six mock consultants
exist on production as rows, `status = 'pending'`, and are not approved. `/consult`
says so plainly and offers the one action that changes it: apply.

The alternative was approving them so the site looked active. It was rejected
on three grounds, and the reasoning is recorded because it will be tempting
again the first week nobody signs up:

- **Phase 5 turns props into fraud.** Today a booking toasts. The day the
  booking transaction ships, an approved consultant is live inventory, and
  somebody pays real money for a session with a person who does not exist.
- **The seeded credentials are specific claims.** "ICAS Certified", "Jyotish
  Visharad", "2,148 reviews", "4.9". Fabricated certifications and review counts
  on fabricated people is an unfair trade practice under the Consumer
  Protection Act, on top of §8's existing note that astrology advertising is
  regulated. **Get this checked by someone qualified before any of it is
  published**, including if the profiles are labelled as demos.
- **It hides the only signal that matters.** An empty marketplace is a supply
  problem, and fake supply removes the pressure to fix it.

Flipping them on for a demo is one statement and reversible:
`update consultants set status='approved' where legacy_id like 'a_';` — that is
what they are for. Approving them for the public is a different decision, and
this section is where it gets re-argued if it ever is.

**No waitlist capture.** Everyone standing on `/consult` is already signed in,
so their number is on file; a form asking for it collects data the database
holds. And there is no way to send the message it would promise. Same call as
the deleted cashback label: an unimplemented promise does not go on screen.

**No admin console in v1.** Approving a consultant, blocking one, removing a post
— do it in the database GUI. It is a marketplace with one real consultant. Build
the console when clicking through the GUI hurts, somewhere north of twenty
consultants.

### Deliberately not in v1, despite being tempting

- **Payouts.** Most regulated, least urgent. Nobody is owed money on day one.
- **Live video.** The most expensive integration, and chat proves the marketplace
  works first.
- **The astrology itself.** Charts and horoscopes stay fixed until the booking
  loop earns money. The uncomfortable truth is that the readings are the product
  narrative but the booking is the business.

---

## 8. Regulatory and legal

- **KYC gates the first payout.** Not a feature — a legal gate. It blocks the
  entire payout capability.
- **Marketplace tax.** GST, and TDS on consultant payouts. Talk to a CA before
  writing payout code, not after.
- **Astrology advertising is regulated.** Disclaimers required; no medical claims
  and no financial-advice claims. The existing copy voice already refuses to
  promise outcomes, which helps.
- **Image licences are a product constraint.** Of 26 murtis, four are CC BY and
  three are share-alike, and the processing pipeline produces **derivatives that
  inherit the obligation**. Attribution must remain reachable in the interface,
  and share-alike images may not go behind a paywall. If the attribution surface
  is removed, the images have to be removed with it.
- **Scripture is not editable copy.** The 48 Bhaktamar verses are the tradition's
  words. Two are currently incomplete and are flagged as such rather than
  reconstructed — a plausible wrong shloka is undetectable to the person it
  misleads.
- **The place search is on a non-commercial licence, and this product is
  commercial.** Birth places are geocoded through Open-Meteo's free geocoding
  API, picked because it returns the IANA timezone with each result — the one
  field `birth_zone` cannot be guessed later. Their terms restrict the free tier
  to non-commercial use and name "apps that have subscriptions or display
  advertisements" and "integrating our service into commercial products" as
  commercial. Namo sells consults, so **the free tier does not cover this app in
  production.** The free tier also caps at 10,000 calls/day and carries a CC-BY
  4.0 attribution obligation.

  **Open, and it blocks revenue, not the build:** either take Open-Meteo's paid
  tier, or move to a geocoder whose licence permits commercial use *and* that
  supplies a timezone — GeoNames (CC-BY, has a timezone endpoint), or a
  self-hosted city dump with offline zone lookup, which removes the runtime
  dependency altogether. Do not swap to a geocoder that returns only lat/lon; it
  would reintroduce the guessed-zone failure.
- **Email is collected at signup and its purpose is not yet settled.** Onboarding
  requires an address alongside the phone. It is never used to sign in and is
  never verified — it is held for reaching people later, marketing included.
  Under the DPDP Act that intent is the part that carries obligations: personal
  data is collected against a **stated** purpose, with consent for it, and
  marketing use generally needs its own opt-out. Today the screen says only that
  it is how we reach you outside the app, which is honest but is not a consent
  record, and nothing stores whether the person agreed to marketing.

  **Open, and it blocks the first campaign, not the signup:** settle the stated
  purpose, decide whether marketing consent is separate and explicit, and if it
  is, it needs a column — that is `docs/05-BACKEND-SCHEMA.md`'s to add. Sending
  the first marketing mail before this is settled is the expensive order to do
  it in.

---

## 9. Success criteria

v1 has worked when:

1. A seeker signs in, closes the tab, returns, and is still themselves with their
   birth details intact.
2. Devtools cannot change a wallet balance.
3. Replaying the ledger from zero reproduces every balance exactly.
4. A real ₹1 payment credits once, and a duplicated webhook still credits once.
5. Two people tapping the same slot produce one booking, one clear refusal, and
   no orphaned debit.
6. A message sent from the seeker side appears on the consultant side without a
   reload, attributed correctly on both.
7. An unapproved consultant is invisible to seekers.

Business signals are deliberately absent from that list. v1 is a correctness
milestone.

## 10. Non-goals

- A social network. The feed exists to surface consultants, not to retain
  scrollers.
- Free astrology at scale. The free tools are an entrance, not the product.
- Western astrology parity. The product is Vedic-first, with other traditions
  present in the tarot decks only.
- A pandit-booking or physical-puja marketplace. The mandir is e-puja and charges
  nothing, on purpose.
- Desktop for seekers. The app is a 420px phone frame. Only the admin console is
  a desktop product.
