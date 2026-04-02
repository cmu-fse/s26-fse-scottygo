git p### **Team Use Case: Visualize Routes**

**Short Name:** VisRoute

**Participating Actors:** The use case is initiated by a Member (logged-in user). The supporting actors include Google Maps JavaScript SDK, GTFS Static Feed (routes, patterns, stops, schedules), GTFS-RT Feeds (vehicle positions and trip updates), TrueTime BusTime API v3 (route colors and detours), and TripShot API (CMU Shuttle routes, patterns, stops).

**Brief Description:** The use case allows a logged-in user to visualize a map of the Pittsburgh area featuring transit routes and stops. On map load, the app fetches all route, pattern, and stop data in a single bulk request (`GET /transit/bulk`) and caches it locally. The user can center the map on their own location, select a specific route (PRT or CMU Shuttle) for visualization, apply date and time filters to see route availability, toggle between PRT and CMU Shuttle systems, and filter by inbound/outbound direction.

---

### **Flow of Events**

#### **Basic Flow**

1. The use case starts when the Member navigates to the map page after logging in.
2. The app initializes the Google Map via the `IMapProvider` abstraction using configuration from `GET /map/config` (API key, default center: 40.4433, −79.9436, default zoom: 14).
3. The app calls `GET /transit/bulk` to fetch all routes (with TrueTime-merged colors), patterns, and stops in a single request. The response (`IBulkTransitData`) is cached locally in the FilterController's `patternCache`, `stopCache`, and `routeColorCache` Maps.
4. The app populates the route selector component with the available PRT routes (PRT system toggled ON by default, CMU Shuttle OFF).
5. The app requests the Member's geographic location via the browser's geolocation API (`navigator.geolocation`).
6. The Member elects to **Confirm/Allow** location access. The app centers the map on the Member's coordinates.
7. The Member selects the **Route Selector**.
   1. The app displays a scrollable dropdown listing available routes (filtered by the active system and direction toggles).
   2. The Member selects a single route from the list.
   3. The FilterController retrieves the route's patterns and stops from the local cache, then the RouteRenderer singleton renders the route polyline(s) and clickable stop markers on the map. All other route overlays are cleared. The URL hash is updated (e.g., `#/map?r=P1`).
8. The Member selects the **Calendar Filter**.
   1. The app displays a calendar-picker web component starting at the current date.
   2. The Member selects a single date.
   3. The app sends `POST /transit/routes/available` with `{date}` in the request body. The server filters routes via the GTFS static feed. The route selector is updated to show only routes operating on the selected date. The URL hash is updated (e.g., `#/map?r=P1&d=20260326`).
9. The Member interacts with the **Time Picker**.
   1. The app displays a time-picker web component using 12-hour format with AM/PM.
   2. The Member selects a time.
   3. The app sends `POST /transit/routes/available` with `{date, time}` in the request body. The server filters routes via the GTFS static feed for both date and time. The route selector updates accordingly. The URL hash is updated (e.g., `#/map?r=P1&d=20260326&t=1430`).
10. The Member selects the **System Toggle** (PRT/CMU).
    1. The app shows toggle switches for "PRT" and "CMU Shuttle."
    2. The Member enables or disables these systems.
    3. If CMU is enabled for the first time, the app lazily fetches CMU shuttle routes from the TripShot API and merges them into the local cache. The route selector updates to show or hide the corresponding route sets. The URL hash is updated (e.g., `#/map?s=PRT,CMU`).
11. The Member selects the **Direction Filter**.
    1. The app shows toggles for "Inbound" and "Outbound."
    2. The Member enables or disables a direction.
    3. The app re-renders the stop markers for only the selected direction(s). The URL hash is updated if non-default (e.g., `#/map?dir=IB`). The use case ends.

#### **Alternative Flows**

