-- Forward-only — never edit once applied.
-- Phase 6. The half of Realtime that is not code.
--
-- A table is not published to Realtime because it exists. Supabase ships an
-- empty `supabase_realtime` publication and every table has to be added to it
-- by hand — so a `postgres_changes` subscription against an unpublished table
-- connects happily, reports itself SUBSCRIBED, and then delivers nothing at
-- all. There is no error anywhere: the client is fine, the policy is fine, the
-- row is in the table, and the other person simply never sees the message.
--
-- Found by walking it. The consultant sent a line, the row landed, and neither
-- side rendered it. `npm run build` was green and the check passed, because
-- neither of them can see a publication.

alter publication supabase_realtime add table public.messages;

-- `sessions` too, so the seeker's room learns the consultant has joined — and
-- learns it has been swept — without polling for it. The meter in the room is
-- driven by the heartbeat, but "your session just started" and "your session
-- just ended" are events, and an event that has to be discovered by asking
-- repeatedly is a event that arrives late.
alter publication supabase_realtime add table public.sessions;

-- RLS still applies to what Realtime sends: a subscriber is only pushed rows
-- the policies would have let them SELECT. Publishing a table does not widen
-- who can read it.
