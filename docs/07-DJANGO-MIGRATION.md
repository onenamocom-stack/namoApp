# 07 — Django migration and scale plan

This is the plan for moving the backend from Supabase (Postgres + edge
functions + RLS) to a Django API, one module at a time, without breaking
production — and for the seams that make the system scale when volume
arrives. Read `docs/02-TRD.md` first for the current trust boundary and
`HANDOFF.md` for what is live.

Status: **all modules built and staged (19 Sep 2026); cutover pending
deploys.** `backend-django/` holds the skeleton (phase 1) and all nine
business modules — reactions, astro, bhakti, content, consultants, chat,
wallet, profile — each with its client flip staged in
`backend-django/cutovers/` and its SQL checks ported to pytest (450 tests
green). Module 10 was the audit + integration pass: every remaining `src/`
call site maps to a staged cutover or is marked "stays on Supabase
(Auth)"; nothing was left to build, and
`backend-django/cutovers/RUNBOOK.md` is the ordered, four-deploy cutover
sequence (HANDOFF §10–§10i). Nothing in this document is true of the
running system until its deploy happens.

---

## 1. The decision, stated plainly

- **Keep Postgres.** It is already the database; money lives in it; every
  property money needs (transactions, constraints, append-only ledgers)
  is Postgres-shaped. Switching databases is a different, much larger
  migration with no payoff here. What changes is *who owns the schema and
  the rules* — moving from RLS + edge functions to a Django API.
- **Keep Supabase Auth for the foreseeable future.** Phone OTP is the
  hardest infrastructure to rebuild (SMS providers, delivery, cost, fraud),
  and it already works in production. The Django API verifies Supabase JWTs
  against Supabase's public keys; the client keeps signing in exactly as it
  does today. Auth migration, if it ever happens, is the **last** module,
  not the first.
- **Do not rebuild in parallel.** The strangler-fig pattern: the Django
  API grows module by module inside the existing system; each module cuts
  over alone; production is never mid-flight.

## 2. Why module-wise is safe here

The client already talks to the backend through a thin layer, not through
scattered calls:

| Client seam | Backend area it touches |
|---|---|
| `src/lib/supabase.js` | the client itself |
| `src/lib/consultants.js` | consultants, slots, bookings |
| `src/lib/content.js` | feed, posts, reels, articles, reviews |
| `src/lib/chat.js` | metered chat |
| `src/lib/astro.js` | charts, horoscope (cached provider) |
| `src/lib/bhakti.js` | deities, e-puja |
| `src/lib/reactions.js` | likes |
| `src/lib/avatar.js` | uploads |
| `src/store.jsx` | session, profile, wallet, ledger, spend |
| `src/screens/onboarding/*`, `src/pro/ProApply.jsx` | auth (Supabase Auth — stays) |

One lib file ≈ one module. Migrating a module means: build its Django app
and endpoints, rewrite the lib file's internals from supabase calls to REST
calls against Django, deploy. Every screen that imports the lib flips in
the same commit. Rollback is reverting one lib file. This is why the
migration can be non-breaking: **the cutover is atomic per lib file, and
the two backends never serve one module at the same time.**

`store.jsx` is the exception — it spans session (stays on Supabase Auth),
profile, and wallet. It gets split along those seams when wallet and
profile migrate; the session parts never move.

## 3. Target architecture

```
React apps (seeker / consultant builds, GitHub Pages, static)
      │  HTTPS + Supabase JWT in Authorization header
      ▼
Django API (stateless, any container host) ──► Postgres (the same one)
      │                                          ▲
      ├── Redis: cache-aside (feeds, horoscope,  │ Django owns all
      │   consultant listings), rate limits,     │ schema migrations
      │   Celery broker                          │ going forward
      ├── Celery workers: sweepers, webhooks,
      │   notifications, outbox dispatch
      └── Cloudflare R2: media bytes (reels,
          posts, avatars, bhakti art) — client
          uploads straight to R2 with presigned
          URLs; only metadata touches Django
```

Trust boundary move, the one sentence version: today every rule is a
Postgres policy (RLS); after a module migrates, its policies are revoked
and its rules live in Django (permissions + services + transactions), with
the JWT — still issued by Supabase Auth — as the credential. RLS dies
module by module, not in one scary day.

### 3.1 The scale seams (built in phase 1, used later)

These are the decisions that matter when volume arrives. Each is cheap now
and expensive to retrofit:

