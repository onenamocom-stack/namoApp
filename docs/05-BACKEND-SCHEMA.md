# 05 — Backend schema

Every table, column, constraint, index and row-level-security policy, with the
reason each exists. Postgres on Supabase.

**This document owns every column name.** Nothing else in the set names one. For
*why* the stack is Supabase and where the trust boundary sits, see `02-TRD.md`.
For build order see `06-IMPLEMENTATION.md`. For prices see `01-PRD.md`.

Nothing here is built yet.

---

## 1. Design rules

Eight rules that the rest of the document assumes. Each one is cheap now and a
migration under live money later.

### 1.1 Money is integers, in paise

Column names say so: `amount_paise`, `balance_paise`, `price_paise`. No float
touches money at any layer. Formatting to `₹1,499` happens in the component.

Rates are **basis points**, not percentages: `fee_bps = 1800`, never `18` and
never `0.18`. The mock stores `commissionPct: 18` as a whole number, and the
percent-or-fraction ambiguity is a permanent source of hundred-fold errors.
`fee_paise = round(gross_paise * fee_bps / 10000)`.

### 1.2 The ledgers are append-only

No `UPDATE`, no `DELETE`, ever, enforced by trigger rather than by discipline. A
mistake is corrected by writing a reversing entry. This is how you answer "where
did my ₹500 go" eleven months later.

### 1.3 There is exactly one cached aggregate

`wallets.balance_paise`. It earns the exception by being on the hot path and by
being checkable — replaying the ledger from zero must reproduce it.

**Everything else is a query.** Not columns: consultant rating, review count,
follower count, earnings available/pending/this-month/lifetime, referral totals,
every number in `insights` and `proMetrics`.

The mock is the argument. Inside a single file written in one sitting, four
stored totals already contradict their own line items:

| Stored | Says | Line items say |
|---|---|---|
| `referrals.earned` | 18,400 | 6,000 |
| `referrals.joined` | 6 | 4 rows |
| `earningsSeries` vs `earnings.thisMonth` | 74,600 | 49,570 |
| `consultants[0].reviewCount` | 2,148 | 3 reviews |

With concurrent writes it drifts faster, not slower. Where a cache is genuinely
unavoidable for sorting, it is named `*_cache` — `rating_avg_cache`,
`rank_score_cache` — so the name carries the warning.

### 1.4 Primary keys are UUIDs, and no mock ID is ever migrated

`id uuid primary key default gen_random_uuid()`.

The mock's string IDs collide across at least six entity families:

| ID | Is both |
|---|---|
| `w1`–`w6` | a wallet transaction **and** a warning |
| `d1`–`d4` | a deity **and** a download |
| `b1`–`b4` | an article **and** a Lotus Path tarot card |
| `p1`–`p4` | a person **and** a nested consultant content item |
| `r1`–`r5` | a clip **and** a review on *every* consultant |
| `s1`–`s4` | an ask suggestion **and** a Sufi card |

Nested IDs (`reviews.r1`, `content.p1`, `messages.m1`) are unique only within
their parent. **If any example in this document showed `id: 'a1'`, someone would
seed it**, and `reactions` would point at two rows. So none do.

Every seeded table carries `legacy_id text` — see §8.

### 1.5 Store the input, compute the derivation

Birth details are stored; charts, horoscopes and panchang are computed. If a
derivation is ever cached, the column says `_cache` and it can be thrown away.

### 1.6 Timestamps are `timestamptz`, with exactly one exception

Everything is UTC. The exception is birth time — §4.1, and it is the one column
that is invisible when wrong.

The mock has **no ISO timestamps at all.** Every date and time is a
pre-formatted display string: `'14 November 1996'`, `'04:35 AM'`, `'Today · 13:30'`,
`'2 days ago'`, `'2h 10m'`. All of them parse at seed time and none survive as
strings.

Rendered deltas are never columns. `bookings.startsIn` (`'2h 10m'`, `'Now'`,
`null`) is a clock subtraction done at render.

### 1.7 One storage type per concept

Every count is `integer`. `'84.2k'` is a client formatting function.

The mock stores the same concept both ways — `clips.views` is `'312k'` while
`insights.topContent.views` is `312000`; `consultants.followers` is `'84.2k'`
while `posts.likes` is `3120`. That ambiguity dies at the schema boundary and
does not come back.

**Follower, like and save counts are derived** from `reactions`, which means
Ritu shows 0 followers on launch day rather than a fabricated 84,200. That is
the same decision as showing `4.9 (3)` instead of `4.9 (2148)`, and it is made
once for both. `view_count` stays a lazily-incremented column — nobody counts
views honestly and a `COUNT(*)` over impressions is not worth the write.

### 1.8 Display order is a column

`sort smallint not null default 0`, seeded as `array_index * 10`.

Array position is currently load-bearing **and the IDs actively contradict it**:
`deities` runs d1, d2, d3, d4, d5, **d7, d6** — Mahavir is deliberately placed
before Shani. `tarotDecks` runs dk5, dk1, dk2, dk3, dk4 so Bhaktamar leads.
Ordering by ID would silently reorder both.

Tables needing `sort`: `deities`, `deity_images`, `tarot_decks`, `tarot_cards`,
`offerings`, `shop_categories`, `shop_subcategories`, `question_packs`,
`report_types`, `consultant_services`, `feed_pins`.

---

## 2. Where each mock export goes

51 exports in `src/data/mock.js`, one in `src/data/bhaktamar.js`. Roughly a
third never becomes a row.

### Static content — seeded once, or shipped as JSON

`categories` · `shopCategories` · `shopSubcategories` · `weekDays` ·
`timeSlots` · `SESSION` · `TAROT_PRICE` · `topUpAmounts` · `loadingLines` ·
`askSuggestions` · `offerings` · `deities` · `tarotDecks` · `bhaktamarCards` ·
`questionPacks` · `premiumTiers` · `reportCatalogue` · `consultantReplies`

