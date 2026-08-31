# 03 — App flow

Every route, what each screen does, where each action goes, and the state
machines behind bookings and money.

**This document owns navigation, actions and state machines. It never mentions a
colour** — anything visual is `04-UI-UX.md`. It names no columns and no
endpoints; those are `05-BACKEND-SCHEMA.md` and `02-TRD.md`. Prices are
`01-PRD.md`.

Described as built. Where a flow ends in a toast instead of an effect, it says
so.

---

## 1. The shell

`src/App.jsx` — `App` → `AppProvider` → `Frame`.

`Frame` is a 420px phone wrapper (`relative`, `overflow-hidden`, `h-[100dvh]`)
holding `<Routes>` plus four always-mounted overlays that gate themselves on
store state.

`HashRouter` is mounted **above** `AppProvider` in `src/main.jsx`, so the store
can call `useLocation()`. Every route lives after the `#`, which is why GitHub
Pages needs no configuration for sub-routes.

### Three layouts

| Layout | Contents | Used by |
|---|---|---|
| `TabLayout` | `<main key={pathname}>` + 5 seeker tabs | The five seeker tabs |
| `ProLayout` | Same, with the consultant tab set | The five `/pro/*` screens |
| `PlainLayout` | Bare `<main>`, no nav | Onboarding and every drill-in |

`key={pathname}` forces a remount on every route change, so no scroll position
or local state leaks between `/home` and `/pro/feed`.

Adding a route is: import the screen, drop a `<Route>` in the right group. There
is no route registry.

---

## 2. Route table

In file order, which is also resolution order.

| Path | Screen | Layout |
|---|---|---|
| `/` | → `/onboarding` | — |
| `/onboarding` | Intro | Plain |
| `/onboarding/side` | AskSide — **the fork** | Plain |
| `/onboarding/name` | AskName | Plain |
| `/onboarding/date` | AskDate | Plain |
| `/onboarding/time` | AskTime | Plain |
| `/onboarding/place` | AskPlace | Plain |
| `/onboarding/phone` | AskPhone — number **and** email | Plain |
| `/onboarding/verify` | VerifyOtp | Plain |
| `/onboarding/computing` | Computing | Plain |
| `/profile` · `/profile/:tab` | Profile | Plain |
| `/wallet` | Wallet | Plain |
| `/horoscope` | Horoscope | Plain |
| `/ask` | Ask | Plain |
| `/chart` | Chart | Plain |
| `/chart/:id` | Placement | Plain |
| `/people` | People | Plain |
| `/people/invite` | Invite | Plain |
| `/people/:id` | Synastry | Plain |
| `/read/:id` | Article | Plain |
| `/reels/:id` | ReelViewer | Plain |
| `/live/:id` | LiveRoom | Plain |
| `/consult/:id` | ConsultantProfile | Plain |
| `/notifications` | Notifications | Plain |
| `/premium` | Premium | Plain |
| `/reports` | Reports | Plain |
| `/tarot` | Tarot | Plain |
| `/home` | Home | **Tab** |
| `/consult` | Consult | **Tab** |
| `/pooja` | Pooja | **Tab** |
| `/academy` | Academy | **Tab** |
| `/shop` | Shop | **Tab** |
| `/pro/apply` | ProApply | Plain |
| `/pro/consult` | ProConsult | **Pro** |
| `/pro/studio` | ProStudio | Pro |
| `/pro/live` | ProGoLive | Pro |
| `/pro/earnings` | ProEarnings | Pro |
| `/pro/profile` · `/pro/profile/:tab` | ProProfile | Pro |
| `/live` | → `/consult` | — |
| `/pro/*` | → `/pro/studio` | — |
| `*` | → `/home` | — |

### Route-order traps

1. **`/pro/*` must stay above `*`.** Otherwise a mistyped consultant path falls
   through the global catch-all and silently teleports a consultant into the
   seeker app.
2. **`/live` → `/consult` must also stay above `*`.** Live was absorbed into
   Consult as a mode; the legacy path is kept alive deliberately.
3. **`/people/invite` is declared before `/people/:id`.** React Router v6 ranks
   by specificity so it would work either way, but the order tells a reader
   which is intended.