- **Stateless API.** No local state, no in-memory anything that a request
  depends on. Any instance serves any request; scale by adding instances.
- **Idempotency everywhere money or writes race.** Client idempotency keys
  on every mutating endpoint; natural unique constraints as the backstop.
  The wallet ledger and payments flows keep the replay guarantees the SQL
  checks in `backend/schema/*_check.sql` already enforce — those checks get
  ported to pytest module by module and must pass before that module cuts
  over.
- **Append-only money tables stay append-only.** Migrations, admin tools
  and data fixes go through service functions, never bare writes.
- **Outbox pattern for side effects.** Anything that must eventually
  happen because a write happened (notification, search index update,
  webhook forward) is written to an `outbox_events` table in the same
  transaction as the write, and dispatched by a worker. No dual writes,
  no "the payment succeeded but the notification didn't" class of bug.
- **CAP position, stated once.** Postgres in one region is CP — the right
  choice where money is concerned: consistency over availability, and a
  clear story (queue-and-retry at the client, honest error screens) for
  the minutes it is unavailable. **Do not** chase multi-active writes; add
  read replicas and CDN when reads outgrow one node, and multi-region read
  only with a stated RPO/RTO. Availability comes from the stateless tier
  and from Cloudflare in front of media, not from clever database topology.
- **Cache-aside with Redis** for the hot read paths (home feed pages,
  consultant listings, horoscope dailies) behind short TTLs and explicit
  invalidation. Every cached read has a defined owner that invalidates it
  on write.
- **Keyset pagination** on every list that can grow (feed, ledger, chat,
  orders). Offsets die at scale.
- **Connection discipline.** Transaction-per-request, short transactions,
  PgBouncer (transaction pooling) in front of Postgres — the standard
  Django-at-scale failure is connection exhaustion, and it is a config
  problem before it is an architecture problem.
- **Workers for time.** Sweepers (chat metering, slot expiry, presence),
  webhook delivery with retries, notification fan-out — all Celery tasks,
  all idempotent, so workers can scale horizontally like the API.

## 4. Media: Cloudflare R2 for reels and everything visual

- **R2, not the database and not app servers.** Bytes live in an R2
  bucket; Postgres stores only `media_assets` rows (id, owner, kind,
  bucket key, mime, size, duration, width/height, status, created_at).
  The 10 GB free tier covers the early reel volume, and R2's zero-egress
  pricing is the real win — video is bandwidth, and bandwidth is what
  kills you on AWS.
- **Upload path:** client asks Django for a presigned PUT → uploads
  straight to R2 → confirms to Django → row flips to ready. Django and the
  Postgres connection never carry video bytes. The presign endpoint is
  authenticated, size- and mime-gated, and idempotent per client key.
- **CDN is free with the choice.** R2 sits behind Cloudflare's network;
  serve playback URLs through a public custom domain with cache-everything
  rules for public media, signed URLs for anything private.
- **Transcoding is deliberately out of M1.** Phone-uploaded MP4 plays
  natively everywhere this app runs. If upload formats get wild, add
  ffmpeg workers later behind the same `media_assets.status` column — the
  table is designed for a processing state from day one.
- Migration 022's content-media bucket and avatars move to R2 when content
  and profile migrate; the table above replaces both storage stories.

## 5. Tables, designed for requirements that do not exist yet

- All new Django tables: UUID primary keys, `created_at`/`updated_at`,
  soft-delete where history matters, and no enum soup in `text` columns —
  Django TextChoices with DB check constraints, so a bad value can never
  be written from any client.
- `media_assets` (above) is the generic media spine: posts, reels,
  avatars, bhakti art, course thumbnails all reference it. One pipeline,
  not five.
- `outbox_events` (id, kind, payload jsonb, available_at, dispatched_at,
  attempts, unique dedupe key) — the seam from §3.1.
- Every aggregate that gets read hot (follower counts, rating averages,
  enrolment counts) is stored with the row and recomputed in the same
  transaction as the write that changes it — computed columns by
  convention, exact by construction, no drift.
- The existing 27 SQL migrations are the baseline. Django's first
  migration per app is generated **against the production schema** (via
  `inspectdb`, then hand-tightened to match `docs/05-BACKEND-SCHEMA.md`)
  and faked in, so history is preserved and Django owns everything after.

## 6. Module order and why

Ordered by coupling (leaves first) and blast radius (smallest first).
Each step's done-condition includes its SQL checks ported to pytest and
green, and one walked route per affected screen.

