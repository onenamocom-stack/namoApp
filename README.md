# Namo — aether-mono

An astrology marketplace for India, built as a phone app. A seeker asks a
question; a consultant answers it, live, for money. Around that sit a daily
reading, a birth chart, an animated shrine, a 48-card Bhaktamar tarot deck,
remedial products and courses.

Two sides in one codebase — seeker and consultant (`/pro/*`) — with an admin
console planned.

**Front end only.** No backend, no auth, no persistence. Every value on screen
comes from `src/data/mock.js`, and nothing survives a reload.

## Run it

```bash
npm install
npm run dev          # or: npm run dev -- --port 5260
```

**Live:** https://atharvborse2004-ops.github.io/aether-mono/#/home
Pushing to `main` deploys automatically.

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
| [backend/INSTRUCTIONS.md](backend/INSTRUCTIONS.md) | The eight engineering rules |
