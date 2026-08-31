# Backend — working rules

Rules that hold regardless of which phase you are on. They are the most
expensive things in this project to retrofit, and unlike the documents in
`docs/` they are *rules*, so they cannot go stale.

- **What** to build: `docs/05-BACKEND-SCHEMA.md`
- **Why** it is shaped that way: `docs/02-TRD.md`
- **In what order**: `docs/06-IMPLEMENTATION.md`
- **What is actually built**: `HANDOFF.md` at the repo root

---

## 1. The rules that do not bend

**1. Money is integers in paise.** Column names say so: `amount_paise`,
`balance_paise`, `price_paise`. No float touches money at any layer. Format to
rupees in the component, at the last moment.

Rates are **basis points**, never percentages: `1800`, not `18` and not `0.18`.
The percent-or-fraction ambiguity is a permanent source of hundred-fold errors.

**2. The ledgers are append-only.** No `UPDATE`, no `DELETE`, ever, enforced by
trigger. A mistake is corrected by writing a reversing entry, not by editing
history. `wallets.balance_paise` is a cache; if it disagrees with the sum of the
ledger, the ledger is right and the balance is the bug.

**3. The client never sends a price, an amount, or an identity.** It sends
`{ consultantId, serviceId, startsAt }`, `{ productId, qty }`,
`{ threadId, body }`. The server looks up price, cost and caller. **If a request
body contains a number the user benefits from, that is the bug.**

**4. Authorize on the server, always.** The URL decides routing; it does not
decide permission. `isPro` stays derived from the pathname in the client — do not
add a role boolean — and the server scopes every query by the caller's own ID.

**5. One write per user action.** A booking that debits a wallet and claims a
slot is one transaction. Two calls means a wallet debited for a slot someone
else took.

**6. Webhooks verify signatures and are idempotent.** Providers retry. The same
event arriving twice must credit once, and the guarantee is a **unique index on
the provider's own identifier** — never an application-level "have I seen this?"
check, which races with its own write.

**7. Secrets never reach the client.** Model keys, payment secrets, service-role
keys: server only. The Supabase anon key is the one credential meant to be
public, and it is only safe because RLS is on. **A table with RLS disabled is a
public table.**

**8. Store the input, compute the derivation.** Birth details are stored; charts,
horoscopes and panchang are computed. If a derivation is ever cached, the column
name says `_cache` so it is obviously throwaway.

---

## 2. Conventions

### Layout

```
backend/
  INSTRUCTIONS.md     this file
  schema/             numbered .sql files, forward-only
  functions/          one folder per server function
  ephemeris/          the Python chart service
  seed/               static JSON lifted out of mock.js
```

Create each folder in the phase that needs it, not before.

### Naming

Tables plural and snake_case. Columns snake_case. Timestamps `*_at`. Money
`*_paise`. Rates `*_bps`. Booleans read as assertions — `verified`, not
`is_verified`. Caches carry `_cache` in the name.

### Migrations

Numbered SQL files, forward-only, **never edited once applied**. A migration that
has run against any real database is history.

### Errors

A refusal returns a reason the interface can show, in the app's voice — second
person, present tense, no hedging. `spend()` already toasts "Not enough
balance"; **the server's job is to make that string true**, not to invent a new
vocabulary. Never fail silently and never return 200 on a refusal without a
structured reason.

### Testing

One runnable check per non-trivial path, and **money paths are never trivial**.
The check that matters most: apply the ledger from zero and assert it equals the
stored balance. If that passes, most of the wallet is right.

There is no test framework in this repo yet. Do not add one to write a single
assertion.

### Verification

**`npm run build` passing proves almost nothing.** There is no linter and no type
checker, so an undefined identifier inside JSX compiles cleanly and throws at
runtime. It has shipped a blank screen twice. **Every phase ends with walking the
affected routes in a browser.**

---

## 3. Local development

**Two Supabase projects. Never one.**

