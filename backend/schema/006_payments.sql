-- Applied to Supabase via MCP. Forward-only — never edit once applied.
-- Phase 3 (docs/06-IMPLEMENTATION.md). Table per docs/05-BACKEND-SCHEMA.md
-- §4.8, RLS per §7.
--
-- This is the credit path. Phase 2 shipped a wallet money could only leave,
-- because a client-callable credit before a payment provider is a mint. The
-- mint is still not open: nothing here is granted to `authenticated`. Only the
-- Razorpay webhook function, running as `service_role` after verifying the
-- provider's signature, can put a rupee into a wallet.

create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid not null references public.profiles(id),
  provider            text not null default 'razorpay',
  provider_order_id   text,
  -- THE idempotency guarantee. Not an application-level "have I seen this?"
  -- check, which races with its own write (backend/INSTRUCTIONS.md rule 6).
  provider_payment_id text unique,
  provider_event_id   text unique,
  amount_paise        integer not null,
  status              text not null check (status in ('created','captured','failed','refunded')),
  raw                 jsonb,
  created_at          timestamptz not null default now()
);

-- A row per event, not a row per payment, which is why both unique columns are
-- nullable: the 'created' row written when checkout opens has neither id yet,
-- and Postgres lets nulls repeat in a unique index. The row that carries a
-- provider_payment_id is a terminal outcome — captured or failed — and there
-- can only ever be one of those per Razorpay payment.

create index payments_profile_created_idx on public.payments (profile_id, created_at desc);
create index payments_order_idx           on public.payments (provider_order_id);

-- ── RLS: read your own, write nothing ────────────────────────────────────────
-- Same shape as wallets and ledger (§7). `service_role` bypasses RLS, which is
-- why the webhook can write and nothing else can.

alter table public.payments enable row level security;

create policy "payments_select_own"
  on public.payments for select
  using (profile_id = auth.uid());

revoke insert, update, delete on public.payments from authenticated, anon;

-- ── The credit, and the whole reason this phase exists ───────────────────────
-- One transaction: the event row and the ledger row, or neither.
--
-- Idempotency falls out of that rather than being arranged. A retried delivery
-- carries the same provider_payment_id, the insert below violates the unique
-- index, and the handler rolls the block back — including the ledger insert
-- that had already run inside it. There is no window between checking and
-- crediting because there is no check.
--
-- The amount credited is the amount RAZORPAY reports, taken from a payload
-- whose signature was verified before this function was called. It is never
-- the number the browser asked for. That is rule 3 (backend/INSTRUCTIONS.md):
-- the client may choose what to *pay*, and the server decides what to credit.
--
-- The wallet is found through the 'created' row rather than through the
-- payload's `notes`, because `notes` round-trips through the client. If no
-- 'created' row matches, this raises rather than guessing: a payment we cannot
-- attribute is a payment nobody gets credited for, and that is the safe half
-- of the mistake.

create function public.payment_capture(
  p_event_id     text,
  p_order_id     text,
  p_payment_id   text,
  p_amount_paise integer,
  p_status       text,
  p_raw          jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid;
begin
  if p_status not in ('captured', 'failed') then
    raise exception 'payment_capture handles captured and failed, not %', p_status;
  end if;

  if p_amount_paise is null or p_amount_paise <= 0 then
    raise exception 'payment % has no positive amount', p_payment_id;
  end if;

  select profile_id into v_profile
    from public.payments
   where provider_order_id = p_order_id
     and status = 'created'
   order by created_at desc
   limit 1;

  if v_profile is null then
    raise exception 'no order % on this system', p_order_id;
  end if;

  insert into public.payments (
    profile_id, provider_order_id, provider_payment_id, provider_event_id,
    amount_paise, status, raw
  )
  values (
    v_profile, p_order_id, p_payment_id, p_event_id,
    p_amount_paise, p_status, p_raw
  );

  if p_status = 'captured' then
    -- The balance is not touched here. The after-insert trigger on `ledger`
    -- moves it, so the credit and the cache cannot disagree (003).
    insert into public.ledger (wallet_id, delta_paise, kind, ref_type)
    values (v_profile, p_amount_paise, 'Added money', 'payment');
  end if;

  return jsonb_build_object('ok', true, 'duplicate', false, 'profile_id', v_profile);

exception when unique_violation then
  -- Razorpay retries until it gets a 2xx, so this is the ordinary case, not an
  -- error. Everything above rolls back with the block; the caller returns 200
  -- and the retries stop.
  return jsonb_build_object('ok', true, 'duplicate', true);
end;
$$;

revoke execute on function public.payment_capture(text, text, text, integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.payment_capture(text, text, text, integer, text, jsonb)
  to service_role;
