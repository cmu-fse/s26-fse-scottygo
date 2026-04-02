# Top 20 Refactoring Candidates From Sigrid

Date: 2026-04-02

## Scope and Constraints Applied

- Source data: all CSV files in `docs/Sigrid`.
- Ranking style: balanced weighted ranking across maintainability findings only (complexity, size, coupling, duplication, component independence, interfacing).
- Security/reliability findings are intentionally excluded from this assignment-specific list.
- Excluded from this plan as already delivered elsewhere: files changed in PR 142.
  - `server/controllers/account.controller.ts`
  - `server/controllers/auth.controller.ts`
  - `server/controllers/controller.ts`
  - `server/controllers/map.controller.ts`
  - `server/controllers/transit.controller.ts`
- Work split requirement applied:
  - Week 1: first 10 items split into 2 independent sets (no overlapping code areas).
  - Week 2: second 10 items split into 2 sets (overlap with Week 1 allowed).
  - 4 teammates total, 5 items each.

## Workstream Plan (No Names Yet)

- Week1-StreamA: Items 1-5 (client core flows)
- Week1-StreamB: Items 6-10 (server transit and platform)
- Week2-StreamC: Items 11-15 (client maintainability and duplication)
- Week2-StreamD: Items 16-20 (server maintainability and decomposition)

Effort legend:

- S: 0.5-1.0 ideal dev-days
- M: 1.0-2.0 ideal dev-days
- L: 2.0-3.0 ideal dev-days

## Ranked Top 20 Candidates

| Rank | Candidate | Why this is high-value | Sigrid evidence | Estimated effort | Workstream |
| --- | --- | --- | --- | --- | --- |
| 1 | Split `FilterController` into smaller modules | Very large interface module increases change risk and test burden | Component independence: MEDIUM, 781 LOC at `client/scripts/controllers/filter-controller.ts` | L | Week1-StreamA |
| 2 | Refactor `map.ts.setupMapEventListeners()` into focused handlers | Extreme complexity and size suggest high defect probability and poor readability | Unit complexity: HIGH, McCabe 74 at `client/scripts/map.ts#L386:701`; Unit size: HIGH, 264 LOC | L | Week1-StreamA |
| 3 | Decompose `auth.ts` into feature-level units | File-level complexity and size are both high and likely slowing safe changes | Unit complexity: HIGH, McCabe 60 at `client/scripts/auth.ts#L1:10`; Unit size: HIGH, 259 LOC | L | Week1-StreamA |
| 4 | Decompose `account.ts` and isolate save/update flows | High complexity and large unit surface area | Unit complexity: HIGH, McCabe 27 at `client/scripts/account.ts#L1:20`; Unit size: HIGH, 218 LOC | L | Week1-StreamA |
| 5 | Refactor `account.ts.handleSave()` into smaller validation/update units | A very complex save path has high review and regression risk | Unit complexity: HIGH, McCabe 55 at `client/scripts/account.ts#L516:726`; Unit size: HIGH, 77 LOC | M | Week1-StreamA |
| 6 | Break up `GTFSService.load()` into parse/validate/persist stages | High complexity + high size in backend ingestion path | Unit complexity: HIGH, McCabe 48 at `server/services/gtfs.service.ts#L74:92`; Unit size: HIGH, 215 LOC | L | Week1-StreamB |
| 7 | Reduce coupling in `user.model.ts` by extracting focused domain helpers | High fan-in and very large model surface indicate architecture pressure point | Module coupling: LOW, fan-in 18 with 694 LOC at `server/models/user.model.ts` | M | Week1-StreamB |
| 8 | Split `App.listen()` into startup phases | Large startup unit with branching is harder to test and reason about | Unit size: HIGH, 96 LOC at `server/app.ts#L314:429`; Unit complexity: MEDIUM, McCabe 12 | M | Week1-StreamB |
| 9 | Refactor `VehiclePositionsService.fetchAndStore()` | Polling pipeline has both notable size and complexity | Unit size: HIGH, 94 LOC at `server/services/vehicle-positions.service.ts#L154:260`; Unit complexity: MEDIUM, McCabe 25 | M | Week1-StreamB |
| 10 | Decompose large sections of `tripshot.service.ts` | Service module includes large units that should be split by responsibility | Unit size: HIGH, 96 LOC for `tripshot.service.ts` at `server/services/tripshot.service.ts#L4:163` | M | Week1-StreamB |
| 11 | Refactor `FilterController.applyDirectionFilter()` | Medium complexity plus high size in frequently touched filtering logic | Unit complexity: MEDIUM, McCabe 14 at `client/scripts/controllers/filter-controller.ts#L501:588`; Unit size: HIGH, 71 LOC | M | Week2-StreamC |
| 12 | Refactor `RouteRenderer` hot path and reduce coupling | Central renderer has high fan-in and a large core geometry method | Module coupling: MEDIUM, fan-in 26 at `client/scripts/renderers/route-renderer.ts`; Unit size: HIGH, `renderRouteGeometry` 78 LOC at `#L149:257` | M | Week2-StreamC |
| 13 | Refactor `TimePickerPanel.attachEvents()` into smaller handlers | Large event-binding unit is harder to test and reason about | Unit size: HIGH, 64 LOC at `client/scripts/components/time-picker.ts#L180:258` | M | Week2-StreamC |
| 14 | Refactor `CalendarPickerPanel.render()` into composable render helpers | Large render method tends to accumulate UI logic debt | Unit size: HIGH, 64 LOC at `client/scripts/components/calendar-picker.ts#L88:164` | M | Week2-StreamC |
| 15 | Eliminate repeated branch blocks in `map.ts` | Multiple duplicate clusters in same hot file indicate easy wins with helper extraction | Duplication: HIGH, 11 lines x4 (`#L348:362`, `#L407:421`, `#L447:461`, `#L488:502`) and 14 lines x3 (`#L363:381`, `#L537:555`, `#L578:596`) | M | Week2-StreamC |
| 16 | Split `App.configureApp()` into middleware/config phases | Large setup method is a maintenance bottleneck | Unit size: HIGH, 91 LOC at `server/app.ts#L69:148`; Unit complexity: MEDIUM, McCabe 13 | M | Week2-StreamD |
| 17 | Refactor `TripUpdatesService.fetchAndStore()` and align with polling abstraction | Similar complexity profile to vehicle positions suggests shared abstractions are possible | Unit size: HIGH, 86 LOC at `server/services/trip-updates.service.ts#L148:251`; Unit complexity: MEDIUM, McCabe 25 | M | Week2-StreamD |
| 18 | Refactor `mongo.db.ts` connection lifecycle and responsibilities | Large DB unit indicates mixed responsibilities and lower testability | Unit size: HIGH, 88 LOC at `server/db/mongo.db.ts#L4:136` | M | Week2-StreamD |
| 19 | Simplify `env.ts` validation and parsing flow | High complexity in environment handling increases startup failure risk | Unit complexity: HIGH, McCabe 46 at `server/env.ts#L3:57` | M | Week2-StreamD |
| 20 | Reduce duplication between trip-updates and vehicle-positions services | Duplicate polling/parsing blocks imply high leverage for shared utility extraction | Duplication: HIGH, 33 lines occurring 2 times at `server/services/trip-updates.service.ts#L78:150` and `server/services/vehicle-positions.service.ts#L84:156` | M | Week2-StreamD |

