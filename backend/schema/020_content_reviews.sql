-- Forward-only — never edit once applied.
-- Phase 9 (docs/06-IMPLEMENTATION.md). Tables per docs/05-BACKEND-SCHEMA.md
-- §5.1-§5.4, RLS per §7, indexes per §8.
--
-- Four tables and no fifth: content, reactions, reviews, feed_pins.
--
-- ── WHY THE FEED IS NOT A TABLE ─────────────────────────────────────────────
-- The mock has a `feed` export — 14 hand-ordered {kind, refId} rows — and the
-- obvious wrong inference is that the database needs one. A feed table is a
-- ranking system and there is no ranking (§5.3). The feed is a query over
-- `content` ordered by published_at, plus `feed_pins` for editorial override
-- from the admin console that phase 13 builds.
--
-- Two of the mock feed's rows never reach this table at all: `refId: 'today'`
-- points at a KEY OF `days`, not an ID, and Home.jsx already hoists the reading
-- and panchang cards in the component. Those stay client-side and always were
-- client-side. Seeding them would be inventing content that does not exist.
--
-- ── WHY FOUR MOCK EXPORTS BECOME ONE TABLE ──────────────────────────────────
-- `posts`, `reads`, `clips` and `liveSessions` overlap by roughly 90%:
-- consultant, title, body, media, timestamp, status. Merged (§5.2), where the
-- seven SELLABLE things are deliberately kept separate. The deciding factor is
-- the overlap, not the pattern — it is the same question answered the opposite
-- way for the opposite reason, and both answers are right.
--
-- The payoff is admin item 6: removing a post is one status column rather than
-- three. `status = 'removed'` is a SOFT DELETE. A removed post in a dispute is
-- evidence, so nothing here hard-deletes content, ever.
--
-- ── WHAT THIS MIGRATION REFUSES TO STORE ────────────────────────────────────
-- No like_count, follower_count or view-count-as-truth column. §1.3 allows
-- exactly one cached aggregate in this database (wallets.balance_paise) plus
-- the two named rating caches. Counts are queries, through the views at the
-- bottom of this file. The mock is the argument: four of its stored totals
-- already contradict their own line items inside one file written in one
-- sitting, and 84,200 followers against zero rows is the same lie at scale.

-- ════════════════════════════════════════════════════════════════════════════
-- CONTENT
-- ════════════════════════════════════════════════════════════════════════════

create table public.content (
  id            uuid primary key default gen_random_uuid(),
  consultant_id uuid not null references public.consultants(profile_id) on delete cascade,
  kind          text not null check (kind in ('post','article','clip','live_session')),
  title         text,
  body          text,
  media_url     text,
  caption       text,
  status        text not null default 'live' check (status in ('live','removed','draft')),
  -- A counter the client increments is a number the user benefits from
  -- (rule 3), so nothing in phase 9 writes this from the browser. It exists so
  -- the column is not retrofitted later; it stays 0 until something server-side
  -- owns it. A zero that is honest beats 312k that is not.
  view_count    integer not null default 0 check (view_count >= 0),
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  -- Lets the seed say which mock row a table row came from without migrating a
  -- mock ID into a primary key (§1.4). Nothing reads it at runtime.
  legacy_id     text unique
);

-- §8. Partial, because every feed query carries `status = 'live'`.
create index content_consultant_idx
  on public.content (consultant_id, published_at desc)
  where status = 'live';

-- The feed itself: newest live content across all consultants.
create index content_published_idx
  on public.content (published_at desc)
  where status = 'live';

-- ════════════════════════════════════════════════════════════════════════════
-- REACTIONS — the store's `flags` Set, normalised
-- ════════════════════════════════════════════════════════════════════════════
--
-- The prototype's namespaced strings map one-to-one onto these four columns:
-- `follow:a1`, `save:po2`, `like:r3`, `remind:l4`. A prototype shortcut that
-- survives contact with a real schema is rare enough to note (§5.1).
--
-- NOT every flag in that Set belongs here, and this is the trap. The store also
-- holds `setting:croppedDeityImage` (a preference), `offair:<room>` (local UI
-- state), `event:<id>` (phase 10's academy), the tarot free-pull keys (§5.6's
-- `tarot_pulls`) and `save:day-<key>` (a saved READING, which is derived and
-- has no table). Those four kinds below are the whole of what phase 9 moves.

create table public.reactions (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in
              ('consultant','content','product','course','live_session')),
  target_id   uuid not null,
  kind        text not null check (kind in ('follow','save','like','remind')),
  created_at  timestamptz not null default now(),
  -- Toggling on twice is the same row, so the client never has to ask whether
  -- it already reacted before reacting.
  unique (actor_id, target_type, target_id, kind)
);

-- §8 — the index that makes "count followers" a query instead of a column.
create index reactions_target_idx on public.reactions (target_type, target_id, kind);