4. **`/consult` and `/consult/:id` are different layouts** — a tab and a drill-in
   sharing a prefix. **This is why Consult's four modes are local state, not
   routes**: `/consult/call` would resolve as a consultant with the ID `"call"`.
5. **`/chart` has no back affordance.** It sits on `PlainLayout` with no back
   control in its header, reachable from three places, and only browser-back
   leaves it. A real gap, not a deliberate one.

---

## 3. Onboarding

| Step | Route | Asks | Validation | Next |
|---|---|---|---|---|
| 1 | `/onboarding` | Intro. *"Two ways in. Pick yours."* | — | `/onboarding/side` |
| 2 | `/onboarding/side` | **The fork.** Two cards, no continue button | — | *"I want a reading"* → `/onboarding/name`, *"I give readings"* → `/pro/studio` |
| 3 | `/onboarding/name` | What to call you | non-empty | `/onboarding/date` |
| 4 | `/onboarding/date` | Birth date — D / M / Y | 1–31, 1–12, ≥ 1900 | `/onboarding/time` |
| 5 | `/onboarding/time` | Birth time — H : M, AM/PM | 1–12, 0–59 | `/onboarding/place` |
| 6 | `/onboarding/place` | Birth place — worldwide search, debounced 300ms | a result must be **picked**, not typed; the pick carries lat, lon and IANA zone | `/onboarding/phone` |
| 7 | `/onboarding/phone` | Mobile number and email, together | number matches `[6-9]` + 9 digits; email matches a shape check. **Both required** | `/onboarding/verify` |
| 8 | `/onboarding/verify` | Six-digit code, with a resend | six digits, accepted by Supabase | `/onboarding/computing` |
| 9 | `/onboarding/computing` | Two beats: loading lines, then the reveal. Writes the profile | — | `/home` |

The four questions share one frame — one question per screen, large type, and
**no progress bar**, deliberately: a bar turns three questions into a form.

Back is `navigate(-1)` on every step.

### Two things the fork gets right, and one it does not

The consultant branch **skips the birth questions entirely** — a consultant
should not have to give his own moment of birth to reach his own bookings. And
**nothing about the fork is stored**: the URL is the only record of which side
you are on, so the choice cannot disagree with where you are.

What it does not do: gate anything. Anyone typing `/pro/studio` is a consultant.
Consultant approval (§8.3) is the fix.

### Why the place step carries a timezone

Step 6 is the only moment anyone knows the zone of the birth *place*, so it is
where `birth_zone` is captured — from the geocoder, alongside lat and lon, never
defaulted and never derived later. While the list was four Indian cities a
hardcoded `Asia/Kolkata` was survivable; with worldwide search it would file a
London birth under India's zone and shift every cusp with no error raised
anywhere (`docs/05-BACKEND-SCHEMA.md` §4.1).

This is why the step requires a **picked result** rather than typed text, and
why the zone is shown on each row before it is committed. Two places called
London differ by four hours, and that difference is invisible once stored.

A draft saved before this step carried zones has no zone, so it is treated as
incomplete and routed back to re-answer rather than written with a null.

### The draft, and where it becomes real

Steps 3–7 fill an in-progress draft. Step 8 creates the account, and step 9
turns the draft into the `profiles` row by `UPDATE` — never an insert, because
the row already exists by then (`docs/05-BACKEND-SCHEMA.md` §7). From that point
Profile, Chart and Horoscope read the real row, not the mock user.

**The draft survives a reload.** It has to: reading the SMS means leaving the
app, and a phone is free to evict the page while you are in Messages. Held in
`sessionStorage`, so an abandoned signup clears itself with the tab. Before
this, an eviction during the code step created an account with no birth details
and said nothing.

Two failures on step 9 are surfaced rather than swallowed, both because the
reveal screen looks identical whether or not the write landed:

- **Draft lost and no details already stored** → back to step 4 to re-answer.
- **The write itself fails** → a "not saved" screen carrying the error, with a
  retry. Never the reveal.

Re-entry points: *Run onboarding again* restarts at step 1; *Edit birth details*
jumps to step 4 and continues through the rest of the flow, so there is no
single-field edit.

---

## 4. Seeker screens

### `/home`
Free-tools row of four circles — Horoscope and Ask AI open overlays, Tarot and
Matching navigate. Then one feed stream where `kind` picks the card:

