-- The one runnable check for phase 10b's Academy (backend/INSTRUCTIONS.md §2).
-- Not a migration. Every row it writes is rolled back by the exception on the
-- last line, which is also how it reports success.
--
--   Passing looks like:  ERROR:  PHASE 10B ACADEMY CHECKS PASSED
--   Failing looks like:  ERROR:  <the assertion that broke>
--
-- Needs two profiles. Counts are relative, so it runs against a database with
-- real enrolments in it.
--
-- WHAT THIS FILE CANNOT DO: two people racing the last seat is two
-- CONNECTIONS. Assertion 3 covers the loser who arrives after the winner
-- committed; the contended path is backend/tools/academy-race.mjs.

do $check$
declare
  v_a       uuid;   -- the buyer
  v_b       uuid;   -- a stranger
  v_course  uuid;   -- ₹2,499, one lesson, one PDF
  v_seat    uuid;   -- one seat, ₹499
  v_free    uuid;   -- free, 10 seats
  v_paid    uuid;   -- ₹1,499, 10 seats — cancelled in 9
  v_dear    uuid;   -- ₹90,00,000 course
  v_res     jsonb;
  v_order   uuid;
  v_pend    uuid;
  v_n       integer;
  v_n0      integer;
  v_bal0    integer;
  v_bal     integer;
  v_sum     integer;
  v_obj     text := 'check/' || gen_random_uuid() || '.pdf';