Content that only *you* change. `deities` and `tarotDecks` graduate to tables in
phase 4 when the admin console uploads them (§6.2) — that reverses the earlier
"static ships as JSON" position, deliberately, because a non-developer cannot
edit a JS file.

`consultantReplies` is the exception that dies entirely: four canned strings
that exist only because there is no backend. They do not survive.

### Derived — computed, never stored

`placements` · `chartHouses` · `days` / `today` · `panchang` · `bookedSlots` ·
`insights` · `proMetrics` · `earningsSeries` · `warnings` · `reports[].price` ·
`sessionHistory` · `mine()` · `pro`

`sessionHistory` and `proLedger` are **the same events seen from two sides** —
one `bookings` table plus two ledgers produces both. A `session_history` table
would drift exactly the way the mock's totals drifted.

`bookedSlots` is already the *result* of subtracting bookings from availability.
Never stored.

### Real state — these become tables

`user` · `consultants` · `bookings` · `chatThreads` · `walletTransactions` ·
`posts` · `reads` · `clips` · `liveSessions` · `products` · `courses` ·
`academyEvents` · `downloads` · `notifications` · `people` · `referrals` ·
`payouts` · `proLedger` · nested `reviews` · the `flags` Set

### Owned by a third party

`liveSessions` runtime and `liveChat` → the video SDK. `askConversation` → the
model provider, with the thread persisted locally.

---

## 3. The v1 cut line

**Scope: a seeker signs in, tops up, sees real consultants, books a real slot
with real money, and chats.**

**13 tables:** `profiles` · `consultants` · `consultant_services` ·
`consultant_availability` · `consultant_time_off` · `bookings` · `wallets` ·
`ledger` · `earnings_ledger` · `orders` · `order_items` · `payments` ·
`threads` · `messages`.

**The rule behind the cut** — *can this be added later without migrating another
table?*

- `reactions`: yes. One table, trivial RLS, no money. **Cut.**
- `orders`: no. It is the ledger's `ref_type` decision, and retrofitting an
  order layer beneath a ledger holding live money is the worst migration in this
  project. **Kept**, despite sessions being the only thing sold in v1.

Cut: `catalogue` · `purchases` · `entitlements` · `reactions` · `content` ·
`reviews` · `sessions` · `notifications` · `referrals` · `payouts` ·
`kyc_documents` · `deity_images` · `tarot_cards` · `tarot_pulls` ·
`admin_users` · `admin_actions` · `consultant_flags` · `feed_pins`.

**Zero front-end change on the cut screens.** Shop, Academy, Pooja, Tarot,
Reports, Premium, Ask AI and Live keep importing `mock.js` untouched. That is
the point of the line.

**Two columns ship in v1 despite being admin features**, because they are RLS
predicates and adding them later means revisiting every policy:
`consultants.status` and `bookings.rescheduled_to`.

---

## 4. Tables

### 4.1 Identity

```sql
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  phone           text unique not null,
  name            text not null,
  email           text,                -- contact only, never an auth factor
  birth_date      date,
  birth_time      time,
  birth_time_known boolean not null default false,
  birth_place     text,
  birth_lat       numeric(9,6),
  birth_lon       numeric(9,6),
  birth_zone      text,               -- IANA, e.g. 'Asia/Kolkata'
  admin           boolean not null default false,
  legacy_id       text,
  created_at      timestamptz not null default now()
);
```

**`birth_date` + `birth_time` + `birth_zone`, never a `timestamptz` and never a
stored UTC offset.** This is the one column set that is invisible when wrong.

A UTC offset is a *function* of a zone and an instant, not a property of either.
India has changed its offsets, so applying today's `+05:30` to a 1962 birth
shifts the entire chart — every house cusp, every dasha boundary — with no error
raised anywhere. Storing the naive local time plus the IANA zone keeps the
original input, and the correct instant is computed from historical tzdata at
chart time.

**Do not "fix" this to a `timestamptz`.** It reads like a bug and is not.

`birth_time_known` exists because a large share of Indian users do not know their
minute of birth, rectification is a real product, and `NULL` must be
distinguishable from midnight.

**No `role` column.** One person can be a seeker, a consultant and an admin
simultaneously — an enum forces a false choice. Consultant-ness is the existence
of a `consultants` row. Admin is the boolean, and admin *tier* lives in
`admin_users` (§6.1), not here.

**`email` is contact, not identity.** The phone is the account and the only
channel anyone proves they hold. Nothing signs in with this address and nothing
verifies it, so it must never be read as evidence of who someone is — a second
account can carry the same address.

It is nullable and not unique, and both are deliberate. Nullable because the
column arrived after the first accounts existed and a `NOT NULL` would mean
inventing an address for them; required-ness is enforced at the onboarding
screen instead (`docs/03-APP-FLOW.md`). Not unique because one address across
two phone numbers is ordinary in a family, and a unique index turns that into a
signup failure the person cannot act on. The CHECK is shape only — nothing
short of sending mail to an address proves it exists.

Owner-writable, unlike `phone`: a contact address nobody can correct after a
typo is a support ticket that never closes. Why it is collected at all, and the
consent that governs using it, are `docs/01-PRD.md`'s.

### 4.2 Consultants

```sql
create table consultants (
  profile_id        uuid primary key references profiles(id) on delete cascade,
  category          text not null,
  specialization    text,
  languages         text[] not null default '{}',
  experience_yrs    smallint,
  bio               text,
  credentials       text[] not null default '{}',
  status            text not null default 'pending'
                    check (status in ('pending','approved','blocked')),
  verified          boolean not null default false,
  rating_avg_cache  numeric(2,1),
  rating_count_cache integer not null default 0,
  rank_score_cache  numeric,
  legacy_id         text,
  created_at        timestamptz not null default now()
);
```

`status` is the public-SELECT predicate for the whole consultant surface, which
is why it ships in v1 rather than with the admin console. A consultant who has
not been approved is invisible to seekers, cannot be booked, and cannot earn.