-- NO REFERENTIAL TRIGGER, DELIBERATELY. `target_id` cannot be a foreign key
-- because it points into five tables. Do not add a validating trigger: UUIDs
-- make collisions impossible, a like on a deleted item is harmless, and orphans
-- get swept periodically or never. The absence looks like an oversight, which
-- is exactly why §5.1 and this paragraph exist.

-- ════════════════════════════════════════════════════════════════════════════
-- REVIEWS
-- ════════════════════════════════════════════════════════════════════════════

create table public.reviews (
  id            uuid primary key default gen_random_uuid(),
  -- UNIQUE BUT NULLABLE, and both halves are load-bearing. Unique: one booking
  -- buys one review. Nullable: Postgres permits many NULLs in a unique index,
  -- and the seeded reviews have no matching bookings — NOT NULL would force the
  -- seed to fabricate them, which is inventing evidence of sessions that never
  -- happened (§5.4).
  booking_id    uuid unique references public.bookings(id),
  seeker_id     uuid not null references public.profiles(id) on delete cascade,
  consultant_id uuid not null references public.consultants(profile_id) on delete cascade,
  rating        smallint not null check (rating between 1 and 5),
  body          text,
  status        text not null default 'live' check (status in ('live','removed')),
  created_at    timestamptz not null default now()
);

create index reviews_consultant_idx
  on public.reviews (consultant_id, created_at desc)
  where status = 'live';

-- The `verified` badge derives from this, rather than being stored: a review
-- with a booking behind it is verified, one without is not. That is what real
-- marketplaces show, and it is a column the seed cannot forge.
comment on column public.reviews.booking_id is
  'Non-null means verified — a completed booking is behind this review.';

-- ── The rating caches ───────────────────────────────────────────────────────
-- consultants.rating_avg_cache and rating_count_cache are two of the three
-- named exceptions to §1.3, earned because the marketplace sorts on them. A
-- cache is only allowed if it is reproducible from its source, so this
-- recomputes from `reviews` rather than incrementing — an increment drifts
-- under concurrency and cannot be checked, which is the whole failure §1.3
-- describes.

