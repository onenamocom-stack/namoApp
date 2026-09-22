-- Forward-only — never edit once applied.
-- Phase 10, the shop half (docs/06-IMPLEMENTATION.md). Academy is not here.
--
-- Decided 14 Sep 2026:
--   · prices INCLUDE GST; each product carries its rate so a line can split it
--   · delivery is priced per pincode (Shiprocket), quoted by the `shop-quote`
--     Edge Function and stored HERE, so checkout takes a quote id, never an
--     amount (rule 3)
--   · pay from the wallet, or by Razorpay directly. No COD.
--
-- The design in one paragraph. There is ONE money path out of a wallet for an
-- order: `shop_order_settle`. Paying from the wallet calls it inside checkout.
-- Paying by Razorpay leaves the order `pending` with its stock reserved, and
-- the existing webhook credits the wallet and then calls the same settle in
-- the same transaction. So a card payment is a top-up that is spent the
-- instant it lands, and a payment that arrives too late for its order — the
-- reservation expired, the stock went to someone else — is simply money in
-- the wallet. It cannot be lost, and there is no second refund path to build.

-- ── Catalogue ───────────────────────────────────────────────────────────────

create table public.shop_categories (
  id    uuid primary key default gen_random_uuid(),
  name  text not null unique,
  sort  smallint not null default 0
);

create table public.shop_subcategories (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.shop_categories(id),
  name        text not null,
  sort        smallint not null default 0,
  unique (category_id, name)
);

create table public.products (
  id              uuid primary key default gen_random_uuid(),
  legacy_id       text unique,                -- seed idempotency, never shown
  category_id     uuid not null references public.shop_categories(id),
  subcategory_id  uuid references public.shop_subcategories(id),
  name            text not null,
  subtitle        text,
  image_url       text,
  price_paise     integer not null check (price_paise > 0),
  mrp_paise       integer check (mrp_paise is null or mrp_paise >= price_paise),
  tax_rate_bps    smallint not null default 0 check (tax_rate_bps between 0 and 2800),
  -- The oversell guard is this CHECK, not the code above it. Checkout locks and
  -- checks first so the refusal has a reason, but if that code is ever wrong
  -- the database still refuses to sell stock it does not have.
  stock           integer not null default 0 check (stock >= 0),
  weight_grams    integer not null check (weight_grams > 0),
  featured        boolean not null default false,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create index products_category_idx on public.products (category_id) where active;

-- ── Addresses, quotes, shipments ────────────────────────────────────────────

create table public.shipping_addresses (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null default auth.uid() references public.profiles(id),
  name        text not null check (char_length(name) between 1 and 80),
  phone       text not null check (phone ~ '^[6-9][0-9]{9}$'),
  line1       text not null check (char_length(line1) between 1 and 200),
  line2       text check (char_length(line2) <= 200),
  city        text not null check (char_length(city) between 1 and 80),
  state       text not null check (char_length(state) between 1 and 80),
  pincode     text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  created_at  timestamptz not null default now()
);

create index shipping_addresses_profile_idx on public.shipping_addresses (profile_id);

-- A delivery price, written by the `shop-quote` function (service role) for
-- one caller, one pincode and one cart weight. Checkout spends it once. The
-- weight is what ties it to a cart: a quote for one maala does not ship five.
create table public.shipping_quotes (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id),
  pincode       text not null,
  weight_grams  integer not null,
  amount_paise  integer not null check (amount_paise >= 0),
  courier       text,
  etd_days      smallint,
  expires_at    timestamptz not null,
  used_at       timestamptz,
  created_at    timestamptz not null default now()
);

-- One per order. The address is a COPY: editing a saved address must not
-- move a parcel already paid for. Shiprocket's ids are nullable columns so
-- connecting it later is a function, not a migration.
create table public.shipments (
  order_id           uuid primary key references public.orders(id),
  address            jsonb not null,
  pincode            text not null,
  weight_grams       integer not null,
  shipping_paise     integer not null,
  status             text not null default 'awaiting_payment'
                     check (status in ('awaiting_payment','ready','shipped',
                                       'delivered','returned','cancelled')),
  courier            text,
  awb                text,
  provider_order_id  text,
  shipped_at         timestamptz,
  delivered_at       timestamptz,
  updated_at         timestamptz not null default now()
);

