-- Forward-only — never edit once applied.
-- Phase 13's first slice, pulled forward by phase 10: shop orders in an admin
-- console. docs/02-TRD.md §7 is the design and this file does not bend it:
--
--   · no admin role in client RLS — both tables below have RLS on and NO
--     policies, and every function is granted to service_role only
--   · the elevated path is the `admin` Edge Function, which holds the service
--     role and checks `admin_users` before calling anything here
--   · tiers are enforced in that function, not in Postgres
--   · every action writes an audit row, in the SAME transaction as the action
--     — so there is no action without its row and no row without its action
--
-- It also removes 029's Telegram alert (decided 15 Sep: orders are watched in
-- the admin console instead). The trigger never fired anywhere — no project
-- had its Vault secrets.

drop trigger if exists shipments_notify_paid on public.shipments;
drop function if exists public.shop_notify_paid();

-- ── Who is an admin ─────────────────────────────────────────────────────────
-- A signed-in profile (same phone OTP as the app) plus a row here. The TRD's
-- four tiers, and `fulfilment`: shipping a parcel is not a refund, and the
-- person packing orders should not hold the power to pay money back.
--
--   support     reads everything in the console, changes nothing
--   fulfilment  + marks orders shipped and delivered
--   finance     + refunds
--   superadmin  everything, and manages admins (by SQL until that screen exists)
--
-- Add one, in the SQL editor of the project in question:
--   insert into public.admin_users (profile_id, tier, added_by_note)
--   select id, 'superadmin', 'founder' from public.profiles where phone = '91XXXXXXXXXX';

create table public.admin_users (
  profile_id    uuid primary key references public.profiles(id),
  tier          text not null check (tier in ('support','fulfilment','finance','superadmin')),
  active        boolean not null default true,
  added_by_note text,
  created_at    timestamptz not null default now()
);

-- Append-only, like both ledgers: an audit trail you can edit is not one.
create table public.admin_actions (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid not null references public.admin_users(profile_id),
  action      text not null,
  target_type text not null,
  target_id   uuid,
  detail      jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index admin_actions_target_idx on public.admin_actions (target_type, target_id, created_at desc);

create trigger admin_actions_immutable
  before update or delete on public.admin_actions
  for each row execute function public.refuse_mutation();

alter table public.admin_users   enable row level security;
alter table public.admin_actions enable row level security;
revoke all on public.admin_users, public.admin_actions from anon, authenticated;

-- ── Ship, deliver ───────────────────────────────────────────────────────────
-- Forward only: ready → shipped → delivered. Anything else is a refund, which
-- has its own function and its own tier. The tier check lives in the Edge
-- Function; `p_admin` is the verified caller it passes in.

create or replace function public.admin_shipment_update(
  p_admin    uuid,
  p_order_id uuid,
  p_status   text,
  p_courier  text,
  p_awb      text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.shipments%rowtype;
begin
  select * into v_s from public.shipments where order_id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'No such shop order.');
  end if;

  if p_status = 'shipped' then
    if v_s.status <> 'ready' then
      return jsonb_build_object('ok', false, 'reason', 'Only a paid order waiting to ship can be marked shipped.');
    end if;
    if coalesce(trim(p_awb), '') = '' then
      return jsonb_build_object('ok', false, 'reason', 'Enter the tracking number.');
    end if;
    update public.shipments
       set status = 'shipped', courier = nullif(trim(p_courier), ''), awb = trim(p_awb),
           shipped_at = now(), updated_at = now()
     where order_id = p_order_id;
  elsif p_status = 'delivered' then
    if v_s.status <> 'shipped' then
      return jsonb_build_object('ok', false, 'reason', 'Only a shipped order can be marked delivered.');
    end if;
    update public.shipments
       set status = 'delivered', delivered_at = now(), updated_at = now()
     where order_id = p_order_id;
  else
    return jsonb_build_object('ok', false, 'reason', 'Status must be shipped or delivered.');
  end if;

  insert into public.admin_actions (admin_id, action, target_type, target_id, detail)
  values (p_admin, 'shop.' || p_status, 'order', p_order_id,
          jsonb_build_object('from', v_s.status, 'courier', p_courier, 'awb', p_awb));

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.admin_shipment_update(uuid, uuid, text, text, text) from public, anon, authenticated;
grant  execute on function public.admin_shipment_update(uuid, uuid, text, text, text) to service_role;

-- ── Refund ──────────────────────────────────────────────────────────────────
-- 028's refund plus its audit row, in one transaction. A refund that was
-- already done writes no second audit row either.

create or replace function public.admin_order_refund(
  p_admin    uuid,
  p_order_id uuid,
  p_reason   text,
  p_restock  boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res jsonb;
begin
  if coalesce(trim(p_reason), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'Say why — the buyer may ask.');
  end if;

  v_res := public.shop_order_refund(p_order_id, trim(p_reason), coalesce(p_restock, false));

  if (v_res->>'refunded')::boolean then
    insert into public.admin_actions (admin_id, action, target_type, target_id, detail)
    values (p_admin, 'shop.refund', 'order', p_order_id,
            jsonb_build_object('reason', trim(p_reason), 'restock', p_restock,
                               'amount_paise', v_res->'amount_paise'));
  end if;
  return v_res;
end;
$$;

revoke execute on function public.admin_order_refund(uuid, uuid, text, boolean) from public, anon, authenticated;
grant  execute on function public.admin_order_refund(uuid, uuid, text, boolean) to service_role;
