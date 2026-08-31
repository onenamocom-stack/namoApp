-- Applied to Supabase via MCP. Forward-only — never edit once applied.
-- See docs/05-BACKEND-SCHEMA.md §4.1 (column) and docs/01-PRD.md (why it is
-- collected, and the consent question that goes with it).

-- Collected at signup alongside the phone. Never used to authenticate — the
-- phone is the identity and the only verified channel. This is a contact
-- address for later use, so it is deliberately:
--
--   nullable  — the column arrives after the first accounts already exist, and
--               a NOT NULL here would mean inventing an address for them.
--               Mandatory is enforced at the onboarding screen instead.
--   not unique — one address across two phone numbers is ordinary in a family.
--               A unique index would hard-fail that signup with an error the
--               person cannot act on.
--
-- The CHECK is shape only. It rejects an obviously malformed address at the
-- trust boundary without pretending to prove the address exists — nothing
-- short of sending mail to it does that.
alter table public.profiles
  add column email text
  constraint profiles_email_shape check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- Correctable by its owner, unlike `phone`. A contact address nobody can fix
-- after a typo is a support ticket that never closes.
grant update (email) on public.profiles to authenticated;