-- ── What 012 needs to carry a shop order ────────────────────────────────────

-- A delivery charge is a line, so an invoice can show it and its tax.
alter table public.order_items drop constraint order_items_item_type_check;
alter table public.order_items add constraint order_items_item_type_check
  check (item_type in ('session','product','course','event','report',
                       'question_pack','shipping'));

-- Only a pending order has one: how long its stock is held for a payment.
alter table public.orders add column expires_at timestamptz;
create index orders_pending_expiry_idx on public.orders (expires_at) where status = 'pending';

-- A Razorpay payment opened FOR an order. Null for a plain top-up.
alter table public.payments add column order_id uuid references public.orders(id);

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.shop_categories    enable row level security;
alter table public.shop_subcategories enable row level security;
alter table public.products           enable row level security;
alter table public.shipping_addresses enable row level security;
alter table public.shipping_quotes    enable row level security;
alter table public.shipments          enable row level security;

create policy "shop_categories_read"    on public.shop_categories    for select using (true);
create policy "shop_subcategories_read" on public.shop_subcategories for select using (true);
create policy "products_read_active"    on public.products           for select using (active);

revoke insert, update, delete on public.shop_categories, public.shop_subcategories,
  public.products from anon, authenticated;

create policy "shipping_addresses_select_own" on public.shipping_addresses
  for select using (profile_id = auth.uid());
create policy "shipping_addresses_insert_own" on public.shipping_addresses
  for insert with check (profile_id = auth.uid());
create policy "shipping_addresses_update_own" on public.shipping_addresses
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "shipping_addresses_delete_own" on public.shipping_addresses
  for delete using (profile_id = auth.uid());
revoke all on public.shipping_addresses from anon;

-- Quotes: no policy for anybody. Written by the service role, read by checkout.
revoke all on public.shipping_quotes from anon, authenticated;

-- Qualified subquery, for the reason 012's order_items policy spells out.
create policy "shipments_select_own" on public.shipments
  for select using (exists (select 1 from public.orders o
                             where o.id = shipments.order_id
                               and o.profile_id = auth.uid()));
revoke insert, update, delete on public.shipments from anon, authenticated;

-- ── Settle: the one way an order takes money ────────────────────────────────
-- Raises WB001 on a short balance so whoever called it unwinds. Locks the
-- order, then the wallet — every caller takes them in that order.

