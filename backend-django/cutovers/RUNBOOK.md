# Cutover runbook — Supabase → Django, all modules

The executable sequence for cutting the nine built modules (HANDOFF §10–§10h)
over to the Django API in **four production deploys**. Each staged client
flip lives in this directory as `<module>.clientlib.js`; the same-commit
notes for `store.jsx`, `ProApply.jsx` and `Computing.jsx` are in those
files' headers.

**The one rule that bounds every rollback:** a cutover is atomic per lib
file. Reverting a client commit puts the Supabase-backed lib back, and the
Supabase backend is still serving that module — because the two backends
never serve one module at the same time, and Django fake-ins its migrations
(create-nothing) against tables both systems share. Django-written rows are
ordinary rows in the same tables; the old RPCs, policies and edge functions
keep working until their retirement step.

**What never moves:** Supabase Auth (session, OTP), the `profiles` row
created by the `handle_new_user` trigger, and Postgres itself
(docs/07-DJANGO-MIGRATION.md §1, §7 step 15). After the final deploy the
only live Supabase surfaces are Auth, the database, and the triggers Django
deliberately leaves in force (phase-2 balance trigger, 016's
`touch_thread`, `handle_new_user`).

---

## 0. Prerequisites (gate everything; docs/07 §7 phase-0 items still open)

1. **Production backup.** Fresh `pg_dump` of the production project stored
   outside Supabase, plus the dashboard backup. Verify it restores into a
   scratch database before deploy 1. The git tag `pre-django` already marks
   the tree.
2. **Production host for the API.** Any stateless container host (Cloud Run
   is the default per docs/07 §8). HTTPS URL, e.g. `https://api.1namo.com`.
3. **Client env.** Add `VITE_DJANGO_API_URL` to `.env.example`, to
   `.env.local` (dev) and to the GitHub Actions secrets (production) — the
   deploy workflow inlines `VITE_*` at build time, so the value ships in the
   bundle and the API must be live at that URL before any client flip.
4. **API env** (see `config/settings/base.py` for the full list):
   `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `DATABASE_URL` (the same
   Postgres), `SUPABASE_URL` (JWKS verification), `CORS_ALLOWED_ORIGINS`
   (the GitHub Pages origins), `MEDIA_PROVIDER=r2` + `R2_*` +
   `MEDIA_PUBLIC_BASE_URL`, `ASTRO_PROVIDER=freeastroapi` +
   `FREE_ASTRO_API_KEY`, and at deploy 3 `RAZORPAY_KEY_ID`,
   `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.

---

## Deploy 1 — API bootstrap (no freeze, no client change)

Nothing routes to Django yet; Supabase serves every module throughout.
This deploy only stands the API up and makes Django's migration metadata
true, so every later deploy is a client commit.

1. Deploy the API to production with the env above.
2. `python manage.py migrate --fake-initial` against the production
   database. `--fake-initial` is the whole trick (docs/07 §5): for the nine
   business apps the tables already exist, so the initial migrations are
   recorded as applied and create nothing; for `apps/core` (`outbox_events`)
   and `apps/media` (`media_assets`) the tables do **not** exist in
   production, so those migrations apply for real and create them. One
   command handles both cases.
3. `python manage.py showmigrations` — every app `[X]`, and confirm the two
   new tables exist:
   `python manage.py dbshell -c "\d outbox_events" -c "\d media_assets"`.
4. Start `python manage.py dispatch_outbox` on a 1-minute scheduler (cron /
   host timer) — it is idempotent and harmless from day one.
5. Verify:
   ```bash
   curl -s https://api.1namo.com/v1/health/        # {"status":"ok","version":...}
   curl -s https://api.1namo.com/v1/me/            # 401 unauthenticated — JWT path live
   curl -s https://api.1namo.com/v1/bhakti/assets/ # 200 [...] — DB reachable
   ```
6. Rollback: take the API down. No client ever called it; nothing else to
   undo.

---

## Deploy 2 — batch A: reactions, astro, bhakti, content, consultants

Five leaf modules, no interdependency, no money in flight. One client commit
flips five lib files plus the two module-6 same-commit edits. No freeze:
each lib is the whole seam, so a revert restores the Supabase path
instantly.

