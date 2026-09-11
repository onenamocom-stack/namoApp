-- Forward-only — never edit once applied.
-- Profile pictures. Your own, on your own screens.
--
-- ── THE GRANT IS NOT OPTIONAL AND IT FAILS SILENTLY ────────────────────────
-- `001_profiles.sql` revokes UPDATE on this table and re-grants it column by
-- column, so that a signed-in client can never grant itself `admin` or
-- repoint its own `phone` identity. That allow-list does not know about
-- columns added later.
--
-- So a bare `add column` here would produce a column the owner can read and
-- cannot write: `profiles_update_own` passes, the UPDATE is then refused at
-- the privilege layer, and PostgREST reports success with zero rows matched.
-- The upload appears to work and the avatar never changes. `002` had to
-- re-grant for `email` for exactly this reason; this is the same move.
--
-- ── WHAT THIS DELIBERATELY DOES NOT DO ─────────────────────────────────────
-- It does not make anybody else's face readable. `profiles_select_own` is
-- `using (id = auth.uid())` and stays that way — a profile row carries a
-- phone number, an email and a birth time, and widening that policy to show a
-- picture would expose all of it.
--
-- Most of the app's avatars are OTHER people: a consultant in the roster, the
-- other party in a chat, a seeker on a pro's booking card. Those need a
-- narrow public projection, and one already exists in flight —
-- `authors_public` (025) — so this migration does not invent a second answer
-- to the same question. Adding `avatar_url` to that view is the follow-up,
-- and it belongs to whoever owns 025.
--
-- ── STORAGE ────────────────────────────────────────────────────────────────
-- The file goes in `content-media` (022), which already allows the image MIME
-- types, is public-read, and scopes every write to a folder named for the
-- writer's own uuid — which is exactly avatar semantics and needed no change.

alter table public.profiles
  add column if not exists avatar_url text;

grant update (avatar_url) on public.profiles to authenticated;

comment on column public.profiles.avatar_url is
  'Public URL into content-media. Own-row read only; other people''s faces need a public projection, not a wider policy on this table.';
