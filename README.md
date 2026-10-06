# Namo — aether-mono

An astrology marketplace for India, built as a phone app. A seeker asks a
question; a consultant answers it, live, for money. Around that sit a daily
reading, a birth chart, an animated shrine, a 48-card Bhaktamar tarot deck,
remedial products and courses.

Two apps, one codebase — the seeker app (default build) and the consultant
app (`/pro/*`, built separately with `--mode pro`), with an admin console
planned. The backend is Supabase: schema in `backend/schema`, server
functions in `backend/functions`, per `docs/02-TRD.md`. A Django API is
being layered in module by module under `backend-django/` — see
[docs/07-DJANGO-MIGRATION.md](docs/07-DJANGO-MIGRATION.md).

## Run it

```bash
npm install
npm run dev          # seeker app — or: npm run dev -- --port 5260
npm run dev:pro      # consultant app
npm run build        # seeker → dist/ (what production deploys)
npm run build:pro    # consultant → dist-pro/
```

## The two deployments

| App | Build | Firebase Hosting site | URL |
|---|---|---|---|
| **Seeker** | `npm run build` → `dist/` | `namo-web` | https://1namo.com |
| **Consultant** | `npm run build:pro` → `dist-pro/` | `namo-pro` | https://pro.1namo.com |

Both deploy from this repo with **`npm run ship`** (`scripts/ship.mjs`):
it refuses uncommitted changes, checks `.env.local`, lints, builds and
deploys with the Firebase CLI (`npx.cmd firebase-tools login` once, as the
project's owner). Nothing deploys on a push — GitHub holds the code and runs
nothing (6 Oct 2026). The `namo-pro` repo is retired.

1namo.com still serves the previous deployment from the original repo
(`atharvborse2004-ops/aether-mono`). The domain moves here only after the
new deployments are walked and approved — the CNAME swap is the last step
of the production window, not the first.

## Stack

React 18 · Vite 5 · Tailwind 3 · react-router-dom (HashRouter).
Three runtime dependencies. No icon library, no state library, no UI kit.

## Where things are documented

Start with **[HANDOFF.md](HANDOFF.md)** — what is actually true right now.

| | |
|---|---|
| [docs/01-PRD.md](docs/01-PRD.md) | Product, users, features, pricing |
| [docs/02-TRD.md](docs/02-TRD.md) | Stack, trust boundary, API surface |
| [docs/03-APP-FLOW.md](docs/03-APP-FLOW.md) | Routes, screens, state machines |
| [docs/04-UI-UX.md](docs/04-UI-UX.md) | Design system |
| [docs/05-BACKEND-SCHEMA.md](docs/05-BACKEND-SCHEMA.md) | Tables, RLS, seed plan |
| [docs/06-IMPLEMENTATION.md](docs/06-IMPLEMENTATION.md) | Build phases |
| [docs/07-DJANGO-MIGRATION.md](docs/07-DJANGO-MIGRATION.md) | Django migration + scale plan |
| [backend/INSTRUCTIONS.md](backend/INSTRUCTIONS.md) | The eight engineering rules |