1. Sanity-verify the five anonymous read surfaces against production data:
   ```bash
   curl -s https://api.1namo.com/v1/bhakti/assets/ | head -c 300
   curl -s "https://api.1namo.com/v1/content/feed/?limit=3" | head -c 300
   curl -s https://api.1namo.com/v1/consultants/ | head -c 300
   curl -s "https://api.1namo.com/v1/astro/panchang/?date=$(date +%F)" | head -c 300
   curl -s "https://api.1namo.com/v1/reactions/counts/?target_type=post&target_id=<a live post id>"
   ```
   Responses are the same rows PostgREST served; feed/consultants ordering
   matches the client's old query (`-published_at NULLS LAST, -id`; rating
   desc NULLS LAST).
2. One client commit:
   - `cutovers/reactions.clientlib.js` → `src/lib/reactions.js`
   - `cutovers/astro.clientlib.js` → `src/lib/astro.js`
   - `cutovers/bhakti.clientlib.js` → `src/lib/bhakti.js`
   - `cutovers/content.clientlib.js` → `src/lib/content.js`
   - `cutovers/consultants.clientlib.js` → `src/lib/consultants.js`
   - store.jsx: `refreshConsultant` switches to `myConsultant()` (the
     cutover header, step "same-commit client edits")
   - `ProApply.jsx`: band picker → `listPriceBands()`, submit →
     `applyAsConsultant()`
3. Deploy seeker + pro builds. Walk the routes: Home/feed, Reels, Bhakti,
   Horoscope, a chart, Consult → a consultant profile → availability grid,
   and `/pro/apply` (submit one test application on dev data first).
4. **Quiet week.** Watch the API logs and the refusal envelopes.
5. RLS revocation, only after the quiet week — this is a database change,
   not a deploy (Supabase SQL editor / CLI against the production ref;
   dev first, same file, per backend/INSTRUCTIONS.md §3):
   ```sql
   -- reactions
   drop policy if exists reactions_own on public.reactions;
   revoke insert (actor_id, target_type, target_id, kind), delete
     on public.reactions from authenticated;
   -- bhakti (catalogue is served by Django now)
   drop policy if exists bhakti_assets_public_read on public.bhakti_assets;
   revoke select on public.bhakti_assets from anon, authenticated;
   -- astro_cache needs NOTHING: 019 put RLS on with deliberately no policy
   --   (service-role-only is the spec), and Django's service layer is that
   --   reader now. The edge function retires at step 6.
   -- content
   drop policy if exists content_select_live on public.content;
   drop policy if exists content_select_own on public.content;
   drop policy if exists content_update_own on public.content;
   drop policy if exists reviews_select_live on public.reviews;
   revoke insert (author_id, kind, title, body, media_url, caption, status, published_at)
     on public.content from authenticated;
   revoke insert (booking_id, seeker_id, consultant_id, rating, body)
     on public.reviews from authenticated;
   -- consultants (leave availability/services write policies until deploy 4 is quiet —
   --   they are the consultant's grid, cut with the booking flow if preferred)
   drop policy if exists consultants_select_approved on public.consultants;
   drop policy if exists consultants_insert_own on public.consultants;
   drop policy if exists price_bands_select_active on public.price_bands;
   drop policy if exists consultant_services_select_public on public.consultant_services;
   drop policy if exists consultant_availability_select_public on public.consultant_availability;
   revoke execute on function public.consultant_open_slots(uuid, date) from anon, authenticated;
   revoke execute on function public.book_session(uuid, uuid, timestamptz) from authenticated;
   revoke select on public.consultants_public, public.authors_public,
     public.content_public, public.reviews_public, public.profile_follow_counts,
     public.consultant_follower_counts from anon, authenticated;
   ```
   Then verify from a signed-in client context that the screens still work
   (they hit Django; the revoked grants must change nothing) and that a raw
   `supabase.from('content').select()` from the browser console now refuses.
6. Retire the `astro` Edge Function (`supabase functions delete astro
   --project-ref <prod>`) once the astro cutover is quiet — the only caller
   was `callAstro`. Storage: `content-media` bucket reads move to R2
   (`MEDIA_PUBLIC_BASE_URL`); leave the bucket in place until the quiet
   week confirms no old `media_url` 404s (old URLs still point at Supabase
   storage — see "Media URLs" below).
7. **Rollback before revocation:** revert the client commit. Supabase
   serves again immediately (its policies are still live). **Rollback
   after revocation:** restore the dropped policies from
   `backend/schema/` (020/024/025/026/007/009) — which is why revocation
   waits for the quiet week; there should be no rollback left to do.

### Media URLs (content + avatars)

Old `media_url`/`avatar_url` values point at Supabase Storage. New uploads
go to R2 through the presign flow and store R2 URLs. Both render: the
bucket stays readable (its `content_media_public_read` storage policy) until
a later cleanup decides otherwise; do not delete the bucket in this runbook.

---