create or replace function public.shop_order_settle(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o       public.orders%rowtype;
  v_balance integer;
  v_lines   integer;
  v_label   text;
begin
  select * into v_o from public.orders where id = p_order_id for update;
  if not found or v_o.status <> 'pending' then
    -- Already paid, or cancelled by the sweeper before the money landed. The
    -- second is not an error: the payment stays in the wallet.
    return jsonb_build_object('ok', true, 'settled', false, 'status', v_o.status);
  end if;

  select balance_paise into v_balance
    from public.wallets where profile_id = v_o.profile_id for update;
  if not found or v_balance < v_o.total_paise then
    raise exception using errcode = 'WB001', message = 'short balance';
  end if;

  select count(*), min(title) into v_lines, v_label
    from public.order_items where order_id = p_order_id and item_type = 'product';
  v_label := 'Shop · ' || case when v_lines = 1 then v_label else v_lines || ' items' end;

  insert into public.ledger (wallet_id, delta_paise, kind, ref_type, ref_id)
  values (v_o.profile_id, -v_o.total_paise, v_label, 'order', p_order_id);

  update public.orders    set status = 'paid', expires_at = null where id = p_order_id;
  update public.shipments set status = 'ready', updated_at = now() where order_id = p_order_id;

  return jsonb_build_object('ok', true, 'settled', true,
                            'balance_paise', v_balance - v_o.total_paise);
end;
$$;

revoke execute on function public.shop_order_settle(uuid) from public, anon, authenticated;

-- ── Release: put a pending order's stock back ───────────────────────────────

create or replace function public.shop_order_release(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from public.orders where id = p_order_id and status = 'pending' for update;
  if not found then
    return false;
  end if;

  -- Products locked in id order, the same order checkout takes them in.
  perform 1 from public.products
   where id in (select item_id from public.order_items
                 where order_id = p_order_id and item_type = 'product')
   order by id for update;

  update public.products p
     set stock = p.stock + i.qty
    from public.order_items i
   where i.order_id = p_order_id and i.item_type = 'product' and p.id = i.item_id;

  update public.orders    set status = 'cancelled', expires_at = null where id = p_order_id;
  update public.shipments set status = 'cancelled', updated_at = now() where order_id = p_order_id;
  return true;
end;
$$;

revoke execute on function public.shop_order_release(uuid) from public, anon, authenticated;

-- ── Checkout ────────────────────────────────────────────────────────────────
-- The client sends { product_id, qty }[], an address id, a quote id and how it
-- will pay. Every number is looked up on this side (rule 3). One transaction
-- (rule 5): a refusal leaves no order, no stock movement and an unspent quote.

create or replace function public.shop_checkout(
  p_items      jsonb,
  p_address_id uuid,
  p_quote_id   uuid,
  p_pay        text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- How long a card payment may take before the stock goes back on the shelf.
  c_hold    constant interval := interval '30 minutes';
  c_max_qty constant integer  := 10;
  v_uid     uuid := auth.uid();
  v_ids     uuid[];
  v_qtys    integer[];
  v_addr    public.shipping_addresses%rowtype;
  v_quote   public.shipping_quotes%rowtype;
  v_short   text;
  v_weight  integer;
  v_goods   integer;
  v_order   uuid;
  v_settle  jsonb;
  v_balance integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'Sign in to place an order.');
  end if;
  if p_pay is null or p_pay not in ('wallet', 'razorpay') then
    return jsonb_build_object('ok', false, 'reason', 'Choose how you want to pay.');
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'Your cart is empty.');
  end if;

  -- The same product twice in the list is one line with the quantities added.
  begin
    select array_agg(pid order by pid), array_agg(q order by pid) into v_ids, v_qtys
      from (select (e->>'product_id')::uuid as pid, sum((e->>'qty')::integer)::integer as q
              from jsonb_array_elements(p_items) e
             group by 1) s;
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'That cart could not be read. Refresh and try again.');
  end;

  if exists (select 1 from unnest(v_ids, v_qtys) c(pid, q)
              where pid is null or q is null or q < 1 or q > c_max_qty) then
    return jsonb_build_object('ok', false, 'reason', 'You can order up to 10 of each item.');
  end if;

  select * into v_addr from public.shipping_addresses
   where id = p_address_id and profile_id = v_uid;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'Pick a delivery address.');
  end if;

  begin
    -- Spend the quote. The UPDATE is the check, so two checkouts on one quote
    -- cannot both pass it.
    update public.shipping_quotes set used_at = now()
     where id = p_quote_id and profile_id = v_uid
       and used_at is null and expires_at > now()
    returning * into v_quote;
    if not found then
      raise exception using errcode = 'SH001',
        message = 'Your delivery price has expired. Check it again.';
    end if;
    if v_quote.pincode <> v_addr.pincode then
      raise exception using errcode = 'SH001',
        message = 'That delivery price was for another address. Check it again.';
    end if;

    -- Lock every product in the cart, in id order, then decide.
    perform 1 from public.products where id = any(v_ids) order by id for update;

    select string_agg(coalesce(p.name, 'An item'), ', ') into v_short
      from unnest(v_ids, v_qtys) c(pid, q)
      left join public.products p on p.id = c.pid
     where p.id is null or not p.active or p.stock < c.q;
    if v_short is not null then
      raise exception using errcode = 'SH001',
        message = 'Not enough stock: ' || v_short || '. Change your cart.';
    end if;

    select sum(p.weight_grams * c.q), sum(p.price_paise * c.q)
      into v_weight, v_goods
      from unnest(v_ids, v_qtys) c(pid, q)
      join public.products p on p.id = c.pid;

    if v_weight <> v_quote.weight_grams then
      raise exception using errcode = 'SH001',
        message = 'Your cart changed. Check the delivery price again.';
    end if;

    insert into public.orders (profile_id, status, total_paise, expires_at)
    values (v_uid, 'pending', v_goods + v_quote.amount_paise, now() + c_hold)
    returning id into v_order;

    -- Title and price are frozen copies: done-condition 3.
    insert into public.order_items (order_id, item_type, item_id, title, qty,
                                    unit_price_paise, tax_rate_bps)
    select v_order, 'product', p.id, p.name, c.q, p.price_paise, p.tax_rate_bps
      from unnest(v_ids, v_qtys) c(pid, q)
      join public.products p on p.id = c.pid;

    if v_quote.amount_paise > 0 then
      -- ponytail: tax 0 on delivery. GST on shipping follows the goods; set it
      -- when a CA says which rate, and invoices will read it from here.
      insert into public.order_items (order_id, item_type, item_id, title, qty, unit_price_paise)
      values (v_order, 'shipping', v_quote.id,
              'Delivery' || coalesce(' · ' || v_quote.courier, ''), 1, v_quote.amount_paise);
    end if;

    -- Reserve. Held until paid, or put back by the sweeper.
    update public.products p
       set stock = p.stock - c.q
      from unnest(v_ids, v_qtys) c(pid, q)
     where p.id = c.pid;

    insert into public.shipments (order_id, address, pincode, weight_grams, shipping_paise, courier)
    values (v_order,
            to_jsonb(v_addr) - 'id' - 'profile_id' - 'created_at',
            v_addr.pincode, v_weight, v_quote.amount_paise, v_quote.courier);

    if p_pay = 'wallet' then
      v_settle := public.shop_order_settle(v_order);   -- WB001 unwinds everything
    end if;

  exception
    when sqlstate 'SH001' then
      return jsonb_build_object('ok', false, 'reason', sqlerrm);
    when sqlstate 'WB001' then
      select balance_paise into v_balance from public.wallets where profile_id = v_uid;
      return jsonb_build_object('ok', false, 'reason', 'Not enough balance',
                                'balance_paise', v_balance);
  end;

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order,
    'status', case when p_pay = 'wallet' then 'paid' else 'pending' end,
    'total_paise', v_goods + v_quote.amount_paise,
    'balance_paise', v_settle->'balance_paise');
