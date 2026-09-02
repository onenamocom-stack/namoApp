-- Phase 7. One table for every derivation freeastroapi.com computes for us.
--
-- Rule 8: store the input, compute the derivation. Birth details live in
-- `profiles`; a chart, a panchang and a daily horoscope are all functions of
-- them. This table is the function's memo, nothing more — truncating it costs
-- one refetch and loses no fact, which is what `_cache` in the name promises.
--
-- ONE table, not one per endpoint. There is nothing to say about a cached
-- chart that is not also true of a cached panchang, and three tables with
-- identical shapes is three migrations the next endpoint has to repeat.
--
-- NO TTL AND NO SWEEPER, deliberately. Every key carries every input that
-- produced its value — the profile and a digest of its birth fields for a
-- chart, the date and the place for a panchang. A value therefore cannot go
-- stale: change any input and the new key simply misses. Edited birth details
-- do not need invalidating, they need a different key, and they get one.
-- The cost is rows nobody reads again, which is a row.
--
-- The 5 req/sec ceiling on our tier is the reason this exists at all. A natal
-- chart never changes and four people opening /chart must not be four calls.

create table astro_cache (
  key        text primary key,
  payload    jsonb not null,
  fetched_at timestamptz not null default now()
);

-- RLS on and DELIBERATELY NO POLICY FOR ANYBODY. A table with RLS disabled is
-- a public table (INSTRUCTIONS.md rule 7); a table with RLS enabled and no
-- policy is reachable only by the service role, which is exactly the astro
-- Edge Function and nothing else. The browser never reads this — it asks the
-- function, which decides what the caller is allowed to have computed.
--
-- It matters more here than it looks: `payload` holds birth-derived output,
-- and the key holds a profile id. A read policy of any shape would be one
-- join away from one person's chart on another person's screen.
alter table astro_cache enable row level security;

comment on table astro_cache is
  'Memo for freeastroapi.com derivations. Throwaway: every key contains every input, so nothing here can go stale. Service role only.';