## Deploy 3 — chat (the meter): sweeper FIRST, then the client flip

Chat is the one module where order inside the deploy matters more than for
any other (HANDOFF §10f): an un-swept hold is the silent failure 014 exists
to kill. The Django sweeper must be running **before** any client polls it.

1. Start `python manage.py sweep_sessions` on a **1-minute scheduler**,
   alongside `dispatch_outbox`. The command is idempotent — CAS settle, FOR
   UPDATE SKIP LOCKED, counts only what it settled — safe to run while
   production traffic is still on Supabase: its arithmetic is 014-as-amended
   statement for statement, and any session it settles is settled exactly
   once whichever sweeper gets there first.
2. Unschedule the Supabase-side sweeper: the pg_cron job installed by 014:
   ```sql
   select cron.unschedule('session-sweep');  -- verify: select * from cron.job;
   ```
   Order between 1 and 2 may be reversed in an emergency (the CAS makes a
   brief overlap safe); the recommended order keeps a sweeper live every
   minute.
3. Verify one full minute passes with `sweep_sessions` running clean in the
   logs and `select count(*) from sessions where status='live'` answering
   the same before/after on an idle period.
4. Client commit: `cutovers/chat.clientlib.js` → `src/lib/chat.js`.
   `ChatPanel`, `ConsultantProfile`, `ProConsult` need no edit — the three
   subscriptions are now pollers (3s messages, 5s session lists) returning
   the same unsubscribe functions. The behavioural change: message latency
   up to ~3s instead of Realtime push, until the channels layer lands as a
   later phase. The meter is untouched — it never lived in the transport.
5. Walk the routes: request a chat from a seeker account, accept from the
   consultant account, exchange messages, press End, verify the ledger rows
   and the balance on both sides.
6. **Quiet week.**
7. RLS revocation after the quiet week:
   ```sql
   drop policy if exists sessions_select_mine on public.sessions;
   drop policy if exists threads_select_mine on public.threads;
   drop policy if exists messages_select_participant on public.messages;
   drop policy if exists messages_insert_in_a_live_session on public.messages;
   drop policy if exists messages_mark_read on public.messages;
   revoke insert on public.messages from authenticated;
   revoke update (read_at) on public.messages from authenticated;
   revoke execute on function public.session_request(uuid, uuid) from authenticated;
   revoke execute on function public.session_accept(uuid) from authenticated;
   revoke execute on function public.session_end(uuid, text) from authenticated;
   revoke execute on function public.session_heartbeat(uuid) from authenticated;
   revoke select on public.threads_view from authenticated;
   ```
   Keep `session_sweep()` in the database (harmless, revoked from callers);
   keep 015's realtime publication in place until nothing subscribes — the
   flipped client no longer does.
8. **Rollback:** revert the chat lib (Realtime subscriptions return with
   it), re-enable the pg_cron job
   (`select cron.schedule('session-sweep','* * * * *','select public.session_sweep()');`),
   stop the Django scheduler. Settles written by the Django sweeper are
   already-correct rows in shared tables; the Supabase RPCs keep working
   for everything else because their policies are untouched until step 7.

---

## Deploy 4 — wallet + payments + profile, the freeze window (one client commit)

The ONE module with a freeze (docs/07 §6 step 8) — and profile rides in the
same commit: both cutovers rewrite blocks of the same `store.jsx`, the
wallet checkout prefill reads `profile` state, and one freeze covering both
halves costs less than two. Money stops changing on the Supabase side for
exactly one deploy.

1. **Feature freeze** wallet/payments: no schema, client or edge-function
   changes to wallet, ledger, payments, Razorpay until step 8 is quiet.
2. Verify the read surfaces with a real token (any signed-in session JWT):
   ```bash
   curl -s -H "Authorization: Bearer $TOKEN" https://api.1namo.com/v1/wallet/
   curl -s -H "Authorization: Bearer $TOKEN" "https://api.1namo.com/v1/wallet/ledger/?limit=5"
   curl -s -H "Authorization: Bearer $TOKEN" https://api.1namo.com/v1/profiles/me/
   ```
   Balance equals the `wallets` row; ledger rows are raw snake_case exactly
   like PostgREST.
3. **Razorpay webhook switch** (dashboard → Settings → Webhooks): point the
   endpoint at `https://api.1namo.com/v1/wallet/webhook/razorpay/`, re-save
   so the secret matches `RAZORPAY_WEBHOOK_SECRET`. The credit is
   idempotent on `provider_payment_id` in the same tables both systems
   write, so one delivery straddling the switch cannot credit twice — but
   switch once, deliberately. Verify with one **test-mode** payment end to
   end: order → checkout → webhook → balance moves → ledger row appears.
   (HANDOFF phase 3: live checkout is currently refused pending Razorpay's
   website review — test-mode keys and a test payment verify the path; the
   band and every refusal sentence are identical in test mode.)
