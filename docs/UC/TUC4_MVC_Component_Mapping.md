# TUC 4 MVC Component Mapping

Source alignment: docs/UC/TUC 4 - Discover Stops & Schedules.md and docs/REST_API/REST_Discover.md

## Existing Components (Implemented)

| Layer | Component | File | Path | Responsibility |
| :-- | :-- | :-- | :-- | :-- |
| Controller | Transit Controller (Discover endpoints) | transit.controller.ts | server/controllers | Serves implemented Discover-related REST endpoints: GET /transit/bulk and GET /transit/stops/:stopId/predictions. |
| Controller | Map Controller (config) | map.controller.ts | server/controllers | Serves GET /map/config for Google map bootstrap configuration. |
| Model | Transit Model | transit.model.ts | server/models | Provides cached static transit data (routes, patterns, stops) used by bulk response. |
| Service | GTFS Service | gtfs.service.ts | server/services | Loads and indexes static stops, routes, and patterns that power bulk-based discovery. |
| Service | Trip Updates Service | trip-updates.service.ts | server/services | Maintains in-memory real-time arrival predictions for stop selection popup. |
| View | Map Page | map.html | client/pages | Hosts map canvas, filter components, and popup/modal containers for Discover UX. |
| Controller | Map Orchestrator | map.ts | client/scripts | Initializes map/config/geolocation and wires UI events used by Discover flow entry. |
| Controller | Filter Controller | filter-controller.ts | client/scripts/controllers | Uses bulk stop data and selected-stop predictions, then renders stop popup on marker click. |
| View Renderer | Route Renderer | route-renderer.ts | client/scripts/renderers | Draws stop markers and route overlays; delegates stop-click handling to controller. |
| View Utility | Map Popup Utility | map-popup.ts | client/scripts/utils | Manages single popup slot for stop and bus info overlay behavior. |
| Service | Map Provider (Google) | google-map.provider.ts | client/scripts/maps | Provides client-side Google Maps access via abstraction used by Discover UI. |
| Shared Contract | Transit Interfaces | transit.interface.ts | common | Defines IStop, IPrediction, and IBulkTransitData used by implemented Discover APIs. |
| Shared Contract | Map Interfaces | map.interface.ts | common | Defines IConfig and map abstraction contracts for map initialization and operations. |

## New Components (Proposed, Not Yet Implemented)

| Layer | Component | File | Path | Responsibility |
| :-- | :-- | :-- | :-- | :-- |
| Controller | Nearby Stops Endpoint | transit.controller.ts | server/controllers | Add GET /transit/stops/nearbystops with lat/lon/radius and Discover filter support. |
| Model | Nearby Stops Query Logic | transit.model.ts | server/models | Compute nearby stops, radius expansion (1000 to 2000m), and walkMinutesEstimate heuristic. |
| Service | Spatial Stop Lookup Extension | gtfs.service.ts | server/services | Support efficient geospatial filtering over GTFS stop cache for nearby lookup. |
| Shared Contract | Discover DTOs | transit.interface.ts | common | Add INearbyStop and INearbyStopsPayload interfaces referenced by REST_Discover. |
| Controller | Discover Stage Controller (client) | filter-controller.ts | client/scripts/controllers | Consume nearby-stops payload and render stop-selection stage with server-provided walking estimate. |
| Controller | Directions Mode Controller (client) | map.ts | client/scripts | Implement explicit Directions action, debounce, one in-flight request rule, reroute cadence, and arrival detection logic. |
| View | Discover Popup Enhancements | map.css | client/styles | Add close, minimize, and directions controls plus directions-mode status and arrived toast styles. |
| Service | Directions Request Adapter (client-side Google call) | google-map.provider.ts | client/scripts/maps | Wrap Google walking route request and cancellation, consistent with client-side directions design. |

## Notes

- Per REST_Discover, walking directions remain a client-side Google Directions request triggered only after the member selects Directions.
- The only proposed new ScottyGo REST endpoint for Discover is /transit/stops/nearbystops.
