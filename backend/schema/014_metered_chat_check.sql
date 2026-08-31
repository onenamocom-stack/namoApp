-- The one runnable check for phase 6 (backend/INSTRUCTIONS.md §2, Testing).
-- Not a migration. Safe to run against any database at any time: every row it
-- writes is rolled back by the exception it raises on the last line, which is
-- also how it reports success.
--
--   Passing looks like:  ERROR:  PHASE 6 CHECKS PASSED
--   Failing looks like:  ERROR:  <the assertion that broke>
--
-- It needs at least TWO profiles and turns the second into an approved
-- consultant with a per-minute chat rate for the duration of the transaction.
-- Every count is RELATIVE, so it survives a database with real sessions in it.
--
-- TIME IS FAKED BY MOVING started_at, not by waiting. `now()` is the
-- transaction timestamp and does not advance inside a DO block, so a session
-- stamped as having begun ten minutes ago is charged exactly ten minutes with
-- no clock jitter at all. That is the only way to assert on a meter in one
-- transaction, and it is also stricter than a real ten-minute wait would be.

do $check$
declare
  v_seeker  uuid;
  v_pro     uuid;
  v_svc     uuid;
  v_rate    integer;
  v_res     jsonb;
  v_sess    uuid;
  v_sess2   uuid;
  v_thread  uuid;
  v_order   uuid;
  v_hold    integer;
  v_expect  integer;
  v_bal0    integer;
  v_bal     integer;
  v_led0    integer;
  v_led     integer;
  v_earn0   integer;
  v_earn    integer;
  v_sess0   integer;
  v_n       integer;
  v_msg     uuid;
  v_refused boolean;
