-- The one runnable check for phase 4 (backend/INSTRUCTIONS.md §2, Testing).
-- Not a migration. Safe to run against any database at any time: every row it
-- writes is rolled back by the exception it raises on the last line, which is
-- also how it reports success.
--
--   Passing looks like:  ERROR:  PHASE 4 CHECKS PASSED
--   Failing looks like:  ERROR:  <the assertion that broke>
--
-- It needs at least one profile to exist, and it turns that profile into a
-- consultant for the duration of the transaction.
--
-- **Every count here is RELATIVE**, and it has to be. The first version
-- asserted absolute numbers — "a day with six open slots returns six" — which
-- was true for exactly as long as the database was empty. The moment the seed
-- gave that consultant real bookings, the check failed and blamed the code. A
-- check that cannot run twice is not a check; the phase 2 file learned this
-- first and says so.
--
-- Assertion 5 is the one worth having: it runs the same subtraction on all
-- seven weekdays, which is exactly what the Thursday-only bug passed on one
-- day and failed on six.

do $check$
declare
  v_uid   uuid;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_date  date;
  v_slots time[] := array['09:30','11:00','13:30','16:00','18:30','20:00']::time[];
  v_t     time;
  v_pick  time;
  v_n     integer;
  v_base  integer;
  v_d     integer;
  v_at    timestamptz;
  v_book  uuid;
  v_svc   uuid;
  v_refused boolean := false;
