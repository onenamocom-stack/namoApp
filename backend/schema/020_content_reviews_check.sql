-- The one runnable check for phase 9 (backend/INSTRUCTIONS.md §2, Testing).
-- Not a migration. Safe to run against any database at any time: every row it
-- writes is rolled back by the exception it raises on the last line, which is
-- also how it reports success.
--
--   Passing looks like:  ERROR:  PHASE 9 CHECKS PASSED
--   Failing looks like:  ERROR:  <the assertion that broke>
--
-- It needs at least TWO profiles and turns the second into an approved
-- consultant for the duration of the transaction. Every count is RELATIVE, so
-- it survives a database with real content in it.
--
-- What it is actually protecting, in order of how much it would cost to get
-- wrong:
--
--   1. A review with no completed booking behind it. This is the phase's third
--      done-condition and the entire anti-fraud story. A marketplace whose
--      five-star reviews can be typed by anyone is worth less than one with no
--      reviews at all, because the honest signal is gone too.
--   2. The rating cache disagreeing with the reviews under it. §1.3 permits a
--      cache only where it is reproducible from its source; a cache that can
--      drift is the bug that section exists to prevent.
--   3. A stranger reading someone else's reactions — who follows whom.

do $check$
declare
  v_seeker    uuid;
  v_pro       uuid;
  v_pro_prev  text;
  v_content   uuid;
  v_draft     uuid;
  v_booking   uuid;
  v_review    uuid;
  v_svc       uuid;
  v_n         integer;
  v_avg       numeric;
  v_cnt       integer;
  v_followers bigint;
  v_refused   boolean;
