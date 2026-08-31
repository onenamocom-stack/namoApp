-- Applied to Supabase via MCP. Forward-only — never edit once applied.
--
-- 003 shipped refuse_mutation() without `set search_path`, which every other
-- function in this schema has. It only ever raises, so there is nothing in it
-- to hijack, but a security-definer-adjacent function with a mutable
-- search_path is a lint that gets ignored next time if it is left standing.
--
-- A separate migration rather than an edit to 003, because 003 has run.

create or replace function public.refuse_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'ledger rows are append-only; write a reversing entry instead';
end;
$$;
