-- The one runnable check for phase 5 (backend/INSTRUCTIONS.md §2, Testing).
-- Not a migration. Safe to run against any database at any time: every row it
-- writes is rolled back by the exception it raises on the last line, which is
-- also how it reports success.
--
--   Passing looks like:  ERROR:  PHASE 5 CHECKS PASSED
--   Failing looks like:  ERROR:  <the assertion that broke>
--
-- It needs at least TWO profiles to exist — a seeker and somebody to book —
-- and it turns the second into an approved consultant for the duration of the
-- transaction. It funds the first by inserting a ledger row, which is the same
-- recipe as the foot of 003, and takes the money back out at the end by
-- aborting.
--
-- **Every count here is RELATIVE.** The phase 4 check's first version asserted
-- absolute numbers and broke the moment the seed added real rows; a check that
-- cannot run twice is not a check.
--
-- WHAT THIS FILE CANNOT DO, and it is done-condition 1. Two clients racing one
-- slot is a test of two CONNECTIONS, and one transaction cannot be two of
-- them. Assertion 3 covers the pre-check refusal — the common case, where the
-- loser arrives late enough to see the slot gone — but the 23505 path, where
-- both pass the check and the unique index decides, needs this, fired
-- SIMULTANEOUSLY from two sessions with the same seeker's jwt:
--
--   begin;
--   select set_config('request.jwt.claims',
--          '{"sub":"<seeker uuid>","role":"authenticated"}', true);
--   select pg_sleep(2);                       -- makes the overlap certain
--   select public.book_session('<consultant>', '<service>', '<starts_at>');
--   commit;
--
-- One returns ok:true, the other 'Someone just took that time. Pick another.',
-- and the refused one leaves no order, no booking and no ledger row.

do $check$
declare
  v_seeker  uuid;
  v_pro     uuid;
  v_svc     uuid;
  v_pm      uuid;
  v_price   integer;
  v_date    date := (now() at time zone 'Asia/Kolkata')::date + 1;
  v_slots   time[] := array['09:30','11:00','13:30','16:00','18:30','20:00']::time[];
  v_t       time;
  v_d       integer;
  v_at      timestamptz;
  v_at2     timestamptz;
  v_res     jsonb;
  v_booking uuid;
  v_order   uuid;
  v_debit   uuid;
  v_delta   integer;
  v_bal0    integer;
  v_bal     integer;
  v_led0    integer;
  v_led     integer;
  v_earn0   integer;
  v_earn    integer;
  v_ord0    integer;
  v_ord     integer;
  v_book0   integer;
  v_book    integer;
  v_n       integer;
  v_refused boolean := false;
