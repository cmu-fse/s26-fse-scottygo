# Sigrid Refactoring 4

## Architecture-Bounded Evolution

Summary: High co-evolution risk was observed across map and transit units, which indicates tightly coupled responsibilities and low isolation of change.

Primary hotspots:

- `server/controllers/transit.controller.ts`
- `client/scripts/controllers/filter-controller.ts`
- `client/scripts/map.ts`
- `client/scripts/trackers/vehicle-tracker.ts`

Root cause: Large units currently mix UI orchestration, API calls, domain logic, and state updates.

Recommended decomposition roadmap:

- Extract memory dashboard UI from controller logic into dedicated view modules.
- Keep health and memory endpoints separate from transit domain endpoints.
- Centralize client transit API calls in one service module.
- Extract prediction polling and stop popup lifecycle into a focused controller.
- Extract bus SVG icon rendering into a utility module.
- Keep `map.ts` as lifecycle/orchestration glue rather than a behavior-heavy module.

## Maintainability: Unit Size Focus

Summary: Large methods and files increase change risk and reduce readability and testability.

Previously completed themes:

- Notification report pipeline decomposition in `server/models/notification.model.ts`.
- Account-controller orchestration extraction in `server/controllers/account.controller.ts`.
- TripShot live-status decomposition in `server/services/tripshot-livestatus.service.ts`.
- Vehicle popup event-binding deduplication in `client/scripts/trackers/vehicle-tracker.ts`.
- Map-state typing alignment for filter and tracker flows in `client/scripts/state/map-state.ts`.
- Filter-controller helper extraction in `client/scripts/controllers/filter-controller.ts`.

## Mini-Sigrid Pass (2026-04-17)

### Account Controller Mini-Pass

Files:

- `server/controllers/account.controller.ts`

Changes:

- Added shared response helpers (`sendSuccess`, `sendClientError`) to remove repeated response object literals.
- Added shared validation and authorization helpers:
  - `requireOwnAccount`
  - `requireTextField`
  - `isValidStatus`
  - `isValidPrivilegeLevel`
- Reused these helpers across account retrieval and update endpoints.
- Kept endpoint contracts and payload shapes unchanged.

Outcomes:

- Lower duplication across account update endpoints.
- Smaller endpoint units with centralized guard logic.
- More consistent response assembly.

### Memory Dashboard Mini-Pass

Files:

- `server/views/memory-dashboard.ts`
- `server/views/memory-dashboard.styles.ts`
- `server/views/memory-dashboard.script.ts`

Changes:

- Split monolithic dashboard template into three modules:
  - HTML shell module (`memory-dashboard.ts`)
  - CSS module (`memory-dashboard.styles.ts`)
  - client-side script module (`memory-dashboard.script.ts`)
- Kept serving behavior unchanged through `HealthController.getMemoryDashboard`.

Outcomes:

- Reduced unit size of `memory-dashboard.ts`.
- Cleaner separation between markup, style, and behavior.
- Lower coupling for future dashboard-only changes.

### Supporting Response-Helper Pass

Files:

- `server/controllers/controller.ts`
- `server/controllers/map.controller.ts`

Changes:

- Added shared base helpers in controller superclass:
  - `clientError(...)`
  - `success(...)`
- Reused these helpers in map controller response paths.
- Ensured middleware methods are bound when class helper methods are used.

Outcomes:

- Reduced duplicated response boilerplate.
- More consistent response construction across controllers.
- Avoided runtime `this`-context middleware failures.

## Relevant Files for Next Pass

| File | Role |
| --- | --- |
| `server/controllers/account.controller.ts` | Continue shrinking side-effect-heavy update paths. |
| `server/views/memory-dashboard.ts` | Keep shell-only and avoid re-inlining behavior/style. |
| `client/scripts/map.ts` | Further reduce entrypoint method size via extraction. |
| `client/scripts/trackers/vehicle-tracker.ts` | Further split popup and rendering concerns. |
| `client/scripts/controllers/filter-controller.ts` | Continue decomposition of nearby-stop and filter application flows. |
