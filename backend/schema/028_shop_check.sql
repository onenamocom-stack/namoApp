-- The one runnable check for phase 10's shop (backend/INSTRUCTIONS.md §2).
-- Not a migration. Every row it writes is rolled back by the exception on the
-- last line, which is also how it reports success.
--
--   Passing looks like:  ERROR:  PHASE 10 SHOP CHECKS PASSED
--   Failing looks like:  ERROR:  <the assertion that broke>
--
-- Needs two profiles. Counts are relative, so it runs against a database with
-- real orders in it.
--
-- WHAT THIS FILE CANNOT DO: two buyers racing the last unit is two
-- CONNECTIONS. Assertion 3 covers the loser who arrives after the winner
-- committed. The contended path — both lock-waiting on the product row — is
-- two sessions fired together, each with its own quote:
--
--   begin;
--   select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);
--   set local role authenticated;
--   select pg_sleep(2);
--   select public.shop_checkout('[{"product_id":"<p>","qty":1}]', '<addr>', '<quote>', 'wallet');
--   commit;
--
-- With stock 1: one ok:true, one 'Not enough stock', and the loser writes nothing.

do $check$
declare
  v_a       uuid;   -- the buyer
  v_b       uuid;   -- a stranger
  v_cat     uuid;
  v_p       uuid;   -- stock 2, ₹1,000, 100 g
  v_dear    uuid;   -- stock 5, ₹90,00,000
  v_addr    uuid;
  v_q       uuid;
  v_res     jsonb;
  v_order   uuid;
  v_pend    uuid;
  v_n       integer;
  v_n0      integer;
  v_bal0    integer;
  v_bal     integer;
  v_sum     integer;
  v_status  text;