begin
  select id into v_uid from public.profiles order by created_at limit 1;
  if v_uid is null then
    raise exception 'no profile to test against — sign one up first';
  end if;

  -- A consultant, approved, open at all six times on all seven days. Existing
  -- rows are left alone; this only widens.
  insert into public.consultants (profile_id, category, status, legacy_id)
  values (v_uid, 'Astrologer', 'approved', 'check:phase4')
  on conflict (profile_id) do update set status = 'approved';

  for v_d in 0..6 loop
    foreach v_t in array v_slots loop
      insert into public.consultant_availability (consultant_id, weekday, slot_time)
      values (v_uid, v_d, v_t) on conflict do nothing;
    end loop;
  end loop;

  -- A service to point bookings at. Any active band row will do.
  insert into public.consultant_services (consultant_id, band_id, mode, billing,
                                          duration_mins, price_paise)
  select v_uid, b.id, 'call', 'fixed', b.duration_mins, b.price_paise
    from public.price_bands b
   where b.billing = 'fixed' and b.duration_mins = 20 and b.active
   order by b.tier limit 1
  on conflict do nothing;

  select id into v_svc from public.consultant_services
   where consultant_id = v_uid and billing = 'fixed' limit 1;

  ---------------------------------------------------------------------------
  -- 1. A day offers something, and every time it offers is one this
  --    consultant actually opened.
  ---------------------------------------------------------------------------
  v_date := v_today + 1;
  select count(*) into v_base from public.consultant_open_slots(v_uid, v_date);
  if v_base < 2 then
    raise exception '1. a fully open day offered % slots', v_base;
  end if;
  if exists (select 1 from public.consultant_open_slots(v_uid, v_date) o
              where not exists (select 1 from public.consultant_availability a
                                 where a.consultant_id = v_uid
                                   and a.weekday = extract(dow from v_date)::smallint
                                   and a.slot_time = o.slot_time)) then
    raise exception '1. a slot was offered that is not in the availability rules';
  end if;

  ---------------------------------------------------------------------------
  -- 2. A pending booking removes exactly its own slot, and nothing else. The
  --    claim is at pending, not at confirmed.
  ---------------------------------------------------------------------------
  select slot_time into v_pick from public.consultant_open_slots(v_uid, v_date) limit 1;
  v_at := ((v_date + v_pick) at time zone 'Asia/Kolkata');

  insert into public.bookings (seeker_id, consultant_id, service_id, starts_at,
                               duration_mins, amount_paise, mode, status)
  select v_uid, v_uid, v_svc, v_at, s.duration_mins, s.price_paise, 'call', 'pending'
    from public.consultant_services s where s.id = v_svc
  returning id into v_book;

  select count(*) into v_n from public.consultant_open_slots(v_uid, v_date);
  if v_n <> v_base - 1 then
    raise exception '2. a pending booking took % slots, expected 1', v_base - v_n;
  end if;
  if exists (select 1 from public.consultant_open_slots(v_uid, v_date)
              where slot_time = v_pick) then
    raise exception '2. the booked slot % is still on offer', v_pick;
  end if;

  ---------------------------------------------------------------------------
  -- 3. A declined booking frees its slot again.
  ---------------------------------------------------------------------------
  update public.bookings set status = 'declined' where id = v_book;
  select count(*) into v_n from public.consultant_open_slots(v_uid, v_date);
  if v_n <> v_base then
    raise exception '3. a declined booking still holds its slot: % of %', v_n, v_base;
  end if;

  ---------------------------------------------------------------------------
  -- 4. Time off removes the slots inside it, and only those.
  ---------------------------------------------------------------------------
  insert into public.consultant_time_off (consultant_id, starts_at, ends_at, reason)
  values (v_uid,
          ((v_date + v_pick) at time zone 'Asia/Kolkata') - interval '1 minute',
          ((v_date + v_pick) at time zone 'Asia/Kolkata') + interval '1 minute',
          'check');
  select count(*) into v_n from public.consultant_open_slots(v_uid, v_date);
  if v_n <> v_base - 1 then
    raise exception '4. time off over one slot removed %, expected 1', v_base - v_n;
  end if;
  delete from public.consultant_time_off where consultant_id = v_uid and reason = 'check';

  ---------------------------------------------------------------------------
  -- 5. THE ONE THAT MATTERS. The same subtraction on every weekday.
  --    The bug this phase closes applied booked slots only when the day was
  --    Thursday, so it passed on the day it was written and nowhere else.
  ---------------------------------------------------------------------------
  for v_d in 1..7 loop
    v_date := v_today + v_d;
    select count(*) into v_base from public.consultant_open_slots(v_uid, v_date);
    if v_base = 0 then
      raise exception '5. % (dow %) offered nothing to test with',
                      to_char(v_date, 'Day'), extract(dow from v_date);
    end if;

    select slot_time into v_pick from public.consultant_open_slots(v_uid, v_date) limit 1;
    v_at := ((v_date + v_pick) at time zone 'Asia/Kolkata');

    insert into public.bookings (seeker_id, consultant_id, service_id, starts_at,
                                 duration_mins, amount_paise, mode, status)
    select v_uid, v_uid, v_svc, v_at, s.duration_mins, s.price_paise, 'call', 'confirmed'
      from public.consultant_services s where s.id = v_svc;

    select count(*) into v_n from public.consultant_open_slots(v_uid, v_date);
    if v_n <> v_base - 1 then
      raise exception '5. % (dow %) went from % open to % with one booked',
                      to_char(v_date, 'Day'), extract(dow from v_date), v_base, v_n;
    end if;
    if exists (select 1 from public.consultant_open_slots(v_uid, v_date)
                where slot_time = v_pick) then
      raise exception '5. % (dow %) still offers the booked slot %',
                      to_char(v_date, 'Day'), extract(dow from v_date), v_pick;
    end if;
  end loop;

  ---------------------------------------------------------------------------
  -- 6. An unapproved consultant has no slots at all. The approval gate,
  --    checked where it is enforced rather than where it is rendered.
  ---------------------------------------------------------------------------
  update public.consultants set status = 'pending' where profile_id = v_uid;
  select count(*) into v_n from public.consultant_open_slots(v_uid, v_today + 1);
  if v_n <> 0 then
    raise exception '6. a pending consultant offered % slots', v_n;
  end if;
  update public.consultants set status = 'approved' where profile_id = v_uid;

  ---------------------------------------------------------------------------
  -- 7. The horizon holds at both ends.
  ---------------------------------------------------------------------------
  select count(*) into v_n from public.consultant_open_slots(v_uid, v_today + 15);
  if v_n <> 0 then
    raise exception '7. a date past the 14-day horizon returned % slots', v_n;
  end if;
  select count(*) into v_n from public.consultant_open_slots(v_uid, v_today - 1);
  if v_n <> 0 then
    raise exception '7. yesterday returned % slots', v_n;
  end if;

  ---------------------------------------------------------------------------
  -- 8. The client cannot approve itself, cannot rewrite an amount, and cannot
  --    write a booking. All three are grants, not policies — a policy scopes
  --    which row, a grant scopes which column.
  ---------------------------------------------------------------------------
  if has_column_privilege('authenticated', 'public.consultants', 'status', 'UPDATE')
     or has_column_privilege('authenticated', 'public.consultants', 'verified', 'UPDATE') then
    raise exception '8. a consultant can approve themselves';
  end if;
  if has_table_privilege('authenticated', 'public.bookings', 'INSERT') then
    raise exception '8. the client can write a booking directly';
  end if;
  if has_column_privilege('authenticated', 'public.bookings', 'amount_paise', 'UPDATE') then
    raise exception '8. the client can rewrite a booking amount';
  end if;
  if has_table_privilege('authenticated', 'public.price_bands', 'INSERT')
     or has_table_privilege('authenticated', 'public.price_bands', 'UPDATE') then
    raise exception '8. the client can write the price catalogue';
  end if;

  ---------------------------------------------------------------------------
  -- 9. A service priced off no band is refused by the policy, not by the UI —
  --    and the honest one still goes through. Run as the signed-in user,
  --    because that is who the policy is about.
  ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_uid, 'role', 'authenticated')::text,
                     true);
  set local role authenticated;

  begin
    insert into public.consultant_services (consultant_id, band_id, mode, billing,
                                            duration_mins, price_paise)
    select v_uid, b.id, 'chat', 'fixed', b.duration_mins, 100
      from public.price_bands b where b.active limit 1;
  exception
    when insufficient_privilege then v_refused := true;   -- the policy refused
  end;

  insert into public.consultant_services (consultant_id, band_id, mode, billing,
                                          duration_mins, price_paise)
  select v_uid, b.id, 'live', b.billing, b.duration_mins, b.price_paise
    from public.price_bands b
   where b.active and b.billing = 'fixed' and b.duration_mins = 20
   order by b.tier limit 1
  on conflict do nothing;
  get diagnostics v_n = row_count;
  reset role;

  if not v_refused then
    raise exception '9. a consultant typed their own price and it was accepted';
  end if;
  if v_n <> 1 then
    raise exception '9. a service priced straight off a band was refused';
  end if;

  -- Aborts the transaction, discarding every row above. This is the pass.
  raise exception 'PHASE 4 CHECKS PASSED';
end
$check$;