| # | Module (lib seam) | Why here |
|---|---|---|
| 0 | Freeze + backup + staging API | Everything below stands on it |
| 1 | Django skeleton: project, auth (JWT verify vs Supabase JWKS), permissions, outbox, media presign, observability | No business logic; every later module lands on it |
| 2 | Reactions (`reactions.js`) | Smallest write surface; proves the cutover mechanics end to end — **built, staged; deploy 2 of the runbook** |
| 3 | Astro (`astro.js`) | Read-mostly, provider-shaped, zero money; Redis cache lands here — **built, staged; deploy 2 of the runbook** |
| 4 | Bhakti (`bhakti.js`) | Self-contained content + one session write — **built, staged; deploy 2 of the runbook** (the "one session write" turned out not to exist — HANDOFF §10c) |
| 5 | Content (`content.js`) + R2 media | The feed, posts, reels on R2; largest read surface, cache-aside earns its keep — **built, staged; deploy 2 of the runbook** |
| 6 | Consultants (`consultants.js`) | Listings, slots, bookings; first real money touch (booking holds) — **built, staged; deploy 2 of the runbook** |
| 7 | Chat (`chat.js`) | Metered billing; sweeper moves to Celery; highest correctness bar — every SQL check in 014 ports here — **built, staged; deploy 3 of the runbook (sweeper scheduler first)** |
| 8 | Wallet + payments (`store.jsx` split) | The ledger, Razorpay order/webhook functions become Django services behind the same client contract; freeze window for cutover — **built, staged; deploy 4 of the runbook (freeze + webhook switch)** |
| 9 | Profile + avatar (`store.jsx` split, `avatar.js`) | Last write surface; storage moves to R2 — **built, staged; deploy 4 of the runbook (same freeze window as wallet)** |
| 10 | Shop, Academy, Notifications, remaining `store.jsx` reads | **Shop, Academy and the admin console moved 21 Sep 2026 on branch `phase-10` (HANDOFF §21)** — the audit below never saw them, because phase 10 lived on unpushed branches of the old repo. They are `apps/shop/`, and unlike every module above it does NOT port the SQL: the endpoints run 028/030/031's functions and RLS as the caller (`as_caller`), the way PostgREST did. **The audit (HANDOFF §10i, 19 Sep 2026), as it read then:** Shop/Academy/Notifications and the mock screens are static (Shop's only data path is `useMyChart` via `astro.js`, module 3); every remaining `store.jsx` read sits inside the wallet/profile/consultant staged cutovers; session/OTP stays on Supabase Auth. Nothing to build; the runbook is `backend-django/cutovers/RUNBOOK.md` |
| — | Auth | **Stays on Supabase Auth.** Revisit only if a requirement (SSO, email, deletion flows) forces it |

Wallet-and-payments (step 8) gets a **feature freeze and a cutover window**:
ledger and payments stop changing on the Supabase side for one deploy,
Django takes both, the old edge functions are retired after a quiet week.
Every other step cuts over with zero freeze because only one system serves
the module at a time.

## 7. Steps, concretely

**Phase 0 — protect what exists (done 19 Sep 2026)**
1. Full backup: `pg_dump` of the production project (Supabase dashboard
   backup + a manual dump stored outside Supabase), git tag `pre-django`
   on this repo, and a written rollback note in HANDOFF.
2. Decide and write down the staging host for the Django API. Not GCP
   yet — any container host that runs stateless Docker (Cloud Run is the
   obvious later choice; Railway/Render-class hosts are fine for staging).
3. Read-only mirror of the production schema into a scratch database;
   this is what `inspectdb` runs against in phase 1.

The git tag `pre-django` is in place. The backup and staging-host items are
still open — they gate the first deployment, not the code.

**Phase 1 — skeleton that later modules land on (done 19 Sep 2026; HANDOFF §10)**
4. `backend-django/` in this repo: Django + DRF, settings split
   (base/local/prod — plus test), twelve-factor env. **Shipped.**
5. Auth: JWT verification against Supabase's JWKS endpoint; a
   `request.profile` filled from the `profiles` table; permission classes
   per role (seeker / consultant / admin) that mirror what the module's
   RLS policies enforce today — the policy text in
   `docs/05-BACKEND-SCHEMA.md` is the specification.
   **JWT verification shipped** (JWKS RS256 with HS256 legacy fallback,
   claims-only user). `request.profile` and the DB-backed consultant
   check (`ConsultantExists`) are deliberately deferred to the module
   phases — there is no `profiles`/`consultants` table in Django yet;
   permissions are claims-based, which is all phase 1 endpoints need.
