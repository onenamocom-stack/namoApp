-- Applied to Supabase via MCP. Forward-only — never edit once applied.
-- Phase 5 (docs/06-IMPLEMENTATION.md). Tables per docs/05-BACKEND-SCHEMA.md
-- §4.6–§4.7, RLS per §7, indexes per §8, the state machine per
-- docs/03-APP-FLOW.md §8.1, the refund policy per docs/01-PRD.md §5.4.
--
-- The phase the whole v1 exists for: the transaction. `bookings` and the
-- partial unique index that IS the conflict check already exist (008). What
-- is added here is the order layer, the consultant's book, the one function
-- that writes all of it inside a single transaction, and the reversing credit
-- a decline owes now that a booking carries money.
--
-- SCOPED TO SCHEDULED BOOKINGS. A `per_minute` service is refused by name
-- below rather than half-supported: metering needs a session with join and
-- leave timestamps and a room to cut off, and that is phase 11.

-- ── The order layer ─────────────────────────────────────────────────────────
-- Seven domain tables, one order layer, discriminator on the line (§4.7). It
-- ships now, with sessions as the only thing sold, because retrofitting an
-- order layer beneath a ledger that already holds live money is the worst
-- migration in this project. It costs the twenty lines below.

create table public.orders (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id),
  status       text not null default 'paid'
               check (status in ('pending','paid','refunded','cancelled')),
  total_paise  integer not null,
  created_at   timestamptz not null default now()
);

create table public.order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete cascade,
  item_type         text not null check (item_type in
                     ('session','product','course','event','report','question_pack')),
  item_id           uuid not null,          -- points into one of six tables; no FK by design
  title             text not null,          -- frozen copy
  qty               smallint not null default 1,
  unit_price_paise  integer not null,       -- frozen copy
  tax_rate_bps      smallint not null default 0
);

create index order_items_item_idx      on public.order_items (item_type, item_id);
create index orders_profile_created_idx on public.orders (profile_id, created_at desc);

-- 008 left `order_id` a bare uuid because `orders` did not exist yet. It does now.
alter table public.bookings
  add constraint bookings_order_id_fkey
  foreign key (order_id) references public.orders(id);

-- ── The consultant's book ───────────────────────────────────────────────────
-- A marketplace has two books (§4.6). `ledger` is what the seeker paid;
-- `earnings_ledger` is what the consultant earned. Different rules, different
-- lifecycles, different tax treatment — and `payouts` (phase 12) must draw
-- from this rather than by scanning bookings.
--
-- The CHECK is the whole invariant: gross − fee = net on every row, including
-- the negative rows a reversal writes.

create table public.earnings_ledger (
  id            uuid primary key default gen_random_uuid(),
  consultant_id uuid not null references public.consultants(profile_id),
  booking_id    uuid references public.bookings(id),
  gross_paise   integer not null,
  fee_bps       smallint not null,          -- 1800, never 18 and never 0.18
  fee_paise     integer not null,
  net_paise     integer not null,
  kind          text not null,              -- what the consultant reads
  created_at    timestamptz not null default now(),
  constraint earnings_ledger_nets check (net_paise = gross_paise - fee_paise)
);

create index earnings_ledger_consultant_created_idx
  on public.earnings_ledger (consultant_id, created_at desc);

-- Append-only, by the same trigger function the seeker's ledger uses. A
-- mistake is corrected by a reversing entry, never by an edit (rule 2).
create trigger earnings_ledger_immutable
  before update or delete on public.earnings_ledger
  for each row execute function public.refuse_mutation();

-- ── RLS: read your own, write nothing ───────────────────────────────────────
-- No write policy on any of the three, for anybody (§7). Only the security
-- definer functions below write them.

alter table public.orders          enable row level security;
alter table public.order_items     enable row level security;
alter table public.earnings_ledger enable row level security;

create policy "orders_select_own"
  on public.orders for select
  using (profile_id = auth.uid());

-- The subquery's reference to the new row is QUALIFIED. Unqualified,
-- `order_id` resolves to the inner table, the predicate becomes `o.id = o.id`,
-- and the policy returns every order in the database. That exact shape shipped
-- in phase 4's service-price policy and assertion 9 caught it.
create policy "order_items_select_own"
  on public.order_items for select
  using (exists (select 1 from public.orders o
                  where o.id = order_items.order_id
                    and o.profile_id = auth.uid()));

create policy "earnings_ledger_select_own"
  on public.earnings_ledger for select
  using (consultant_id = auth.uid());

revoke insert, update, delete on public.orders          from authenticated, anon;
revoke insert, update, delete on public.order_items     from authenticated, anon;
revoke insert, update, delete on public.earnings_ledger from authenticated, anon;

