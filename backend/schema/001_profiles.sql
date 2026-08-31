-- Applied to Supabase via MCP. Forward-only — never edit once applied.
-- See docs/05-BACKEND-SCHEMA.md §4.1 (columns) and §7 (RLS) for the reasoning.

create table public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  phone             text unique not null,
  name              text not null,
  birth_date        date,
  birth_time        time,
  birth_time_known  boolean not null default false,
  birth_place       text,
  birth_lat         numeric(9,6),
  birth_lon         numeric(9,6),
  birth_zone        text,               -- IANA, e.g. 'Asia/Kolkata'. Never a timestamptz,
                                         -- never a stored UTC offset — see docs/05-BACKEND-SCHEMA.md §4.1.
  admin             boolean not null default false,
  legacy_id         text,
  created_at        timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid());

-- No INSERT policy for the client, by design (docs/05-BACKEND-SCHEMA.md §7).
-- Row creation happens server-side, below, when auth.users gets a new row.

-- Column-level grant: the client's UPDATE may only touch the fields it
-- legitimately owns. `admin`, `phone`, `legacy_id`, `id`, `created_at` stay
-- out of client reach even on the client's own row — the RLS policy scopes
-- *which row*, this scopes *which columns*, so a signed-in client can never
-- grant itself admin or silently repoint its own phone identity.
revoke update on public.profiles from authenticated;
grant update (name, birth_date, birth_time, birth_time_known, birth_place, birth_lat, birth_lon, birth_zone)
  on public.profiles to authenticated;

-- Creates the profiles row the instant a phone signs up, using the name
-- passed as auth metadata during signInWithOtp. The client then only ever
-- UPDATEs this row (see the grant above) — it never INSERTs one.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, phone, name)
  values (new.id, new.phone, coalesce(new.raw_user_meta_data ->> 'name', 'there'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger-only function: not meant to be called as a client RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