The three `_cache` columns are the named exceptions to §1.3. `rating_avg_cache`
exists so the consultant list can `ORDER BY` it; it is maintained by trigger from
`reviews` and is throwaway. `rank_score_cache` is recomputed nightly — **the
formula that fills it is a product decision and lives in `01-PRD.md`**, not here.

### 4.3 What a consultant sells

```sql
create table price_bands (
  id            uuid primary key default gen_random_uuid(),
  tier          smallint not null,        -- 1..6, the thing a consultant picks
  billing       text not null check (billing in ('fixed','per_minute')),
  duration_mins smallint not null check (duration_mins > 0),
  price_paise   integer not null check (price_paise >= 0),
  active        boolean not null default true,
  sort          smallint not null default 0,
  created_at    timestamptz not null default now(),
  unique (tier, billing, duration_mins)
);

create table consultant_services (
  id            uuid primary key default gen_random_uuid(),
  consultant_id uuid not null references consultants(profile_id) on delete cascade,
  band_id       uuid not null references price_bands(id),
  mode          text not null check (mode in ('call','chat','live','booking')),
  billing       text not null default 'fixed'
                check (billing in ('fixed','per_minute')),
  duration_mins smallint not null,
  price_paise   integer not null check (price_paise >= 0),
  active        boolean not null default true,
  sort          smallint not null default 0,
  created_at    timestamptz not null default now(),
  unique (consultant_id, mode, billing, duration_mins)
);
```

**`price_bands` is where "the platform sets the price" stops being a sentence
in the PRD.** Six tiers, each carrying the three bookable lengths and a
per-minute rate. `consultant_services.price_paise` is a copy of the band's, and
the write policy refuses a row whose price, length and billing do not match an
*active* band — so a consultant choosing a band is a rule the database holds,
not six buttons a browser draws. A price change is an INSERT and a flip of
`active`; live bookings do not move, because they froze their own amount.

Every column of the new row in that policy's `EXISTS` **must be qualified**
(`consultant_services.price_paise`, not `price_paise`) — unqualified, it
resolves to the band's own column, the comparison becomes `b.x = b.x`, and the
check silently passes anything. It shipped that way once and
`009_slots_check.sql` assertion 9 is what caught it.

**This table is the fix for the three-ladder problem.** The mock holds three
incompatible pricing models at once: `SESSION` says a flat 20 minutes,
`consultants.price` is a single number, and `bookings` records 10/15/30-minute
sessions at three different prices across three modes. A single
`consultants.price_paise` column cannot express any two of those together.

It also supplies **the noun the current UI is missing.** The Consult booking
sheet today knows a consultant and a slot but has no identifier for *what is
being bought* — which is precisely why it could not send a purchase request
without also sending an amount, and why rule 3 in `backend/INSTRUCTIONS.md`
(the client never sends a price) is currently unobeyable. With `service_id`, the
client sends `{ consultantId, serviceId, startsAt }` and the server reads the
price.

**`billing` is how both session models coexist**, which is the answer
`01-PRD.md` §5.1 finally gives: scheduled sessions at 15, 20 or 30 minutes AND
an instant per-minute call. A `per_minute` row is `duration_mins = 1` with
`price_paise` as the rate for one minute, so `price_paise` always means "the
price of one unit of `duration_mins` minutes" — one column, one meaning, and no
second price column to disagree with the first.

Phase 4 *models* per-minute and nothing meters it. The meter — a balance hold,
a per-minute debit, a mid-session cutoff — is phase 5/11, and it needs no
column this table does not already have.

In v1 a consultant has **four rows**: 15, 20 and 30 minutes from their band,
plus that band's per-minute rate.

### 4.4 Availability — a rule, an exception, and a fact

Three tables. The mock has none of them; closures live in a browser `Set` as
`closed:${day}:${slot}`.

```sql
create table consultant_availability (
  consultant_id uuid not null references consultants(profile_id) on delete cascade,
  weekday       smallint not null check (weekday between 0 and 6),
  slot_time     time not null,
  primary key (consultant_id, weekday, slot_time)
);

create table consultant_time_off (
  id            uuid primary key default gen_random_uuid(),
  consultant_id uuid not null references consultants(profile_id) on delete cascade,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  reason        text,
  check (ends_at > starts_at)
);
```

**One row per OPEN slot**, not a start/end range, and not a boolean.

The UI is a literal 7 × 6 grid — `weekDays` × `timeSlots`. A range model would
have to generate that grid on read and re-derive ranges on write, and the two
derivations would disagree. Slot rows make toggling a cell one `INSERT` or one
`DELETE`, cap the table at 42 rows per consultant, and index trivially.

Ranges become necessary the same day arbitrary durations do — which is the same
day `consultant_services` grows a second row, so the two changes ship together
or not at all.

**Open slots are computed, never stored:**

```
open = consultant_availability
     − consultant_time_off
     − bookings (status in 'pending','confirmed')
```

`bookedSlots` in the mock is the *result* of that subtraction, exported as a
constant and imported by three screens.

**One source serves every caller** — `consultant_open_slots(consultant, date)`,
a `security definer` Postgres function reached over RPC. `02-TRD.md` §5 names
it as `GET /consultants/:id/slots?date=`; it is not an Edge Function, because
the subtraction is pure SQL over three tables sitting right there and nothing
it decides needs a secret. It is `security definer` because it must subtract
*other people's* bookings, which RLS correctly hides from the caller — it
returns times, never rows.

Before phase 4 there were two implementations and they disagreed:
`ProConsult.jsx` applied booked slots only when `day === 'Thu'`, while
`ConsultantProfile.jsx` applied them always and ignored the consultant's own
closures entirely. The comment above `bookedSlots` in the mock claimed that
could not happen.

**Booking horizon is 14 days and slot times are IST** (`Asia/Kolkata`). Both
are product constants and both live in that function, once.

`weekday` is `0 = Sunday … 6 = Saturday`, i.e. Postgres `dow`. `weekDays` in
`mock.js` starts on Monday, so the screens convert; the database does not carry
a second convention. Deriving a weekday in the browser is where this bites — an
IST-anchored midnight is the previous day in UTC, and `getUTCDay()` on it
shifted the whole grid by one.