6. Cross-cutting: request id + structured logs, health endpoint, keyset
   pagination helper, idempotency-key middleware, rate limiting, outbox
   table + dispatcher, R2 presign endpoint, `media_assets`. **All shipped**
   (outbox dispatched by management command until Celery lands).
7. CI: lint, Django checks, pytest with a coverage floor on services;
   deploy to staging on merge. **Checks + pytest shipped** as
   `.github/workflows/api.yml`; no coverage-floor enforcement and no
   staging deploy yet — both wait for the staging host (phase 0 item 2).

**Phases 2–10 — one module at a time, always the same five moves**
8. Port the module's SQL check files to pytest against the real schema.
   **Done for all nine modules** (HANDOFF §10a–§10h; 450 tests green).
9. Build the Django app (models from the hand-tightened baseline,
   services, endpoints) until the pytest port is green. **Done for all
   nine.**
10. Rewrite the lib file's internals to REST. Deploy the API, then the
    client, in one release. Walk the routes. **Staged for all nine** —
    the client flips sit in `backend-django/cutovers/`; the deploy order,
    grouped into four production deploys, is
    `backend-django/cutovers/RUNBOOK.md`.
11. Revoke the module's RLS policies in a follow-up migration — only
    after the client release has been quiet in production. **Pending —
    the per-group revocation SQL is written into the runbook**, one quiet
    week behind each deploy.
12. Onward. Never two modules mid-flight at once. The runbook keeps the
    invariant that actually protects production — a cutover is atomic per
    lib file and one system serves a module at a time — while batching the
    five independent leaf modules (reactions, astro, bhakti, content,
    consultants) into one deploy; money-bearing modules (chat, wallet)
    still each get their own, in dependency order.

**Phase 11 — the edges**
13. Razorpay order/webhook edge functions → Django services (same
    contract, plus the reconcile job from HANDOFF's phase 3 notes).
    **Done as part of module 8 (HANDOFF §10g)** — `apps/wallet/` services,
    `/v1/wallet/` endpoints incl. the signature-only webhook, and the
    `reconcile_payments` management command; staged, not deployed. What
    remains here is only the retirement half: after the module-8 cutover
    window is quiet, undeploy the two edge functions (runbook deploy 4).
14. Astro provider edge function → provider interface behind Django
    (mock adapter kept for dev). **Done as part of module 3 (HANDOFF
    §10b)** — `apps/astro/providers.py` (`FreeAstroApiProvider` +
    `MockProvider`); the `astro` edge function's undeployment is runbook
    deploy 2.
15. What is left on Supabase is: Auth, and the database. That is the
    steady state until a requirement says otherwise. **Unchanged — that
    is also the runbook's final state**, plus the triggers Django
    deliberately leaves in force (`handle_new_user`, the phase-2 balance
    trigger, 016's `touch_thread`).

## 8. Hosting, answered

- **Front end (both apps): GitHub Pages is enough, indefinitely.** The
  apps are static SPAs; Pages + the existing deploy workflow carries them.
  The production deploy does not change during any of this.
- **The APK**: same codebase wrapped by Capacitor later — assets ship
  inside the APK, API calls go to wherever the Django API lives. No
  separate "app build" pipeline to buy.
- **GCP**: not needed now. When the Django API needs production hosting,
  Cloud Run is the default answer (stateless containers, scales to zero,
  cheap at this volume) — that decision belongs to phase 8's cutover, not
  today. Buy compute when there is compute to run; until the API ships,
  there isn't.
- **The pro app**: static build, same answer — Pages (or a second repo's
  Pages) whenever its hosting is decided; no server of its own, ever.

## 9. What this plan deliberately does not do

- No microservices. One Django monolith, modular apps, one database —
  the module seams above are also the service seams *if* a split is ever
  earned. Distributed transactions are avoided by design, not managed by
  tooling: one write = one database transaction, side effects via outbox.
- No multi-region, no read replicas, no Kafka, no CQRS. Each has a named
  trigger in §3.1 that justifies it later; none is triggered at this
  volume.
- No new database, no rewrite of the front end, no auth rebuild.
- No schema change for migration's sake. Tables gain columns when a
  module needs them, through Django migrations, with the forward-looking
  shape rules of §5.
