# Namo (aether-mono)

Astrology marketplace for India. Vite · React 18 · Tailwind · HashRouter.
Two sides in one codebase: seeker (`/home`, `/pooja`, `/consult`, `/shop`,
`/academy`) and consultant (`/pro/*`). An admin console is planned and unbuilt.

**No backend yet** — every value comes from `src/data/mock.js`.

## Map

```
src/            the app. Do not reorganise — App.jsx routing and the
                index.css component layer both assume this shape
  components/   shared UI. Read index.css @layer components before writing markup
  screens/      seeker screens, one file each, default export, no props
  pro/          consultant screens
  data/         mock.js + bhaktamar.js. All content lives here
docs/           the six planning documents, numbered to read in order
backend/        INSTRUCTIONS.md — the eight rules every phase obeys
tools/          Python art pipeline for the deity murtis
public/         cards/ (48 tarot faces) · deities/ (26 murtis)
HANDOFF.md      what is actually true right now. Read this first
```

## Which document owns what

Each fact has exactly one home. When something needs writing down, it goes in
the file that owns it and the others link to it — **never copy a fact between
documents.**

| What came up | Goes in |
|---|---|
| Product scope, users, features, **any rupee amount**, admin capabilities, regulatory | `docs/01-PRD.md` |
| Stack, trust boundary, API surface, auth, RLS strategy, admin isolation, NFRs | `docs/02-TRD.md` |
| Routes, screens, actions, overlays, state machines, money paths | `docs/03-APP-FLOW.md` |
| Tokens, components, affordances, imagery, accessibility, voice | `docs/04-UI-UX.md` |
| **Any table or column**, constraints, indexes, RLS policies, seed plan | `docs/05-BACKEND-SCHEMA.md` |
| Phases, done-conditions, gates, risks | `docs/06-IMPLEMENTATION.md` |
| An engineering rule or convention | `backend/INSTRUCTIONS.md` |
| **Anything built, blocked, deferred or discovered** | `HANDOFF.md` |

Two boundaries that get crossed first:

- **App Flow never mentions a colour. UI/UX never mentions data loading.**
- **TRD owns RLS strategy; Schema owns the policy text.**

## Rules for editing them

- **Update in the same session as the work or the discussion**, without being
  asked.
- **Edit the existing section.** No changelogs appended at the bottom. If a
  decision reverses, rewrite it and say what it replaced.
- **State, not intent.** `HANDOFF.md` describes what is true right now. A
  document describing the plan as though it were built is worse than no
  document, because it gets trusted.
- **Date `HANDOFF.md`** when the state changes.
- **Say which file changed**, in one line. Never silently.

## Traps

`docs/04-UI-UX.md` §11 lists nine that have already cost time. The two that
recur:

1. **`npm run build` passing proves almost nothing.** No linter, no type checker
   — an undefined identifier inside JSX is a runtime error with a green build.
   Walk the routes.
2. **Tailwind's opacity modifier silently emits nothing on this palette**, because
   every colour resolves through a CSS variable. Anything translucent needs an
   inline literal `rgba()`.

## House style

Copy follows the voice rule at the top of `src/data/mock.js`: second person,
present tense, imperative where possible. No hedging, no emoji, no exclamation
marks. Blunt rather than reassuring. **Documentation in this repo matches it.**

Scripture is not copy. The Sanskrit, transliteration and English renderings in
`bhaktamar.js` are the tradition's words — never rewritten to match the house
voice, and never reconstructed when incomplete.