### 4.5 Bookings

```sql
create table bookings (
  id             uuid primary key default gen_random_uuid(),
  seeker_id      uuid not null references profiles(id),
  consultant_id  uuid not null references consultants(profile_id),
  service_id     uuid not null references consultant_services(id),
  order_id       uuid references orders(id),
  starts_at      timestamptz not null,
  duration_mins  smallint not null,          -- frozen copy
  amount_paise   integer not null,           -- frozen copy
  mode           text not null,
  status         text not null default 'pending'
                 check (status in ('pending','confirmed','completed',
                                   'declined','cancelled','rescheduled','no_show')),
  rescheduled_to uuid references bookings(id),
  note           text,
  legacy_id      text,
  created_at     timestamptz not null default now()
);

-- The conflict check IS this index. Not application logic.
create unique index bookings_slot_claim
  on bookings (consultant_id, starts_at)
  where status in ('pending','confirmed');
```

`duration_mins` and `amount_paise` are **frozen copies, not joins.** When a
consultant changes their price, past bookings must not move.

**The partial unique index is the atomic claim.** Two clients requesting the same
slot at the same instant produce one booking and one `23505` unique violation,
which the booking function catches and turns into a refusal the UI already knows
how to show. This makes rule 5 — one write per user action — a database
guarantee instead of a discipline.

```
-- ponytail: unique(consultant_id, starts_at) assumes a session fits inside one
-- slot's spacing (currently 2.5h, so anything up to ~90 min is safe). When
-- durations vary, swap to the native range exclusion rather than inventing a
-- locking scheme:
--   EXCLUDE USING gist (consultant_id WITH =,
--                       tstzrange(starts_at, ends_at) WITH &&)
```

`declined` is in the check constraint because `ProSessions` can already produce
it, even though no seeded row has that status — omitting it is how it gets
forgotten.

`rescheduled_to` is a self-reference for admin item 4. **Rescheduling does not
move money**: the ledger entry and the order stay on the original booking, and
the new row inherits `order_id`.

### 4.6 Money — two books, not one

```sql
create table wallets (
  profile_id     uuid primary key references profiles(id) on delete cascade,
  balance_paise  integer not null default 0,
  constraint wallets_never_negative check (balance_paise >= 0)
);

create table ledger (
  id           uuid primary key default gen_random_uuid(),
  wallet_id    uuid not null references wallets(profile_id) on delete cascade,
  delta_paise  integer not null,          -- signed
  kind         text not null,
  ref_type     text not null check (ref_type in ('order','payment','refund','adjustment')),
  ref_id       uuid,
  note         text,
  created_at   timestamptz not null default now(),
  constraint ledger_delta_nonzero check (delta_paise <> 0)
);

create table earnings_ledger (
  id            uuid primary key default gen_random_uuid(),
  consultant_id uuid not null references consultants(profile_id),
  booking_id    uuid references bookings(id),
  gross_paise   integer not null,
  fee_bps       smallint not null,
  fee_paise     integer not null,
  net_paise     integer not null,
  kind          text not null,
  created_at    timestamptz not null default now(),
  check (net_paise = gross_paise - fee_paise)
);
```

**A marketplace has two books.** `ledger` is what the seeker paid; `earnings_ledger`
is what the consultant earned. They are different rules, different lifecycles and
different tax treatment, and `payouts` must draw from the second rather than by
scanning bookings.

**Do not merge them** on the reasoning that it is all money for the same person.
A consultant is also a seeker — they have a wallet and can buy a report — and the
two books answer different questions.

`earnings_ledger` costs one extra `INSERT` inside a transaction that is already
open, which is why it ships in v1 rather than with the pro-side phase. Without
it, real bookings would sit beside a `ProEarnings` screen showing fabricated
rupees — a demo worse than no demo.

**The ledger `ref_type` has four values and only one is a purchase.** See §4.7
for why it is four rather than one or seven.

Both ledgers are immutable:

```sql
create or replace function refuse_mutation() returns trigger as $$
begin
  raise exception 'ledger rows are append-only; write a reversing entry instead';
end $$ language plpgsql;

create trigger ledger_immutable before update or delete on ledger
  for each row execute function refuse_mutation();
create trigger earnings_ledger_immutable before update or delete on earnings_ledger
  for each row execute function refuse_mutation();
```

**The balance cache is maintained by the ledger, not by its writers.**

```sql
create function apply_ledger_to_balance() returns trigger as $$
begin
  update wallets set balance_paise = balance_paise + new.delta_paise
   where profile_id = new.wallet_id;
  return new;
end $$ language plpgsql security definer set search_path = public;

create trigger ledger_applies_to_balance after insert on ledger
  for each row execute function apply_ledger_to_balance();
```

This is what makes §1.3's promise checkable rather than aspirational. There is
no way to write a ledger row and forget the balance — not from a function
written later, not from a hand-typed `INSERT` in the SQL editor. Replaying the
ledger from zero reproduces the stored balance because the stored balance *is*
that replay, accumulated one row at a time.

`wallets_never_negative` is the backstop underneath it. Every debit is already
checked inside `wallet_debit()` under a row lock; the constraint is what
survives a mistake in a function nobody has written yet.

**Debits go through one function, and it is the only one in v1 that moves a
wallet.** `wallet_debit(p_amount_paise, p_kind, p_ref_type)` — `security
definer`, granted to `authenticated`. It takes the row lock, compares against
the locked balance, and either inserts the signed ledger row or returns
`{ ok: false, reason }` with the string the interface already shows. The lock is
the concurrency control: two debits firing together serialise on it rather than
both reading the same balance and both passing.

**It accepts the amount from the client, and that is within rule 3**, which
bans a number *the user benefits from*. A debit is not one. It is shaped this
way because the catalogue is still in `mock.js` — there is no server-side price
for a tarot card until phases 8 and 10, and phase 5's booking is the first
purchase whose price the server looks up for itself.