Until 23 Aug there was one, and both `localhost` and the deployed site talked
to it. That was survivable only while the wallet held nothing. It stopped being
survivable the moment phase 3 put real rupees through it, and it was already
wrong before that: real accounts created by real people sat in the same tables
a dev laptop was free to truncate.

| | Project | Used by | Holds |
|---|---|---|---|
| **Production** | `talqzgolttfgdzcoaqno` | the deployed site only | real people, real money |
| **Dev** | `mrjsatelbuiypodeulcx` (`namo-dev`) | `npm run dev`, `.mcp.json`, every agent session | throwaway data |

The rules that keep them apart:

- **`.env.local` points at DEV.** Always. It is gitignored; `.env.example`
  carries the key names and no values.
- **The GitHub Actions secrets point at PRODUCTION.** `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` under Settings → Secrets and variables → Actions.
  They are the only place production credentials live, and the deploy workflow
  fails loudly if either is empty rather than shipping a white screen.
- **`.mcp.json` points at DEV — and it is not the only file that can.** This is
  the one that matters for agents: an MCP server on the production ref means
  every `apply_migration` and `execute_sql` in every session lands on real data.
  `.mcp.json` carries `?project_ref=<dev>` in the server URL.

  **A user-scoped server with the same name shadows it.** On 30 Aug 2026 a whole
  phase went to production because `~/.claude.json` also defined a server called
  `supabase`, on the production ref, and the user scope wins. The project file
  was correct and irrelevant. **Both are now on dev**; if the two ever disagree
  again, the one in the repo is not the one in force.

  **So the first call of any session that will write is
  `mcp__supabase__get_project_url`, and its answer is checked against the dev
  ref before anything else runs.** One read, before the first write, every time.
  Dev is `mrjsatelbuiypodeulcx`; production is `talqzgolttfgdzcoaqno`.

  **Two answers to one question means two databases, not a cache.** That
  incident presented for an hour as a stale PostgREST schema cache — a function
  returning `PGRST202` over REST while being plainly present in the SQL editor.
  It was two databases. If the browser and the agent disagree about what exists,
  check which project each is talking to before debugging either.
- **Migrations run against dev first, then production.** Same file, same order,
  no edits between. A migration that has run anywhere is history (§2).
- **Dev signs in with test OTP, production with Twilio Verify.** Dev has
  `+919999900001` and `+919999900002`, both code `123456`: no SMS, no cost, and
  two accounts whenever a test needs them. **Never configure those numbers on
  production** — there they are a way into a real wallet.

### Replaying the schema into a fresh project

Everything in `schema/` is forward-only and ordered, so a fresh database is
just the numbered files in sequence:

```bash
cat backend/schema/001_*.sql backend/schema/002_*.sql backend/schema/003_wallets_ledger.sql     backend/schema/004_*.sql backend/schema/005_*.sql > /tmp/bootstrap.sql
```

Paste that into the new project's SQL editor. Note `003_wallets_ledger.sql`
is named explicitly — `003_wallets_ledger_check.sql` is a **test**, not a
migration, and must not be in the replay.

Then run the check on its own. It passes by raising
`ERROR: PHASE 2 CHECKS PASSED`, which reads like a failure and is not.

### The front end

`npm run dev` on any free port, unchanged. Vite inlines `VITE_*` at build
time, so **changing `.env.local` needs a dev-server restart** — a hot reload
keeps the old value and the mismatch is invisible.

---

## 4. Keeping the documents true

The rule lives in `CLAUDE.md` at the repo root. The short version:

- A **decision** — stack, schema, a third-party choice — updates the document
  that owns it. Each fact has exactly one home; the others link.
- **Anything built, blocked, deferred or discovered** updates `HANDOFF.md`.
- **Edit the existing section.** Do not append a changelog. If a decision
  reverses, rewrite it and say what it replaced.

A document describing intent as though it were state is worse than no document,
because it gets trusted. This repo has already paid for that lesson twice: a
design doc describing a build that had been replaced several redesigns earlier,
and a handoff listing a chat fix as done while the panel threw on first open.
