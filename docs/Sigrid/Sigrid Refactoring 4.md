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

## Peer Review Follow-Up (2026-04-17)

### Teammate 1: JWT middleware duplication across controllers

Assessment:

- Valid. `MapController.authorize` was still a duplicate JWT implementation, and auth behavior was inconsistent across controllers.

Applied fix:

- Added shared JWT middleware in base controller:
  - `Controller.authenticateToken(req, res, next)`
  - `Controller.getTokenPayload(req)`
- Removed duplicated JWT middleware methods from:
  - `server/controllers/map.controller.ts`
  - `server/controllers/account.controller.ts`
  - `server/controllers/notification.controller.ts`
- Updated map routes to use `this.authenticateToken.bind(this)` directly.
- Standardized token attachment strategy to typed `req.user` payload handling.

Outcome:

- Removed copy-paste auth logic across controllers.
- Unified JWT verification and token error responses in one implementation.

### Teammate 2: inconsistent success/error response helper usage

Assessment:

- Valid. Account controller used local `sendSuccess` and `sendClientError` wrappers even though base helper methods already existed.

Applied fix:

- Removed local account-controller wrappers:
  - `sendSuccess(...)`
  - `sendClientError(...)`
- Replaced usage with direct base helpers:
  - `this.success(...)`
  - `this.clientError(...)`
- Kept `sendAccountSuccess(...)` only as a narrow account-payload convenience wrapper (obfuscation + authorized user), backed by `this.success(...)`.

Outcome:

- Standardized success/error shape construction on base-controller primitives.
- Reduced helper overlap and improved consistency with teammate review guidance.

## Relevant Files for Next Pass

| File | Role |
| --- | --- |
| `server/controllers/account.controller.ts` | Continue shrinking side-effect-heavy update paths. |
| `server/views/memory-dashboard.ts` | Keep shell-only and avoid re-inlining behavior/style. |
| `client/scripts/map.ts` | Further reduce entrypoint method size via extraction. |
| `client/scripts/trackers/vehicle-tracker.ts` | Further split popup and rendering concerns. |
| `client/scripts/controllers/filter-controller.ts` | Continue decomposition of nearby-stop and filter application flows. |

## Branch Summary Table (Sigrid-Refactoring-4-CR)

| Item | File | Category | Severity | Description |
| --- | --- | --- | --- | --- |
| 1 | `server/controllers/controller.ts` | Duplication | HIGH | Centralized JWT auth middleware (`authenticateToken`) and token access helper (`getTokenPayload`) to remove copy-paste controller auth logic. |
| 2 | `server/controllers/map.controller.ts` | Duplication | HIGH | Replaced route-level custom JWT middleware with shared base middleware; retained `authorize` as a compatibility alias that delegates to shared auth. |
| 3 | `server/controllers/account.controller.ts` | Duplication | HIGH | Removed controller-local JWT implementation and standardized account endpoint authorization through shared guard helpers (`requireAdminUser`, `requireAdminOrOwnUser`, `requireOwnUser`). |
| 4 | `server/controllers/notification.controller.ts` | Duplication | HIGH | Removed controller-local JWT implementation and reused base controller middleware for all protected notification routes. |
| 5 | `server/controllers/account.controller.ts` | Unit Interfacing | MEDIUM | Removed generic local response wrappers (`sendSuccess`, `sendClientError`) and standardized success/error construction around base `success(...)` and `clientError(...)` helpers. |
| 6 | `server/controllers/account.controller.ts` | Unit Size | HIGH | Extracted repeated request validation and authorization flows into focused helpers and simplified endpoint orchestration (`getAllUsers`, `searchUsers`, `getUserAccount`, `update*`). |
| 7 | `server/controllers/controller.ts` | Unit Interfacing | MEDIUM | Added reusable response/auth primitives to base class to narrow per-controller surface area and improve consistency. |
| 8 | `server/search/search-strategy.ts` | Unit Size | HIGH | Moved shared search tokenization/normalization and notification text matching out of strategy class into dedicated utility module. |
| 9 | `server/search/search.utils.ts` | Unit Size | HIGH | Introduced shared search helpers (`filterStopWords`, `toSearchTokens`, `matchesAllQueryTokens`, `matchesNotificationText`) and compacted stop-word declaration to reduce file bloat. |
| 10 | `server/services/tripshot-livestatus.service.ts` | Unit Size | HIGH | Decomposed scheduled-time parsing into focused helper methods (`parseClockTime`, `getEasternRideDateString`, `getEasternClockParts`, `normalizeDayBoundaryOffsetSeconds`). |
| 11 | `server/services/tripshot-livestatus.service.ts` | Duplication | HIGH | Centralized repeated prediction map insertion into `appendPrediction(...)` and reused it across scheduled/live prediction paths. |
| 12 | `server/views/memory-dashboard.ts` | Unit Size | HIGH | Removed large inline style/script blocks and converted template to composition of extracted style/script modules. |
| 13 | `server/views/memory-dashboard.styles.ts` | Unit Size | MEDIUM | Extracted dashboard CSS into a dedicated module to isolate presentation changes from template structure. |
| 14 | `server/views/memory-dashboard.script.ts` | Unit Size | HIGH | Replaced monolithic script string with composition of smaller script parts to reduce single-unit size. |
| 15 | `server/views/memory-dashboard.script.part1.ts` | Unit Size | MEDIUM | Added focused script segment for setup, chart rendering, and detail list behavior. |
| 16 | `server/views/memory-dashboard.script.part2.ts` | Unit Size | MEDIUM | Added focused script segment for metrics drilldown, hover interactions, and metric card rendering. |
| 17 | `server/views/memory-dashboard.script.part3.ts` | Unit Size | MEDIUM | Added focused script segment for reload/polling/export lifecycle and event wiring. |
| 18 | `client/scripts/components/map-controls.ts` | Unit Size | MEDIUM | Split large `connectedCallback()` into `renderControls()` and `bindControlEvents()` to reduce method size and improve readability. |
| 19 | `client/scripts/trackers/vehicle-tracker.ts` | Duplication | HIGH | Removed duplicated bus-popup event wiring by consolidating popup action binding paths. |
| 20 | `client/scripts/controllers/prediction-controller.ts` | Unit Size | HIGH | Extracted and organized prediction polling and popup lifecycle logic into a dedicated controller boundary. |
| 21 | `client/scripts/utils/map-popup.ts` | Duplication | HIGH | Removed repeated minimize-state capture logic by introducing shared `cachePopupState(...)` used by both minimize flows. |
| 22 | `docs/Sigrid/Sigrid Refactoring 4.md` | Documentation Quality | MEDIUM | Normalized and expanded documentation with mini-pass notes, peer-review follow-up, and branch-wide summary inventory. |
