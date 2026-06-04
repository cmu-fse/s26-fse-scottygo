# CLAUDE.md

Guidance for working in the ScottyGo codebase with Claude Code (or other AI coding tools). This file documents project conventions and how AI was used during development.

## Project overview

ScottyGo is a real-time CMU transit tracker: a TypeScript full-stack app (Express + Socket.io backend, Parcel-bundled browser frontend, MongoDB via Mongoose) that integrates PRT bus data (TrueTime / GTFS-Realtime) and CMU Shuttle data (TripShot) on a Google Maps interface. See `README.md` for the feature and architecture overview.

## Repository layout

- `client/` — frontend; `pages/`, `scripts/` (components, controllers, renderers, services, state, trackers, utils), bundled with Parcel.
- `server/` — backend; `controllers/` (account, auth, map, transit, notification, subscriptions), `models/`, `services/` (external transit feeds + alerts, moderation, email, memory monitor), and `search/` (Strategy-pattern search).
- `common/` — TypeScript interfaces shared across client and server. Change shared types here, never duplicate them.
- `tests/` — Jest tests under `server.tests/` split into `unit.tests/`, `integration.tests/`, and `rest.tests/`.
- `docs/` — architecture, REST API specs, integration notes, runbooks.

For deeper architectural detail (layer responsibilities, the database-access-through-Models rule, the `IMapProvider` abstraction, real-time data-flow diagrams, and code-generation guidelines), see [`.github/copilot-instructions.md`](.github/copilot-instructions.md), which serves as the in-depth technical reference for this codebase.

## Key commands

```bash
npm run watch              # build + run with auto-reload (primary dev loop)
npm run build              # Parcel build (client + server)
npm start                  # run built server
npm run lint               # ESLint over the repo
npm test                   # full Jest suite
npm run test:unit          # unit tests only
npm run test:integration   # integration tests only
npm run test:rest          # REST API tests only
npm run test:server        # unit + integration + REST
```

Per-feature test scripts exist (e.g. `npm run test:unit:discoverstops`, `npm run test:integration:livenotification`) — see `package.json` `scripts`.

## Conventions

- **TypeScript throughout**, CommonJS modules. Shared types live in `common/`.
- **Design patterns are intentional**: Strategy for contextual search (`server/search/`), Observer for live notifications, Singleton for server-side controllers. Preserve these when extending related code.
- **Controllers stay thin**; business logic and external-feed access belong in `services/`.
- **External transit feeds are wrapped in services** (`truetime.service.ts`, `gtfs.service.ts`, `tripshot*.ts`, `vehicle-positions.service.ts`, `trip-updates.service.ts`) with caching — call feeds through these, not directly.
- **Linting and formatting** via ESLint + Prettier; run `npm run lint` before committing.
- **Tests** use Jest with `--runInBand` and `--detectOpenHandles`; mirror the existing unit/integration/REST split when adding coverage.

## Workflow expectations

- **Main-branch protection**: every change reaches `main` via PR with required review and approval. Never assume direct pushes.
- **CI**: GitHub Actions runs lint + tests on PRs; keep them green.
- **Sigrid** static analysis is enabled; prefer changes that maintain or improve maintainability ratings.

## How AI tooling was used in this project

AI coding tools (Claude, GitHub Copilot) were used as directed collaborators, not autopilots:

- **Small, bounded requests** rather than whole-feature generation, to keep diffs reviewable.
- **Human review of every change** before it entered a PR; redundant or over-generated code (e.g. excess test cases) was pruned.
- **Edge cases traced and tested by hand** rather than trusting generated tests as proof of correctness.
- **All code reviewed and approved by a human teammate** via the main-branch-protection workflow before merge.

When extending this codebase with AI assistance, follow the same approach: specify intent precisely, work in small increments, read the diff critically, and verify behavior with tests.
