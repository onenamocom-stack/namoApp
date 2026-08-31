-- Applied to Supabase via MCP. Forward-only — never edit once applied.
-- Phase 2 (docs/06-IMPLEMENTATION.md). Tables per docs/05-BACKEND-SCHEMA.md
-- §4.6, RLS per §7, indexes per §8.
--
-- `earnings_ledger` is NOT here. It references consultants and bookings,
-- neither of which exists until phases 4 and 5, and it ships inside the
-- booking transaction that writes it.

create table public.wallets (
  profile_id     uuid primary key references public.profiles(id) on delete cascade,
  balance_paise  integer not null default 0,
  -- The last line of defence. Every debit is checked in wallet_debit() under a
  -- row lock, but a wallet that can go negative is worth refusing at the
  -- storage layer too — this is the one invariant that must survive a mistake
  -- in any function written later.
  constraint wallets_never_negative check (balance_paise >= 0)
);

create table public.ledger (
  id           uuid primary key default gen_random_uuid(),
  wallet_id    uuid not null references public.wallets(profile_id) on delete cascade,
  delta_paise  integer not null,          -- signed: negative debits, positive credits
  kind         text not null,             -- what the user reads: 'Tarot · Bhaktamar'
  ref_type     text not null check (ref_type in ('order','payment','refund','adjustment')),
  ref_id       uuid,                      -- null until phase 5 gives a purchase an order row
  note         text,
  created_at   timestamptz not null default now(),
  constraint ledger_delta_nonzero check (delta_paise <> 0)
);

create index ledger_wallet_created_idx on public.ledger (wallet_id, created_at desc);

-- ── The ledger is history ────────────────────────────────────────────────────
-- Append-only by trigger, not by discipline. A mistake is corrected by writing
-- a reversing entry (docs/05-BACKEND-SCHEMA.md §1.2).

create or replace function public.refuse_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ledger rows are append-only; write a reversing entry instead';
end;
$$;

create trigger ledger_immutable
  before update or delete on public.ledger
  for each row execute function public.refuse_mutation();

-- ── The balance is a cache, and the cache follows the ledger ─────────────────
-- `wallets.balance_paise` is the one cached aggregate in the schema (§1.3). It
-- is maintained here rather than by each writer, which means it cannot drift:
-- there is no way to insert a ledger row and forget the balance, including
-- from a hand-typed INSERT in the SQL editor. Replaying the ledger from zero
-- reproduces the stored balance because the stored balance is that replay.

create or replace function public.apply_ledger_to_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.wallets
     set balance_paise = balance_paise + new.delta_paise
   where profile_id = new.wallet_id;
  return new;
end;
$$;

create trigger ledger_applies_to_balance
  after insert on public.ledger
  for each row execute function public.apply_ledger_to_balance();

-- ── RLS: read your own, write nothing ────────────────────────────────────────
-- No write policy for anybody, on either table (§7). A ledger with a client
-- INSERT policy is not a ledger. Only the security definer function below
-- writes, and it runs as the owner, bypassing these.

alter table public.wallets enable row level security;
alter table public.ledger  enable row level security;

create policy "wallets_select_own"
  on public.wallets for select
  using (profile_id = auth.uid());

create policy "ledger_select_own"
  on public.ledger for select
  using (wallet_id = auth.uid());

revoke insert, update, delete on public.wallets from authenticated, anon;
revoke insert, update, delete on public.ledger  from authenticated, anon;

revoke execute on function public.refuse_mutation() from public, anon, authenticated;
revoke execute on function public.apply_ledger_to_balance() from public, anon, authenticated;

-- ── Every account gets a wallet the moment it exists ─────────────────────────
-- Extends the phase 1 trigger rather than adding a second one, so a signup
-- stays one insert path. Same reasoning as profiles: the client never creates
-- the row it will later be scoped to.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, phone, name)
  values (new.id, new.phone, coalesce(new.raw_user_meta_data ->> 'name', 'there'));

  insert into public.wallets (profile_id) values (new.id);

  return new;
end;
$$;

-- Backfill: the accounts that signed up during phase 1 predate wallets.
insert into public.wallets (profile_id)
  select id from public.profiles
  on conflict (profile_id) do nothing;

-- ── The only way money moves in phase 2 ──────────────────────────────────────
-- Debit only. There is deliberately no client-callable credit: top-up is
-- phase 3 (Razorpay), and a credit RPC before then is a mint. To fund a test
-- wallet, insert the ledger row by hand and let the trigger move the balance:
--
--   insert into public.ledger (wallet_id, delta_paise, kind, ref_type, note)
--   values ('<profile uuid>', 124000, 'Added money', 'adjustment', 'phase 2 testing');
--
-- The amount comes from the client, and that is not a breach of rule 3 in
-- backend/INSTRUCTIONS.md: the rule bans a number the *user benefits from*,
-- and a debit is not one. It is shaped this way because the catalogue is still
-- in mock.js — there is no server-side price for a tarot card until phases 8
-- and 10, and phase 5 is the first purchase whose price the server looks up
-- for itself.

create or replace function public.wallet_debit(
  p_amount_paise integer,
  p_kind         text,
  p_ref_type     text default 'order'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_balance integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'Sign in to pay from your wallet.');
  end if;

  if p_amount_paise is null or p_amount_paise <= 0
     or coalesce(btrim(p_kind), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'That is not something we can charge for.');
  end if;

  -- The lock is the concurrency control. Two debits firing at once serialise
  -- here, so they cannot both read the same balance and both pass the check.
  select balance_paise into v_balance
    from public.wallets
   where profile_id = v_uid
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'No wallet on this account.');
  end if;

  if p_amount_paise > v_balance then
    -- The string the front end has always shown. The server's job is to make
    -- it true, not to invent a second vocabulary (backend/INSTRUCTIONS.md §2).
    return jsonb_build_object('ok', false, 'reason', 'Not enough balance',
                              'balance_paise', v_balance);
  end if;

  insert into public.ledger (wallet_id, delta_paise, kind, ref_type)
  values (v_uid, -p_amount_paise, p_kind, p_ref_type);

  return jsonb_build_object('ok', true, 'balance_paise', v_balance - p_amount_paise);
end;
$$;

revoke execute on function public.wallet_debit(integer, text, text) from public, anon;
grant  execute on function public.wallet_debit(integer, text, text) to authenticated;
