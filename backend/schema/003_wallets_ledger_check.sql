-- The one runnable check for phase 2 (backend/INSTRUCTIONS.md §2, Testing).
-- Not a migration. Safe to run against any database at any time: every row it
-- writes is rolled back by the exception it raises on the last line, which is
-- also how it reports success.
--
--   Passing looks like:  ERROR:  PHASE 2 CHECKS PASSED
--   Failing looks like:  ERROR:  <the assertion that broke>
--
-- The ledger is append-only, including for the table owner, so a check that
-- inserted real rows could not clean up after itself. Aborting is the cleanup.

do $check$
declare
  v_uid     uuid;
  v_res     jsonb;
  v_balance integer;
  v_replay  integer;
  v_rows    integer;
  v_raised  boolean;
  v_type    text;
  v_open    integer;   -- balance before this check touched anything
  v_openrows integer;
begin
  select id into v_uid from public.profiles order by created_at limit 1;
  if v_uid is null then
    raise exception 'no profile to test against — sign one up first';
  end if;

  -- Act as that signed-in user for everything below.
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_uid, 'role', 'authenticated')::text,
                     true);

  -- Every assertion below is RELATIVE to whatever this wallet already holds.
  -- An earlier version asserted absolute figures, which only passed while the
  -- wallet happened to be empty — the first real credit made the check itself
  -- fail and say the wallet was broken. A check that cannot run twice is not a
  -- check.
  select balance_paise into v_open from public.wallets where profile_id = v_uid;
  select count(*) into v_openrows from public.ledger where wallet_id = v_uid;

  ---------------------------------------------------------------------------
  -- 1. The balance cache follows the ledger, with no writer maintaining it.
  ---------------------------------------------------------------------------
  insert into public.ledger (wallet_id, delta_paise, kind, ref_type, note)
  values (v_uid, 124000, 'Added money', 'adjustment', 'check');

  select balance_paise into v_balance from public.wallets where profile_id = v_uid;
  if v_balance <> v_open + 124000 then
    raise exception '1. credit did not reach the balance: expected %, got %', v_open + 124000, v_balance;
  end if;

  ---------------------------------------------------------------------------
  -- 2. A debit inside the balance is taken, once.
  ---------------------------------------------------------------------------
  v_res := public.wallet_debit(4900, 'Tarot · Bhaktamar');
  if (v_res ->> 'ok')::boolean is not true then
    raise exception '2. an affordable debit was refused: %', v_res ->> 'reason';
  end if;

  select balance_paise into v_balance from public.wallets where profile_id = v_uid;
  if v_balance <> v_open + 119100 then
    raise exception '2. balance after debit: expected %, got %', v_open + 119100, v_balance;
  end if;

  -- The row it wrote is an order, and cannot be anything else. 005 removed the
  -- client-supplied `p_ref_type`; this is what notices if it comes back.
  select ref_type into v_type
    from public.ledger
   where wallet_id = v_uid and kind = 'Tarot · Bhaktamar'
   order by created_at desc limit 1;
  if v_type <> 'order' then
    raise exception '2. wallet_debit wrote ref_type %, expected order', v_type;
  end if;

  ---------------------------------------------------------------------------
  -- 3. A debit larger than the balance is refused BY THE SERVER, with the
  --    exact string the front end has always shown, and writes nothing.
  ---------------------------------------------------------------------------
  -- Also relative: a fixed 500000 is affordable once the wallet holds more
  -- than that, and this assertion needs an amount that is always too large.
  v_res := public.wallet_debit(500000 + v_open, 'Report · Career');
  if (v_res ->> 'ok')::boolean is not false then
    raise exception '3. an unaffordable debit was allowed through';
  end if;
  if v_res ->> 'reason' <> 'Not enough balance' then
    raise exception '3. wrong refusal string: %', v_res ->> 'reason';
  end if;

  select balance_paise into v_balance from public.wallets where profile_id = v_uid;
  if v_balance <> v_open + 119100 then
    raise exception '3. a refused debit moved the balance to %', v_balance;
  end if;

  select count(*) into v_rows from public.ledger where wallet_id = v_uid;
  if v_rows <> v_openrows + 2 then
    raise exception '3. a refused debit left a ledger row: % rows, expected %', v_rows, v_openrows + 2;
  end if;

  ---------------------------------------------------------------------------
  -- 4. Nonsense amounts are refused before they reach the ledger.
  ---------------------------------------------------------------------------
  if (public.wallet_debit(-1000, 'Refund by another name') ->> 'ok')::boolean is not false then
    raise exception '4. a negative debit was accepted — that is a credit';
  end if;
  if (public.wallet_debit(0, 'Nothing') ->> 'ok')::boolean is not false then
    raise exception '4. a zero debit was accepted';
  end if;

  ---------------------------------------------------------------------------
  -- 5. History cannot be edited. Not by the client, not by the owner.
  ---------------------------------------------------------------------------
  v_raised := false;
  begin
    update public.ledger set delta_paise = 0 where wallet_id = v_uid;
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception '5. a ledger row was updated — the immutability trigger is not firing';
  end if;

  v_raised := false;
  begin
    delete from public.ledger where wallet_id = v_uid;
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception '5. a ledger row was deleted — the immutability trigger is not firing';
  end if;

  ---------------------------------------------------------------------------
  -- 6. A wallet cannot go negative even if a function written later gets its
  --    arithmetic wrong. This writes the ledger row directly, bypassing
  --    wallet_debit's check, so it is the storage-layer constraint under test.
  ---------------------------------------------------------------------------
  v_raised := false;
  begin
    insert into public.ledger (wallet_id, delta_paise, kind, ref_type)
    values (v_uid, -(v_open + 999999), 'Overdraft', 'adjustment');
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception '6. the wallet went negative';
  end if;

  ---------------------------------------------------------------------------
  -- 7. The check worth having: replay the ledger from zero and it reproduces
  --    the stored balance exactly. If this passes, most of the wallet is right.
  ---------------------------------------------------------------------------
  select coalesce(sum(delta_paise), 0) into v_replay
    from public.ledger where wallet_id = v_uid;
  select balance_paise into v_balance from public.wallets where profile_id = v_uid;
  if v_replay <> v_balance then
    raise exception '7. ledger replays to %, stored balance is % — the ledger is right and the balance is the bug',
                    v_replay, v_balance;
  end if;

  ---------------------------------------------------------------------------
  -- 8. The client has no write anywhere near either table.
  ---------------------------------------------------------------------------
  if has_table_privilege('authenticated', 'public.ledger', 'INSERT')
     or has_table_privilege('authenticated', 'public.ledger', 'UPDATE')
     or has_table_privilege('authenticated', 'public.ledger', 'DELETE') then
    raise exception '8. authenticated can write the ledger';
  end if;
  if has_table_privilege('authenticated', 'public.wallets', 'INSERT')
     or has_table_privilege('authenticated', 'public.wallets', 'UPDATE')
     or has_table_privilege('authenticated', 'public.wallets', 'DELETE') then
    raise exception '8. authenticated can write the balance';
  end if;

  -- Aborts the transaction, discarding every row above. This is the pass.
  raise exception 'PHASE 2 CHECKS PASSED';
end
$check$;