begin
  select id into v_a from public.profiles order by created_at limit 1;
  select id into v_b from public.profiles where id <> v_a order by created_at limit 1;
  if v_a is null or v_b is null then
    raise exception 'needs two profiles';
  end if;

  insert into public.wallets (profile_id) values (v_a), (v_b) on conflict do nothing;
  insert into public.ledger (wallet_id, delta_paise, kind, ref_type)
  values (v_a, 1000000, 'check funding', 'adjustment');           -- ₹10,000
  insert into public.admin_users (profile_id, tier, added_by_note)
  values (v_a, 'superadmin', 'check') on conflict do nothing;

  insert into public.courses (title, tutor, price_paise) values ('Check Course', 'Check Tutor', 249900)
  returning id into v_course;
  insert into public.course_lessons (course_id, title, video_url) values (v_course, 'Lesson 1', 'https://example.com/v');
  insert into public.course_materials (course_id, title, storage_path) values (v_course, 'Notes', v_obj);
  insert into storage.objects (bucket_id, name) values ('course-materials', v_obj);
  insert into public.courses (title, tutor, price_paise) values ('Check Emerald Course', 'T', 900000000)
  returning id into v_dear;

  insert into public.academy_events (title, host, starts_at, seats, seats_left, price_paise)
  values ('Check Last Seat', 'H', now() + interval '1 day', 1, 1, 49900) returning id into v_seat;
  insert into public.academy_events (title, host, starts_at, seats, seats_left, price_paise)
  values ('Check Free', 'H', now() + interval '1 day', 10, 10, 0) returning id into v_free;
  insert into public.academy_events (title, host, starts_at, seats, seats_left, price_paise)
  values ('Check Paid', 'H', now() + interval '1 day', 10, 10, 149900) returning id into v_paid;
  insert into public.academy_event_links (event_id, join_url)
  values (v_seat, 'https://meet.example/1'), (v_free, 'https://meet.example/2'), (v_paid, 'https://meet.example/3');

  ---------------------------------------------------------------------------
  -- 0. Before enrolling: the outline is public, the links are not.
  ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role anon;
  select count(*) into v_n from public.course_outline where course_id = v_course;
  if v_n <> 1 then raise exception '0. anon cannot read the outline'; end if;
  begin
    select count(*) into v_n from public.course_lessons;
    raise exception '0. anon can query lessons';
  exception when insufficient_privilege then null;
  end;
  set local role authenticated;
  select count(*) into v_n from public.course_lessons where course_id = v_course;
  if v_n <> 0 then raise exception '0. a lesson link is readable before enrolling'; end if;
  reset role;

  ---------------------------------------------------------------------------
  -- 1. Done-condition 1: wallet enrol moves money once; access follows.
  ---------------------------------------------------------------------------
  select balance_paise into v_bal0 from public.wallets where profile_id = v_a;
  set local role authenticated;
  v_res := public.academy_enrol('course', v_course, 'wallet');
  reset role;
  if not (v_res->>'ok')::boolean or v_res->>'status' <> 'active' then
    raise exception '1. wallet enrol refused: %', v_res;
  end if;
  v_order := (v_res->>'order_id')::uuid;
  select balance_paise into v_bal from public.wallets where profile_id = v_a;
  if v_bal0 - v_bal <> 249900 then
    raise exception '1. wallet moved by %, expected 249900', v_bal0 - v_bal;
  end if;
  select count(*) into v_n from public.ledger where ref_id = v_order;
  if v_n <> 1 then raise exception '1. % ledger rows for one enrolment', v_n; end if;

  set local role authenticated;
  v_res := public.academy_enrol('course', v_course, 'wallet');
  reset role;
  if (v_res->>'ok')::boolean or v_res->>'reason' <> 'You are already enrolled.' then
    raise exception '1. a second enrol was not refused: %', v_res;
  end if;
  if (select balance_paise from public.wallets where profile_id = v_a) <> v_bal then
    raise exception '1. a refused second enrol moved money';
  end if;

  -- The database decides who reads, not the screen.
  set local role authenticated;
  select count(*) into v_n from public.course_lessons where course_id = v_course;
  if v_n <> 1 then raise exception '1. the enrolled person cannot read the lesson'; end if;
  select count(*) into v_n from public.course_materials where course_id = v_course;
  if v_n <> 1 then raise exception '1. the enrolled person cannot read the materials'; end if;
  select count(*) into v_n from storage.objects where bucket_id = 'course-materials' and name = v_obj;
  if v_n <> 1 then raise exception '1. the enrolled person cannot read the PDF object'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.course_lessons where course_id = v_course;
  if v_n <> 0 then raise exception '1. a stranger read the lesson link'; end if;
  select count(*) into v_n from public.course_materials where course_id = v_course;
  if v_n <> 0 then raise exception '1. a stranger read the materials'; end if;
  select count(*) into v_n from storage.objects where bucket_id = 'course-materials' and name = v_obj;
  if v_n <> 0 then raise exception '1. a stranger read the PDF object'; end if;
  select count(*) into v_n from public.enrolments where profile_id = v_a;
  if v_n <> 0 then raise exception '1. a stranger read someone''s enrolments'; end if;
  begin
    insert into public.enrolments (profile_id, item_type, item_id, status)
    values (v_b, 'course', v_course, 'active');
    raise exception '1. a client wrote its own enrolment';
  exception when insufficient_privilege then null;
  end;
  reset role;

  ---------------------------------------------------------------------------
  -- 2. Short balance: refused, nothing written.
  ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  select count(*) into v_n0 from public.orders where profile_id = v_a;
  set local role authenticated;
  v_res := public.academy_enrol('course', v_dear, 'wallet');
  reset role;
  if (v_res->>'ok')::boolean or v_res->>'reason' <> 'Not enough balance' then
    raise exception '2. an unaffordable course was not refused for balance: %', v_res;
  end if;
  if (select count(*) from public.orders where profile_id = v_a) <> v_n0
     or exists (select 1 from public.enrolments where item_id = v_dear) then
    raise exception '2. a refused enrol wrote an order or enrolment';
  end if;

  ---------------------------------------------------------------------------
  -- 3. The last seat: one wins, the next is refused and writes nothing.
  ---------------------------------------------------------------------------
  set local role authenticated;
  v_res := public.academy_enrol('event', v_seat, 'wallet');
  reset role;
  if not (v_res->>'ok')::boolean then raise exception '3. the last seat was refused: %', v_res; end if;
  if (select seats_left from public.academy_events where id = v_seat) <> 0 then
    raise exception '3. the seat was not taken';
  end if;
  insert into public.ledger (wallet_id, delta_paise, kind, ref_type) values (v_b, 100000, 'check funding', 'adjustment');
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  select balance_paise into v_bal0 from public.wallets where profile_id = v_b;
  set local role authenticated;
  v_res := public.academy_enrol('event', v_seat, 'wallet');
  select count(*) into v_n from public.academy_event_links where event_id = v_seat;
  reset role;
  if (v_res->>'ok')::boolean or v_res->>'reason' <> 'That one is full' then
    raise exception '3. a full event sold a seat: %', v_res;
  end if;
  if v_n <> 0 then raise exception '3. the refused person reads the join link'; end if;
  if (select balance_paise from public.wallets where profile_id = v_b) <> v_bal0
     or exists (select 1 from public.enrolments where profile_id = v_b and item_id = v_seat) then
    raise exception '3. a refused seat wrote money or an enrolment';
  end if;

  ---------------------------------------------------------------------------
  -- 4. Done-condition 3: a catalogue price change does not move an old line.
  ---------------------------------------------------------------------------
  update public.courses set price_paise = 399900, title = 'Renamed' where id = v_course;
  if (select unit_price_paise from public.order_items where order_id = v_order) <> 249900
     or (select title from public.order_items where order_id = v_order) <> 'Check Course'
     or (select total_paise from public.orders where id = v_order) <> 249900 then
    raise exception '4. an old enrolment followed the catalogue';
  end if;

  ---------------------------------------------------------------------------
  -- 5. Free: enrolled, a seat taken, no order and no ledger row.
  ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  select count(*) into v_n0 from public.ledger where wallet_id = v_a;
  set local role authenticated;
  v_res := public.academy_enrol('event', v_free, 'wallet');
  select count(*) into v_n from public.academy_event_links where event_id = v_free;
  reset role;
  if not (v_res->>'ok')::boolean or v_res->>'order_id' is not null or v_n <> 1 then
    raise exception '5. free enrol wrong: % (link rows %)', v_res, v_n;
  end if;
  if (select count(*) from public.ledger where wallet_id = v_a) <> v_n0
     or (select seats_left from public.academy_events where id = v_free) <> 9 then
    raise exception '5. a free enrol wrote a ledger row or took no seat';
  end if;

  ---------------------------------------------------------------------------
  -- 6. Card: pending takes a seat and no money and grants nothing; re-tapping
  --    releases it; the webhook settles through payment_capture once.
  ---------------------------------------------------------------------------
  select balance_paise into v_bal0 from public.wallets where profile_id = v_a;
  set local role authenticated;
  v_res := public.academy_enrol('event', v_paid, 'razorpay');
  v_pend := (v_res->>'order_id')::uuid;
  select count(*) into v_n from public.academy_event_links where event_id = v_paid;
  reset role;
  if not (v_res->>'ok')::boolean or v_res->>'status' <> 'pending' or v_n <> 0 then
    raise exception '6. card enrol wrong or grants access while pending: % (link rows %)', v_res, v_n;
  end if;
  if (select seats_left from public.academy_events where id = v_paid) <> 9
     or (select balance_paise from public.wallets where profile_id = v_a) <> v_bal0 then
    raise exception '6. pending did not hold a seat, or took money';
  end if;

  set local role authenticated;
  v_res := public.academy_enrol('event', v_paid, 'razorpay');   -- tapped again
  reset role;
  if not (v_res->>'ok')::boolean
     or (select status from public.orders where id = v_pend) <> 'cancelled'
     or (select seats_left from public.academy_events where id = v_paid) <> 9 then
    raise exception '6. re-tapping did not release the abandoned checkout: %', v_res;
  end if;
  v_pend := (v_res->>'order_id')::uuid;

  insert into public.payments (profile_id, provider_order_id, amount_paise, status, order_id)
  values (v_a, 'order_check_ac6', 149900, 'created', v_pend);
  v_res := public.payment_capture('evt_check_ac6', 'order_check_ac6', 'pay_check_ac6', 149900, 'captured', '{}');
  if not (v_res->'settle'->>'settled')::boolean
     or (select status from public.enrolments where order_id = v_pend) <> 'active'
     or (select balance_paise from public.wallets where profile_id = v_a) <> v_bal0 then
    raise exception '6. capture did not activate the enrolment net zero: %', v_res;
  end if;
  select count(*) into v_n0 from public.ledger where wallet_id = v_a;
  v_res := public.payment_capture('evt_check_ac6b', 'order_check_ac6', 'pay_check_ac6', 149900, 'captured', '{}');
  if not (v_res->>'duplicate')::boolean or (select count(*) from public.ledger where wallet_id = v_a) <> v_n0 then
    raise exception '6. a retried webhook wrote ledger rows';
  end if;

  ---------------------------------------------------------------------------
  -- 7. The sweeper gives an expired card checkout's seat back; a late payment
  --    stays in the wallet.
  ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_res := public.academy_enrol('event', v_paid, 'razorpay');
  reset role;
  v_pend := (v_res->>'order_id')::uuid;
  if (select seats_left from public.academy_events where id = v_paid) <> 8 then
    raise exception '7. expected 8 seats left, got %', (select seats_left from public.academy_events where id = v_paid);
  end if;
  update public.orders set expires_at = now() - interval '1 second' where id = v_pend;
  perform public.shop_order_expire();
  if (select status from public.enrolments where order_id = v_pend) <> 'cancelled'
     or (select seats_left from public.academy_events where id = v_paid) <> 9 then
    raise exception '7. the sweeper did not release the seat';
  end if;
  select balance_paise into v_bal0 from public.wallets where profile_id = v_b;
  insert into public.payments (profile_id, provider_order_id, amount_paise, status, order_id)
  values (v_b, 'order_check_ac7', 149900, 'created', v_pend);
  perform public.payment_capture('evt_check_ac7', 'order_check_ac7', 'pay_check_ac7', 149900, 'captured', '{}');
  if (select balance_paise from public.wallets where profile_id = v_b) <> v_bal0 + 149900
     or (select status from public.enrolments where order_id = v_pend) <> 'cancelled' then
    raise exception '7. a late payment enrolled, or did not stay in the wallet';
  end if;

  ---------------------------------------------------------------------------
  -- 8. Admin refund of the course: once, audited, access gone.
  ---------------------------------------------------------------------------
  select balance_paise into v_bal0 from public.wallets where profile_id = v_a;
  v_res := public.admin_order_refund(v_a, v_order, 'check', false);
  if not (v_res->>'refunded')::boolean
     or (select balance_paise from public.wallets where profile_id = v_a) <> v_bal0 + 249900 then
    raise exception '8. refund did not credit: %', v_res;
  end if;
  perform public.admin_order_refund(v_a, v_order, 'check again', false);
  if (select balance_paise from public.wallets where profile_id = v_a) <> v_bal0 + 249900
     or (select count(*) from public.admin_actions where target_id = v_order and action = 'academy.refund') <> 1 then
    raise exception '8. a second refund credited, or the audit row count is wrong';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from public.course_lessons where course_id = v_course;
  reset role;
  if v_n <> 0 then raise exception '8. a refunded enrolment still reads the lesson'; end if;

  ---------------------------------------------------------------------------
  -- 9. Cancel an event: paid refunded once, free cancelled, a card checkout
  --    still open released, one audit row, links gone, no new enrolment.
  ---------------------------------------------------------------------------
  insert into public.enrolments (profile_id, item_type, item_id, status)
  values (v_b, 'event', v_paid, 'active');                     -- stands in for a free enrolment
  insert into public.academy_events (title, host, starts_at, seats, seats_left, price_paise)
  values ('Check Pending', 'H', now() + interval '1 day', 5, 5, 49900) returning id into v_seat;

  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_res := public.academy_enrol('event', v_seat, 'razorpay');
  reset role;
  v_pend := (v_res->>'order_id')::uuid;
  v_res := public.admin_event_cancel(v_a, v_seat, 'check pending');
  if (v_res->>'pending_released')::integer <> 1 or (v_res->>'refunded')::integer <> 0
     or (select status from public.orders where id = v_pend) <> 'cancelled' then
    raise exception '9. a pending card checkout was not released on cancel: %', v_res;
  end if;

  select balance_paise into v_bal0 from public.wallets where profile_id = v_a;
  v_res := public.admin_event_cancel(v_a, v_paid, 'check');
  if not (v_res->>'ok')::boolean or (v_res->>'refunded')::integer <> 1
     or (v_res->>'amount_paise')::integer <> 149900 or (v_res->>'free_cancelled')::integer <> 1 then
    raise exception '9. cancel result wrong: %', v_res;
  end if;
  if (select balance_paise from public.wallets where profile_id = v_a) <> v_bal0 + 149900
     or exists (select 1 from public.enrolments where item_id = v_paid and status in ('pending','active')) then
    raise exception '9. cancel did not refund and close every enrolment';
  end if;
  if (select count(*) from public.admin_actions where target_id = v_paid and action = 'academy.cancel_event') <> 1 then
    raise exception '9. no audit row for the cancel';
  end if;
  v_res := public.admin_event_cancel(v_a, v_paid, 'again');
  if (v_res->>'ok')::boolean or (select balance_paise from public.wallets where profile_id = v_a) <> v_bal0 + 149900 then
    raise exception '9. a second cancel was accepted or refunded again';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from public.academy_event_links where event_id = v_paid;
  v_res := public.academy_enrol('event', v_paid, 'wallet');
  reset role;
  if v_n <> 0 or (v_res->>'ok')::boolean or v_res->>'reason' <> 'That event was cancelled.' then
    raise exception '9. a cancelled event is still readable or enrollable: % (link rows %)', v_res, v_n;
  end if;

  ---------------------------------------------------------------------------
  -- 10. Both ledgers still replay to their balances.
  ---------------------------------------------------------------------------
  select coalesce(sum(delta_paise), 0) into v_sum from public.ledger where wallet_id = v_a;
  if v_sum <> (select balance_paise from public.wallets where profile_id = v_a) then
    raise exception '10. A''s ledger sums to % but the balance reads something else', v_sum;
  end if;
  select coalesce(sum(delta_paise), 0) into v_sum from public.ledger where wallet_id = v_b;
  if v_sum <> (select balance_paise from public.wallets where profile_id = v_b) then
    raise exception '10. B''s ledger sums to % but the balance reads something else', v_sum;
  end if;

  raise exception 'PHASE 10B ACADEMY CHECKS PASSED';
end
$check$;