- **A1. No Network Access.** In step 3, if `GET /transit/bulk` fails due to no network, the app falls back to fetching routes individually via `GET /transit/routes`. If that also fails, the map loads with no transit overlays.
- **A2. GTFS-RT Feed Failure.** If the server's GTFS-RT vehicle-positions or trip-updates feeds fail, the `vehiclePositionsService`/`tripUpdatesService` increment a `consecutiveFailures` counter and continue serving the most recently cached data. The client's health polling (every 60 seconds via `GET /transit/health`) detects the upstream failure and may display a service-health warning.
- **A3. Location Out of Bounds.** In step 6, if the Member's GPS coordinates are outside the Greater Pittsburgh Area, the app displays a warning modal. The map remains centered on the default coordinates (CMU campus: 40.4433, −79.9436) instead of centering on the Member.
- **A4. Google Maps API Failure.** In step 2, if the Google Maps JavaScript SDK fails to initialize (e.g., invalid API key, network issue, or regional IP blocking), the map container remains blank and the app cannot render route overlays.
- **A5. Location Permission Denied.** In step 5, if the Member denies browser geolocation or closes the permission prompt, the app maintains the default map center (CMU campus: 40.4433, −79.9436) and default zoom level (14).
- **A6. TrueTime Colors Unavailable.** In step 3, if the TrueTime API fails to provide route colors during cache refresh, the server uses the GTFS default color (#1e90ff) as fallback and retries fetching colors every 5 minutes for up to 12 attempts (~1 hour). The client health polling detects color recovery and re-fetches `GET /transit/routes` to apply restored colors.
- **A7. No Service Available.** In step 9.3, if the date/time filter returns zero routes from `POST /transit/routes/available`, the app displays a modal: _"No service available for this selection"_ and clears all route overlays and stops vehicle polling.
- **A8. Multi-System Toggle Off.** In step 10.2, if the Member disables both PRT and CMU Shuttle toggles, the map displays the base geographic map with no transit overlays. The route selector is emptied.

---

### **Rules**

- **R1. Single Route Focus:** In step 7, only one specific route can be selected at a time from the route selector to maintain visual clarity. Selecting a new route automatically deselects the previous one and clears its polylines, stop markers, and vehicle markers.
- **R2. Default State:** Upon initial load, the "PRT" system is toggled ON and the "CMU Shuttle" is toggled OFF. Both Inbound and Outbound directions are enabled. No route is preselected unless restored from the URL hash.
- **R3. Bulk Data Loading:** All static transit data (routes, patterns, stops) is loaded in a single `GET /transit/bulk` request on map initialization and cached locally. Subsequent filter operations (route selection, direction toggle) use the local cache without additional API calls.
- **R4. URL State Persistence:** All filter state (selected route, systems, date, time, directions) is persisted in the URL hash (e.g., `#/map?r=P1&s=PRT,CMU&d=20260326&t=1430&dir=IB`). On page refresh or navigation, the app restores the exact filter state from the URL hash.
- **R5. API Timeout:** The TripShot API (CMU Shuttle) enforces a 5-second request timeout. GTFS-RT feeds are polled on a 30-second interval with no per-request timeout.

---

### **Implementation Notes**

- **Map Integration:** The Google Maps JavaScript SDK is loaded dynamically and abstracted behind the `IMapProvider` interface. Route overlays are rendered as `IMapPolyline` objects using `IPattern[]` format (`{direction, path: [{lat, lng}]}`), not GeoJSON. Stop markers are rendered as `IMapMarker` objects with colored dot icons.
- **Data Sources:** Route and schedule data is parsed from GTFS static feeds at server startup and cached in MongoDB with a 24-hour TTL. TrueTime BusTime API v3 provides route colors (fetched once per cache refresh, merged into route data) and detour information. CMU Shuttle data is fetched on-demand from the TripShot API.
- **Bulk Loading:** `GET /transit/bulk` returns all routes, patterns (`Record<routeId, IPattern[]>`), and stops (`Record<"routeId:DIRECTION", IStop[]>`) in a single response. The client caches this in `FilterController` and serves all subsequent filter operations locally.
- **State Management:** All filter state is stored in the URL hash (not query parameters). The `url-sync` module reads/writes the hash format `#/map?r=<routeId>&s=<systems>&d=<YYYYMMDD>&t=<HHMM>&dir=<IB,OB>` using `history.replaceState()`. On page load, `restoreStateFromURL()` parses the hash and applies the saved filter state.
- **Location Privacy:** Per browser security standards, the app explicitly requests permission to access `navigator.geolocation` before centering the map. If denied, the default center (CMU campus: 40.4433, −79.9436) and zoom (14) are used.
- **Health Monitoring:** The FilterController polls `GET /transit/health` every 60 seconds to monitor upstream GTFS-RT feed health and TrueTime color availability, automatically recovering when services come back online.

https://developers.google.com/maps/documentation/routes/transit-route\#transit-fields