begin
  select id into v_seeker from public.profiles order by created_at limit 1;
  select id into v_pro    from public.profiles
   where id <> v_seeker order by created_at limit 1;
  if v_seeker is null or v_pro is null then
    raise exception 'needs two profiles — a seeker and somebody to book';
  end if;

  -- An approved consultant, open at all six times on all seven days, with one
  -- fixed service priced straight off a band. Existing rows are left alone.
  insert into public.consultants (profile_id, category, status, legacy_id)
  values (v_pro, 'Astrologer', 'approved', 'check:phase5')
  on conflict (profile_id) do update set status = 'approved';

  for v_d in 0..6 loop
    foreach v_t in array v_slots loop
      insert into public.consultant_availability (consultant_id, weekday, slot_time)
      values (v_pro, v_d, v_t) on conflict do nothing;
    end loop;
  end loop;

  insert into public.consultant_services (consultant_id, band_id, mode, billing,
                                          duration_mins, price_paise)
  select v_pro, b.id, 'call', 'fixed', b.duration_mins, b.price_paise
    from public.price_bands b
   where b.billing = 'fixed' and b.duration_mins = 20 and b.active
   order by b.tier limit 1
  on conflict do nothing;

  select id, price_paise into v_svc, v_price
    from public.consultant_services
   where consultant_id = v_pro and billing = 'fixed' and mode = 'call'
   order by duration_mins limit 1;

  -- Two open slots on the same day: one to book, one for the refusals.
  select o.starts_at into v_at  from public.consultant_open_slots(v_pro, v_date) o
   order by o.slot_time limit 1;
  select o.starts_at into v_at2 from public.consultant_open_slots(v_pro, v_date) o
   order by o.slot_time offset 1 limit 1;
  if v_at is null or v_at2 is null then
    raise exception 'setup: the consultant has fewer than two open slots tomorrow';
  end if;

  -- Fund the seeker. Same recipe as the foot of 003 — the trigger carries it
  -- into the balance, so the wallet is correct by construction.
  insert into public.wallets (profile_id) values (v_seeker) on conflict do nothing;
  insert into public.ledger (wallet_id, delta_paise, kind, ref_type, note)
  values (v_seeker, v_price * 3, 'Added money', 'adjustment', 'phase 5 check');

  -- Everything from here is measured against these.
  select balance_paise into v_bal0 from public.wallets where profile_id = v_seeker;
  select count(*) into v_led0  from public.ledger where wallet_id = v_seeker;
  select count(*) into v_earn0 from public.earnings_ledger where consultant_id = v_pro;
  select count(*) into v_ord0  from public.orders where profile_id = v_seeker;
  select count(*) into v_book0 from public.bookings where seeker_id = v_seeker;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_seeker, 'role', 'authenticated')::text,
                     true);

  ---------------------------------------------------------------------------
  -- 1. One booking is one transaction: one order, one line, one booking, one
  --    debit, one earnings row, and a balance short by exactly the price the
  --    SERVER looked up. The call carries no price — there is no parameter
  --    for one (INSTRUCTIONS.md rule 3).
  ---------------------------------------------------------------------------
  v_res := public.book_session(v_pro, v_svc, v_at);
  if not (v_res ->> 'ok')::boolean then
    raise exception '1. an affordable open slot was refused: %', v_res ->> 'reason';
  end if;
  v_booking := (v_res ->> 'booking_id')::uuid;
  v_order   := (v_res ->> 'order_id')::uuid;

  select balance_paise into v_bal from public.wallets where profile_id = v_seeker;
  if v_bal <> v_bal0 - v_price then
    raise exception '1. the wallet moved by %, expected %', v_bal0 - v_bal, v_price;
  end if;

  select count(*) into v_led  from public.ledger where wallet_id = v_seeker;
  select count(*) into v_ord  from public.orders where profile_id = v_seeker;
  select count(*) into v_book from public.bookings where seeker_id = v_seeker;
  select count(*) into v_earn from public.earnings_ledger where consultant_id = v_pro;
  if v_led <> v_led0 + 1 or v_ord <> v_ord0 + 1
     or v_book <> v_book0 + 1 or v_earn <> v_earn0 + 1 then
    raise exception '1. one booking wrote % ledger, % order, % booking, % earnings rows',
      v_led - v_led0, v_ord - v_ord0, v_book - v_book0, v_earn - v_earn0;
  end if;

  select count(*) into v_n from public.order_items where order_id = v_order;
  if v_n <> 1 then
    raise exception '1. one booking wrote % order lines', v_n;
  end if;

  -- The amounts are frozen copies of the service row, not of anything sent.
  if not exists (select 1 from public.bookings
                  where id = v_booking and amount_paise = v_price
                    and order_id = v_order and status = 'pending') then
    raise exception '1. the booking did not freeze the service price, order or status';
  end if;

  select id, delta_paise into v_debit, v_delta
    from public.ledger
   where wallet_id = v_seeker and ref_id = v_order and ref_type = 'order';
  if v_delta <> -v_price then
    raise exception '1. the debit was % against a price of %', v_delta, v_price;
  end if;

  ---------------------------------------------------------------------------
  -- 2. gross − fee = net, and the fee is 18% expressed as 1800 basis points.
  --    Checked on this row, and then as an invariant across every row in the
  --    table — the CHECK constraint enforces it, so this is really asking
  --    whether the constraint is still there.
  ---------------------------------------------------------------------------
  if not exists (
    select 1 from public.earnings_ledger
     where booking_id = v_booking
       and gross_paise = v_price
       and fee_bps     = 1800
       and fee_paise   = round(v_price::numeric * 1800 / 10000)::integer
       and net_paise   = gross_paise - fee_paise) then
    raise exception '2. the earnings row does not read gross %, 1800 bps, net = gross - fee',
      v_price;
  end if;
  if exists (select 1 from public.earnings_ledger
              where net_paise <> gross_paise - fee_paise) then
    raise exception '2. an earnings row exists where gross - fee <> net';
  end if;

  ---------------------------------------------------------------------------
  -- 3. The same slot again is refused BY NAME, and the refusal writes
  --    nothing — no order, no booking, and above all no debit. This is the
  --    pre-check half of done-condition 1; the 23505 half is the two-session
  --    script in the header.
  ---------------------------------------------------------------------------
  select balance_paise into v_bal0 from public.wallets where profile_id = v_seeker;
  select count(*) into v_led0 from public.ledger where wallet_id = v_seeker;
  select count(*) into v_ord0 from public.orders where profile_id = v_seeker;

  v_res := public.book_session(v_pro, v_svc, v_at);
  if (v_res ->> 'ok')::boolean then
    raise exception '3. the same slot was sold twice';
  end if;
  if coalesce(v_res ->> 'reason', '') = '' then
    raise exception '3. the refusal carried no reason the interface can show';
  end if;

  select balance_paise into v_bal from public.wallets where profile_id = v_seeker;
  select count(*) into v_led from public.ledger where wallet_id = v_seeker;
  select count(*) into v_ord from public.orders where profile_id = v_seeker;
  if v_bal <> v_bal0 or v_led <> v_led0 then
    raise exception '3. ORPHANED DEBIT: a refused booking moved the wallet by %',
      v_bal0 - v_bal;
  end if;
  if v_ord <> v_ord0 then
    raise exception '3. a refused booking left % orders behind', v_ord - v_ord0;
  end if;

  ---------------------------------------------------------------------------
  -- 4. Not enough balance is refused in the words the front end already
  --    shows, and leaves nothing behind either. The wallet is walked down by
  --    a ledger row rather than by editing the balance, because editing the
  --    balance is the thing this schema does not allow.
  ---------------------------------------------------------------------------
  insert into public.ledger (wallet_id, delta_paise, kind, ref_type, note)
  values (v_seeker, -(v_bal - (v_price - 1)), 'Check drain', 'adjustment', 'phase 5 check');

  select count(*) into v_led0 from public.ledger where wallet_id = v_seeker;
  v_res := public.book_session(v_pro, v_svc, v_at2);
  if (v_res ->> 'ok')::boolean then
    raise exception '4. a session was sold to a wallet that could not pay for it';
  end if;
  if v_res ->> 'reason' <> 'Not enough balance' then
    raise exception '4. the refusal said "%" rather than the string the UI shows',
      v_res ->> 'reason';
  end if;
  select count(*) into v_led from public.ledger where wallet_id = v_seeker;
  if v_led <> v_led0 then
    raise exception '4. a refused booking wrote % ledger rows', v_led - v_led0;
  end if;
  if not exists (select 1 from public.consultant_open_slots(v_pro, v_date)
                  where starts_at = v_at2) then
    raise exception '4. a refused booking held on to the slot';
  end if;

  -- Put it back, so the decline below is measured against a real balance.
  insert into public.ledger (wallet_id, delta_paise, kind, ref_type, note)
  values (v_seeker, v_price * 2, 'Added money', 'adjustment', 'phase 5 check');

  ---------------------------------------------------------------------------
  -- 5. A DECLINE RESTORES THE BALANCE VIA A NEW ROW, and the original debit
  --    is untouched. Declined by the consultant through the same UPDATE the
  --    front end makes — the reversal is a trigger, so there is no second
  --    call anybody can forget.
  ---------------------------------------------------------------------------
  select balance_paise into v_bal0 from public.wallets where profile_id = v_seeker;
  select count(*) into v_led0  from public.ledger where wallet_id = v_seeker;
  select count(*) into v_earn0 from public.earnings_ledger where consultant_id = v_pro;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_pro, 'role', 'authenticated')::text,
                     true);
  set local role authenticated;
  update public.bookings set status = 'declined' where id = v_booking;
  reset role;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_seeker, 'role', 'authenticated')::text,
                     true);

  select balance_paise into v_bal from public.wallets where profile_id = v_seeker;
  if v_bal <> v_bal0 + v_price then
    raise exception '5. a decline returned % of %', v_bal - v_bal0, v_price;
  end if;

  select count(*) into v_led from public.ledger where wallet_id = v_seeker;
  if v_led <> v_led0 + 1 then
    raise exception '5. a decline wrote % ledger rows, expected 1', v_led - v_led0;
  end if;
  if not exists (select 1 from public.ledger
                  where ref_id = v_order and ref_type = 'refund'
                    and delta_paise = v_price) then
    raise exception '5. the reversing row is not a full credit against the order';
  end if;

  -- The append-only half. The debit is still exactly the row it was.
  if not exists (select 1 from public.ledger
                  where id = v_debit and delta_paise = -v_price and ref_type = 'order') then
    raise exception '5. the original debit was edited rather than reversed';
  end if;

  -- And the consultant does not keep the earnings on a session they refused.
  select count(*) into v_earn from public.earnings_ledger where consultant_id = v_pro;
  if v_earn <> v_earn0 + 1 then
    raise exception '5. a decline wrote % earnings rows, expected 1', v_earn - v_earn0;
  end if;
  if not exists (select 1 from public.earnings_ledger
                  where booking_id = v_booking and gross_paise = -v_price
                    and net_paise = gross_paise - fee_paise) then
    raise exception '5. the reversing earnings row does not net out against the original';
  end if;
  if (select coalesce(sum(net_paise), 0) from public.earnings_ledger
       where booking_id = v_booking) <> 0 then
    raise exception '5. the two earnings rows for one declined booking do not cancel';
  end if;
  if not exists (select 1 from public.orders where id = v_order and status = 'refunded') then
    raise exception '5. the order was not marked refunded';
  end if;

  -- The slot is free again, which is 009 assertion 3 still holding with money
  -- in the picture.
  if not exists (select 1 from public.consultant_open_slots(v_pro, v_date)
                  where starts_at = v_at) then
    raise exception '5. a declined booking still holds its slot';
  end if;

  ---------------------------------------------------------------------------
  -- 6. Reversing twice credits once. The guard is the refund row itself, not
  --    a flag, so a retry cannot pay a seeker twice.
  ---------------------------------------------------------------------------
  select count(*) into v_led0 from public.ledger where wallet_id = v_seeker;
  perform public.booking_reverse(v_booking, 'declined');
  select count(*) into v_led from public.ledger where wallet_id = v_seeker;
  if v_led <> v_led0 then
    raise exception '6. a second reversal credited the wallet again';
  end if;

  ---------------------------------------------------------------------------
  -- 7. Both books are append-only, by trigger. A correction is a new row.
  ---------------------------------------------------------------------------
  v_refused := false;
  begin
    update public.ledger set delta_paise = 1 where id = v_debit;
  exception when others then v_refused := true;
  end;
  if not v_refused then
    raise exception '7. a ledger row was editable';
  end if;

  v_refused := false;
  begin
    update public.earnings_ledger set net_paise = 1 where booking_id = v_booking;
  exception when others then v_refused := true;
  end;
  if not v_refused then
    raise exception '7. an earnings row was editable';
  end if;

  ---------------------------------------------------------------------------
  -- 8. Per-minute is refused by name rather than charged as if one minute
  --    were the whole call. The meter is phase 11.
  ---------------------------------------------------------------------------
  insert into public.consultant_services (consultant_id, band_id, mode, billing,
                                          duration_mins, price_paise)
  select v_pro, b.id, 'live', 'per_minute', b.duration_mins, b.price_paise
    from public.price_bands b
   where b.billing = 'per_minute' and b.active
   order by b.tier limit 1
  on conflict do nothing;

  select id into v_pm from public.consultant_services
   where consultant_id = v_pro and billing = 'per_minute' limit 1;
  if v_pm is null then
    raise exception '8. setup: no per-minute service to refuse';
  end if;
  v_res := public.book_session(v_pro, v_pm, v_at);
  if (v_res ->> 'ok')::boolean then
    raise exception '8. a per-minute service was booked as if it were a session';
  end if;
  -- Pin the REASON, not just the refusal. Any unrelated refusal — slot taken,
  -- balance short, service inactive — satisfies a bare `not ok`, so the one
  -- thing this assertion exists to prove would not actually be proven.
  if v_res ->> 'reason' <> 'Instant calls are not bookable yet.' then
    raise exception '8. per-minute was refused for the wrong reason: %', v_res ->> 'reason';
  end if;

  ---------------------------------------------------------------------------
  -- 9. The three new tables are readable only by the person they are about,
  --    and writable by nobody. Run as the signed-in role, because that is who
  --    the policies are about.
  ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_pro, 'role', 'authenticated')::text,
                     true);
  set local role authenticated;

  select count(*) into v_n from public.orders where profile_id = v_seeker;
  if v_n <> 0 then
    raise exception '9. a consultant could read % of the seeker''s orders', v_n;
  end if;
  select count(*) into v_n from public.order_items where order_id = v_order;
  if v_n <> 0 then
    raise exception '9. a consultant could read somebody else''s order lines';
  end if;

  v_refused := false;
  begin
    insert into public.earnings_ledger (consultant_id, booking_id, gross_paise,
                                        fee_bps, fee_paise, net_paise, kind)
    values (v_pro, null, 100000, 0, 0, 100000, 'typed in');
  exception when others then v_refused := true;
  end;
  if not v_refused then
    raise exception '9. a consultant wrote themselves an earnings row';
  end if;

  v_refused := false;
  begin
    insert into public.bookings (seeker_id, consultant_id, service_id, starts_at,
                                 duration_mins, amount_paise, mode, status)
    values (v_pro, v_pro, v_svc, v_at2, 20, 0, 'call', 'confirmed');
  exception when others then v_refused := true;
  end;
  if not v_refused then
    raise exception '9. a client inserted a booking directly — that is a free session';
  end if;

  -- And the ALLOW direction, which matters just as much: a policy that refuses
  -- everybody passes every refusal test and leaves ProEarnings permanently
  -- empty. The consultant must be able to read their OWN earnings.
  select count(*) into v_n from public.earnings_ledger where consultant_id = v_pro;
  if v_n < 1 then
    raise exception '9. a consultant cannot read their own earnings rows';
  end if;

  reset role;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_seeker, 'role', 'authenticated')::text,
                     true);
  set local role authenticated;
  select count(*) into v_n from public.orders where profile_id = v_seeker;
  if v_n < 1 then
    raise exception '9. a seeker cannot read their own orders';
  end if;
  select count(*) into v_n from public.order_items where order_id = v_order;
  if v_n <> 1 then
    raise exception '9. a seeker cannot read their own order line';
  end if;
  reset role;

  ---------------------------------------------------------------------------
  -- 10. Two reversals of one booking credit once. The guarantee is the unique
  --     index from 013, not a check — two concurrent reversals both read no
  --     refund row and both credit (INSTRUCTIONS.md rule 6).
  ---------------------------------------------------------------------------
  select count(*) into v_led0 from public.ledger where wallet_id = v_seeker;
  begin
    insert into public.ledger (wallet_id, delta_paise, kind, ref_type, ref_id, note)
    values (v_seeker, v_price, 'Refund · session', 'refund', v_order, 'second reversal');
    raise exception '10. a second refund against one order was accepted';
  exception
    when unique_violation then null;   -- the index refused it, which is the pass
  end;
  select count(*) into v_led from public.ledger where wallet_id = v_seeker;
  if v_led <> v_led0 then
    raise exception '10. a refused second refund still wrote % rows', v_led - v_led0;
  end if;

  -- Aborts the transaction, discarding every row above. This is the pass.
  raise exception 'PHASE 5 CHECKS PASSED';
end
$check$;
