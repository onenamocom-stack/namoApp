-- Forward-only — never edit once applied.
-- Bhakti, second pass. Two changes to `kind`, both driven by what the screen
-- turned out to need once it was on a phone.
--
-- ── RINGTONES AND POOJA TUNES ARE THE SAME THING ───────────────────────────
-- 024 split them because the brief listed them separately. They are one file
-- doing one job: a short devotional audio clip you save and then pick in your
-- phone's sound settings. Two kinds meant two tabs holding the same rows and a
-- curator having to guess which bucket a track belonged in. `tune` absorbs
-- `ringtone`.
--
-- ── STATUS IS A NEW KIND, NOT A SCREEN ─────────────────────────────────────
-- WhatsApp status artwork was a composer card bolted above the kind switcher,
-- outside the kind system entirely, working off "the first wallpaper row" as
-- its image. It is a curated kind like the others now, and it leads — it is
-- the thing people open Bhakti to do daily.
--
-- ── ORDER MATTERS ──────────────────────────────────────────────────────────
-- The data update runs BEFORE the constraint is narrowed. Adding a CHECK
-- validates every existing row, so a surviving `ringtone` row would fail the
-- migration. There are none on dev today, which makes step 1 a no-op there and
-- exactly the thing that saves this on a database where it is not.
--
-- The constraint name is not guessed: 024 wrote it inline and anonymous, so
-- Postgres auto-named it. Confirmed on dev via `pg_constraint` before writing
-- this file.

update public.bhakti_assets set kind = 'tune' where kind = 'ringtone';

alter table public.bhakti_assets drop constraint bhakti_assets_kind_check;

alter table public.bhakti_assets
  add constraint bhakti_assets_kind_check
  check (kind in ('status', 'wallpaper', 'tune', 'bhajan'));

comment on column public.bhakti_assets.kind is
  'status = WhatsApp status artwork, wallpaper = an image to save, tune = a short devotional clip (ringtones live here too), bhajan = a full track.';
