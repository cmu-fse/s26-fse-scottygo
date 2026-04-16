# Replace Calendar/Time Filters with Route Info Popup

**Type:** Enhancement / Usability  
**Priority:** Medium  
**Labels:** `enhancement`, `map`, `usability`, `frontend`, `backend`

---

## Summary

Remove the calendar-picker and time-picker filter panels from the map page. Instead, add a **Route Info popup modal** (triggered when the user selects a route) that displays the route's **service schedule** (operating days and trip time ranges from GTFS data) and **active alerts/detours**. This consolidates route information into a single, contextual popup — similar in style to the existing stop prediction popup.

---

## Motivation

- The calendar and time filter panels require users to set a date/time before seeing which routes are available, adding friction to the common use case of simply viewing current route info.
- Service hours and alerts are more useful when displayed in context alongside the selected route, rather than as a global filter.
- Reduces UI clutter on the map page by removing two floating panels and a toolbar button.

---

## Current Behavior

1. Map toolbar (`<map-controls>`) includes **Calendar** and **Time** filter buttons.
2. Clicking **Calendar** opens `<calendar-picker-panel>` — user picks a date, clicks OK.
3. Clicking **Time** opens `<time-picker-panel>` — user picks a time, clicks OK.
4. On confirmation, `FilterController.applyDateTimeFilter()` calls `POST /transit/routes/available` with `{ date, time }`, then hides routes that don't operate at that date/time.
5. No single place shows a route's full service schedule or associated alerts/detours inline.

### Files involved (to be removed/modified)

| File | What to remove |
| --- | --- |
| `client/scripts/components/calendar-picker.ts` | Entire component (delete or deprecate) |
| `client/scripts/components/time-picker.ts` | Entire component (delete or deprecate) |
| `client/scripts/components/map-controls.ts` | Calendar and time filter buttons |
| `client/pages/map.html` | `<calendar-picker-panel>` and `<time-picker-panel>` elements |
| `client/scripts/map.ts` | Calendar/time event handlers, `handlePanelToggle('calendar', ...)` and `handlePanelToggle('time', ...)`, date/time state updates |
| `client/scripts/controllers/filter-controller.ts` | `applyDateTimeFilter()`, `fetchAvailableRoutes()`, date/time reset logic |
| `client/scripts/state/map-state.ts` | `selectedDate`, `selectedTime` state fields |
| `client/styles/map.css` | Calendar/time picker styles |
| `server/controllers/transit.controller.ts` | `POST /transit/routes/available` endpoint (can be removed or kept for API consumers) |

---

## Proposed Behavior

### 1. Route Info Popup Modal

When a user **selects a route** (via the route selector or by clicking a route polyline), display a **Route Info popup** anchored to the map area. The popup follows the same visual pattern as the existing stop prediction popup (`#map-popup`).

#### Popup Structure

```
div#route-info-popup.map-popup
├── div.map-popup__header
│   ├── span.map-popup__route-badge (colored by route)
│   ├── strong.map-popup__title → route name
│   └── button.map-popup__close ("×")
├── div.map-popup__section--schedule
│   ├── h4 → "Service Schedule"
│   ├── div.route-info__days → day pills (Mon–Sun), active days highlighted
│   └── div.route-info__hours → "First trip: 5:30 AM · Last trip: 11:45 PM" (per direction)
├── div.map-popup__section--alerts (if any)
│   ├── h4 → "Active Alerts"
│   └── ul.route-info__alerts
│       └── li → alert header + description + active period
├── div.map-popup__section--detours (if any)
│   ├── h4 → "Active Detours"
│   └── ul.route-info__detours
│       └── li → detour description + start/end dates
└── div.map-popup__footer
    └── small → "Schedule from GTFS static data · Updated daily"
```

#### Trigger

- **Route selector**: After selecting a route from `<route-selector>`, show the Route Info popup automatically (or via an info icon).
- **Route polyline click**: Optionally, clicking a rendered polyline could also open the Route Info popup for that route.
- The popup should be **dismissable** (close button or outside click) and should **not block** map interaction.

### 2. Backend: New Route Schedule Endpoint

Create a new endpoint to return schedule details for a specific route:

```
GET /transit/routes/:routeId/schedule
```

**Response:**

