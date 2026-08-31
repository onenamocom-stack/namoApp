-- Applied to Supabase via MCP. Forward-only — never edit once applied.
-- Phase 4 (docs/06-IMPLEMENTATION.md). Tables per docs/05-BACKEND-SCHEMA.md
-- §4.2–§4.4, RLS per §7, the public view per §9.
--
-- This is the phase where /pro stops being a costume. Consultant-ness is the
-- existence of a consultants row — there is no role column anywhere (§4.1).
-- `status` is the public-read predicate, which is why an admin feature ships
-- in v1: adding it later means revisiting every policy in this file.

-- ── Price bands: the platform's catalogue, not a typed number ───────────────
-- 01-PRD.md §4.1 — the platform sets bands and consultants choose one. Six
-- tiers, each carrying the three bookable lengths plus the per-minute rate for
-- an instant session. A price change is an INSERT here and a flip of `active`,
-- never a migration against live bookings: bookings freeze their own amount.

create table public.price_bands (
  id            uuid primary key default gen_random_uuid(),
  tier          smallint not null,        -- 1..6, the thing a consultant picks
  billing       text not null check (billing in ('fixed','per_minute')),
  duration_mins smallint not null check (duration_mins > 0),
  price_paise   integer not null check (price_paise >= 0),
  active        boolean not null default true,
  sort          smallint not null default 0,
  created_at    timestamptz not null default now(),
  unique (tier, billing, duration_mins)
);

-- Generated from the six prices the mock already charges (01-PRD.md:133), each
-- quoted against the 20-minute session. Every division below is exact in whole
-- paise — no rounding, no float, rule 1.
insert into public.price_bands (tier, billing, duration_mins, price_paise, sort)
select b.tier,
       'fixed',
       d.mins,
       (b.rupees * 100 * d.mins / 20)::integer,
       b.tier * 10
  from (values (1, 749), (2, 899), (3, 999), (4, 1299), (5, 1499), (6, 2200))
         as b(tier, rupees),
       (values (15), (20), (30)) as d(mins);

insert into public.price_bands (tier, billing, duration_mins, price_paise, sort)
select b.tier, 'per_minute', 1, (b.rupees * 100 / 20)::integer, b.tier * 10
  from (values (1, 749), (2, 899), (3, 999), (4, 1299), (5, 1499), (6, 2200))
         as b(tier, rupees);

-- ── Consultants ─────────────────────────────────────────────────────────────

create table public.consultants (
  profile_id         uuid primary key references public.profiles(id) on delete cascade,
  category           text not null,
  specialization     text,
  languages          text[] not null default '{}',
  experience_yrs     smallint,
  bio                text,
  credentials        text[] not null default '{}',
  status             text not null default 'pending'
                     check (status in ('pending','approved','blocked')),
  verified           boolean not null default false,
  -- The three named exceptions to §1.3. Throwaway, filled by a trigger from
  -- reviews (phase 9) and a nightly job (phase 14). Nothing reads them yet.
  rating_avg_cache   numeric(2,1),
  rating_count_cache integer not null default 0,
  rank_score_cache   numeric,
  legacy_id          text,
  created_at         timestamptz not null default now()
);

create index consultants_status_idx on public.consultants (status);

-- ── Services: the noun the front end was missing ────────────────────────────
-- Rule 3 is unobeyable without this. Today the browser computes
-- `price / SESSION.mins * duration` and sends the answer; with a service row
-- the client sends { consultantId, serviceId, startsAt } and the server reads
-- the price.
--
-- `band_id` and `billing` are additions to docs/05-BACKEND-SCHEMA.md §4.3,
-- which described one 20-minute row per consultant and no bands. Both billing
-- models are real as of phase 4: scheduled 15/20/30 sessions AND an instant
-- per-minute call. A per_minute row is duration_mins = 1 with price_paise as
-- the rate for one minute, so price_paise always means "the price of one unit
-- of duration_mins minutes" — one column, one meaning. Nothing meters yet;
-- the meter is phase 5/11.

create table public.consultant_services (
  id            uuid primary key default gen_random_uuid(),
  consultant_id uuid not null references public.consultants(profile_id) on delete cascade,
  band_id       uuid not null references public.price_bands(id),
  mode          text not null check (mode in ('call','chat','live','booking')),
  billing       text not null default 'fixed' check (billing in ('fixed','per_minute')),
  duration_mins smallint not null,
  price_paise   integer not null check (price_paise >= 0),
  active        boolean not null default true,
  sort          smallint not null default 0,
  created_at    timestamptz not null default now(),
  unique (consultant_id, mode, billing, duration_mins)
);

create index consultant_services_consultant_idx
  on public.consultant_services (consultant_id) where active;

-- ── Availability: one row per OPEN slot ─────────────────────────────────────
-- Not a range and not a boolean (§4.4). The UI is a literal 7 × 6 grid, so a
-- tap is one INSERT or one DELETE, and the table caps at 42 rows per
-- consultant. Ranges arrive the day arbitrary durations do.
--
-- `slot_time` is IST and the booking horizon is 14 days. Both are product
-- constants, named once in consultant_open_slots() (009) so they are not
-- invented three times — 05-BACKEND-SCHEMA.md:377-384.

