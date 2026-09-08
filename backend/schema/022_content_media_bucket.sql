-- Forward-only — never edit once applied.
-- Phase 9, the storage half. Tables were 020; this is the bucket the studio
-- uploads into and the feed reads back.
--
-- ── PUBLIC BUCKET, AND WHY THAT IS THE RIGHT ANSWER HERE ────────────────────
-- `content-media` is public-read. That is deliberate and it is narrow: what
-- goes in it is content a consultant chose to publish to a feed that anyone
-- can scroll. A signed URL would buy nothing — the row pointing at the file is
-- already readable by anon through `content_public` — while costing a signing
-- round trip per card on a screen that renders twenty of them.
--
-- This is NOT the pattern for anything else. `kyc_documents` (phase 12) and
-- anything carrying a birth chart are private buckets with signed URLs, and
-- the fact that this one is public must not be read as the house default.
--
-- ── WRITES ARE SCOPED BY FOLDER, AND THE FOLDER IS THE OWNER'S UUID ─────────
-- Every object lives at `<auth.uid()>/<filename>`. The policies below compare
-- the first path segment to the caller's own ID, so a consultant can write and
-- replace their own files and nobody else's. That is the same shape as every
-- other write in this schema: the server decides whose row it is, and the
-- client's claim about identity is checked rather than believed (rule 3).
--
-- Deleting is allowed for your own files. Content rows are soft-deleted and
-- never hard-deleted (020), but a file is not evidence in the way a row is —
-- and a consultant who uploads the wrong photograph of themselves should not
-- need an administrator to take it down.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content-media',
  'content-media',
  true,
  -- 25 MB. A reel is the big case; this is generous for an image and tight
  -- enough that nobody uploads a feature film by accident. Enforced by storage
  -- itself, so a client that skips the check in the browser still cannot.
  26214400,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
)
on conflict (id) do nothing;

-- ── Policies on storage.objects, scoped to this bucket ──────────────────────

create policy "content_media_public_read"
  on storage.objects for select
  using (bucket_id = 'content-media');

create policy "content_media_insert_own_folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'content-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "content_media_update_own_folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'content-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'content-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "content_media_delete_own_folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'content-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