```json
{
  "routeId": "71B",
  "routeName": "71B Hamilton",
  "system": "PRT",
  "operatingDays": [1, 2, 3, 4, 5],
  "directions": [
    {
      "direction": "INBOUND",
      "firstTrip": "05:30",
      "lastTrip": "23:45"
    },
    {
      "direction": "OUTBOUND",
      "firstTrip": "05:15",
      "lastTrip": "23:30"
    }
  ],
  "alerts": [
    {
      "id": "alert-123",
      "headerText": "Detour on Forbes Ave",
      "descriptionText": "Due to construction...",
      "activePeriods": [
        { "start": "2026-04-10T00:00:00Z", "end": "2026-04-20T00:00:00Z" }
      ]
    }
  ],
  "detours": [
    {
      "id": "detour-456",
      "description": "Via Oakland Ave between Forbes and Fifth",
      "startdt": "2026-04-10",
      "enddt": "2026-04-20"
    }
  ]
}
```

**Implementation:**

- **Schedule data**: `GtfsService` already has `tripTimeRange` (first/last minute-of-day per trip), `tripRoute`, `tripDirection`, and `calendar` maps. Add a method `getRouteSchedule(routeId)` that:
  1. Finds all trips for the route via `tripRoute`
  2. Groups by direction via `tripDirection`
  3. Returns min `first` and max `last` from `tripTimeRange` per direction
  4. Returns `operatingDays` from the route's service calendars
- **Alerts**: Filter `AlertsService.getAlerts()` by `routeIds.includes(routeId)`
- **Detours**: Reuse `TransitModel.getDetours([routeId])`

### 3. Unified Popup Behavior (Route, Stop Prediction, Bus)

All three popup modals — **Route Info**, **Stop Prediction**, and **Bus** — must follow the same minimize/restore lifecycle. No close (×) button; popups can only be **minimized** or **replaced**.

#### Remove the Close Button

- Remove the `map-popup__close` (×) button from all popup headers.
- Keep the **minimize** (–) button as the only header action.

#### Minimize → Docked Tab at Bottom

When the user clicks the minimize button:

1. The popup slides down and collapses into a small **docked tab** anchored to the bottom-center of the map container.
2. The tab shows:
   - An **up-arrow icon** (`expand_less` material icon)
   - A short **label** summarizing the popup context:
     - Route popup: route badge + route name (e.g., `▲ 71B Hamilton`)
     - Stop popup: stop name (e.g., `▲ Forbes & Craig`)
     - Bus popup: bus/vehicle ID (e.g., `▲ Bus 3245`)
3. The tab uses class `map-popup-tab` and is styled to be unobtrusive but visible.

```
div.map-popup-tab
├── span.material-icons-outlined → "expand_less"
├── span.map-popup-tab__badge (optional, colored for route)
└── span.map-popup-tab__label → context summary
```

#### Restore from Docked Tab

- Clicking the docked tab **restores** the full popup with its previous content (cached data, scroll position).
- The tab is removed when the popup is restored.

#### Auto-Dismiss Rules

The popup (and its docked tab, if minimized) is **automatically removed** when:

| Trigger | Behavior |
| --- | --- |
| User de-selects the current route | Route info popup dismissed |
| User selects a **different** route | Route info popup replaced with new route's info |
| User clicks a **different** stop marker | Stop popup replaced with new stop's predictions |
| User clicks a **different** bus marker | Bus popup replaced with new bus's info |
| User de-selects the route (returns to nearby-stops view) | All popups dismissed |
| User enters directions mode | Popups dismissed (directions UI takes over) |

#### One Active Popup at a Time

- Only one popup (or one docked tab) can exist at a time across all three types.
- Opening a new popup of **any type** dismisses the current popup/tab.
- E.g., clicking a stop while a route info popup is minimized → route tab removed, stop popup shown.

#### Implementation Notes

- Refactor the shared popup lifecycle into a utility (e.g., `client/scripts/utils/map-popup.ts` — extend the existing module):
  - `showPopup(id, html, onMinimize)` — renders popup, returns handle
  - `minimizePopup(label, badge?)` — collapses to docked tab
  - `restorePopup()` — restores from tab
  - `dismissPopup()` — removes popup + tab completely
- Each popup type (route, stop, bus) calls these shared functions instead of managing DOM directly.
- The minimize animation should use CSS `transform: translateY()` with a transition for smooth sliding.

### 4. Remove Calendar/Time Filter Components

- Delete `<calendar-picker-panel>` and `<time-picker-panel>` from `map.html`
- Remove calendar/time buttons from `<map-controls>`
- Remove `dateSelected` / `timeSelected` event handlers from `map.ts`
- Remove `applyDateTimeFilter()` and `fetchAvailableRoutes()` from `FilterController`
- Remove `selectedDate` / `selectedTime` from `MapStateManager`
- Clean up associated CSS

