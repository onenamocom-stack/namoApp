-- Applied to Supabase via MCP. Forward-only — never edit once applied.
-- Phase 4 (docs/06-IMPLEMENTATION.md). The slots source per
-- docs/05-BACKEND-SCHEMA.md §4.4 and the API row in docs/02-TRD.md §5.
--
-- ONE source for every caller. Today there are two and they disagree: the
-- consultant's grid subtracts booked slots only when the weekday happens to be
-- Thursday (ProConsult.jsx:268, :291) while the seeker's sheet subtracts them
-- always and ignores the consultant's own closures entirely. Neither is a
-- rendering bug — they are two implementations of one rule, which is the
-- shape of bug that comes back.
--
-- It is a Postgres function reached over PostgREST RPC, not an Edge Function.
-- 02-TRD.md names this endpoint `GET /consultants/:id/slots?date=`; the
-- subtraction is pure SQL over three tables sitting right here, and a Deno
-- function would open a connection to run this same query, then need its own
-- deploy, its own CORS and its own secret. Nothing it decides needs a secret.
--
-- security definer, because it must subtract OTHER PEOPLE'S bookings — which
-- RLS correctly hides from the caller. It returns times, never rows: a seeker
-- learns a slot is gone and never who took it or why.

-- ── The two product constants, named once ───────────────────────────────────
-- Slot times are IST. The booking horizon is 14 days. 05-BACKEND-SCHEMA.md
-- :377-384 asks for both to be named here rather than invented three times.

create or replace function public.consultant_open_slots(
  p_consultant_id uuid,
  p_date          date
)
returns table (slot_time time, starts_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select a.slot_time,
         ((p_date + a.slot_time) at time zone 'Asia/Kolkata') as starts_at
    from public.consultant_availability a
    join public.consultants c on c.profile_id = a.consultant_id
   where a.consultant_id = p_consultant_id
     -- An unapproved or blocked consultant has no open slots, ever. The same
     -- predicate as the RLS policy, because this function bypasses it.
     and c.status = 'approved'
     -- 0 = Sunday .. 6 = Saturday, i.e. Postgres `dow`. The front end's
     -- weekDays array starts on Monday, so it maps; the database does not
     -- carry a second convention to keep in step.
     and a.weekday = extract(dow from p_date)::smallint
     -- Inside the horizon, and not in the past. Out of range returns nothing
     -- rather than raising: a date picker one day too far is a UI bug, not a
     -- caller lying, and an empty day renders correctly already.
     and p_date >= (now() at time zone 'Asia/Kolkata')::date
     and p_date <= (now() at time zone 'Asia/Kolkata')::date + 14
     and ((p_date + a.slot_time) at time zone 'Asia/Kolkata') > now()
     -- minus time off
     and not exists (
       select 1 from public.consultant_time_off t
        where t.consultant_id = p_consultant_id
          and ((p_date + a.slot_time) at time zone 'Asia/Kolkata') >= t.starts_at
          and ((p_date + a.slot_time) at time zone 'Asia/Kolkata') <  t.ends_at)
     -- minus claimed slots. The claim is at `pending`, not at `confirmed`
     -- (03-APP-FLOW.md §8.1) — a request holds the slot while the consultant
     -- decides, or two seekers are sold the same half hour.
     and not exists (
       select 1 from public.bookings b
        where b.consultant_id = p_consultant_id
          and b.starts_at = ((p_date + a.slot_time) at time zone 'Asia/Kolkata')
          and b.status in ('pending','confirmed'))
   order by a.slot_time;
$$;

revoke execute on function public.consultant_open_slots(uuid, date) from public;
grant  execute on function public.consultant_open_slots(uuid, date) to anon, authenticated;
