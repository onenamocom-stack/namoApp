-- Forward-only — never edit once applied.
-- Phase 9. This CORRECTS 021, which did not do what it said.
--
-- 021 ran `revoke execute ... from anon, authenticated` and reported success,
-- and the database linter went on flagging both functions. It was right to.
--
-- Postgres grants EXECUTE on a new function to the pseudo-role PUBLIC, and
-- neither `anon` nor `authenticated` ever held a grant of its own to take
-- away — so the revoke matched nothing and removed nothing, while both roles
-- kept the access they inherit from PUBLIC. The ACL said so the whole time:
--
--   =X/postgres            <- the PUBLIC grant, the one that mattered
--   postgres=X/postgres
--   service_role=X/postgres
--
-- A leading `=` with no role name before it is PUBLIC. Compare `wallet_debit`,
-- which carries an explicit `authenticated=X/postgres` because it is meant to
-- be called over RPC.
--
-- The lesson worth keeping: a revoke that succeeds is not a revoke that did
-- anything. Check the ACL, or the linter, rather than the absence of an error.

revoke execute on function public.refresh_rating_cache(uuid)   from public;
revoke execute on function public.reviews_touch_rating_cache() from public;

-- The trigger is unaffected: it runs as the definer with the table owner's
-- rights and never consults these grants.