### 4. Client: Route Info Service

Add a client-side service function:

```ts
// client/scripts/services/route-data.service.ts (extend existing)
async function fetchRouteSchedule(routeId: string): Promise<IRouteSchedule> {
  const res = await axios.get(`/transit/routes/${routeId}/schedule`);
  return res.data.payload;
}
```

---

## New Interfaces

```ts
// common/transit.interface.ts

export interface IDirectionSchedule {
  direction: string; // "INBOUND" | "OUTBOUND"
  firstTrip: string; // "HH:MM" (24h or display format)
  lastTrip: string; // "HH:MM"
}

export interface IRouteSchedule {
  routeId: string;
  routeName: string;
  system: 'PRT' | 'CMU';
  operatingDays: number[]; // 0-6 (Sun-Sat)
  directions: IDirectionSchedule[];
  alerts: IServiceAlert[];
  detours: IDetour[];
}
```

---

## Acceptance Criteria

### Calendar/Time Removal

- [ ] Calendar-picker and time-picker panels are removed from the map page
- [ ] Calendar and time buttons are removed from map-controls toolbar

### Route Info Popup

- [ ] Selecting a route shows a Route Info popup with schedule, alerts, and detours
- [ ] Schedule section displays operating days as visual day pills (active days highlighted)
- [ ] Schedule section shows first/last trip times per direction
- [ ] Alerts section shows active `IServiceAlert` items filtered to the route, or "No active alerts" if none
- [ ] Detours section shows active `IDetour` items for the route, or hidden if none
- [ ] `GET /transit/routes/:routeId/schedule` endpoint returns correct schedule + alerts + detours
- [ ] CMU Shuttle routes show schedule info from TripShot data (or display "See CMU shuttle schedule" fallback)

### Unified Popup Behavior (Route, Stop, Bus)

- [ ] Close (×) button is removed from all three popup types
- [ ] Minimize (–) button collapses the popup into a docked tab at the bottom of the map
- [ ] Docked tab shows an up-arrow icon and a contextual label (route name / stop name / bus ID)
- [ ] Clicking the docked tab restores the full popup with cached content
- [ ] Only one popup or docked tab exists at a time — opening a new one dismisses the old
- [ ] De-selecting a route/stop/bus automatically dismisses its popup and docked tab
- [ ] Selecting a different route/stop/bus replaces the current popup with the new one
- [ ] Entering directions mode dismisses any active popup or docked tab
- [ ] Minimize/restore uses a smooth CSS slide animation

### General

- [ ] All popups support dark mode (`body.dark` class)
- [ ] No regression in route selection, nearby stops, directions, or vehicle tracking

---

## Technical Notes

- **GTFS data already parsed**: `GtfsService` has all the necessary maps (`tripTimeRange`, `tripRoute`, `tripDirection`, `calendar`). The new `getRouteSchedule()` method aggregates existing data — no new parsing needed.
- **Alerts already polled**: `AlertsService` polls GTFS-RT alerts every 5 minutes and stores them in memory. Just filter by `routeId`.
- **Detours already cached**: `TransitModel.getDetours()` fetches from MongoDB cache (TrueTime API). Reuse directly.
- **Popup lifecycle refactor**: Extend `client/scripts/utils/map-popup.ts` to be the single source of truth for popup/tab DOM management. All three popup types (route, stop, bus) should call shared `showPopup()` / `minimizePopup()` / `restorePopup()` / `dismissPopup()` functions. This replaces the current per-popup DOM manipulation in `FilterController`.
- **Minimize state caching**: When minimizing, cache the popup's innerHTML and scroll position in a module-level variable. On restore, re-inject the cached content rather than re-fetching from the server.
- **Docked tab CSS**: Use `position: fixed; bottom: 0; left: 50%; transform: translateX(-50%)` for the tab, with `transition: transform 0.3s ease` for the slide animation.
- **One popup at a time**: The existing `MAP_POPUP_ID` pattern already enforces one popup. Extend it to also track the docked tab (`MAP_POPUP_TAB_ID`). Any `showPopup()` or `minimizePopup()` call first calls `dismissPopup()` to clean up the previous state.
- **`POST /transit/routes/available`**: Can be kept for backward compatibility or removed if no other consumers depend on it.
