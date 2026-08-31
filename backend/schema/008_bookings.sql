-- Applied to Supabase via MCP. Forward-only — never edit once applied.
-- Phase 4 (docs/06-IMPLEMENTATION.md). Table per docs/05-BACKEND-SCHEMA.md
-- §4.5, RLS per §7, indexes per §8.
--
-- The table, not the transaction. docs/06 puts `bookings` in phase 5, and this
-- moves it one phase earlier for two reasons that are not stylistic:
--
--   1. consultant_open_slots() (009) subtracts claimed slots. Without this
--      table the three-way subtraction is a two-way one, and the whole point
--      of the phase — the two sides agreeing about which slots are free — is
--      untestable.
--   2. The phase 4 seed writes bookings. Seed trap 1 (06-IMPLEMENTATION.md
--      §Seed) is literally about this table having no consultant reference in
--      the mock.
--
-- What stays in phase 5: `orders`, `order_items`, `earnings_ledger`, and the
-- one transaction that claims a slot and debits a wallet. `order_id` is
-- nullable in the spec, which is what lets the table arrive without them —
-- a seeded booking carries no order because no money was ever taken for it.

create table public.bookings (
  id             uuid primary key default gen_random_uuid(),
  seeker_id      uuid not null references public.profiles(id),
  consultant_id  uuid not null references public.consultants(profile_id),
  service_id     uuid not null references public.consultant_services(id),
  order_id       uuid,                      -- references orders(id) in phase 5
  starts_at      timestamptz not null,
  duration_mins  smallint not null,         -- frozen copy
  amount_paise   integer not null,          -- frozen copy
  mode           text not null,
  status         text not null default 'pending'
                 check (status in ('pending','confirmed','completed',
                                   'declined','cancelled','rescheduled','no_show')),
  rescheduled_to uuid references public.bookings(id),
  note           text,
  legacy_id      text,
  created_at     timestamptz not null default now()
);

-- `duration_mins` and `amount_paise` are frozen copies, not joins. When a
-- consultant changes band, past bookings must not move.

-- The conflict check IS this index. Not application logic. Two clients
-- requesting the same slot at the same instant produce one booking and one
-- 23505, which phase 5's function turns into a named refusal.
create unique index bookings_slot_claim
  on public.bookings (consultant_id, starts_at)
  where status in ('pending','confirmed');

-- ponytail: unique(consultant_id, starts_at) assumes a session fits inside one
-- slot's spacing (currently 2.5h, so anything up to ~90 min is safe). When
-- durations outgrow that, swap to the native range exclusion rather than
-- inventing a locking scheme:
--   EXCLUDE USING gist (consultant_id WITH =,
--                       tstzrange(starts_at, ends_at) WITH &&)

create index bookings_consultant_starts_idx on public.bookings (consultant_id, starts_at);
create index bookings_seeker_starts_idx     on public.bookings (seeker_id, starts_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Read your own, either side of it. No client INSERT policy at all: phase 5's
-- security definer function writes the row inside the transaction that also
-- debits the wallet, and a client-insertable booking is a free session.

alter table public.bookings enable row level security;

create policy "bookings_select_mine"
  on public.bookings for select
  using (seeker_id = auth.uid() or consultant_id = auth.uid());

-- Accept and decline, and nothing else. `using` reads the old row, `with
-- check` the new one, so this is exactly the pending → confirmed | declined
-- edge of the state machine in 03-APP-FLOW.md §8.1 — a consultant cannot mark
-- their own session `completed` to be paid for one they did not take, and
-- cannot reach back into a booking that is already resolved.
create policy "bookings_update_decision"
  on public.bookings for update
  using (consultant_id = auth.uid() and status = 'pending')
  with check (consultant_id = auth.uid() and status in ('confirmed','declined'));

revoke insert, update, delete on public.bookings from authenticated, anon;
grant update (status) on public.bookings to authenticated;

-- A decline has nothing to reverse yet — the seeded rows carry no order and no
-- ledger entry. Phase 5 adds the reversing credit at the same time it adds the
-- money that makes one necessary.
