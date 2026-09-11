-- The one runnable check for 025 (backend/INSTRUCTIONS.md §2, Testing).
-- Not a migration. Every row it writes is rolled back by the exception it
-- raises on the last line, which is also how it reports success.
--
--   Passing looks like:  ERROR:  SEEKER PUBLISHING CHECKS PASSED
--   Failing looks like:  ERROR:  <the assertion that broke>
--
-- Needs two profiles that are NOT consultants, and one approved consultant.
--
-- What it protects, in order of what it would cost to get wrong:
--
--   1. A seeker publishing a REEL. The kind gate is an RLS predicate rather
--      than a CHECK constraint, because it depends on another table — which
--      makes it exactly the sort of rule that looks enforced and is not.
--   2. A seeker publishing AS SOMEBODY ELSE.
--   3. A blocked consultant still reaching the feed. Widening the view to let
--      seekers in is the obvious place to lose that gate, because the old one
--      was an inner join and the new one cannot be.

do $check$
declare
  v_seeker uuid; v_other uuid; v_pro uuid; v_c uuid; v_n integer; v_ref boolean;
begin
  select p.id into v_seeker from public.profiles p
    left join public.consultants c on c.profile_id = p.id
   where c.profile_id is null limit 1;
  select p.id into v_other from public.profiles p
    left join public.consultants c on c.profile_id = p.id
   where c.profile_id is null and p.id <> v_seeker limit 1;
  select profile_id into v_pro from public.consultants where status = 'approved' limit 1;
  if v_seeker is null or v_other is null then
    raise exception 'needs two profiles that are not consultants';
  end if;
  if v_pro is null then raise exception 'needs one approved consultant'; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_seeker, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. a seeker may post a photo and a blog post
  insert into public.content (author_id, kind, caption, status, published_at)
       values (v_seeker, 'post', 'a photo', 'live', now()) returning id into v_c;
  insert into public.content (author_id, kind, title, body, status, published_at)
       values (v_seeker, 'article', 't', 'b', 'live', now());

  -- 2. and may NOT post a reel
  v_ref := false;
  begin
    insert into public.content (author_id, kind, caption, status, published_at)
         values (v_seeker, 'clip', 'a reel', 'live', now());
  exception when insufficient_privilege or check_violation then v_ref := true;
  end;
  if not v_ref then raise exception '2. a seeker published a REEL'; end if;

  -- 3. and may not publish as somebody else
  v_ref := false;
  begin
    insert into public.content (author_id, kind, caption, status, published_at)
         values (v_other, 'post', 'not mine', 'live', now());
  exception when insufficient_privilege or check_violation then v_ref := true;
  end;
  if not v_ref then raise exception '3. a seeker published as another person'; end if;

  -- 4. the post is public, and labelled as not being a consultant's
  select count(*) into v_n from public.content_public
   where id = v_c and author_is_consultant = false;
  if v_n <> 1 then raise exception '4. seeker post not public / mislabelled (%)', v_n; end if;
  reset role;

  -- 5. an approved consultant still publishes reels
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.content (author_id, kind, caption, status, published_at)
       values (v_pro, 'clip', 'a real reel', 'live', now());
  reset role;

  -- 6. following a PERSON moves both counts
  insert into public.reactions (actor_id, target_type, target_id, kind)
       values (v_other, 'profile', v_seeker, 'follow');
  select follower_count into v_n from public.profile_follow_counts where profile_id = v_seeker;
  if v_n <> 1 then raise exception '6. follower_count is % for one follower', v_n; end if;
  select following_count into v_n from public.profile_follow_counts where profile_id = v_other;
  if v_n <> 1 then raise exception '6. following_count is % for one follow', v_n; end if;

  -- 6b. and publishing is what puts them in authors_public, which is the only
  -- place a seeker's name is readable by anybody else.
  select count(*) into v_n from public.authors_public where id = v_seeker;
  if v_n <> 1 then raise exception '6b. a published author is not in authors_public'; end if;

  -- 7. a blocked consultant is still kept out of the feed
  update public.consultants set status = 'blocked' where profile_id = v_pro;
  select count(*) into v_n from public.content_public where author_id = v_pro;
  if v_n <> 0 then raise exception '7. a BLOCKED consultant still publishes (% rows)', v_n; end if;

  raise exception 'SEEKER PUBLISHING CHECKS PASSED';
end $check$;