create or replace function public.refresh_rating_cache(c_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.consultants c
     set rating_avg_cache   = agg.avg_rating,
         rating_count_cache = agg.n
    from (select round(avg(rating)::numeric, 1) as avg_rating,
                 count(*)                       as n
            from public.reviews
           where consultant_id = c_id and status = 'live') agg
   where c.profile_id = c_id;
$$;

create or replace function public.reviews_touch_rating_cache()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- A review that moves between consultants is not a thing, but a status change
  -- from 'live' to 'removed' is, and both rows have to be recounted.
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.refresh_rating_cache(old.consultant_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_rating_cache(new.consultant_id);
  end if;
  return null;
end;
$$;

create trigger reviews_rating_cache
  after insert or update or delete on public.reviews
  for each row execute function public.reviews_touch_rating_cache();

-- ════════════════════════════════════════════════════════════════════════════
-- FEED PINS — editorial override, written only by the admin console
-- ════════════════════════════════════════════════════════════════════════════

create table public.feed_pins (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,
  ref_id     uuid not null,
  sort       smallint not null default 0,
  starts_at  timestamptz,
  ends_at    timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index feed_pins_window_idx on public.feed_pins (sort, starts_at, ends_at);

-- ════════════════════════════════════════════════════════════════════════════
-- ROW-LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════════════════
-- Rule 7: a table with RLS disabled is a public table.

alter table public.content   enable row level security;
alter table public.reactions enable row level security;
alter table public.reviews   enable row level security;
alter table public.feed_pins enable row level security;

-- ── content ─────────────────────────────────────────────────────────────────
-- Anyone reads live content from an APPROVED consultant. The parent predicate
-- matters: without it, a consultant who is pending or blocked keeps publishing
-- into the public feed, and blocking someone would stop their bookings while
-- leaving their posts up.

create policy "content_select_live"
  on public.content for select
  using (
    status = 'live'
    and exists (
      select 1 from public.consultants c
       where c.profile_id = content.consultant_id
         and c.status = 'approved'
    )
  );

-- Own drafts stay visible to their author, whatever their status.
create policy "content_select_own"
  on public.content for select
  using (consultant_id = auth.uid());

create policy "content_insert_own"
  on public.content for insert
  with check (consultant_id = auth.uid());

create policy "content_update_own"
  on public.content for update
  using (consultant_id = auth.uid())
  with check (consultant_id = auth.uid());

-- No delete policy for anybody. Removal is `status = 'removed'`.

-- ── reactions ───────────────────────────────────────────────────────────────
-- Own rows only. "Am I following this consultant" is a read of your own row;
-- "how many people follow them" is a COUNT, and it comes from the views below,
-- which run as their owner. Reading the reaction rows themselves would publish
-- who follows whom, which is nobody's business and is not needed for a number.

create policy "reactions_own"
  on public.reactions for all
  using (actor_id = auth.uid())
  with check (actor_id = auth.uid());

-- ── reviews ─────────────────────────────────────────────────────────────────

create policy "reviews_select_live"
  on public.reviews for select
  using (status = 'live');

-- THE ANTI-FRAUD RULE, and the phase's third done-condition. A review requires
-- a booking that is the caller's own and is COMPLETED. Not pending, not
-- confirmed, not declined — completed. The seeded reviews get in underneath
-- this with the service role, which is what a seed is for.
--
-- Enforced in the policy rather than in a function because there is no money
-- and no second write here: rule 5 wants one write per action, and this is one.
create policy "reviews_insert_against_completed_booking"
  on public.reviews for insert
  with check (
    seeker_id = auth.uid()
    and booking_id is not null
    and exists (
      select 1 from public.bookings b
       where b.id = reviews.booking_id
         and b.seeker_id = auth.uid()
         and b.consultant_id = reviews.consultant_id
         and b.status = 'completed'
    )
  );

-- No update, no delete. A review is the reviewer's word at a moment; moderation
-- moves `status`, and moderation is the admin console's job (phase 13).

-- ── feed_pins ───────────────────────────────────────────────────────────────

create policy "feed_pins_select_active"
  on public.feed_pins for select
  using (
    (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  );

-- ════════════════════════════════════════════════════════════════════════════
-- GRANTS
-- ════════════════════════════════════════════════════════════════════════════
-- Supabase grants the full set on new public tables by default, so every
-- restriction has to be taken away explicitly — the 007_consultants.sql
-- pattern. RLS scopes WHICH ROW; these scope WHICH COLUMNS.

revoke insert, update, delete on public.content   from authenticated, anon;
revoke insert, update, delete on public.reactions from authenticated, anon;
revoke insert, update, delete on public.reviews   from authenticated, anon;
revoke insert, update, delete on public.feed_pins from authenticated, anon;
revoke select on public.feed_pins from anon;

-- A consultant publishes and edits their own words. They do NOT get `status`
-- beyond the draft/live pair they already control, and they never get
-- `view_count` or `legacy_id` — a self-served view count is fiction, and
-- legacy_id belongs to the seed.
grant insert (consultant_id, kind, title, body, media_url, caption, status, published_at)
  on public.content to authenticated;
grant update (title, body, media_url, caption, status, published_at)
  on public.content to authenticated;

grant insert (actor_id, target_type, target_id, kind) on public.reactions to authenticated;
grant delete on public.reactions to authenticated;

-- No `status` on insert: a review arrives live or not at all, and only
-- moderation moves it.
grant insert (booking_id, seeker_id, consultant_id, rating, body)
  on public.reviews to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- THE COUNT VIEWS
-- ════════════════════════════════════════════════════════════════════════════
-- Counts are queries (§1.3). These run as their owner, exactly as
-- consultants_public does and for the same reason: the underlying RLS is
-- own-row-only, so an invoker-rights view would return 0 for everyone but
-- yourself. The view's own projection is the access control — it exposes
-- aggregates and never the actor IDs behind them.

create view public.content_public as
  select c.id,
         c.consultant_id,
         p.name as consultant_name,
         c.kind,
         c.title,
         c.body,
         c.media_url,
         c.caption,
         c.view_count,
         c.published_at,
         coalesce(r.likes, 0) as like_count,
         coalesce(r.saves, 0) as save_count
    from public.content c
    join public.consultants cs on cs.profile_id = c.consultant_id
    join public.profiles    p  on p.id          = c.consultant_id
    left join (
      select target_id,
             count(*) filter (where kind = 'like') as likes,
             count(*) filter (where kind = 'save') as saves
        from public.reactions
       where target_type = 'content'
       group by target_id
    ) r on r.target_id = c.id
   where c.status = 'live'
     and cs.status = 'approved';

grant select on public.content_public to anon, authenticated;

-- Follower counts, the number that currently reads 84,200 against zero rows.
create view public.consultant_follower_counts as
  select cs.profile_id as consultant_id,
         count(r.id)   as follower_count
    from public.consultants cs
    left join public.reactions r
      on r.target_type = 'consultant'
     and r.target_id   = cs.profile_id
     and r.kind        = 'follow'
   where cs.status = 'approved'
   group by cs.profile_id;

grant select on public.consultant_follower_counts to anon, authenticated;

-- Reviews as the profile screen reads them, with `verified` derived rather
-- than stored, and the reviewer's first name and last initial rather than the
-- whole name — a review is public, the reviewer's full identity is not.
create view public.reviews_public as
  select rv.id,
         rv.consultant_id,
         rv.rating,
         rv.body,
         rv.created_at,
         rv.booking_id is not null as verified,
         split_part(p.name, ' ', 1)
           || case when split_part(p.name, ' ', 2) <> ''
                   then ' ' || left(split_part(p.name, ' ', 2), 1) || '.'
                   else '' end as reviewer_name
    from public.reviews rv
    join public.profiles p on p.id = rv.seeker_id
   where rv.status = 'live';

grant select on public.reviews_public to anon, authenticated;
