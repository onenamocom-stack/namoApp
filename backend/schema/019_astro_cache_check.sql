-- Phase 7 checks. A TEST, NOT A MIGRATION — do not include it in a replay.
--
-- Run in the SQL editor. It PASSES BY RAISING:
--   ERROR:  PHASE 7 CHECKS PASSED
-- which reads like a failure and is not. The raise rolls the whole thing back
-- so the rows written below never survive it. Any other error names the
-- assertion that broke.
--
-- Every count is RELATIVE (INSTRUCTIONS.md, and twice-learned). This runs
-- against a database with real rows in it and must not care how many.

do $$
declare
  before_rows  bigint;
  after_rows   bigint;
  policy_count int;
  rls_on       boolean;
  leaked       int;
begin
  select count(*) into before_rows from astro_cache;

  -- 1. The shape. `payload` is jsonb rather than text because the function
  --    stores what the API returned, and re-parsing a string on every read is
  --    a cost paid forever to save one column type.
  if (select count(*) from information_schema.columns
      where table_name = 'astro_cache'
        and column_name in ('key', 'payload', 'fetched_at')) <> 3 then
    raise exception 'astro_cache is missing one of key/payload/fetched_at';
  end if;

  -- 2. RLS is on. A table with RLS disabled is a public table, and this one
  --    holds birth-derived output keyed by profile id.
  select relrowsecurity into rls_on from pg_class where relname = 'astro_cache';
  if not rls_on then
    raise exception 'astro_cache has RLS disabled — it is a public table';
  end if;

  -- 3. And there is NO POLICY. This is the assertion that matters. RLS with a
  --    permissive policy would be worse than no table: one person's chart is
  --    one join from another person's screen. Service role only, forever.
  select count(*) into policy_count from pg_policies
    where tablename = 'astro_cache';
  if policy_count <> 0 then
    raise exception 'astro_cache has % policy(ies) — it must be service-role only', policy_count;
  end if;

  -- 4. A write lands, and the count moves by exactly one. Relative.
  insert into astro_cache (key, payload)
    values ('check:phase7:' || gen_random_uuid(), '{"probe":true}'::jsonb);

  select count(*) into after_rows from astro_cache;
  if after_rows <> before_rows + 1 then
    raise exception 'expected one new row, count moved by %', after_rows - before_rows;
  end if;

  -- 5. The same key twice is one row, not two. The function upserts on it, so
  --    a chart recomputed by two simultaneous readers must collapse rather
  --    than duplicate.
  begin
    insert into astro_cache (key, payload) values ('check:phase7:fixed', '{"a":1}'::jsonb);
    insert into astro_cache (key, payload) values ('check:phase7:fixed', '{"a":2}'::jsonb);
    raise exception 'a duplicate key was accepted — `key` is not the primary key';
  exception
    when unique_violation then null;   -- correct
  end;

  -- 6. What `authenticated` can see through RLS: nothing. Checked by asking
  --    Postgres directly rather than by trusting step 3 — a policy on a role
  --    we did not think to look for would pass step 3 and fail here.
  select count(*) into leaked from pg_policies
    where tablename = 'astro_cache'
      and ('authenticated' = any(roles) or 'anon' = any(roles) or 'public' = any(roles));
  if leaked <> 0 then
    raise exception 'astro_cache is readable by a client role';
  end if;

  raise exception 'PHASE 7 CHECKS PASSED';
end $$;
