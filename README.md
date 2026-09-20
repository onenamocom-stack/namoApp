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

| App | Repo | URL |
|---|---|---|
| **Seeker** (this repo) | `onenamocom-stack/namoApp` | https://1namo.com/#/home |
| **Consultant** | [`onenamocom-stack/namo-pro`](https://github.com/onenamocom-stack/namo-pro) | https://onenamocom-stack.github.io/namo-pro/ |

Pushing to `main` of this repo deploys the seeker app automatically. The
consultant app deploys from the namo-pro repo's workflow, which builds this
repo's `--mode pro` target — see its README.

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