-- ── The booking transaction ─────────────────────────────────────────────────
-- One write per user action (INSTRUCTIONS.md rule 5). The client sends
-- { consultantId, serviceId, startsAt } and NEVER a price (rule 3) — every
-- number below is looked up on this side of the wire.
--
-- The order of operations is the design, and it is not arbitrary:
--
--   1. lock the wallet   — two debits by the same seeker serialise here
--   2. check the balance — against the LOCKED number, never a client's copy
--   3. open the order    — the ledger row needs its id for ref_id
--   4. CLAIM THE SLOT    — the insert that can raise 23505
--   5. debit the ledger  — only once the slot is ours
--   6. credit the book   — the consultant's side of the same money
--
-- The slot claim sits BEFORE the debit on purpose. Two clients firing at the
-- same instant both reach step 4; one commits, the other blocks on the unique
-- index, wakes to a 23505, and never reaches step 5. That is done-condition
-- 1's "no orphaned debit" — an ordering, not a compensating write. Everything
-- in the block unwinds together, so a refusal leaves no order and no booking.
--
-- Charge AT BOOKING, no hold (01-PRD.md §5.4). A hold is a second state that
-- can leak, expire wrongly, or reconcile against nothing.

create or replace function public.book_session(
  p_consultant_id uuid,
  p_service_id    uuid,
  p_starts_at     timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- 18%, in basis points, named once. 01-PRD.md §4.1. A percentage or a
  -- fraction here is the hundred-fold error rule 1 exists to ban.
  c_fee_bps constant smallint := 1800;
  v_uid     uuid := auth.uid();
  v_svc     public.consultant_services%rowtype;
  v_name    text;
  v_label   text;
  v_balance integer;
  v_order   uuid;
  v_booking uuid;
  v_fee     integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'Sign in to book a session.');
  end if;
  if p_consultant_id = v_uid then
    return jsonb_build_object('ok', false, 'reason', 'You cannot book yourself.');
  end if;

  -- The price, the length and the mode come from here and nowhere else. The
  -- consultant must be approved: the same predicate as the RLS policy,
  -- because this function bypasses it.
  select s.* into v_svc
    from public.consultant_services s
    join public.consultants c on c.profile_id = s.consultant_id
   where s.id = p_service_id
     and s.consultant_id = p_consultant_id
     and s.active
     and c.status = 'approved';

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'That session is not available any more.');
  end if;

  -- Per-minute is modelled (007) and metered in phase 11, where the session
  -- with join and leave timestamps lives. Refused by name rather than charged
  -- as though one minute were the whole call.
  if v_svc.billing <> 'fixed' then
    return jsonb_build_object('ok', false, 'reason', 'Instant calls are not bookable yet.');
  end if;

  -- Availability, time off, the horizon and the past, from the one slots
  -- source. A second implementation of this subtraction is the phase 4 bug.
  if not exists (
    select 1 from public.consultant_open_slots(
                   p_consultant_id,
                   (p_starts_at at time zone 'Asia/Kolkata')::date) o
     where o.starts_at = p_starts_at) then
    return jsonb_build_object('ok', false, 'reason', 'That time is no longer open. Pick another.');
  end if;

  select name into v_name from public.profiles where id = p_consultant_id;
  v_label := coalesce(v_name, 'Consultation') || ' · ' || v_svc.duration_mins || ' min';
  v_fee   := round(v_svc.price_paise::numeric * c_fee_bps / 10000)::integer;

  begin
    -- 1 and 2. The lock, then the check against the locked number.
    select balance_paise into v_balance
      from public.wallets where profile_id = v_uid for update;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'No wallet on this account.');
    end if;
    if v_svc.price_paise > v_balance then
      -- The string the front end has always shown (INSTRUCTIONS.md §2). Raised
      -- rather than returned so the block unwinds: nothing is written by here,
      -- but a bare return that skips the rollback is one edit away from wrong.
      raise exception using errcode = 'P0001', message = 'short balance';
    end if;

    -- 3. The order. One booking is one order with one line (§4.7).
    insert into public.orders (profile_id, total_paise)
    values (v_uid, v_svc.price_paise)
    returning id into v_order;

    insert into public.order_items (order_id, item_type, item_id, title, unit_price_paise)
    values (v_order, 'session', v_svc.id, v_label, v_svc.price_paise);

    -- 4. The claim. `duration_mins` and `amount_paise` are frozen copies, not
    -- joins: a consultant changing band must not move a booking already paid
    -- for. Status is `pending` — the slot is held while the consultant
    -- decides, or two seekers are sold the same half hour.
    insert into public.bookings (seeker_id, consultant_id, service_id, order_id,
                                 starts_at, duration_mins, amount_paise, mode, status)
    values (v_uid, p_consultant_id, v_svc.id, v_order,
            p_starts_at, v_svc.duration_mins, v_svc.price_paise, v_svc.mode, 'pending')
    returning id into v_booking;

    -- 5. The seeker's side. The balance follows by the phase 2 trigger, so
    -- there is no way to write this row and forget the wallet.
    insert into public.ledger (wallet_id, delta_paise, kind, ref_type, ref_id)
    values (v_uid, -v_svc.price_paise, v_label, 'order', v_order);

    -- 6. The consultant's side, in the transaction that is already open —
    -- which is the whole reason earnings_ledger ships in v1 rather than with
    -- the pro-side phase.
    insert into public.earnings_ledger (consultant_id, booking_id, gross_paise,
                                        fee_bps, fee_paise, net_paise, kind)
    values (p_consultant_id, v_booking, v_svc.price_paise,
            c_fee_bps, v_fee, v_svc.price_paise - v_fee, v_label);

  exception
    when unique_violation then
      -- The partial unique index on (consultant_id, starts_at) where status in
      -- ('pending','confirmed'). The conflict check is the database's, not
      -- this function's. The loser never reached step 5.
      return jsonb_build_object('ok', false,
                                'reason', 'Someone just took that time. Pick another.');
    when sqlstate 'P0001' then
      return jsonb_build_object('ok', false, 'reason', 'Not enough balance',
                                'balance_paise', v_balance);
  end;

  return jsonb_build_object('ok', true, 'booking_id', v_booking, 'order_id', v_order,
                            'balance_paise', v_balance - v_svc.price_paise);
