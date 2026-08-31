-- A TEST, NOT A MIGRATION. Never include this in a schema replay.
-- The phase 2 equivalent is 003_wallets_ledger_check.sql and this follows it.
--
-- Paste into the SQL editor of whichever project you want to check. Passing
-- looks like a failure:
--
--   ERROR:  PHASE 3 CHECKS PASSED
--
-- It raises on its last line on purpose. `ledger` is append-only, so a check
-- that inserted real credits could not clean up after itself — the raise rolls
-- the whole block back instead. Any other error names the assertion that broke.
--
-- Needs at least one profile with a wallet. It measures relative to whatever
-- that wallet already holds, so it can be run repeatedly.
--
-- Covers the three done-conditions from docs/06-IMPLEMENTATION.md that do not
-- need Razorpay itself: a capture credits once, the identical payment replayed
-- credits nothing, and a failure leaves a payments row and no ledger row. The
-- fourth — a real ₹1 payment — is a person with a card, and cannot be asserted
-- here.

do $$
declare
  v_profile   uuid;
  v_order     text := 'order_CHECK_' || gen_random_uuid();
  v_order2    text := 'order_CHECK_' || gen_random_uuid();
  v_payment   text := 'pay_CHECK_'   || gen_random_uuid();
  v_payment2  text := 'pay_CHECK_'   || gen_random_uuid();
  v_opening   integer;
  v_balance   integer;
  v_rows      integer;
  v_result    jsonb;
  v_status    text;
  v_raised    boolean := false;
begin
  select profile_id, balance_paise into v_profile, v_opening
    from public.wallets order by profile_id limit 1;

  if v_profile is null then
    raise exception 'no wallet to check against — sign an account in first';
  end if;

  -- ── 1. A capture credits exactly once ──────────────────────────────────────

  insert into public.payments (profile_id, provider_order_id, amount_paise, status)
  values (v_profile, v_order, 12300, 'created');

  v_result := public.payment_capture(
    'evt_CHECK_1', v_order, v_payment, 12300, 'captured', '{"check": true}'::jsonb);

  if (v_result ->> 'duplicate')::boolean then
    raise exception 'first delivery reported itself a duplicate';
  end if;

  select count(*) into v_rows from public.ledger
   where wallet_id = v_profile and delta_paise = 12300 and ref_type = 'payment';
  if v_rows <> 1 then
    raise exception 'expected 1 credit row, found %', v_rows;
  end if;

  select balance_paise into v_balance from public.wallets where profile_id = v_profile;
  if v_balance <> v_opening + 12300 then
    raise exception 'balance is %, expected %', v_balance, v_opening + 12300;
  end if;

  -- ── 2. The identical payment, delivered again, credits nothing ─────────────
  -- Razorpay retries until it gets a 2xx. This is the ordinary case.

  v_result := public.payment_capture(
    'evt_CHECK_2', v_order, v_payment, 12300, 'captured', '{"check": true}'::jsonb);

  if not (v_result ->> 'duplicate')::boolean then
    raise exception 'second delivery of % was not recognised as a duplicate', v_payment;
  end if;

  select count(*) into v_rows from public.ledger
   where wallet_id = v_profile and delta_paise = 12300 and ref_type = 'payment';
  if v_rows <> 1 then
    raise exception 'replay credited again — % rows where there should be 1', v_rows;
  end if;

  select balance_paise into v_balance from public.wallets where profile_id = v_profile;
  if v_balance <> v_opening + 12300 then
    raise exception 'replay moved the balance to %', v_balance;
  end if;

  -- The same event id arriving under a different payment id is also refused,
  -- which is the second unique index doing its job.
  v_result := public.payment_capture(
    'evt_CHECK_1', v_order, 'pay_CHECK_other', 12300, 'captured', '{}'::jsonb);
  if not (v_result ->> 'duplicate')::boolean then
    raise exception 'a repeated event id was accepted';
  end if;

  -- ── 3. A failed payment leaves a row and no credit ─────────────────────────

  insert into public.payments (profile_id, provider_order_id, amount_paise, status)
  values (v_profile, v_order2, 500, 'created');

  v_result := public.payment_capture(
    'evt_CHECK_3', v_order2, v_payment2, 500, 'failed', '{"check": true}'::jsonb);

  select status into v_status from public.payments where provider_payment_id = v_payment2;
  if v_status is distinct from 'failed' then
    raise exception 'failed payment recorded as %', coalesce(v_status, 'nothing at all');
  end if;

  select count(*) into v_rows from public.ledger
   where wallet_id = v_profile and delta_paise = 500;
  if v_rows <> 0 then
    raise exception 'a failed payment wrote % ledger rows', v_rows;
  end if;

  select balance_paise into v_balance from public.wallets where profile_id = v_profile;
  if v_balance <> v_opening + 12300 then
    raise exception 'a failed payment moved the balance to %', v_balance;
  end if;

  -- ── 4. A payment we cannot attribute is refused, not guessed ──────────────

  begin
    v_result := public.payment_capture(
      'evt_CHECK_4', 'order_that_never_existed', 'pay_CHECK_orphan', 100, 'captured', '{}'::jsonb);
  exception when others then
    v_raised := true;
  end;

  if not v_raised then
    raise exception 'an unattributable payment was accepted';
  end if;

  -- ── Everything above is rolled back by this line ──────────────────────────

  raise exception 'PHASE 3 CHECKS PASSED';
end $$;
