-- Forward-only — never edit once applied.
-- Seekers publish too. Photos and blog posts, not reels; and they are
-- followable, so the follower count on their own profile is a real number.
--
-- ── THE COLUMN IS RENAMED, AND THAT IS THE POINT ───────────────────────────
-- `content.consultant_id` referenced `consultants(profile_id)` and was NOT
-- NULL, so a seeker could not author a row at all. Repointing the key at
-- `profiles` while keeping the name would leave every future reader believing
-- content authors are consultants, and they are not any more. `author_id` is
-- what the column holds.
--
-- Postgres carries a rename through indexes, policies and views, so the risk
-- here is not breakage — it is a name that lies. That is why this is a rename
-- and not a second nullable column beside the first.
--
-- ── WHAT A SEEKER MAY POST, AND WHERE THE RULE LIVES ───────────────────────
-- Photos (`post`) and blog posts (`article`). NOT `clip`: a reel is the
-- consultant's marketing surface and the format people judge a practitioner
-- by, and opening it to everybody turns the feed into something nobody chose.
--
-- The rule is an RLS predicate rather than a CHECK constraint because it
-- depends on another table — whether the author is an approved consultant —
-- and a CHECK cannot see one. `live_session` stays consultant-only for the
-- same reason and is phase 11's anyway.

alter table public.content rename column consultant_id to author_id;

alter table public.content drop constraint content_consultant_id_fkey;
alter table public.content
  add constraint content_author_id_fkey
  foreign key (author_id) references public.profiles(id) on delete cascade;

alter index content_consultant_idx rename to content_author_idx;

-- ── The write policies, rebuilt on the new name plus the kind gate ──────────
-- Dropped and recreated rather than left to the rename: the INSERT policy has
-- to grow a condition, and two policies written in two migrations that must be
-- read together is how a permission gets misunderstood.

drop policy if exists "content_insert_own" on public.content;
drop policy if exists "content_update_own" on public.content;
drop policy if exists "content_select_own" on public.content;
drop policy if exists "content_select_live" on public.content;

create policy "content_insert_own"
  on public.content for insert
  with check (
    author_id = auth.uid()
    and (
      kind in ('post', 'article')
      or exists (
        select 1 from public.consultants c
         where c.profile_id = author_id and c.status = 'approved'
      )
    )
  );

create policy "content_update_own"
  on public.content for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "content_select_own"
  on public.content for select
  using (author_id = auth.uid());

-- Live content is public when its author is a seeker, or an APPROVED
-- consultant. The approval gate still matters for consultants — blocking one
-- has to take their posts down with them — and it must not accidentally
-- become a gate on ordinary people, who are never "approved" of.
create policy "content_select_live"
  on public.content for select
  using (
    status = 'live'
    and not exists (
      select 1 from public.consultants c
       where c.profile_id = content.author_id
         and c.status <> 'approved'
    )
  );

-- ── Following a person, not only a practitioner ────────────────────────────
-- `target_type` gains 'profile'. 'consultant' stays exactly as it was: a
-- consultant is followed as a practitioner and that is a different act from
-- following a person who posts photos. Keeping them separate means a follower
-- count can answer either question later without unpicking rows.

alter table public.reactions drop constraint reactions_target_type_check;
alter table public.reactions
  add constraint reactions_target_type_check
  check (target_type in ('consultant', 'content', 'product', 'course',
                         'live_session', 'profile'));

-- ── The views ──────────────────────────────────────────────────────────────

drop view if exists public.content_public;

create view public.content_public as
  select c.id,
         c.author_id,
         -- Kept under its old name as well, because the seed and any bundle
         -- deployed before this migration read `consultant_id`. A rename is
         -- not worth a coordinated deploy. New code reads `author_id`.
         c.author_id as consultant_id,
         p.name as author_name,
         p.name as consultant_name,
         (cs.profile_id is not null) as author_is_consultant,
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
    join public.profiles p on p.id = c.author_id
    left join public.consultants cs
      on cs.profile_id = c.author_id and cs.status = 'approved'
    left join (
      select target_id,
             count(*) filter (where kind = 'like') as likes,
             count(*) filter (where kind = 'save') as saves
        from public.reactions
       where target_type = 'content'
       group by target_id
    ) r on r.target_id = c.id
   where c.status = 'live'
     and not exists (
       select 1 from public.consultants b
        where b.profile_id = c.author_id and b.status <> 'approved'
     );

grant select on public.content_public to anon, authenticated;

-- Followers and following for ANY profile, counted rather than stored (§1.3).
-- Follows of either kind count: a consultant who also posts as a person has
-- one audience, not two, and splitting the number on the profile screen would
-- be arithmetic nobody asked for.
create view public.profile_follow_counts as
  select p.id as profile_id,
         (select count(*) from public.reactions r
           where r.kind = 'follow'
             and r.target_type in ('profile', 'consultant')
             and r.target_id = p.id)                       as follower_count,
         (select count(*) from public.reactions r
           where r.kind = 'follow'
             and r.target_type in ('profile', 'consultant')
             and r.actor_id = p.id)                        as following_count
    from public.profiles p;

grant select on public.profile_follow_counts to anon, authenticated;

-- A public name for a seeker whose posts are in the feed. `profiles` is
-- own-row-only and stays that way; this exposes the name and nothing else —
-- no phone, no email, no birth details. Publishing a post is what puts a name
-- on a screen, so only people who have published are listed.
create view public.authors_public as
  select distinct p.id, p.name
    from public.profiles p
    join public.content c on c.author_id = p.id and c.status = 'live';

grant select on public.authors_public to anon, authenticated;

-- ── Grants ─────────────────────────────────────────────────────────────────
-- The column-level insert grant named the old column, so it has to be
-- reissued.

revoke insert, update on public.content from authenticated, anon;
grant insert (author_id, kind, title, body, media_url, caption, status, published_at)
  on public.content to authenticated;
grant update (title, body, media_url, caption, status, published_at)
  on public.content to authenticated;