**There is no credit function.** Crediting is phase 3's webhook. Until then a
test wallet is funded by inserting a ledger row directly, which the trigger
above carries into the balance.

### 4.7 Orders — where the sellable things become one shape

```sql
create table orders (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references profiles(id),
  status       text not null default 'paid'
               check (status in ('pending','paid','refunded','cancelled')),
  total_paise  integer not null,
  created_at   timestamptz not null default now()
);

create table order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references orders(id) on delete cascade,
  item_type         text not null check (item_type in
                     ('session','product','course','event','report','question_pack')),
  item_id           uuid not null,
  title             text not null,          -- frozen copy
  qty               smallint not null default 1,
  unit_price_paise  integer not null,       -- frozen copy
  tax_rate_bps      smallint not null default 0
);
```

**Seven domain tables, one order layer, discriminator on the line.**

The seven sellable things — session, product, course, event, report, question
pack, tarot pull — overlap by roughly 20%. A product has stock and shipping, a
course has lessons and progress, a session has a slot and a counterparty, a
report has an SLA and a generated artefact. One table for all of them means
either forty nullable columns or a `jsonb` blob, and Postgres can constrain
neither.

But they *are* identical at exactly one point: **a title, a quantity, a unit
price and a tax rate.** That point is the order line. So the discriminator sits
on four columns instead of forty, real domain tables keep real constraints, and
the ledger never learns what a course is.

This also structurally kills a bug the mock already demonstrates. `premiumTiers`
sells two products that are also in `reports` at a third of the price, and one of
its tiers is the same SKU as a question pack at an identical price — one product
sold from two tables (the figures are in `01-PRD.md` §5.2). **`premiumTiers`
stops being a catalogue and becomes a merchandising view** over `reports` and
`question_packs`, which forces that conflict to be resolved rather than encoded.

`item_id` has no foreign key — it points into one of six tables. Same trade as
`reactions` (§5.1): UUIDs make orphans harmless and collisions impossible.

**Two carve-outs:**

- **Bookings are not purchases.** A booking has a slot, a conflict, a counterparty
  and a two-sided ledger. It carries `order_id` for the money and skips
  `order_items` semantics entirely — one booking is one order with one line of
  `item_type = 'session'`.
- **Tarot pulls are not order items.** A per-pull charge is metered, not a SKU.
  It debits `ledger` directly with `ref_type = 'adjustment'`. Promote it if a
  second metered price ever appears.

**Who writes all of this: one function.** `book_session(p_consultant_id,
p_service_id, p_starts_at)` — `security definer`, granted to `authenticated`,
and the first purchase in the project whose price the server looks up for
itself. It takes no amount, because there is nothing for the client to send:

1. locks the wallet — two debits by the same seeker serialise there
2. checks the balance against the locked number
3. opens the `orders` row and its single `order_items` line
4. **claims the slot** — the insert that can raise `23505`
5. debits `ledger` with `ref_type = 'order'` and the order's id
6. credits `earnings_ledger` with gross, `fee_bps = 1800`, fee and net

**Step 4 sits before step 5 deliberately.** The loser of a race blocks on the
partial unique index, wakes to a `23505` and never reaches the debit, so "no
orphaned debit" is an ordering rather than a compensating write. Everything
inside the block unwinds together, so a refusal leaves no order behind either.

**Commission is 18%, stored as `fee_bps = 1800`**, and
`fee_paise = round(gross_paise * fee_bps / 10000)`. The `earnings_ledger` CHECK
makes `gross − fee = net` an invariant rather than a convention, including on
the negative rows a reversal writes.

**And one function reverses it.** `booking_reverse(p_booking_id, p_reason)`
writes a full credit into `ledger` (`ref_type = 'refund'`), the mirror-image row
into `earnings_ledger`, and moves the order to `refunded`. It edits nothing. It
is idempotent on the refund row itself rather than on a flag, so a retry is a
no-op instead of a second credit, and it is granted to nobody — a
client-callable refund is a free session with extra steps. A trigger on
`bookings.status` calls it when a booking becomes `declined`, which also covers
an admin typing the status in the SQL editor. The other two reversing cases in
`01-PRD.md` §5.4 — a consultant who never turns up, a platform failure — are an
admin calling it by hand.

**Per-minute sessions are refused by name**, not charged as though one minute
were the whole call. The meter is phase 11, where a session with join and leave
timestamps exists to meter against.

### 4.8 Payments

```sql
create table payments (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid not null references profiles(id),
  provider            text not null default 'razorpay',
  provider_order_id   text,
  provider_payment_id text unique,          -- THE idempotency guarantee
  provider_event_id   text unique,
  amount_paise        integer not null,
  status              text not null check (status in ('created','captured','failed','refunded')),
  raw                 jsonb,
  created_at          timestamptz not null default now()
);
```

**`provider_payment_id unique` is the idempotency mechanism**, not an application
check. Razorpay retries webhooks; the second delivery hits the unique index, the
insert fails, and no second credit is written. An application-level "have I seen
this?" check has a race between the read and the write. The index does not.

`ledger` cannot serve this role — the event and the credit have different
lifecycles and a failed payment produces an event with no ledger row.

### 4.9 Chat

```sql
create table threads (
  id             uuid primary key default gen_random_uuid(),
  seeker_id      uuid not null references profiles(id),
  consultant_id  uuid not null references consultants(profile_id),
  booking_id     uuid references bookings(id),
  open_until     timestamptz,
  last_message_at timestamptz,
  last_preview   text,                     -- cache, §1.3 exception by name
  legacy_id      text,
  unique (seeker_id, consultant_id)
);

create table messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references threads(id) on delete cascade,
  sender_id   uuid not null references profiles(id),
  body        text not null,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
```

**`sender_id` only. There is no role column, deliberately.**

The mock stores `from: 'me' | 'them'`, which is *viewer-relative* and always
written from the seeker's side. Read by a consultant it is exactly backwards —
her own name at the top and her own replies in the other party's bubbles.
`ChatPanel.jsx` patches this with two helper functions that flip the sides.