end;
$$;

revoke execute on function public.book_session(uuid, uuid, timestamptz) from public, anon;
grant  execute on function public.book_session(uuid, uuid, timestamptz) to authenticated;

-- ── The reversing credit ────────────────────────────────────────────────────
-- 01-PRD.md §5.4 names three things that reverse in full — the consultant
-- declines, the consultant never turns up, a platform failure — and one that
-- does not: the seeker who simply did not attend. A policy of "no refunds"
-- implemented as "declines do not reverse" is a consultant tapping Decline and
-- keeping a stranger's money, which is not a policy.
--
-- One function for all three, because they are one movement with three
-- reasons. The trigger below calls it for the decline; an admin calls it by
-- hand for the other two. That is also why `no_show` does NOT reverse
-- automatically: the column cannot say whose no-show it was, and the seeker's
-- is the case that pays nothing back.
--
-- Nothing is ever edited. Both books get a NEW row (rule 2) and the original
-- debit is left exactly as it stands.

create or replace function public.booking_reverse(p_booking_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b public.bookings%rowtype;
  v_e public.earnings_ledger%rowtype;
begin
  select * into v_b from public.bookings where id = p_booking_id;
  if not found or v_b.order_id is null then
    -- A seeded booking carries no order because no money was ever taken for
    -- it. Nothing to reverse is not a failure.
    return jsonb_build_object('ok', true, 'reversed', false);
  end if;

  -- Idempotent on the refund row itself rather than on a flag column: one
  -- order, one reversal, and a second call is a no-op instead of a second
  -- credit.
  if exists (select 1 from public.ledger
              where ref_type = 'refund' and ref_id = v_b.order_id) then
    return jsonb_build_object('ok', true, 'reversed', false);
  end if;

  if not exists (select 1 from public.wallets where profile_id = v_b.seeker_id) then
    raise exception 'booking % has no seeker wallet to credit', p_booking_id;
  end if;

  insert into public.ledger (wallet_id, delta_paise, kind, ref_type, ref_id, note)
  values (v_b.seeker_id, v_b.amount_paise, 'Refund · session', 'refund',
          v_b.order_id, p_reason);

  -- The consultant's side reverses too, or a declined session still reads as
  -- earnings and phase 12 pays out for a reading nobody gave. Every sign flips
  -- together, so gross − fee = net still holds on the reversing row.
  select * into v_e from public.earnings_ledger
   where booking_id = p_booking_id and gross_paise > 0
   order by created_at limit 1;
  if found then
    insert into public.earnings_ledger (consultant_id, booking_id, gross_paise,
                                        fee_bps, fee_paise, net_paise, kind)
    values (v_e.consultant_id, p_booking_id, -v_e.gross_paise,
            v_e.fee_bps, -v_e.fee_paise, -v_e.net_paise, 'Reversed · ' || p_reason);
  end if;

  update public.orders set status = 'refunded' where id = v_b.order_id;

  return jsonb_build_object('ok', true, 'reversed', true, 'amount_paise', v_b.amount_paise);
end;
$$;

-- Admin only. The decline path reaches it through the trigger, never through a
-- client: a client-callable refund is a free session with extra steps.
revoke execute on function public.booking_reverse(uuid, text) from public, anon, authenticated;

-- The decline stays a plain UPDATE under the phase 4 policy, so the front end
-- does not change and does not have to be trusted to make a second call. A
-- trigger also covers every other way into `declined` — including an admin
-- typing it in the SQL editor — which an RPC would not.
create or replace function public.reverse_on_decline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'declined' and old.status is distinct from 'declined' then
    perform public.booking_reverse(new.id, 'declined');
  end if;
  return new;
end;
$$;

create trigger bookings_decline_reverses
  after update of status on public.bookings
  for each row execute function public.reverse_on_decline();

revoke execute on function public.reverse_on_decline() from public, anon, authenticated;