create table public.consultant_availability (
  consultant_id uuid not null references public.consultants(profile_id) on delete cascade,
  weekday       smallint not null check (weekday between 0 and 6),
  slot_time     time not null,
  primary key (consultant_id, weekday, slot_time)
);

create table public.consultant_time_off (
  id            uuid primary key default gen_random_uuid(),
  consultant_id uuid not null references public.consultants(profile_id) on delete cascade,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  reason        text,
  constraint consultant_time_off_ordered check (ends_at > starts_at)
);

create index consultant_time_off_consultant_idx
  on public.consultant_time_off (consultant_id, starts_at);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Approval is enforced here, not in a screen. An unapproved consultant is
-- invisible to search AND to a typed URL, because the predicate is on the row.

alter table public.price_bands             enable row level security;
alter table public.consultants             enable row level security;
alter table public.consultant_services     enable row level security;
alter table public.consultant_availability enable row level security;
alter table public.consultant_time_off     enable row level security;

create policy "price_bands_select_active"
  on public.price_bands for select
  using (active);

-- Two SELECT policies, because they answer different questions: the world sees
-- approved consultants, and an applicant sees their own row while it is still
-- pending. Policies OR together, which is exactly the wanted behaviour.
create policy "consultants_select_approved"
  on public.consultants for select
  using (status = 'approved');

create policy "consultants_select_own"
  on public.consultants for select
  using (profile_id = auth.uid());

create policy "consultants_insert_own"
  on public.consultants for insert
  with check (profile_id = auth.uid());

create policy "consultants_update_own"
  on public.consultants for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "consultant_services_select_public"
  on public.consultant_services for select
  using (exists (select 1 from public.consultants c
                  where c.profile_id = consultant_id
                    and (c.status = 'approved' or c.profile_id = auth.uid())));

-- The band check lives in the policy rather than in a trigger or a function:
-- it is one EXISTS, it cannot be bypassed, and it is what makes "the platform
-- sets the price" true rather than merely rendered as six buttons.
--
-- EVERY COLUMN OF THE NEW ROW IS QUALIFIED, and that is not style. An
-- unqualified `billing` inside this subquery resolves to `b.billing` — the
-- inner scope wins — so the three comparisons become `b.x = b.x` and the whole
-- check silently passes anything with a valid band_id. The first draft of this
-- file shipped exactly that, and assertion 9 of 009_slots_check.sql caught it:
-- a consultant inserted a ₹1 session priced off a ₹749 band and the database
-- accepted it. A policy that is always true reads identically to one that
-- works.
create policy "consultant_services_write_own"
  on public.consultant_services for all
  using (consultant_id = auth.uid())
  with check (
    consultant_id = auth.uid()
    and exists (select 1 from public.price_bands b
                 where b.id            = consultant_services.band_id
                   and b.active
                   and b.billing       = consultant_services.billing
                   and b.duration_mins = consultant_services.duration_mins
                   and b.price_paise   = consultant_services.price_paise));

create policy "consultant_availability_select_public"
  on public.consultant_availability for select
  using (exists (select 1 from public.consultants c
                  where c.profile_id = consultant_id
                    and (c.status = 'approved' or c.profile_id = auth.uid())));

create policy "consultant_availability_write_own"
  on public.consultant_availability for all
  using (consultant_id = auth.uid())
  with check (consultant_id = auth.uid());

-- Time off is own-read as well as own-write: a seeker learns a slot is gone,
-- never why. The slots function subtracts it as the owner.
create policy "consultant_time_off_own"
  on public.consultant_time_off for all
  using (consultant_id = auth.uid())
  with check (consultant_id = auth.uid());

-- ── Grants ──────────────────────────────────────────────────────────────────
-- Supabase grants the full set on new public tables by default, so every
-- restriction below has to be taken away explicitly.

revoke insert, update, delete on public.price_bands from authenticated, anon;

-- Column-level, the 001_profiles.sql:34-41 pattern: RLS scopes *which row*,
-- this scopes *which columns*. Without it a signed-in applicant could set
-- status = 'approved' and verified = true on their own row — which is the
-- entire approval gate, given away.
revoke insert, update, delete on public.consultants from authenticated, anon;
grant insert (profile_id, category, specialization, languages,
              experience_yrs, bio, credentials)
  on public.consultants to authenticated;
grant update (category, specialization, languages,
              experience_yrs, bio, credentials)
  on public.consultants to authenticated;

revoke insert, update, delete on public.consultant_services     from anon;
revoke insert, update, delete on public.consultant_availability from anon;
revoke insert, update, delete on public.consultant_time_off     from anon;
revoke select on public.consultant_time_off from anon;

-- ── The public view ─────────────────────────────────────────────────────────
-- Public consultant fields come from a view, never by loosening profiles (§9).
-- It runs as its owner on purpose: profiles RLS is own-row-only, so an
-- invoker-rights view would return an empty name for every consultant but
-- yourself. The view's own WHERE is the access control, and it exposes eleven
-- safe columns and nothing else — no phone, no birth details, no status, no
-- legacy_id.

create view public.consultants_public as
  select c.profile_id, p.name, c.category, c.specialization, c.languages,
         c.experience_yrs, c.bio, c.credentials, c.verified,
         c.rating_avg_cache, c.rating_count_cache
    from public.consultants c
    join public.profiles p on p.id = c.profile_id
   where c.status = 'approved';

grant select on public.consultants_public to anon, authenticated;