Role is derivable: `sender_id = threads.consultant_id`. **Storing it is how you
get a message that disagrees with its own thread.**

`read_at` gives unread counts and read receipts for one column. There is no
`unread` counter — it is `count(*) where read_at is null`.

**`online` is not a column.** Presence is a Supabase Realtime primitive. A boolean
here is stale the moment a tab closes.

**`booking_id` / `open_until` is an open question.** Both the store and
`ChatPanel` state that consultants only reply inside a session window, and
nothing in the mock expresses one. Whether paid chat is a booking with a
duration or a thread with a message quota must be decided before the chat phase
— both columns are present so either answer fits.

---

## 5. Post-v1 tables

Sketched at the level needed to keep v1 columns compatible. Full DDL lands with
the phase that builds them.

### 5.1 Reactions — the `flags` Set, normalised

```sql
create table reactions (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid not null references profiles(id) on delete cascade,
  target_type text not null check (target_type in
              ('consultant','content','product','course','live_session')),
  target_id   uuid not null,
  kind        text not null check (kind in ('follow','save','like','remind')),
  created_at  timestamptz not null default now(),
  unique (actor_id, target_type, target_id, kind)
);
```

The store's namespaced strings — `follow:a1`, `save:po2`, `like:r3`,
`remind:l4` — map one-to-one onto this. A prototype shortcut that survives
contact with a real schema is rare enough to note.

**No referential trigger, deliberately.** `target_id` cannot be a foreign key
because it points into five tables. Do not add a validating trigger: UUIDs make
collisions impossible, a like on a deleted item is harmless, and orphans get
swept periodically or never. The absence of a trigger looks like an oversight,
so this paragraph exists.

### 5.2 Content — four mock exports, one table

```sql
create table content (
  id            uuid primary key default gen_random_uuid(),
  consultant_id uuid not null references consultants(profile_id),
  kind          text not null check (kind in ('post','article','clip','live_session')),
  title         text,
  body          text,
  media_url     text,
  caption       text,
  status        text not null default 'live' check (status in ('live','removed','draft')),
  view_count    integer not null default 0,
  published_at  timestamptz,
  legacy_id     text
);
```

`posts`, `reads`, `clips` and `liveSessions` overlap by roughly 90% —
consultant, title, body, media, timestamp, status. **Merged**, where the seven
sellable things are kept separate. The deciding factor is the overlap, not the
pattern: it is the same question answered opposite ways for opposite reasons.

This is also the payoff for admin item 6 — removing a post becomes one status
column rather than three, and `status = 'removed'` is a **soft delete**. A
removed post in a dispute is evidence; never hard-delete it.

### 5.3 The feed is not a table

The mock's `feed` is 14 hand-ordered `{ kind, refId }` rows. **A feed table is a
ranking system, and there is no ranking** — it is a query over `content` ordered
by `published_at`, plus a small `feed_pins(kind, ref_id, sort, starts_at,
ends_at)` for editorial control from the admin console.

"The mock has a feed so the database needs one" is the obvious wrong inference,
which is why this section exists. Note also that `feed.refId: 'today'` points at
a *key of `days`*, not an ID, and `Home.jsx` already hoists the reading and
panchang cards in the component rather than reordering `feed`. Those two stay
client-side.

### 5.4 Reviews

```sql
create table reviews (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid unique references bookings(id),
  seeker_id     uuid not null references profiles(id),
  consultant_id uuid not null references consultants(profile_id),
  rating        smallint not null check (rating between 1 and 5),
  body          text,
  status        text not null default 'live' check (status in ('live','removed')),
  created_at    timestamptz not null default now()
);
```

`booking_id` is **unique but nullable** — Postgres permits many NULLs in a unique
index. Keying a review to a completed booking is the whole anti-fraud story, but
the three seeded reviews per consultant have no matching bookings, and `NOT NULL`
would force the seed to fabricate them. A `verified` badge derives from
`booking_id is not null`, which is what real marketplaces show anyway.

### 5.5 Media and licensing

```sql
create table deity_images (
  id         uuid primary key default gen_random_uuid(),
  deity_id   uuid not null references deities(id) on delete cascade,
  file       text not null,
  label      text not null,
  artist     text,
  licence    text not null check (licence in
             ('public_domain','cc_by_4','cc_by_sa_3','cc_by_sa_4','supplied')),
  source_url text,
  sort       smallint not null default 0
);
```

**`licence` is `NOT NULL` with no default**, and this is not tidiness. Of the 26
murtis, 4 are CC BY 4.0 and 3 are share-alike (CC BY-SA 3.0 and 4.0), and
`tools/deity-art-process.py` produces **derivatives** — so the share-alike
obligation is inherited by the processed webp the app actually ships.

"Which images may not go behind a paywall, and which must carry attribution"
has to be answerable as a `WHERE` clause, not by reading prose. The moment the
admin console lets a non-developer upload art (§6.2), artist / licence / source
are required fields on the form or the app accumulates unattributable assets
that legally have to be deleted along with anything derived from them.

`src/data/mock.js` has already been split into these three fields, with
`creditLine()` as the single renderer.

**Open:** the 48 Bhaktamar card faces in `public/cards/` carry no attribution at
all. Same `NOT NULL` rule applies and someone has to say where they came from.

### 5.6 Remaining

`tarot_pulls` (the real rolling-seven-day window, replacing two booleans in a
browser `Set`) · `entitlements` (what was bought and can now be used;
`questionsLeft` becomes a SUM over it) · `notifications` · `referrals` ·
`payouts` · `kyc_documents` · `products` · `courses` · `academy_events` ·
`downloads` · `deities` · `tarot_decks` · `tarot_cards` · `ask_messages` ·
`sessions` (joined_at, left_at, actual_mins — what admin item 9 measures).

---

## 6. Admin

### 6.1 Admin does not use RLS

**The admin console is a separate server-side app holding the service-role key.
It bypasses row-level security entirely. There is no admin role in the client's
RLS.**