## Why This Split Supports Independent Work

- Week 1 has no overlap between teammates:
  - Week1-StreamA touches only client-side files under `client/scripts`.
  - Week1-StreamB touches only server-side/platform files under `server` plus dependency management.
- Week 2 groups are cohesive by concern:
  - Week2-StreamC is focused on client maintainability decomposition and duplication cleanup.
  - Week2-StreamD is focused on server maintainability decomposition and shared abstractions.

## Suggested Execution Order Inside Each 5-Item Batch

- Do largest structural decomposition tasks first in each batch (L then M).
- Then take medium units in high-churn modules.
- Finish with duplication extraction to reduce merge risk and maximize score impact.

## Near-Cut Candidate (Good backup if scope changes)

- `server/services/tripshot.service.ts` method `TripshotService.getStops(string,string)` (83 LOC, HIGH in Unit size findings).

## Verification Checklist (After Each Refactoring PR)

1. Confirm the PR targets only assigned items from this file and does not overlap with another in-progress teammate item.
2. Verify behavior is unchanged for the affected flow.

- Run the relevant test suite or manual scenario checks for the touched route/module.

3. Re-run local quality gates before opening/updating the PR.

- Run lint and tests.

4. Re-run Sigrid analysis for the updated branch/snapshot.
5. Check that the specific finding(s) mapped to the item are gone from the maintainability refactoring list.

- Examples: Unit complexity, Unit size, Duplication, Module coupling, Component independence.

6. Check that the project Maintainability score improved (or at minimum did not regress).
7. Record evidence in the PR description.

- Include item number(s), before/after Sigrid screenshot or metric snippet, and affected file/module.

8. If a finding does not disappear, split remaining work into a follow-up item and keep the original PR narrowly scoped.

### Suggested PR Template Snippet

- Refactoring item(s):
- Sigrid finding type(s):
- Before metric/list entry:
- After metric/list entry:
- Maintainability score delta:
- Validation performed (tests/manual):