begin
  select id into v_seeker from public.profiles order by created_at limit 1;
  select id into v_pro    from public.profiles where id <> v_seeker order by created_at limit 1;
  if v_seeker is null or v_pro is null then
    raise exception 'needs two profiles; this database has fewer';
  end if;

  -- Make the second profile an approved consultant for this transaction.
  insert into public.consultants (profile_id, category, status)
       values (v_pro, 'Astrologer', 'approved')
  on conflict (profile_id) do update set status = 'approved'
    returning status into v_pro_prev;

  -- ── 1. Content is visible to the public only while live AND approved ──────
  insert into public.content (consultant_id, kind, title, body, status, published_at)
       values (v_pro, 'article', 'A check wrote this', 'Body.', 'live', now())
    returning id into v_content;

  insert into public.content (consultant_id, kind, title, body, status)
       values (v_pro, 'article', 'Not published', 'Body.', 'draft')
    returning id into v_draft;

  select count(*) into v_n from public.content_public where id = v_content;
  if v_n <> 1 then raise exception '1. live content is missing from content_public'; end if;

  select count(*) into v_n from public.content_public where id = v_draft;
  if v_n <> 0 then raise exception '1. a DRAFT leaked into content_public'; end if;

  -- A blocked consultant's posts leave the public feed with them.
  update public.consultants set status = 'blocked' where profile_id = v_pro;
  select count(*) into v_n from public.content_public where id = v_content;
  if v_n <> 0 then raise exception '1. a BLOCKED consultant is still publishing'; end if;
  update public.consultants set status = 'approved' where profile_id = v_pro;

  -- ── 2. Counts are queries, and they start honest ──────────────────────────
  select like_count into v_n from public.content_public where id = v_content;
  if v_n <> 0 then raise exception '2. a brand-new post already has % likes', v_n; end if;

  insert into public.reactions (actor_id, target_type, target_id, kind)
       values (v_seeker, 'content', v_content, 'like');
  select like_count into v_n from public.content_public where id = v_content;
  if v_n <> 1 then raise exception '2. one like counted as %', v_n; end if;

  -- Reacting twice is the same row, not two.
  begin
    insert into public.reactions (actor_id, target_type, target_id, kind)
         values (v_seeker, 'content', v_content, 'like');
    raise exception '2. the same like was accepted twice';
  exception when unique_violation then null;
  end;

  select follower_count into v_followers
    from public.consultant_follower_counts where consultant_id = v_pro;
  if v_followers <> 0 then
    raise exception '2. a consultant with no followers reports %', v_followers;
  end if;

  insert into public.reactions (actor_id, target_type, target_id, kind)
       values (v_seeker, 'consultant', v_pro, 'follow');
  select follower_count into v_followers
    from public.consultant_follower_counts where consultant_id = v_pro;
  if v_followers <> 1 then raise exception '2. one follower counted as %', v_followers; end if;

  -- ── 3. THE ANTI-FRAUD RULE ────────────────────────────────────────────────
  -- Asserted as the seeker, through RLS, because the policy is the enforcement.
  -- The service role used above bypasses it entirely, which is what a seed
  -- needs and what a test must not accidentally rely on.

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_seeker, 'role', 'authenticated')::text,
                     true);
  set local role authenticated;

  -- No booking at all.
  v_refused := false;
  begin
    insert into public.reviews (seeker_id, consultant_id, rating, body)
         values (v_seeker, v_pro, 5, 'Never met them.');
  exception when insufficient_privilege or check_violation then v_refused := true;
  end;
  if not v_refused then
    raise exception '3. a review with NO booking was accepted';
  end if;

  reset role;

  -- A booking that exists but is not completed. The service is built here from
  -- an active band rather than assumed: consultant_services requires a band and
  -- a fresh consultant has none, and a check that silently skipped this step
  -- would insert a NULL service_id and fail for the wrong reason.
  select id into v_svc from public.consultant_services
   where consultant_id = v_pro and billing = 'fixed' limit 1;

  if v_svc is null then
    insert into public.consultant_services
           (consultant_id, band_id, mode, billing, duration_mins, price_paise)
    select v_pro, b.id, 'booking', 'fixed', b.duration_mins, b.price_paise
      from public.price_bands b
     where b.active and b.billing = 'fixed'
     order by b.duration_mins limit 1
    returning id into v_svc;
  end if;

  insert into public.bookings (seeker_id, consultant_id, service_id, starts_at,
                               duration_mins, amount_paise, mode, status)
       values (v_seeker, v_pro, v_svc, now() + interval '1 day', 20, 100000,
               'booking', 'pending')
    returning id into v_booking;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_seeker, 'role', 'authenticated')::text,
                     true);
  set local role authenticated;

  v_refused := false;
  begin
    insert into public.reviews (booking_id, seeker_id, consultant_id, rating, body)
         values (v_booking, v_seeker, v_pro, 5, 'Booked but not seen.');
  exception when insufficient_privilege or check_violation then v_refused := true;
  end;
  if not v_refused then
    raise exception '3. a review against a PENDING booking was accepted';
  end if;

  reset role;

  -- The same booking, completed. Now it must go in.
  update public.bookings set status = 'completed' where id = v_booking;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_seeker, 'role', 'authenticated')::text,
                     true);
  set local role authenticated;

  insert into public.reviews (booking_id, seeker_id, consultant_id, rating, body)
       values (v_booking, v_seeker, v_pro, 4, 'Turned a vague panic into a plan.')
    returning id into v_review;

  reset role;

  if v_review is null then raise exception '3. a legitimate review was refused'; end if;

  -- One booking, one review.
  v_refused := false;
  begin
    insert into public.reviews (booking_id, seeker_id, consultant_id, rating)
         values (v_booking, v_seeker, v_pro, 1);
  exception when unique_violation then v_refused := true;
  end;
  if not v_refused then raise exception '3. one booking bought TWO reviews'; end if;

  -- ── 4. `verified` is derived, never stored ────────────────────────────────
  select count(*) into v_n
    from public.reviews_public where id = v_review and verified;
  if v_n <> 1 then raise exception '4. a review with a booking is not marked verified'; end if;

  -- A seeded review with no booking is visible but NOT verified.
  insert into public.reviews (seeker_id, consultant_id, rating, body)
       values (v_seeker, v_pro, 5, 'Seeded, no booking.');
  select count(*) into v_n
    from public.reviews_public where consultant_id = v_pro and not verified;
  if v_n <> 1 then raise exception '4. an unverified review is not distinguished'; end if;

  -- ── 5. The rating cache reproduces the reviews under it ───────────────────
  -- The §1.3 rule: a cache is only allowed where replaying its source
  -- reproduces it. Two reviews now, 4 and 5, so the average is 4.5.
  select rating_avg_cache, rating_count_cache into v_avg, v_cnt
    from public.consultants where profile_id = v_pro;
  if v_cnt <> 2 then raise exception '5. rating_count_cache says % for 2 reviews', v_cnt; end if;
  if v_avg <> 4.5 then raise exception '5. rating_avg_cache says % for 4 and 5', v_avg; end if;

  -- Removing one moves the cache; the count never counts removed rows.
  update public.reviews set status = 'removed' where id = v_review;
  select rating_avg_cache, rating_count_cache into v_avg, v_cnt
    from public.consultants where profile_id = v_pro;
  if v_cnt <> 1 then raise exception '5. a removed review still counts (%)', v_cnt; end if;
  if v_avg <> 5.0 then raise exception '5. cache did not follow the removal (%)', v_avg; end if;

  -- And the removed one leaves the public view.
  select count(*) into v_n from public.reviews_public where id = v_review;
  if v_n <> 0 then raise exception '5. a REMOVED review is still public'; end if;

  -- ── 6. A stranger reads counts, never who is behind them ──────────────────
  perform set_config('request.jwt.claims',
                     json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text,
                     true);
  set local role authenticated;

  select count(*) into v_n from public.reactions where target_id = v_content;
  if v_n <> 0 then raise exception '6. a stranger read % reaction rows', v_n; end if;

  select count(*) into v_n from public.reactions where target_id = v_pro;
  if v_n <> 0 then raise exception '6. a stranger read who follows whom'; end if;

  -- but the aggregate is still public
  select follower_count into v_followers
    from public.consultant_follower_counts where consultant_id = v_pro;
  if v_followers <> 1 then raise exception '6. the follower COUNT should stay public'; end if;

  -- and a stranger cannot publish as somebody else
  v_refused := false;
  begin
    insert into public.content (consultant_id, kind, title, status)
         values (v_pro, 'post', 'Not mine to write', 'live');
  exception when insufficient_privilege or check_violation then v_refused := true;
  end;
  if not v_refused then raise exception '6. a stranger published as the consultant'; end if;

  reset role;

  -- Aborts the transaction, discarding every row above. This is the pass.
  raise exception 'PHASE 9 CHECKS PASSED';
end
$check$;