The alternative — `profiles.admin = true` plus an "or is admin" clause in every
policy — is fourteen policies that can each be got wrong independently, and one
leaked admin JWT reads every wallet in the system. Isolating the elevated path
into one server process keeps the blast radius inside something you control.

```sql
create table admin_users (
  profile_id uuid primary key references profiles(id),
  tier       text not null check (tier in ('support','moderator','finance','superadmin')),
  created_at timestamptz not null default now()
);

create table admin_actions (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid not null references profiles(id),
  action      text not null,
  target_type text not null,
  target_id   uuid,
  before      jsonb,
  after       jsonb,
  reason      text,
  created_at  timestamptz not null default now()
);
```

**Tiers are enforced in the admin app, not in Postgres** — the service role has
no tiers. Support reads. Moderator removes content and blocks. Finance touches
payouts and refunds. Superadmin manages admins.

**Every action of every tier writes `admin_actions`.** That is legal record, not
a feature, and it is the only reason a blocked consultant's appeal can be
answered.

This does not contradict the "no persisted role" rule in the front-end handoff.
That rule governs routing inside the seeker/consultant SPA so `isPro` cannot
disagree with the address bar. Admin is a different application with a different
login.

### 6.2 What the nine admin capabilities need

| # | Capability | Schema cost |
|---|---|---|
| 1 | Academy CMS + consultant rank | `courses` / `academy_events` / `downloads` + `consultants.rank_score_cache`. Formula in `01-PRD.md` |
| 2 | Deity images & tarot | `deities` · `deity_images` · `tarot_decks` · `tarot_cards` + a storage bucket. **Reverses "static ships as JSON"** — recorded, not silent |
| 3 | Marketplace | `products` · `product_images` · stock · `orders`. All already required |
| 4 | Reschedule | `bookings.rescheduled_to` — **one column, in v1** |
| 5 | Consultant approval | `consultants.status` — **in v1**, it is an RLS predicate. Plus `kyc_documents` |
| 6 | Remove post, block | `content.status` · `consultants.status` · `admin_actions`. Never hard-delete |
| 7 | Reviews + audit | `reviews`. Consultant analytics are queries |
| 8 | Search users, spend history | **Free.** `profiles` + `orders` + `ledger` + a `pg_trgm` index |
| 9 | Anti-fluking bot | `consultant_flags` + `bot_rules` (thresholds as **rows, not code**, so they tune without a deploy) |

```sql
create table consultant_flags (
  id            uuid primary key default gen_random_uuid(),
  consultant_id uuid not null references consultants(profile_id),
  rule          text not null,
  value         numeric,
  window_start  timestamptz,
  window_end    timestamptz,
  resolved_by   uuid references profiles(id),
  resolved_at   timestamptz,
  created_at    timestamptz not null default now()
);
```

**Item 9 is a scheduled query, not a service and not a model.** Everything it
needs is already computed as `proMetrics`: median reply time, calls attended
over requested, sessions completed. Once `messages`, `bookings` and `sessions`
are real those are three SELECTs behind a materialized view and a nightly cron.

It **writes flags; a human resolves them.** `resolved_by` and `resolved_at` exist
because heuristic detection has false positives, and auto-penalising someone's
livelihood on a threshold produces appeals that cannot be answered.

---

## 7. Row-level security

Enabled on every table. Policies for the v1 thirteen.

| Table | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|
| `profiles` | own row | UPDATE own only |
| `consultants` | anyone, `status = 'approved'` | own row only |
| `price_bands` | anyone, where `active` | **none, ever** — the catalogue is not client-writable |
| `consultant_services` | anyone, where parent approved | own only, **and the price must match an active band** |
| `consultant_availability` | anyone, where parent approved | own only |
| `consultant_time_off` | own only | own only |
| `bookings` | `seeker_id = auth.uid() OR consultant_id = auth.uid()` | **no client INSERT.** UPDATE limited to the consultant setting `confirmed` / `declined` |
| `wallets` | own | **none, ever** |
| `ledger` | own wallet | **none, ever**, plus the immutability trigger |
| `earnings_ledger` | own consultant row | **none, ever** |
| `orders` | own (`profile_id = auth.uid()`) | **none** |
| `order_items` | own, through an EXISTS on the parent order — **and every column of the new row is qualified in it**, or the predicate collapses to `o.id = o.id` and returns every order in the database | **none** |
| `payments` | own | **none** |
| `threads` | participant | **none** — created server-side with the booking |
| `messages` | participant | INSERT where participant **and** `sender_id = auth.uid()` **and** the thread window is open |

**`wallets`, `ledger` and `earnings_ledger` have no write policy for anybody.**
Only `security definer` functions write them. A ledger with a client INSERT
policy is not a ledger.

**`messages` is the only direct client write in v1**, deliberately: a message is
worth nothing, Realtime wants the row, and routing it through a function buys
nothing.

**Public consultant fields come from a view, never by loosening `profiles`.**

```sql
create view consultants_public as
  select c.profile_id, p.name, c.category, c.specialization, c.languages,
         c.experience_yrs, c.bio, c.credentials, c.verified,
         c.rating_avg_cache, c.rating_count_cache
  from consultants c join profiles p on p.id = c.profile_id
  where c.status = 'approved';
```

**And the read side of `bookings` comes from one too.**

```sql
create view bookings_view as
  select b.*, s.name as seeker_name, s.birth_date, s.birth_time, s.birth_place,
         c.name as consultant_name
  from bookings b
  join profiles s on s.id = b.seeker_id
  join profiles c on c.id = b.consultant_id
  where b.seeker_id = auth.uid() or b.consultant_id = auth.uid();
```

Without it the consultant's own screen cannot render: `bookings` carries
`seeker_id`, `profiles` is own-row-only, and a consultant reading their own
queue would get a UUID and no name. It restricts itself with the same predicate
as `bookings_select_mine`, and it carries **the seeker's birth details to the
consultant on that booking** — a reading cannot be done without them, a booking
is the request for one, and there is no path here to the birth details of
somebody who has not booked you. No phone, no email.