| Card | Actions |
|---|---|
| Post | Like · Reply (toast) · Share (toast) · Save. Byline → consultant |
| Reel | → `/reels/:id` |
| Reading | *Read all* → horoscope overlay |
| Panchang | *Full chart* → `/chart` |
| Article | → `/read/:id` · Save |
| Live | → `/live/:id` |
| Course | → `/academy` |
| Product | **Add → cart** · → `/shop` |

The reading and panchang cards are hoisted to positions 1 and 2 **in the
component**, not by reordering the feed data, so the feed stays a list of
content.

### `/consult`
The roster, read from `consultants_public` — so an unapproved practice is
absent because the server never sent it, not because a filter here dropped it.
Search and category counts run over what came back.

Per consultant: the row opens their profile; a call knob toasts; a message knob
opens the chat overlay; Live goes to a real room when one is running. Nothing is
disabled for being "offline" — there is no presence yet (phase 6), and a dot
that is always green is worse than no dot. The rail above the list counts
`verified`, which is a real column.

**Its own booking sheet is gone** — deleted as redundant with the one on
`/consult/:id`, which is the only booking flow.

**With nobody approved, the empty state is the whole screen.** Not a line of
grey text under the furniture: the banners, the category chips, the verified
rail and the session line all describe a roster that does not exist, so none of
them render. What remains says the list is empty because the practice is new,
and offers `/pro/apply`. The reasoning, and the rejected alternative of
approving six invented astrologers, is in `01-PRD.md` §7.

### `/pooja`
**The one screen that does not scroll.** A fixed-height column: deity row,
shrine, tab bar.