4. One client commit (the rest of the store split, per the two cutover
   headers):
   - `cutovers/wallet.clientlib.js` → `src/lib/wallet.js`; store.jsx wallet
     block rewires to `createWalletApi` (guards stay in store.jsx);
     `toLedgerRow`/`formatLedgerDate` move to the lib.
   - `cutovers/profiles.clientlib.js` → `src/lib/profile.js` (the
     `createProfileApi` half) and its `uploadAvatar` replaces
     `src/lib/avatar.js`'s content (Profile.jsx needs no edit).
   - store.jsx profile block rewires `refreshProfile` to the api;
     `Computing.jsx`'s write block becomes `profileApi.saveProfile({...})`
     (same keys, no `.eq('id', ...)` — the JWT is the identity).
   - `supabase` stays imported in store.jsx and the onboarding screens:
     the session still comes from Supabase Auth, and the access token IS
     the Django credential.
5. Walk the money routes on dev data first, then release: Wallet (balance +
   ledger render), a top-up through checkout (test mode), a spend (Buy on
   Shop), a booking debit, the onboarding reveal screen write, an avatar
   change (presign → PUT → confirm → profile pointer).
6. `python manage.py reconcile_payments` after the first real payments and
   once mid-week — read-only; it names anyone owed. Run it after any
   webhook change and before believing the first live payment.
7. **Quiet week**, with the freeze held throughout.
8. After the quiet week — the retirement half of docs/07 §7 step 13:
   - Undeploy the two edge functions:
     `supabase functions delete razorpay-order razorpay-webhook --project-ref <prod>`
   - RLS revocation:
   ```sql
   drop policy if exists wallets_select_own on public.wallets;
   drop policy if exists ledger_select_own on public.ledger;
   drop policy if exists payments_select_own on public.payments;
   drop policy if exists orders_select_own on public.orders;
   drop policy if exists order_items_select_own on public.order_items;
   drop policy if exists earnings_ledger_select_own on public.earnings_ledger;
   drop policy if exists profiles_select_own on public.profiles;
   drop policy if exists profiles_update_own on public.profiles;
   drop policy if exists bookings_select_mine on public.bookings;
   drop policy if exists bookings_update_decision on public.bookings;
   drop policy if exists consultant_availability_write_own on public.consultant_availability;
   drop policy if exists consultant_services_write_own on public.consultant_services;
   drop policy if exists consultant_time_off_own on public.consultant_time_off;
   drop policy if exists consultants_select_own on public.consultants;
   drop policy if exists consultants_update_own on public.consultants;
   revoke execute on function public.wallet_debit(integer, text) from authenticated;
   revoke select on public.bookings_view from authenticated;
   revoke update (name, birth_date, birth_time, birth_time_known, birth_place,
     birth_lat, birth_lon, birth_zone), update (email), update (avatar_url)
     on public.profiles from authenticated;
   ```
   Deliberately left in force: the phase-2 balance trigger
   (`apply_ledger_to_balance`) and `refuse_mutation` — Django's services
   never double-write what a trigger does and the ledger's append-only
   guarantee survives any client bug; `handle_new_user`; `touch_thread`.
9. **Rollback before revocation:** unfreeze, revert the client commit (the
   Supabase RPCs and edge functions still serve — they were untouched),
   switch the Razorpay webhook back to the edge-function URL. Rows written
   by Django are ordinary rows both backends read correctly. **Rollback
   after revocation:** restore policies from `backend/schema/`
   (001/002/003/006/008/009) and redeploy the edge functions from
   `backend/functions/` — again, why revocation waits for the quiet week.

---

## Final state check

- `curl -s https://api.1namo.com/v1/health/` — live, versioned.
- Every module's endpoints verified per deploy above; 450 pytest-django
  tests green in CI (`.github/workflows/api.yml`).
- Supabase retains: Auth (OTP), Postgres, the triggers listed in deploy 4
  step 8. RLS is revoked for every migrated table; edge functions and the
  pg_cron sweeper are retired; `outbox_events` dispatch and
  `sweep_sessions` run on the host scheduler.
- Scheduling recap (all 1-minute, all idempotent):
  `dispatch_outbox`, `sweep_sessions`. Celery replaces the cron wrappers
  later without changing claiming logic (`tasks/README`).