begin
  select id into v_a from public.profiles order by created_at limit 1;
  select id into v_b from public.profiles where id <> v_a order by created_at limit 1;
  if v_a is null or v_b is null then
    raise exception 'needs two profiles';
  end if;

  insert into public.wallets (profile_id) values (v_a), (v_b) on conflict do nothing;
  insert into public.ledger (wallet_id, delta_paise, kind, ref_type)
  values (v_a, 500000, 'check funding', 'adjustment');           -- ₹5,000

  insert into public.shop_categories (name) values ('check:cat') returning id into v_cat;
  insert into public.products (category_id, name, price_paise, stock, weight_grams)
  values (v_cat, 'Check Maala', 100000, 2, 100) returning id into v_p;
  insert into public.products (category_id, name, price_paise, stock, weight_grams)
  values (v_cat, 'Check Emerald', 900000000, 5, 50) returning id into v_dear;

  ---------------------------------------------------------------------------
  -- 0. A seeker writes their own address, and not a stranger's.
  ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.shipping_addresses (name, phone, line1, city, state, pincode)
  values ('Check', '9876543210', '1 Road', 'Pune', 'MH', '411001') returning id into v_addr;
  begin
    insert into public.shipping_addresses (profile_id, name, phone, line1, city, state, pincode)
    values (v_b, 'Forged', '9876543210', '1 Road', 'Pune', 'MH', '411001');
    raise exception '0. a seeker wrote an address onto another account';
  exception when insufficient_privilege then null;
  end;
  reset role;

  ---------------------------------------------------------------------------
  -- 1. Wallet checkout: stock reserved, money moved once, lines frozen.
  --    A price in the request body is ignored (rule 3).
  ---------------------------------------------------------------------------
  insert into public.shipping_quotes (profile_id, pincode, weight_grams, amount_paise, courier, expires_at)
  values (v_a, '411001', 200, 8000, 'Check Courier', now() + interval '10 minutes') returning id into v_q;
  select balance_paise into v_bal0 from public.wallets where profile_id = v_a;

  set local role authenticated;
  v_res := public.shop_checkout(
    jsonb_build_array(jsonb_build_object('product_id', v_p, 'qty', 1, 'price_paise', 1),
                      jsonb_build_object('product_id', v_p, 'qty', 1)),
    v_addr, v_q, 'wallet');
  reset role;

  if not (v_res->>'ok')::boolean or v_res->>'status' <> 'paid' then
    raise exception '1. wallet checkout refused: %', v_res;
  end if;
  v_order := (v_res->>'order_id')::uuid;
  if (v_res->>'total_paise')::integer <> 208000 then
    raise exception '1. total is % — expected 2 × ₹1,000 + ₹80 delivery', v_res->>'total_paise';
  end if;
  if (select stock from public.products where id = v_p) <> 0 then
    raise exception '1. stock did not move to 0';
  end if;
  select balance_paise into v_bal from public.wallets where profile_id = v_a;
  if v_bal0 - v_bal <> 208000 then
    raise exception '1. wallet moved by %, expected 208000', v_bal0 - v_bal;
  end if;
  select count(*) into v_n from public.order_items where order_id = v_order;
  if v_n <> 2 then
    raise exception '1. expected one product line and one delivery line, got %', v_n;
  end if;
  if (select qty from public.order_items where order_id = v_order and item_type = 'product') <> 2 then
    raise exception '1. the duplicate cart entry was not merged into one line of 2';
  end if;
  if (select status from public.shipments where order_id = v_order) <> 'ready' then
    raise exception '1. a paid order''s shipment is not ready';
  end if;

  ---------------------------------------------------------------------------
  -- 2. A quote spends once.
  ---------------------------------------------------------------------------
  update public.products set stock = 1 where id = v_p;
  set local role authenticated;
  v_res := public.shop_checkout(jsonb_build_array(jsonb_build_object('product_id', v_p, 'qty', 1)),
                                v_addr, v_q, 'wallet');
  reset role;
  if (v_res->>'ok')::boolean or v_res->>'reason' not like 'Your delivery price has expired%' then
    raise exception '2. a spent quote was accepted: %', v_res;
  end if;

  ---------------------------------------------------------------------------
  -- 3. Sold out is refused, writes nothing, and leaves the quote unspent.
  ---------------------------------------------------------------------------
  update public.products set stock = 0 where id = v_p;
  insert into public.shipping_quotes (profile_id, pincode, weight_grams, amount_paise, expires_at)
  values (v_a, '411001', 100, 8000, now() + interval '10 minutes') returning id into v_q;
  select count(*) into v_n0 from public.orders where profile_id = v_a;

  set local role authenticated;
  v_res := public.shop_checkout(jsonb_build_array(jsonb_build_object('product_id', v_p, 'qty', 1)),
                                v_addr, v_q, 'wallet');
  reset role;
  if (v_res->>'ok')::boolean or v_res->>'reason' not like 'Not enough stock%' then
    raise exception '3. a sold-out product was sold: %', v_res;
  end if;
  select count(*) into v_n from public.orders where profile_id = v_a;
  if v_n <> v_n0 then
    raise exception '3. a refused checkout wrote % orders', v_n - v_n0;
  end if;
  if (select used_at from public.shipping_quotes where id = v_q) is not null then
    raise exception '3. a refused checkout spent its quote';
  end if;

  ---------------------------------------------------------------------------
  -- 4. Done-condition 3: a catalogue price change does not move an old line.
  ---------------------------------------------------------------------------
  update public.products set price_paise = 150000, name = 'Renamed' where id = v_p;
  if (select unit_price_paise from public.order_items where order_id = v_order and item_type = 'product') <> 100000
     or (select title from public.order_items where order_id = v_order and item_type = 'product') <> 'Check Maala' then
    raise exception '4. an old order line followed the catalogue';
  end if;

  ---------------------------------------------------------------------------
  -- 5. A cart that does not match its quote's weight is refused.
  ---------------------------------------------------------------------------
  update public.products set stock = 5 where id = v_p;
  set local role authenticated;
  v_res := public.shop_checkout(jsonb_build_array(jsonb_build_object('product_id', v_p, 'qty', 3)),
                                v_addr, v_q, 'wallet');
  reset role;
  if (v_res->>'ok')::boolean or v_res->>'reason' not like 'Your cart changed%' then
    raise exception '5. a quote for 100 g shipped 300 g: %', v_res;
  end if;

  ---------------------------------------------------------------------------
  -- 6. Short balance: refused, stock untouched.
  ---------------------------------------------------------------------------
  insert into public.shipping_quotes (profile_id, pincode, weight_grams, amount_paise, expires_at)
  values (v_a, '411001', 50, 0, now() + interval '10 minutes') returning id into v_q;
  set local role authenticated;
  v_res := public.shop_checkout(jsonb_build_array(jsonb_build_object('product_id', v_dear, 'qty', 1)),
                                v_addr, v_q, 'wallet');
  reset role;
  if (v_res->>'ok')::boolean or v_res->>'reason' <> 'Not enough balance' then
    raise exception '6. an unaffordable order was not refused for balance: %', v_res;
  end if;
  if (select stock from public.products where id = v_dear) <> 5 then
    raise exception '6. a refused order moved stock';
  end if;

  ---------------------------------------------------------------------------
  -- 7. Razorpay: pending holds stock and takes no money; the webhook pays it
  --    in one transaction; a retried delivery does nothing.
  ---------------------------------------------------------------------------
  insert into public.shipping_quotes (profile_id, pincode, weight_grams, amount_paise, expires_at)
  values (v_a, '411001', 100, 8000, now() + interval '10 minutes') returning id into v_q;
  select balance_paise into v_bal0 from public.wallets where profile_id = v_a;
  set local role authenticated;
  v_res := public.shop_checkout(jsonb_build_array(jsonb_build_object('product_id', v_p, 'qty', 1)),
                                v_addr, v_q, 'razorpay');
  reset role;
  if not (v_res->>'ok')::boolean or v_res->>'status' <> 'pending' then
    raise exception '7. razorpay checkout did not leave a pending order: %', v_res;
  end if;
  v_pend := (v_res->>'order_id')::uuid;
  if (select stock from public.products where id = v_p) <> 4 then
    raise exception '7. a pending order did not reserve stock';
  end if;
  if (select balance_paise from public.wallets where profile_id = v_a) <> v_bal0 then
    raise exception '7. a pending order took money before payment';
  end if;

  insert into public.payments (profile_id, provider_order_id, amount_paise, status, order_id)
  values (v_a, 'order_check_7', 158000, 'created', v_pend);
  v_res := public.payment_capture('evt_check_7', 'order_check_7', 'pay_check_7', 158000, 'captured', '{}');
  if not (v_res->'settle'->>'settled')::boolean then
    raise exception '7. a captured payment did not settle its order: %', v_res;
  end if;
  if (select status from public.orders where id = v_pend) <> 'paid'
     or (select balance_paise from public.wallets where profile_id = v_a) <> v_bal0 then
    raise exception '7. after capture the order is not paid, or the wallet is not net zero';
  end if;
  select count(*) into v_n0 from public.ledger where wallet_id = v_a;
  v_res := public.payment_capture('evt_check_7b', 'order_check_7', 'pay_check_7', 158000, 'captured', '{}');
  select count(*) into v_n from public.ledger where wallet_id = v_a;
  if not (v_res->>'duplicate')::boolean or v_n <> v_n0 then
    raise exception '7. a retried webhook wrote % ledger rows', v_n - v_n0;
  end if;

  ---------------------------------------------------------------------------
  -- 8. The sweeper puts expired stock back; a late payment stays in the wallet.
  ---------------------------------------------------------------------------
  insert into public.shipping_quotes (profile_id, pincode, weight_grams, amount_paise, expires_at)
  values (v_a, '411001', 100, 8000, now() + interval '10 minutes') returning id into v_q;
  set local role authenticated;
  v_res := public.shop_checkout(jsonb_build_array(jsonb_build_object('product_id', v_p, 'qty', 1)),
                                v_addr, v_q, 'razorpay');
  reset role;
  v_pend := (v_res->>'order_id')::uuid;
  update public.orders set expires_at = now() - interval '1 second' where id = v_pend;
  perform public.shop_order_expire();
  if (select status from public.orders where id = v_pend) <> 'cancelled'
     or (select stock from public.products where id = v_p) <> 4
     or (select status from public.shipments where order_id = v_pend) <> 'cancelled' then
    raise exception '8. the sweeper did not cancel and restock an expired order';
  end if;

  select balance_paise into v_bal0 from public.wallets where profile_id = v_a;
  insert into public.payments (profile_id, provider_order_id, amount_paise, status, order_id)
  values (v_a, 'order_check_8', 108000, 'created', v_pend);
  perform public.payment_capture('evt_check_8', 'order_check_8', 'pay_check_8', 108000, 'captured', '{}');
  if (select balance_paise from public.wallets where profile_id = v_a) <> v_bal0 + 108000
     or (select status from public.orders where id = v_pend) <> 'cancelled' then
    raise exception '8. a late payment was not left in the wallet';
  end if;

  ---------------------------------------------------------------------------
  -- 9. Cancel: the owner releases a pending order; a stranger cannot.
  ---------------------------------------------------------------------------
  insert into public.shipping_quotes (profile_id, pincode, weight_grams, amount_paise, expires_at)
  values (v_a, '411001', 100, 8000, now() + interval '10 minutes') returning id into v_q;
  set local role authenticated;
  v_res := public.shop_checkout(jsonb_build_array(jsonb_build_object('product_id', v_p, 'qty', 1)),
                                v_addr, v_q, 'razorpay');
  v_pend := (v_res->>'order_id')::uuid;

  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  v_res := public.shop_order_cancel(v_pend);
  if (v_res->>'ok')::boolean then
    raise exception '9. a stranger cancelled someone else''s order';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  v_res := public.shop_order_cancel(v_pend);
  reset role;
  if (select status from public.orders where id = v_pend) <> 'cancelled'
     or (select stock from public.products where id = v_p) <> 4 then
    raise exception '9. the owner''s cancel did not release the order';
  end if;

  ---------------------------------------------------------------------------
  -- 10. Reads: a stranger sees none of it; nobody signed in writes the catalogue;
  --     an inactive product is invisible.
  ---------------------------------------------------------------------------
  update public.products set active = false where id = v_dear;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from public.shipping_addresses where id = v_addr;
  if v_n <> 0 then raise exception '10. a stranger read an address'; end if;
  select count(*) into v_n from public.shipments where order_id = v_order;
  if v_n <> 0 then raise exception '10. a stranger read a shipment'; end if;
  begin
    select count(*) into v_n from public.shipping_quotes;
    raise exception '10. quotes are readable by a client';
  exception when insufficient_privilege then null;   -- no grant at all, which is the pass
  end;
  select count(*) into v_n from public.products where id = v_dear;
  if v_n <> 0 then raise exception '10. an inactive product is visible'; end if;
  begin
    update public.products set stock = 999 where id = v_p;
    raise exception '10. a signed-in client changed stock';
  exception when insufficient_privilege then null;
  end;
  reset role;

  ---------------------------------------------------------------------------
  -- 11. Refund: once, to the wallet, with restock.
  ---------------------------------------------------------------------------
  select balance_paise into v_bal0 from public.wallets where profile_id = v_a;
  v_res := public.shop_order_refund(v_order, 'check', true);
  if not (v_res->>'refunded')::boolean
     or (select balance_paise from public.wallets where profile_id = v_a) <> v_bal0 + 208000
     or (select stock from public.products where id = v_p) <> 6 then
    raise exception '11. refund did not credit and restock: %', v_res;
  end if;
  v_res := public.shop_order_refund(v_order, 'check again', true);
  if (select balance_paise from public.wallets where profile_id = v_a) <> v_bal0 + 208000 then
    raise exception '11. a second refund credited again';
  end if;

  ---------------------------------------------------------------------------
  -- 12. The ledger still replays to the balance.
  ---------------------------------------------------------------------------
  select coalesce(sum(delta_paise), 0) into v_sum from public.ledger where wallet_id = v_a;
  if v_sum <> (select balance_paise from public.wallets where profile_id = v_a) then
    raise exception '12. ledger sums to % but the balance reads %', v_sum,
      (select balance_paise from public.wallets where profile_id = v_a);
  end if;

  raise exception 'PHASE 10 SHOP CHECKS PASSED';
end
$check$;