Gestures on the shrine — swipe **right/left for the next/previous deity**
(which resets to that deity's first murti), **down/up for the next/previous
murti**. Both wrap. The axes mirror the rows they move through: the deity strip
runs horizontally above the shrine, and murtis are a stack behind the frame.

A swipe is refused when it starts on a control, because every prop is a button
and two own gestures already. Under 44px is a tap; an ambiguous diagonal is
ignored rather than guessed.

Four offerings on a rail, each an animation and a toast. The thali rotates under
a finger and settles to the nearest whole turn. A knob opens the murti picker,
which is **the only place the image attribution appears** and therefore cannot
be removed without removing the images.

No money anywhere. Nothing books a pandit.

### `/shop`
Cart knob with a count badge. Promo banners that set a category filter. Category
pills revealing subcategory pills. A chart-matched hero when unfiltered.

**Add** goes to the cart; **Buy now** charges the wallet immediately. Sold-out
products keep their row with both controls dead.

### `/academy`
Courses / Events / Downloads.

Course *Resume* and *Watch* are external links to **YouTube search URLs** — the
only outbound links in the app. *Enrol* toasts. Events show a seat-fill bar and
toggle a flag; full events refuse. Downloads toast; nothing is stored.

### `/tarot`
A guided pull, as a three-state machine rather than one laid-out screen:

```
deck ──pick a tradition──▶ question ──pull──▶ card
 ▲                            │                │
 └────── change deck ─────────┴─ pull again ───┘
```

`deck` and `question` are **centred modal dialogs**, not bottom sheets — a sheet
reads as more of the same screen, and these are questions the screen is asking.
The face-down deck sits behind them; it is the subject of the dialogs, not an
empty state.

Nothing is typed at `question`. The seeker holds it in their head until the card
is face up — the one step the app cannot verify, which is why it is modal rather
than a line of copy you can scroll past. `deck` has no dismiss: there is no
screen behind it to return to.

Five decks. Bhaktamar leads with 48 painted faces; the other four have six
procedurally drawn cards each.

Card order, fixed: **face → shloka (Devanagari, IAST, English) → meaning (title,
subtitle, line, virtue) → ask yourself and remedy → ask a reader.** The verse
precedes the meaning because the shloka *is* the card and the meaning is a gloss
on it.

Two free pulls a week, then **the wallet is charged for real** (price in
`01-PRD.md` §4.2). When the balance is short the button disables and offers the
wallet. **The price appears nowhere until a card has been pulled** — not in the
header, not on the button, not as a footnote.

### `/profile/:tab`
Four tabs in the URL — overview, horoscope, wallet, settings. Back always means
Home here, regardless of history.

Overview holds the chart wheel, birth data, language pills and a row list into
most of the app. Settings holds **Switch to consultant → `/pro/feed`**, which is
an ordinary link because the side is not state.

### `/wallet`
Balance and history, both read from the server. Since phase 3 *Add money* opens
a sheet: four presets and a custom amount, then Razorpay's own checkout in an
overlay this app does not draw.

**Nothing on this screen credits anything.** The sheet opens an order and
hands off; the balance moves when the provider's webhook reaches the server and
its signature verifies. So the screen cannot await the credit — it polls for a
few seconds, and if the credit has not landed it says the payment is settling
rather than holding a spinner over a number it does not control. Dismissing
Razorpay's overlay, or a card the bank declines, both return to the sheet with
the balance untouched.

The payment-method tags are still gone, and so is the cashback label, which is
deleted rather than deferred — `01-PRD.md` §4.8.

The seeded transaction list is gone too, here and on the profile wallet tab.
It was denominated in rupees while real entries are paise, and a list mixing
the two is off by a hundred on half its lines.

### Others
`/reports` charges for real but **has no way to open the cart** — the only route
to checkout is walking to Shop. `/premium` shows prices and grants nothing.
`/ask` spends questions and its pack sheet grants them free, with a hardcoded
wallet figure. `/chart`, `/chart/:id`, `/people`, `/people/:id`, `/read/:id`,
`/reels/:id`, `/live/:id`, `/notifications` are read-only or toggle flags.

`/reels/:id` rewrites the URL as you scroll, so the address bar tracks the
visible reel.

---

## 5. Consultant screens

### `/pro/apply`
The front door, and the only `/pro` route the gate does not redirect away from.
Four states in one screen: no session (sign up through the seeker's own name and
phone steps, carrying `?next=pro`), session but no `consultants` row (the
application), `pending` or `blocked` (under review), `approved` (straight
through to the studio).

A price is **picked from a band**, never typed, and the row it writes cannot
carry a status — the column grant does not include one.

### `/pro/consult`
Requests with accept and decline, now real status writes rather than flag
toggles: a second tap on Accept changes nothing, because the policy only allows
the move *out of* pending. Confirmed sessions each get a channel button — chat
opens the panel, live navigates to a room, call toasts. The availability grid
below writes `consultant_availability`, one row per open cell, and reads what is
taken from the same slots function the seeker's booking sheet calls.

An availability grid of weekdays against times; tapping a cell toggles it closed.
**The same booked-slots data the seeker's booking sheet reads** — except this
screen applies it only on Thursday, so the two views already disagree. One
endpoint fixes it.

### `/pro/studio`
Compose a reel, an article, or start a live room. Publishing fires a toast.
**There is no upload control anywhere** — all artwork is generated procedurally.

### `/pro/earnings`
Available and clearing balances, a weekly bar chart, performance metrics, a
per-session ledger showing gross minus fee equals net, referrals, and payouts.

The withdraw sheet reuses the seeker's top-up presets, shows a fee breakdown, and
**changes nothing** — the available balance never moves.

### `/pro/profile`
Mirrors the public consultant page and links to it rather than rebuilding it.
Content grid, insights, reviews, settings. **Switch to seeking → `/home`.**

---

## 6. Overlays

Four, mounted once inside the frame, above every screen. None is a route — which
is the point: they open from any tab without losing the screen underneath.

| Overlay | Opened from |
|---|---|
| **ChatPanel** | The header chat knob on every tab; Home's Ask AI circle; Consult, Live and ConsultantProfile message knobs; a consultant's chat channel button |
| **HoroscopePanel** | The header horoscope knob, Home's horoscope circle, the reading card's *Read all* |
| **CartSheet** | **Only** Shop's cart knob and Shop's view-cart button |
| **Toast** | Every `showToast` and every flag toggle carrying messages |

ChatPanel's tabs differ by side: a seeker gets Consultant / Ask AI / Alerts with
Ask AI default; a consultant gets Clients / Alerts. Ask AI is a seeker product —
a consultant is the person being asked, and a chart oracle in her inbox is the
app talking to itself.

**CartSheet is the app's main checkout** and the only overlay that moves money.

Local sheets using the shared primitive — Consult booking, ConsultantProfile
booking, wallet top-up, question packs, withdraw, murti picker — are not global
and open only from their own screen.

---

## 7. Money paths

**Stated once, here.** Seven paths move the wallet, and none of them is
arithmetic in the browser any more.

| # | Path | Effect |
|---|---|---|
| 1 | Cart checkout | Debits the cart total, clears the cart |
| 2 | Shop *Buy now* | Debits the product price |
| 3 | Reports *Buy now* | Debits the report price |
| 4 | Tarot paid pull | Debits the per-pull price |
| 5 | Wallet top-up | **Credits**, and only from a verified webhook |
| 6 | **Booking a session** | Debits the price the SERVER looked up, inside the transaction that claims the slot |
| 7 | **A decline** | **Credits** the full amount back, written by a trigger on the status change |

Paths 5 and 7 are the ones that run backwards. Paths 1–4 and 6 begin and end
inside a tap: the person presses Buy, the server decides, the balance moves. A
top-up begins with a tap and ends somewhere else entirely — in a request
Razorpay makes to a public URL, minutes later if it has to retry. Nothing the
browser does credits a wallet, including reporting that the payment succeeded.
§8.2 is the state machine. A decline is a third party's tap moving somebody
else's balance, which is why it is a trigger rather than a call the consultant's
client makes: there is no second request for a client to forget.

Paths 1–4 go through `wallet_debit()`, which takes the amount from the client
because there is no server-side catalogue for a tarot card yet. **Path 6 is the
first that does not**: `book_session()` is handed
`{ consultantId, serviceId, startsAt }` and reads the price off the service row
itself. Both decide under a row lock and refuse in the app's own words when the
balance is short. The client compares nothing: the balance it holds is a read of
a cache, and a screen that decided for itself would be deciding on a number
devtools can edit.

**Every caller awaits it.** The debit returns a promise, and `if (promise)` is
truthy — a caller that forgets lets through a purchase the server refused. A
second guard sits in the store rather than on the buttons, so a re-entrant tap
is refused even if a button forgets its pending state.

### Displayed but never charged

Academy enrolment · Premium · question packs, which grant questions free · live
room gifts · the consultant withdraw sheet.

**The primary revenue line came off that list in phase 5.** The consultant
profile sheet books for real; the Consult tab's own sheet is a link into it
rather than a second flow.

---

## 8. State machines

### 8.1 Booking

```
                    ┌──────────► declined ──► (reversing credit)
                    │
  [request] ──► pending ──► confirmed ──► completed
                    │            │
                    │            ├──► no_show
                    │            └──► rescheduled ──► (new pending, same order)
                    └──► cancelled ──► (refund per policy)
```

- **The slot is claimed at `pending`**, not at `confirmed` — otherwise two
  seekers hold the same slot while a consultant decides.
- **`declined` writes a reversing credit**; it never edits the original debit.
- **`rescheduled` does not move money.** The charge and the order stay on the
  original booking and the new one inherits them.
- `cancelled` depends on a policy that is still open — see `01-PRD.md` §5.4.

Today: `[request] → pending` is `book_session()`, one transaction that looks up
the price, claims the slot, debits the wallet and writes both books.
`pending → confirmed | declined` is the consultant's own UPDATE, validated by
the policy, and **`declined` now writes the reversing credit** — in both books,
as new rows, from a trigger on the status change rather than a second call a
client could skip. `booking_reverse()` is that movement, and an admin calls it
by hand for the other two cases that reverse in full (`01-PRD.md` §5.4): a
consultant who never turns up, and a platform failure.

**`no_show` does not reverse automatically**, and that is the one asymmetry
worth stating: the column cannot say whose no-show it was, and a seeker who
simply did not attend is refunded nothing.

`completed`, `rescheduled` and `cancelled` are still unreachable from any
client.

### 8.2 Payment

```
  created ──► captured ──► (wallet credit, exactly once)
     │
     └──► failed ──► (no credit, no ledger row)
```

The provider retries, so the same captured event can arrive several times. Only
the first produces a credit; the mechanism is a uniqueness guarantee rather than
a check, because a check races with its own write.

Refunds are a separate forward transition, never a mutation of the original.

### 8.3 Consultant approval

```
  apply ──► pending ──► approved ──► (visible, bookable, earning)
                              │
                              └──► blocked ──► (invisible, unbookable)
```

**Pending is invisible**, not merely unlisted: not in search, not bookable, and
producing no earnings. Verified on the server rather than in a screen — an
unapproved consultant returns nothing from the list, from a direct id lookup,
from their prices, from their availability and from their slots.

There is no `rejected` state. This diagram used to show one and the `status`
CHECK never had it; `blocked` covers both refusing an application and closing a
practice, and a state nothing can enter is a state that gets forgotten.

**The applicant cannot move any of this.** `status` and `verified` are outside
the column grant, so approval is an `UPDATE` in the database GUI until the admin
console exists (phase 13).

**Blocking a consultant who has confirmed bookings and a pending balance is an
unresolved policy question** — see `01-PRD.md` §6.

---

## 9. State model

Three places state lives, and the boundaries matter.

### The URL
Which side you are on. `isPro` is derived from the pathname and **is never
stored** — a persisted role could disagree with the address bar. Also: the active
profile tab, the visible reel, and every drill-in identity.

### The store
One context. Most of it still resets on reload.

Server-backed, and therefore surviving a reload: the session, the profile, and
the **wallet balance and ledger**.

Still local, still evaporating: cart lines · questions remaining · chat panel
open state and tab · horoscope panel state · cart sheet state · language ·
toast · and the flag set. The birth draft is the one exception — it survives in
`sessionStorage` for the length of the signup.

### The flag set
One flat `Set` of namespaced strings, which is the prototype's best idea:

`like:` · `save:` · `follow:` · `remind:` · `event:` · `accept:` · `decline:` ·
`tarot:free1|free2` · `save:day-<key>`

`closed:<day>:<time>`, `accept:<id>` and `decline:<id>` are gone as of phase 4 —
a closed slot is the absence of a `consultant_availability` row, and a decision
is a `bookings.status` write.

Sticky toggles and their toasts with no new store surface. It maps cleanly onto a
real reactions table, which is rare for a prototype shortcut.

### What is missing everywhere

**No loading states, no error states, no empty states** — because nothing is ever
absent, slow or failing. Adding them across roughly fifteen screens is the real
front-end cost of the backend migration, and it is UI work, not server work.

Each fetching screen needs: a skeleton or a held layout while loading; a refusal
that names its reason in the app's voice; an empty state that says what to do
next rather than showing an empty list.

---

## 10. Known breaks

| Break | Status |
|---|---|
| **ChatPanel threw on the first tap of the messages knob** — `isPro` was used but never defined, in two places, with no error boundary | **Fixed** |
| The consultant's availability view applied booked slots only on Thursday; the seeker's sheet applied them always and ignored the consultant's own closures | **Closed** — phase 4. Both call `consultant_open_slots()`; there is no second rule left to disagree with, and `009_slots_check.sql` asserts it on all seven weekdays |
| Reports adds to the cart with no way to open the cart from that screen | Open |
| Question packs display a price and grant questions free | Open |
| Ask AI's wallet figure is a hardcoded string, not the live balance | Open |
| `/chart` has no back control | Open |
| The consultant's feed is the seeker's feed, including shop and free tools | **Closed** — `ProFeed.jsx` deleted, Feed is no longer a concept on the pro side |
| Consultant performance metrics disagree with the warnings that cite them — 88% against 68% for the same figure | Open |
| Birth details are collected in onboarding and never used | **Closed** — phase 1. Written to `profiles`, read back by Profile, Chart and Horoscope |
| `/people/:id` showed the **mock user's initial under the label "You"** — a signed-in Rahul saw Atharv's `A` | **Fixed** — `Synastry.jsx` reads `useProfileFields()`. Found by auditing identity reads, not by the browser walk, which is still owed |
| Sun, moon and rising are the mock's for every account, on four screens — `Computing.jsx`, `HoroscopePanel.jsx`, `Shop.jsx` and via `useProfileFields()` | Open by design — they need the ephemeris service. **Phase 7 must change all four**, not just the hook |
| Two Bhaktamar cards carry incomplete verses | Flagged in data; needs a verified source |