end;
$$;

revoke execute on function public.shop_checkout(jsonb, uuid, uuid, text) from public, anon;
grant  execute on function public.shop_checkout(jsonb, uuid, uuid, text) to authenticated;

-- ── The seeker abandons a card payment ──────────────────────────────────────
-- Their own pending order only. If Razorpay captures anyway (a UPI collect
-- that completes late), the webhook finds it cancelled and the money stays in
-- the wallet.

create or replace function public.shop_order_cancel(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.orders
                  where id = p_order_id and profile_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'reason', 'That order is not yours.');
  end if;
  return jsonb_build_object('ok', true, 'cancelled', public.shop_order_release(p_order_id));
end;
$$;

revoke execute on function public.shop_order_cancel(uuid) from public, anon;
grant  execute on function public.shop_order_cancel(uuid) to authenticated;

-- ── The sweeper ─────────────────────────────────────────────────────────────
-- Without it, an abandoned card checkout holds stock forever and the product
-- reads sold out to everyone. `skip locked` so a settle in flight wins.

create or replace function public.shop_order_expire()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_n  integer := 0;
begin
  for v_id in
    select id from public.orders
     where status = 'pending' and expires_at < now()
     for update skip locked
  loop
    if public.shop_order_release(v_id) then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.shop_order_expire() from public, anon, authenticated;

