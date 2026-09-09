-- Forward-only — never edit once applied.
-- Phase 9, immediately after 020. Should have been in it; 020 had already run
-- on dev when the database linter caught this, and a migration that has run
-- anywhere is history (INSTRUCTIONS §2), so it gets a file of its own.
--
-- Supabase exposes every function in `public` over PostgREST as
-- `/rest/v1/rpc/<name>`, and both of 020's functions are `security definer`.
-- That combination means anon and authenticated could call them directly:
--
--   refresh_rating_cache(uuid)      writes to consultants
--   reviews_touch_rating_cache()    a trigger body, never meant to be called
--
-- Neither can forge a rating — refresh recomputes from `reviews` and would only
-- ever write the truth. The objection is narrower and still worth acting on: a
-- `security definer` function that UPDATEs a table, reachable by anyone with
-- the anon key, is a write surface nothing needs. Rule 7 says the anon key is
-- only safe because of what it cannot reach.
--
-- The trigger keeps working. It runs as the definer with the table owner's
-- rights and does not consult these grants at all.

revoke execute on function public.refresh_rating_cache(uuid)      from anon, authenticated;
revoke execute on function public.reviews_touch_rating_cache()    from anon, authenticated;
