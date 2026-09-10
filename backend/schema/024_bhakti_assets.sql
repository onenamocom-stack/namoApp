-- Forward-only — never edit once applied.
-- Bhakti: the devotional media library behind the second nav slot, where the
-- shrine used to sit. Wallpapers, ringtones, pooja tunes and bhajans.
--
-- ── THIS IS A LIBRARY, NOT A FEED ──────────────────────────────────────────
-- `content` (020) is a consultant publishing their own work under RLS scoped
-- to their UUID. This is the opposite shape: a small curated catalogue that
-- nobody in the client may write. There is no author column and no client
-- write policy, because there is no client writer — the rows are loaded by a
-- service-role script today (`backend/seed/bhakti.mjs`) and by the phase 13
-- admin console when it exists. `02-TRD.md` §7 is explicit that there is no
-- admin role in the client's RLS, and this table does not invent one.
--
-- ── ATTRIBUTION IS THREE COLUMNS AND ALL THREE ARE NOT NULL ────────────────
-- `mock.js` already splits artist / licence / source for the deity art, and
-- the reason is written there: it makes "which of these may go behind a
-- paywall" a query rather than a reading exercise. Phase 13's spec repeats it
-- as a hard requirement for the upload form — without these the app
-- accumulates assets that legally have to be deleted along with anything
-- derived from them.
--
-- It matters more here than it did there, because these files are DOWNLOADED
-- and some of them will later be SOLD. `licence` is what the paywall filter
-- reads: several of the existing deity images are CC BY-SA, and share-alike
-- behind a price is a problem you do not want to discover after taking money.
--
-- ── PRICE IS NULLABLE AND NULL MEANS FREE ──────────────────────────────────
-- Pricing is undecided (9 Sep 2026). A nullable column says "not priced yet"
-- honestly, where 0 would say "decided, and it is free" — and the screen can
-- tell the difference. When a price arrives it is `spend()` at the download,
-- in paise, like every other amount below the store's rupee boundary.

create table if not exists public.bhakti_assets (
  id          uuid primary key default gen_random_uuid(),

  -- What it is, which decides how the row renders and what the action says.
  -- A wallpaper is downloaded; the other three are played and downloaded.
  kind        text not null check (kind in ('wallpaper', 'ringtone', 'tune', 'bhajan')),

  title       text not null check (length(btrim(title)) > 0),

  -- Free text, not a foreign key. The deity list lives in the front end and
  -- is not a table; making this a reference would invent one to satisfy a
  -- filter chip. Null means "not tied to a deity" — a generic mantra.
  deity       text,

  -- Public URLs into the bucket below. `preview_url` is the still shown for
  -- an audio row; null for a wallpaper, which is its own preview.
  media_url   text not null,
  preview_url text,

  -- Paise, like every amount the server holds. NULL = free, see above.
  price_paise integer check (price_paise is null or price_paise > 0),

  -- Not optional. See the header.
  artist      text not null,
  licence     text not null,
  source      text not null,

  -- Soft withdrawal. Nothing is hard-deleted: a row may be referenced by a
  -- purchase once pricing exists, and by then it is a receipt.
  active      boolean not null default true,

  -- Ordering within a kind, so a curated list is not alphabetical by accident.
  sort        integer not null default 0,

  -- Idempotency key for the seed script, same trick as `content.legacy_id`.
  legacy_id   text unique,

  created_at  timestamptz not null default now()
);

comment on table public.bhakti_assets is
  'Curated devotional media. Service-role writes only; anon reads active rows.';

create index if not exists bhakti_assets_kind_idx
  on public.bhakti_assets (kind, sort) where active;

alter table public.bhakti_assets enable row level security;

-- Anyone may read what is active, signed in or not. There is nothing personal
-- in a row and the files themselves are public in the bucket — a policy that
-- required a session would only stop the marketing screenshot.
create policy "bhakti_assets_public_read"
  on public.bhakti_assets for select
  using (active);

-- No insert / update / delete policy, deliberately. RLS denies by default, so
-- the absence of a policy IS the rule: only the service role writes here.

-- ── The bucket ─────────────────────────────────────────────────────────────
-- A second bucket rather than reusing `content-media` (022), for one hard
-- reason and one soft one. Hard: 022's MIME allow-list is images and video
-- only, and it is applied — it cannot be edited under a forward-only rule.
-- Soft: its write policies scope every object to a folder named for the
-- writer's own UUID, which is exactly wrong for a curated library that has no
-- per-user owner.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bhakti-media',
  'bhakti-media',
  true,
  -- 15 MB. A wallpaper is ~2 MB and a bhajan a few more; this is generous for
  -- both and tight enough to refuse an album by accident.
  15728640,
  array[
    'image/jpeg', 'image/png', 'image/webp',
    -- The half 022 could not hold. m4a reports as audio/mp4.
    'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav'
  ]
)
on conflict (id) do nothing;

-- Public read, same reasoning as 022: the row pointing at the file is already
-- world-readable, so a signed URL would cost a round trip and buy nothing.
create policy "bhakti_media_public_read"
  on storage.objects for select
  using (bucket_id = 'bhakti-media');

-- No write policy. The seed script and the future admin console both use the
-- service role, which bypasses RLS; nothing in the browser uploads here.