begin
  select id into v_seeker from public.profiles order by created_at limit 1;
  select id into v_pro from public.profiles where id <> v_seeker order by created_at limit 1;
  if v_seeker is null or v_pro is null then
    raise exception 'needs two profiles — a seeker and somebody to chat with';
  end if;

  insert into public.consultants (profile_id, category, status, legacy_id)
  values (v_pro, 'Astrologer', 'approved', 'check:phase6')
  on conflict (profile_id) do update set status = 'approved';

  -- A per-minute CHAT rate, straight off a band.
  insert into public.consultant_services (consultant_id, band_id, mode, billing,
                                          duration_mins, price_paise)
  select v_pro, b.id, 'chat', 'per_minute', b.duration_mins, b.price_paise
    from public.price_bands b
   where b.billing = 'per_minute' and b.active
   order by b.tier limit 1
  on conflict do nothing;

  select id, price_paise into v_svc, v_rate
    from public.consultant_services
   where consultant_id = v_pro and mode = 'chat' and billing = 'per_minute' limit 1;
  if v_svc is null then raise exception 'setup: no per-minute chat service'; end if;

  -- Top up by twenty minutes' worth. NOT "so the wallet holds twenty minutes"
  -- — whatever was already in there is still in there, and the first version of
  -- this check asserted a flat 20 and failed against a dev wallet with ₹10,000
  -- in it. The cap was doing its job and the assertion was wrong. Expectations
  -- below are computed from the balance, like every other count in this file.
  insert into public.wallets (profile_id) values (v_seeker) on conflict do nothing;
  insert into public.ledger (wallet_id, delta_paise, kind, ref_type, note)
  values (v_seeker, v_rate * 20, 'Added money', 'adjustment', 'phase 6 check');

  select balance_paise into v_bal0 from public.wallets where profile_id = v_seeker;
  select count(*) into v_led0  from public.ledger where wallet_id = v_seeker;
  select count(*) into v_earn0 from public.earnings_ledger where consultant_id = v_pro;
  select count(*) into v_sess0 from public.sessions where seeker_id = v_seeker;

  ---------------------------------------------------------------------------
  -- 1. Asking costs NOTHING. A consultant who never answers must never have
  --    cost the seeker a rupee — the difference between this and a booking,
  --    which claims a slot and charges for it.
  ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_seeker, 'role', 'authenticated')::text, true);

  v_res := public.session_request(v_pro, v_svc);
  if not (v_res ->> 'ok')::boolean then
    raise exception '1. a funded seeker could not ask: %', v_res ->> 'reason';
  end if;
  v_sess := (v_res ->> 'session_id')::uuid;

  select balance_paise into v_bal from public.wallets where profile_id = v_seeker;
  select count(*) into v_led from public.ledger where wallet_id = v_seeker;
  if v_bal <> v_bal0 or v_led <> v_led0 then
    raise exception '1. asking for a chat moved the wallet by %', v_bal0 - v_bal;
  end if;
  if not exists (select 1 from public.sessions
                  where id = v_sess and status = 'requested' and rate_paise = v_rate) then
    raise exception '1. the request did not freeze the rate or is not pending';
  end if;

  ---------------------------------------------------------------------------
  -- 2. The consultant's join is what starts the clock and takes the hold. The
  --    hold is every minute the wallet can buy, up to the 30-minute cap —
  --    computed here from the same two numbers the function uses, so this
  --    asserts the RULE rather than one wallet's arithmetic.
  ---------------------------------------------------------------------------
  v_expect := least(v_bal0 / v_rate, 30);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);
  v_res := public.session_accept(v_sess);
  if not (v_res ->> 'ok')::boolean then
    raise exception '2. accept refused: %', v_res ->> 'reason';
  end if;
  v_thread := (v_res ->> 'thread_id')::uuid;
  v_hold   := (v_res ->> 'hold_paise')::integer;

  if (v_res ->> 'minutes_held')::integer <> v_expect then
    raise exception '2. held % minutes, expected % (balance %, rate %, cap 30)',
      v_res ->> 'minutes_held', v_expect, v_bal0, v_rate;
  end if;
  if v_hold <> v_rate * v_expect then
    raise exception '2. hold was % for % minutes at %', v_hold, v_expect, v_rate;
  end if;
  -- And the cap is a cap, not a coincidence.
  if v_bal0 / v_rate > 30 and v_expect <> 30 then
    raise exception '2. a rich wallet held % minutes rather than the 30-minute cap', v_expect;
  end if;

  select balance_paise into v_bal from public.wallets where profile_id = v_seeker;
  if v_bal <> v_bal0 - v_hold then
    raise exception '2. wallet moved by %, expected the whole hold %', v_bal0 - v_bal, v_hold;
  end if;

  select order_id into v_order from public.sessions where id = v_sess;
  select count(*) into v_n from public.order_items where order_id = v_order;
  if v_n <> 1 then raise exception '2. accept wrote % order lines', v_n; end if;

  -- Nothing is earned yet. Nobody has said anything.
  select count(*) into v_earn from public.earnings_ledger where consultant_id = v_pro;
  if v_earn <> v_earn0 then
    raise exception '2. accept credited the consultant % rows before a word was said',
      v_earn - v_earn0;
  end if;

  ---------------------------------------------------------------------------
  -- 3. One live session per consultant. A second request accepted while the
  --    first is live loses on the unique index, not on application logic.
  ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_seeker, 'role', 'authenticated')::text, true);
  v_res := public.session_request(v_pro, v_svc);
  v_sess2 := (v_res ->> 'session_id')::uuid;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);
  v_res := public.session_accept(v_sess2);
  if (v_res ->> 'ok')::boolean then
    raise exception '3. a consultant was put in two live sessions at once';
  end if;

  ---------------------------------------------------------------------------
  -- 4. The meter is what gates messages. Inside a live session both parties
  --    can write; that is the only time anybody can.
  ---------------------------------------------------------------------------
  set local role authenticated;
  insert into public.messages (thread_id, sender_id, body)
  values (v_thread, v_pro, 'Namaste. What would you like to look at?')
  returning id into v_msg;
  reset role;
  if v_msg is null then raise exception '4. the consultant could not write in a live session'; end if;

  ---------------------------------------------------------------------------
  -- 5. TEN MINUTES CHARGES TEN MINUTES. The session is stamped as having begun
  --    ten minutes ago; `now()` is frozen for this transaction, so this is an
  --    exact assertion and not a race with the clock.
  ---------------------------------------------------------------------------
  update public.sessions
     set started_at = now() - interval '10 minutes',
         expires_at = now() - interval '10 minutes' + interval '20 minutes'
   where id = v_sess;

  select count(*) into v_led0 from public.ledger where wallet_id = v_seeker;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_seeker, 'role', 'authenticated')::text, true);
  v_res := public.session_end(v_sess);
  if not (v_res ->> 'ok')::boolean then
    raise exception '5. end refused: %', v_res ->> 'reason';
  end if;
  if (v_res ->> 'minutes')::integer <> 10 then
    raise exception '5. a ten-minute session billed % minutes', v_res ->> 'minutes';
  end if;
  if (v_res ->> 'charged_paise')::integer <> v_rate * 10 then
    raise exception '5. charged % for ten minutes at %', v_res ->> 'charged_paise', v_rate;
  end if;
  if (v_res ->> 'refunded_paise')::integer <> v_hold - v_rate * 10 then
    raise exception '5. refunded %, expected %', v_res ->> 'refunded_paise', v_hold - v_rate*10;
  end if;

  -- Exactly one new ledger row — the settle — and the balance is the wallet
  -- minus ten minutes, not minus the hold.
  select count(*) into v_led from public.ledger where wallet_id = v_seeker;
  if v_led <> v_led0 + 1 then
    raise exception '5. settling wrote % ledger rows, expected 1', v_led - v_led0;
  end if;
  select balance_paise into v_bal from public.wallets where profile_id = v_seeker;
  if v_bal <> v_bal0 - v_rate * 10 then
    raise exception '5. net charge was %, expected %', v_bal0 - v_bal, v_rate * 10;
  end if;

  -- And the ledger replays to the balance, which is the phase 2 promise still
  -- holding with a meter in the picture.
  if v_bal <> (select sum(delta_paise) from public.ledger where wallet_id = v_seeker) then
    raise exception '5. the ledger no longer replays to the balance';
  end if;

  ---------------------------------------------------------------------------
  -- 6. The consultant earns what was USED, and gross − fee = net on it.
  ---------------------------------------------------------------------------
  select count(*) into v_earn from public.earnings_ledger where consultant_id = v_pro;
  if v_earn <> v_earn0 + 1 then
    raise exception '6. ending wrote % earnings rows, expected 1', v_earn - v_earn0;
  end if;
  if not exists (select 1 from public.earnings_ledger
                  where consultant_id = v_pro and gross_paise = v_rate * 10
                    and fee_bps = 1800
                    and fee_paise = round((v_rate * 10)::numeric * 1800 / 10000)::integer
                    and net_paise = gross_paise - fee_paise
                  order by created_at desc limit 1) then
    raise exception '6. the earnings row does not match the minutes actually used';
  end if;

  ---------------------------------------------------------------------------
  -- 7. Ending twice settles once. Both sides press End; that is normal.
  ---------------------------------------------------------------------------
  select count(*) into v_led0 from public.ledger where wallet_id = v_seeker;
  v_res := public.session_end(v_sess);
  if not (v_res ->> 'already_ended')::boolean then
    raise exception '7. a second End did not report the session already ended';
  end if;
  select count(*) into v_led from public.ledger where wallet_id = v_seeker;
  if v_led <> v_led0 then
    raise exception '7. a second End wrote % more ledger rows', v_led - v_led0;
  end if;

  ---------------------------------------------------------------------------
  -- 8. Once the session is over the transcript is READ-ONLY. This is what
  --    stops chat being free to anyone who simply never presses End.
  ---------------------------------------------------------------------------
  v_refused := false;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_seeker, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.messages (thread_id, sender_id, body)
    values (v_thread, v_seeker, 'one more thing, free of charge?');
  exception when others then v_refused := true;
  end;
  -- Reading it is still fine: you paid for the conversation, you keep it.
  select count(*) into v_n from public.messages where thread_id = v_thread;
  reset role;
  if not v_refused then
    raise exception '8. a message was accepted with no live session — chat is free';
  end if;
  if v_n < 1 then
    raise exception '8. a participant cannot read the transcript they paid for';
  end if;

  ---------------------------------------------------------------------------
  -- 9. A wallet that cannot buy one minute is refused AT ACCEPT, and the
  --    refusal writes nothing. The seeker is told; the consultant is not left
  --    in a live session nobody is paying for.
  ---------------------------------------------------------------------------
  insert into public.ledger (wallet_id, delta_paise, kind, ref_type, note)
  values (v_seeker, -(select balance_paise from public.wallets where profile_id = v_seeker)
                    + (v_rate - 1),
          'Check drain', 'adjustment', 'phase 6 check');

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);
  select count(*) into v_led0 from public.ledger where wallet_id = v_seeker;
  v_res := public.session_accept(v_sess2);
  if (v_res ->> 'ok')::boolean then
    raise exception '9. a session started on a wallet that cannot buy a minute';
  end if;
  if v_res ->> 'reason' <> 'Not enough balance' then
    raise exception '9. wrong refusal: %', v_res ->> 'reason';
  end if;
  select count(*) into v_led from public.ledger where wallet_id = v_seeker;
  if v_led <> v_led0 then
    raise exception '9. a refused accept wrote % ledger rows', v_led - v_led0;
  end if;
  if exists (select 1 from public.sessions where id = v_sess2 and status = 'live') then
    raise exception '9. a refused accept left the session live';
  end if;

  ---------------------------------------------------------------------------
  -- 10. THE SWEEPER. A session both parties walk away from must still settle,
  --     or the hold sits taken forever and nothing anywhere notices — the
  --     shape of failure this project has already paid for once.
  ---------------------------------------------------------------------------
  insert into public.ledger (wallet_id, delta_paise, kind, ref_type, note)
  values (v_seeker, v_rate * 20, 'Added money', 'adjustment', 'phase 6 check');

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_seeker, 'role', 'authenticated')::text, true);
  v_res := public.session_request(v_pro, v_svc);
  v_sess2 := (v_res ->> 'session_id')::uuid;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);
  v_res := public.session_accept(v_sess2);
  if not (v_res ->> 'ok')::boolean then
    raise exception '10. setup: accept refused: %', v_res ->> 'reason';
  end if;

  -- Abandoned five minutes ago, with time still on the clock: the grace period
  -- is what decides this one, not expiry.
  update public.sessions
     set started_at = now() - interval '5 minutes',
         heartbeat_at = now() - interval '5 minutes',
         expires_at = now() + interval '15 minutes'
   where id = v_sess2;

  select count(*) into v_n from public.session_sweep();
  if not exists (select 1 from public.sessions where id = v_sess2 and status = 'ended') then
    raise exception '10. the sweeper left an abandoned session live and holding money';
  end if;
  if (select charged_paise from public.sessions where id = v_sess2) <> v_rate * 5 then
    raise exception '10. the sweeper charged %, expected five minutes',
      (select charged_paise from public.sessions where id = v_sess2);
  end if;

  ---------------------------------------------------------------------------
  -- 11. A stranger sees none of it — not the session, not the thread, not one
  --     message. Run as somebody who is neither party.
  ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
                     json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text,
                     true);
  set local role authenticated;
  select count(*) into v_n from public.sessions where id = v_sess;
  if v_n <> 0 then raise exception '11. a stranger read a session'; end if;
  select count(*) into v_n from public.messages where thread_id = v_thread;
  if v_n <> 0 then raise exception '11. a stranger read a private transcript'; end if;
  select count(*) into v_n from public.threads_view;
  if v_n <> 0 then raise exception '11. threads_view leaked % threads to a stranger', v_n; end if;
  reset role;

  -- Aborts the transaction, discarding every row above. This is the pass.
  raise exception 'PHASE 6 CHECKS PASSED';
end
$check$;