select cron.schedule('shop-order-expire', '* * * * *', 'select public.shop_order_expire()');

-- ── Refund a paid order (admin, by hand) ────────────────────────────────────
-- To the wallet, as a new ledger row. `ledger_one_refund_per_order` (013)
-- makes a second call a no-op. `p_restock` because a parcel that came back
-- damaged is not stock.

create or replace function public.shop_order_refund(p_order_id uuid, p_reason text, p_restock boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o public.orders%rowtype;
begin
  select * into v_o from public.orders where id = p_order_id for update;
  if not found or v_o.status <> 'paid'
     or not exists (select 1 from public.shipments where order_id = p_order_id) then
    return jsonb_build_object('ok', false, 'reason', 'Only a paid shop order can be refunded.');
  end if;

  insert into public.ledger (wallet_id, delta_paise, kind, ref_type, ref_id, note)
  values (v_o.profile_id, v_o.total_paise, 'Refund · shop order', 'refund', p_order_id, p_reason);

  if p_restock then
    perform 1 from public.products
     where id in (select item_id from public.order_items
                   where order_id = p_order_id and item_type = 'product')
     order by id for update;
    update public.products p
       set stock = p.stock + i.qty
      from public.order_items i
     where i.order_id = p_order_id and i.item_type = 'product' and p.id = i.item_id;
  end if;

  update public.orders set status = 'refunded' where id = p_order_id;
  update public.shipments
     set status = case when status in ('shipped','delivered') then 'returned' else 'cancelled' end,
         updated_at = now()
   where order_id = p_order_id;

  return jsonb_build_object('ok', true, 'refunded', true, 'amount_paise', v_o.total_paise);
exception when unique_violation then
  return jsonb_build_object('ok', true, 'refunded', false);
end;
$$;

revoke execute on function public.shop_order_refund(uuid, text, boolean) from public, anon, authenticated;
grant  execute on function public.shop_order_refund(uuid, text, boolean) to service_role;

-- ── payment_capture, now also paying for an order ───────────────────────────
-- 006's function unchanged down to the credit. After it: if the payment was
-- opened for an order, settle that order in the same transaction. A short
-- balance or an order the sweeper already cancelled leaves the money in the
-- wallet, which is the safe half. Any other error rolls the credit back too,
-- the webhook returns 500 and Razorpay retries the whole thing.

create or replace function public.payment_capture(
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
  v_shop    uuid;
  v_settle  jsonb;
begin
  if p_status not in ('captured', 'failed') then
    raise exception 'payment_capture handles captured and failed, not %', p_status;
  end if;

  if p_amount_paise is null or p_amount_paise <= 0 then
    raise exception 'payment % has no positive amount', p_payment_id;
  end if;

  select profile_id, order_id into v_profile, v_shop
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
    amount_paise, status, raw, order_id
  )
  values (
    v_profile, p_order_id, p_payment_id, p_event_id,
    p_amount_paise, p_status, p_raw, v_shop
  );

  if p_status = 'captured' then
    insert into public.ledger (wallet_id, delta_paise, kind, ref_type)
    values (v_profile, p_amount_paise, 'Added money', 'payment');

    if v_shop is not null then
      begin
        v_settle := public.shop_order_settle(v_shop);
      exception when sqlstate 'WB001' then
        v_settle := jsonb_build_object('ok', true, 'settled', false, 'status', 'short');
      end;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'duplicate', false, 'profile_id', v_profile,
                            'shop_order', v_shop, 'settle', v_settle);

exception when unique_violation then
  return jsonb_build_object('ok', true, 'duplicate', true);
end;
$$;

revoke execute on function public.payment_capture(text, text, text, integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.payment_capture(text, text, text, integer, text, jsonb)
  to service_role;
