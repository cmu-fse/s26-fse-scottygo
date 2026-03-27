# TUC2: Track Bus in Real-Time

Shortname: TrackBus

Participating Actors  
The use case is initiated by a Member. The supporting actors include Google Maps JavaScript SDK, GTFS-RT Feeds (PRT vehicle positions and trip updates), TrueTime BusTime API (detours and route colors), and TripShot API (CMU Shuttle).

Brief Description  
The use case provides real-time tracking of vehicle locations and visualizes active detours. The server polls GTFS-RT protobuf feeds every 30 seconds, storing vehicle positions and trip-update predictions in memory. When the Member selects a route, the client fetches vehicle positions from the server and renders them as animated SVG bus markers on Google Maps, smoothly interpolating movement with ease-out cubic easing over 5 seconds. If an active detour exists for the route, the app overlays the divergent path segments in red on the map and displays a dismissable detour banner.

Assumptions  
The Member is logged into the app. Bulk transit data (routes, patterns, stops) has been preloaded into the client's local cache from `GET /transit/bulk` during map initialization (see TUC1). The server's GTFS-RT polling services (vehicle positions, trip updates) are running.

Flow of Events

Basic Flow  
1\. The use case starts when the Member selects a bus route from the route selector component.  
2\. The FilterController retrieves the route's polyline patterns and stops from the client's local cache (preloaded from `GET /transit/bulk`).  
3\. The RouteRenderer singleton renders the route polyline(s) and clickable stop markers on the Google Map via the `IMapProvider` abstraction.  
4\. The VehicleTracker calls `GET /transit/vehicles/:routeId` to fetch current vehicle positions from the server's in-memory GTFS-RT cache.  
5\. The app renders each vehicle as an animated SVG bus marker on the map, oriented by the vehicle's heading. The bus icon color is orange (#FFA500) if the vehicle is on a detoured route, yellow (#FFB84D) otherwise. A blue directional triangle indicates heading.  
6\. The app calls `GET /transit/detours/:routeId/geometry` to check for active detours on the selected route.  
7\. If detours with geometry exist, the RouteRenderer extracts impacted segments (divergent from the original path within ~25m tolerance) and overlays them in red (#ff2d20) on the map. A dismissable detour banner is displayed with the detour description and dates.  
8\. The VehicleTracker polls `GET /transit/vehicles/:routeId` every 30 seconds. Existing markers are smoothly animated to their new positions over 5 seconds using ease-out cubic easing (`1 - (1 - t)^3`). New vehicles are added; vehicles no longer in the response are removed from the map. The use case ends when the Member selects a different route or leaves the map view.

Alternative Flows

- **A1 Detour Active.** In Step 6, `GET /transit/detours/:routeId/geometry` returns detour data with geometry.
  - The RouteRenderer compares the detour path against the original path and extracts only the divergent segments (tolerance ~25m / 0.00025°).
  - The divergent segments are overlaid as red polylines (color #ff2d20, weight 6, opacity 0.95) on top of the existing route polylines.
  - A detour banner is shown at the top of the map with a cloud-off icon, detour description, and date range. The banner is dismissable.
  - The original route polylines remain visible beneath the detour overlay.
- **A2 No Active Vehicles.** In Step 4, if `GET /transit/vehicles/:routeId` returns an empty array, the VehicleTracker displays a toast notification: "No active buses found for this route." The toast is shown only once per session to avoid repeated alerts. Polling continues at the 30-second interval.
- **A3 GTFS-RT Feed Failure.** If the server's GTFS-RT vehicle positions feed fails, the `vehiclePositionsService` increments a `consecutiveFailures` counter and continues serving the most recently cached data. The client's health polling (every 60 seconds via `GET /transit/health`) detects the upstream failure and may display a service-health warning.
- **A4 Scheduled Fallback.** If the vehicle response contains vehicles with `source: 'static'` (scheduled data instead of live positions), the VehicleTracker displays a toast: "Real-time tracking is currently unavailable. Showing scheduled times only." The toast is shown once per session.
- **A5 CMU Shuttle.** In Step 1, the Member selects a CMU shuttle route (route ID prefixed with `CMU-`). The basic flow is the same except:
  - Patterns and stops are fetched from the TripShot API instead of the GTFS/MongoDB cache.
  - Vehicle positions are requested from `tripshotService.getVehicles()` (currently returns an empty array — not yet implemented).
  - Detour checking is skipped for CMU routes (TrueTime detours apply only to PRT routes).
- **A6 Stop Prediction Popup.** At any point during tracking, the Member clicks a stop marker on the map.
  - The app calls `GET /transit/stops/:stopId/predictions` to fetch real-time arrival predictions from the server's in-memory GTFS-RT trip-updates cache.
  - A popup displays up to 8 upcoming arrivals with route badge (colored), arrival time in minutes (or "NOW"), bus ID, and delayed status.
  - If no predictions are available, the popup shows "No upcoming arrivals."
- **A7 Color Recovery.** The FilterController's health polling detects that TrueTime route colors transition from unavailable to available. The app re-fetches `GET /transit/routes` to get fresh colors and re-renders the currently selected route polylines with updated colors.
- **A8 No Service for Date/Time Filter.** The Member applies a date/time filter that returns zero routes. The app displays a modal: "No service available for this selection," clears all route overlays, and stops vehicle polling.

Rules

- **R1 Selected Routes:** The system displays only the currently selected route's polylines, stop markers, and vehicle markers.
- **R2 Refresh Rate:** Vehicle positions are polled every 30 seconds from the server's in-memory GTFS-RT cache. The server itself polls the GTFS-RT protobuf feed (`truetime.portauthority.org/gtfsrt-bus/vehicles`) every 30 seconds.
- **R3 Detour Visibility:** When an active detour exists, the original route polylines remain visible and the divergent detour segments are overlaid in red (#ff2d20). Only the path segments that differ from the original route are highlighted.
- **R4 Data Freshness:** Vehicle location data in the server's in-memory cache is refreshed every 30 seconds via GTFS-RT polling. An atomic index swap ensures clients never see partial updates.
- **R5 Health Monitoring:** The client polls `GET /transit/health` every 60 seconds to detect upstream feed failures (vehicle positions, trip updates) and TrueTime color availability.

Implementation Notes

- **Vehicle positions and predictions are stored in-memory** (not MongoDB). The `vehiclePositionsService` and `tripUpdatesService` each maintain an in-memory `Map` keyed by routeId/stopId, updated every 30 seconds from GTFS-RT protobuf feeds. This provides near-zero latency for client reads and avoids database write overhead for high-frequency data.
- **MongoDB TTL cache (24-hour)** is used for static transit data: routes (with TrueTime-merged colors), patterns, stops, and detours. This avoids re-parsing GTFS feeds on every request and shares cached data across all clients.
  - Reference: [https://www.mongodb.com/docs/manual/core/index-ttl/](https://www.mongodb.com/docs/manual/core/index-ttl/)
- **Marker animation** uses `requestAnimationFrame` with ease-out cubic easing (`1 - (1 - t)^3`) over 5 seconds for smooth 60 FPS movement interpolation. Markers skip animation for very small moves (< 0.00001°) and snap instantly for teleports (> ~5 km).
- **SVG bus icons** are zoom-responsive, scaling dynamically with `scale = max(0.5, min(2.5, (zoom - 10) * 0.3 + 1))`. The icon includes a bus body, windshield, windows, wheels, and a blue directional triangle oriented by the vehicle's heading.
- **Detour geometry extraction** compares the detour path against the original path point-by-point using a ~25m (0.00025°) tolerance to identify only the divergent segments, avoiding redundant overlay of shared path sections.
- **TrueTime color retry**: If the initial color fetch fails, the server retries every 5 minutes for up to 12 attempts (~1 hour). GTFS default color (#1e90ff) is used as fallback until TrueTime recovers.
- **Atomic index swap**: The server builds a complete new vehicle/prediction index before replacing the old one, ensuring clients never read a partially updated dataset.
- Polyline Reference: https://developers.google.com/maps/documentation/javascript/examples/polyline-simple
