-- 032 — the signup trigger needs DATABASE defaults, not Django's
--
-- Symptom: "Database error saving new user" on every sign-up, 26 Sep 2026.
--
-- Cause: `handle_new_user` (003) inserts three columns —
--
--     insert into public.profiles (id, phone, name) values (...)
--
-- so every OTHER not-null column on `profiles` must have a default in the
-- DATABASE. Django ships defaults in Python: `AddField` adds the column
-- with a default and then issues `ALTER COLUMN ... DROP DEFAULT`, leaving
-- it NOT NULL with nothing behind it. The ORM fills the value on its own
-- inserts and never notices; a Postgres trigger inserting three columns
-- fails, and Supabase Auth reports that failure as the sentence above —
-- with no hint that a column is involved.
--
-- This is the second time. HANDOFF §10j restored the same defaults after
-- the migration to the new project ("without them `handle_new_user` and
-- the client-insert policies cannot function"); `video_enabled` arrived
-- with the moderation work on 23 Sep and reintroduced it.
--
-- So this file is a fix AND a check, and it is idempotent: run it after
-- any Django migration that touches `profiles`. Passing is silence.

alter table public.profiles alter column video_enabled  set default false;
alter table public.profiles alter column admin          set default false;
alter table public.profiles alter column birth_time_known set default false;
alter table public.profiles alter column created_at     set default now();

-- Wallets are on the same trigger and the same hazard.
alter table public.wallets alter column balance_paise set default 0;
alter table public.wallets alter column created_at    set default now();

-- And the check. `id`, `phone` and `name` are excluded because the trigger
-- supplies them; anything else without a default breaks sign-up.
do $$
declare missing text;
begin
  select string_agg(column_name, ', ' order by column_name) into missing
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and is_nullable = 'NO'
    and column_default is null
    and column_name not in ('id', 'phone', 'name');

  if missing is not null then
    raise exception
      'profiles has NOT NULL columns with no database default: %. '
      'handle_new_user inserts only (id, phone, name), so sign-up will fail '
      'with "Database error saving new user". Give each one a default.',
      missing;
  end if;

  select string_agg(column_name, ', ' order by column_name) into missing
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'wallets'
    and is_nullable = 'NO'
    and column_default is null
    and column_name not in ('profile_id');

  if missing is not null then
    raise exception
      'wallets has NOT NULL columns with no database default: %. '
      'handle_new_user inserts only (profile_id).', missing;
  end if;
end $$;