Writes still go through the table.

### There is no `/pro` authorization endpoint

Every consultant-side screen's data is a query already scoped by `auth.uid()`.
A seeker standing on `/pro/sessions` sees an **empty list, not a 403** — the
server never asks who they claim to be.

`isPro` stays derived from the URL in the client, exactly as the front-end
handoff requires, and rule 4 is satisfied by data scoping rather than by a route
guard someone can forget to add. This is the cleanest answer to that rule and it
is not obvious, so it is written down.

---

## 8. Indexes

Beyond primary keys and the unique constraints already declared.

```sql
create index on bookings (consultant_id, starts_at);      -- slot query
create index on bookings (seeker_id, starts_at desc);     -- my sessions
create index on consultants (status);                     -- the public predicate
create index on consultant_services (consultant_id) where active;
create index on consultant_time_off (consultant_id, starts_at);
create index on ledger (wallet_id, created_at desc);      -- statement
create index on earnings_ledger (consultant_id, created_at desc);
create index on messages (thread_id, created_at desc);    -- thread render
create index on messages (thread_id) where read_at is null;  -- unread count
create index on threads (consultant_id, last_message_at desc);
create index on threads (seeker_id, last_message_at desc);
create index on order_items (item_type, item_id);         -- "who bought this"
create index on content (consultant_id, published_at desc) where status = 'live';
create index on reactions (target_type, target_id, kind); -- count followers
create index on profiles using gin (name gin_trgm_ops);   -- admin search
```

The trigram index needs `create extension pg_trgm` and only matters once the
admin console exists.

---

## 9. Migrations and seed

### Conventions

Numbered SQL files in `backend/schema/`, forward-only, **never edited once
applied**. A migration that has run against any real database is history.

Applied so far: `001` through `011`, the phase 4 files being
`007_consultants.sql`, `008_bookings.sql`, `009_slots.sql`,
`010_bookings_view.sql` and `011_round_price_bands.sql`. The `_check.sql` files
are tests, not migrations, and never appear in a replay. All went in
through the Supabase MCP rather than the CLI — there is no `supabase/migrations`
directory in this repo, so the numbered file is a record of what ran, not the
thing that runs it. Keep the two in step by hand.

### The seed cannot key on mock IDs

Because they collide (§1.4). Every seeded table gets fresh UUIDs plus
`legacy_id text` holding the original string, and the seed re-points the
polymorphic references — `feed.refId`, `chatThreads.consultantId`,
`insights.topContent.id` — through that column. **Without the mapping the
polymorphic references cannot be resolved at all.** `legacy_id` stays after
seeding: it is free, and it is how the seed re-runs.

### Roughly fifteen display names resolve to nothing

Only three real foreign-key fields exist in the mock. Everything else joins by
display name, **and not all the names exist**:

| Field | Unmatched examples |
|---|---|
| `bookings.client` | Kabir S., Priya M., Rhea D., Imran Q., Sana B., Vikram T. — six seekers with no profile anywhere |
| `sessionHistory.consultant` | Dr. Nandita Rao, Simran Kaur |
| `products.recommendedBy` | Yogesh Pandit, Dev Malhotra |
| `courses.tutor`, `academyEvents.host`, `referrals.list[].name`, `proLedger.label`, `chatThreads.seeker`, `downloads.course` | various |

**Rule: unmatched names create placeholder profiles flagged
`legacy_id = 'seed_placeholder:<name>'`, and the seed prints the full list.** It
fails loudly at seed time rather than as a foreign key violation at 2am.

### Three specific seed traps

1. **`bookings` has no `consultantId`.** Every row implicitly belongs to
   `consultants[0]`. A seed lifted verbatim silently attributes all seven
   bookings to Ritu Kashyap, and it stays invisible until a second consultant
   signs in. Assign it explicitly.
2. **Two Bhaktamar cards are incomplete.** `j37` stops mid-verse; `j38` carries
   only the second half of the shloka despite having its verse marker. Both are
   flagged `partial: true` in `src/data/bhaktamar.js`. A length check on the
   Devanagari fields will fail on exactly two of 48 rows, and it is a content
   gap needing a verified source — not an encoding bug.
3. **`REPORT_MULTIPLIER` must not reach the database.** `reports.price` is
   `base × 3`, computed at module load as a placeholder. `proLedger.pl3` already
   compounds it — billing a "Natal report" at 4,041 = 449 × 9, where 449 is the
   *Remedial* base, not Natal's. Six real prices get typed once, per row, and the
   multiplier is deleted. See `01-PRD.md`.

### Encoding

`utf8` throughout. `bhaktamar_cards.sa` holds Devanagari and `.iast` holds Latin
with combining diacritics; neither is ever case-folded, normalised or
transliterated in the database.

---

## 10. Open questions

Carried, not guessed at. Each blocks something specific.

**Answered in phase 4**, and recorded where they are owned rather than left
here: the session duration ladder is *both* models — tiered 15/20/30 and
per-minute, §4.3 — and the slots constants are a 14-day horizon in IST, §4.4.

**Answered 27 Aug, before phase 5**, and owned by `01-PRD.md` §5.4: the wallet
is debited **at booking**, inside the transaction that claims the slot — no
hold. There is no self-service cancellation and no refund for a session the
seeker skipped. A decline, a consultant no-show and a platform failure are not
refunds and each writes a **full reversing credit**; the booking function
implements both halves or it implements a consultant keeping a stranger's
money.

| Open | Blocks | Note |
|---|---|---|
| **`REPORT_MULTIPLIER` and duplicate SKUs** | report / premium seed | `01-PRD.md` |
| **Chat window semantics** | `threads` | `booking_id` or `open_until` — both columns exist so either answer fits |
| **Consultant ranking formula** | `rank_score_cache` | `01-PRD.md` |
| **Free tarot pull window** | `tarot_pulls` | Leaning rolling seven days from `pulled_at` |
| **Bhaktamar card provenance** | `tarot_cards` seed | 48 faces with no attribution recorded |
