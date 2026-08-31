-- Forward-only — never edit once applied.
-- Phase 6. `threads.last_preview` and `last_message_at` were columns nothing
-- ever wrote, so every thread in the list read "No messages yet." while its
-- transcript was full. Found by walking it, not by the check — the check
-- asserts on money and RLS, and a stale preview is neither.
--
-- Maintained by a TRIGGER rather than by whoever inserts the message, for the
-- same reason `wallets.balance_paise` is (003): a cache each writer must
-- remember to update is one that eventually disagrees. There is exactly one
-- place a message is created — a client INSERT under the live-session policy —
-- and it must not also be responsible for keeping a summary in step.
--
-- These two columns are the §1.3 cache exception, already named as such in
-- docs/05-BACKEND-SCHEMA.md §4.9. The messages are the truth; this is a
-- rendering of the newest one, and it can be rebuilt from them at any time:
--
--   update threads t set last_preview = m.body, last_message_at = m.created_at
--     from (select distinct on (thread_id) thread_id, body, created_at
--             from messages order by thread_id, created_at desc) m
--    where m.thread_id = t.id;

create or replace function public.touch_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.threads
     set last_message_at = new.created_at,
         -- Enough to recognise the conversation, not enough to leak it into a
         -- notification. Left/right of a multi-byte character is safe here:
         -- `left()` counts characters, not bytes.
         last_preview = left(new.body, 120)
   where id = new.thread_id;
  return new;
end;
$$;

create trigger messages_touch_thread
  after insert on public.messages
  for each row execute function public.touch_thread();

revoke execute on function public.touch_thread() from public, anon, authenticated;

-- Backfill, so threads that already exist stop claiming to be empty.
update public.threads t
   set last_preview = m.body, last_message_at = m.created_at
  from (select distinct on (thread_id) thread_id, left(body, 120) as body, created_at
          from public.messages order by thread_id, created_at desc) m
 where m.thread_id = t.id;
