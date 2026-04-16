# Feature: Search Bar Location Selection on Map Page

## Summary

Allow users to set a planned location via the map page search bar. The app defaults to the user's GPS location (if permitted) and provides an option to search and set a different planned location using the Google Maps API.

## Motivation

Users may want to browse transit information for a location other than where they currently are — for example, planning a trip from a future destination. This feature separates the concepts of **current location** (GPS-based) and **planned location** (user-selected), enabling flexible trip planning while preserving location-dependent features like bus report submission.

## Detailed Description

### Search Bar Behavior

- When the user clicks/taps the search bar, a dropdown result list appears automatically.
- The first item in the dropdown is **"Current Location"** (populated from GPS if access is granted).
- Below or to the right of "Current Location", a **"Set a different location"** option is displayed.

### Setting a Different Location

- Tapping **"Set a different location"** opens a location search powered by the **Google Maps Places API**.
- The search accepts **any location** (not limited to transit stops).
- The user can select a result to set it as their **planned location**.

### Location Types

| Location Type | Source | Purpose |
|---|---|---|
| **Current Location** | Device GPS | Used to validate eligibility for submitting a bus report |
| **Planned Location** | User-selected (defaults to current location) | Used for all other location-dependent features (e.g., nearby routes, distance calculations) |

### GPS Permission Scenarios

| Scenario | Current Location | Default Planned Location | Bus Report |
|---|---|---|---|
| GPS access **granted** | Device GPS coordinates | Same as current location | Allowed |
| GPS access **denied** | Unavailable | CMU Pittsburgh campus center | **Not allowed** |

### Rules

1. **Planned location defaults to current location** when GPS access is granted.
2. If the user **denies GPS access**, the default planned location centers on **CMU Pittsburgh campus**.
3. **Bus report submission requires GPS access** — users who deny location permission cannot submit bus reports.
4. Current location and planned location are **stored separately**.
5. The planned location persists until the user changes it or resets to current location.

## UI/UX Mockup (Text)

```
┌─────────────────────────────────────┐
│    Search location...               │
├─────────────────────────────────────┤
│   Current Location                  │
│  ─────────────────────────────────  │
│   Set a different location →        │
├─────────────────────────────────────┤
│  (search results appear here when   │
│   "Set a different location" is     │
│   tapped and user types a query)    │
└─────────────────────────────────────┘
```

## Acceptance Criteria

- [ ] Tapping the search bar opens a dropdown with "Current Location" as the first option.
- [ ] A "Set a different location" action is visible in the dropdown.
- [ ] Tapping "Set a different location" enables location search via Google Maps Places API.
- [ ] Search results include any location (not limited to transit stops).
- [ ] Selecting a search result sets it as the user's planned location.
- [ ] Planned location is stored separately from current location.
- [ ] Planned location defaults to current location when GPS is available.
- [ ] Planned location defaults to CMU Pittsburgh campus when GPS is denied.
- [ ] Current location is used to validate bus report submission eligibility.
- [ ] Planned location is used for all other location-dependent features.
- [ ] Users who deny GPS access cannot submit a bus report.
- [ ] Selecting "Current Location" from the dropdown resets the planned location to the GPS location.

## Technical Considerations

- Use **Google Maps Places Autocomplete API** for location search (respect `IMapProvider` abstraction where possible).
- Store planned location in client-side state (e.g., `map-state`); persist across page interactions within session.
- Current location should be obtained via the browser `navigator.geolocation` API.
- Ensure the search bar component is reusable (consider a new web component in `client/scripts/components/`).
- Coordinate with `FilterController` to use planned location for relevant data queries.
- Bus report submission logic must gate on GPS permission status, not on whether a planned location is set.

## Labels

`enhancement`, `map`, `ux`
