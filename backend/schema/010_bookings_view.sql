-- Applied to Supabase via MCP. Forward-only — never edit once applied.
-- Phase 4 (docs/06-IMPLEMENTATION.md). The read side of `bookings`, per
-- docs/05-BACKEND-SCHEMA.md §9 — public fields come from a view, never by
-- loosening `profiles`.
--
-- Without this the consultant's own screen cannot render: `bookings` carries
-- `seeker_id`, and `profiles` RLS is own-row-only, so a consultant reading a
-- booking gets a UUID and no name. The seeker has the same problem in reverse
-- from phase 5.
--
-- Two things the view deliberately does:
--
--   1. It restricts itself. It runs as its owner — it must, to read the other
--      party's name — so the WHERE clause is the access control, and it is the
--      same predicate as the `bookings_select_mine` policy.
--   2. It carries the seeker's BIRTH DETAILS to the consultant, which is not
--      an oversight. A reading cannot be done without them, and a booking is
--      the seeker asking for one. It is scoped to the consultant on that
--      booking and to nobody else — there is no path here to the birth details
--      of somebody who has not booked you.
--
-- No phone number, no email, no id beyond the ones already on the row.

create view public.bookings_view as
  select b.id,
         b.seeker_id,
         b.consultant_id,
         b.service_id,
         b.order_id,
         b.starts_at,
         b.duration_mins,
         b.amount_paise,
         b.mode,
         b.status,
         b.note,
         b.created_at,
         s.name  as seeker_name,
         s.birth_date,
         s.birth_time,
         s.birth_place,
         c.name  as consultant_name
    from public.bookings b
    join public.profiles s on s.id = b.seeker_id
    join public.profiles c on c.id = b.consultant_id
   where b.seeker_id = auth.uid()
      or b.consultant_id = auth.uid();

grant select on public.bookings_view to authenticated;
revoke select on public.bookings_view from anon;

-- Writes still go through the table, where `bookings_update_decision` allows
-- exactly pending → confirmed | declined and the column grant allows exactly
-- `status`. A view does not widen that.
