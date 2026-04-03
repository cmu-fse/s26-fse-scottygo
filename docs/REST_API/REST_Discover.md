# **Discover Stops & Schedules API Documentation**

## **1. Overview**

**Primary Router Paths:** /transit, /map  
**External Provider:** Google Maps Directions service (client-side request)

This section documents the API surface for the **Discover Stops & Schedules** use case in [docs/UC/TUC 4 - Discover Stops & Schedules.md](../UC/TUC%204%20-%20Discover%20Stops%20%26%20Schedules.md).

The recommended UX is a two-stage flow:

1. **Stop Selection Stage:** Member taps a stop marker and sees stop metadata (name, next arrivals, and estimated walking time from straight-line distance).
2. **Directions Stage:** Member taps a dedicated **Directions** button in the stop popup; only then does the app request a walking route from Google and switch to navigation mode.

This approach reduces unnecessary upstream route calls and keeps map interactions responsive.

### **1.1 Interface Definitions**

- **IStop** (from common/transit.interface.ts)
  - **stopId**: string
  - **stopName**: string
  - **lat**: number
  - **lon**: number
  - **routes?**: string[]
- **IPrediction** (from common/transit.interface.ts)
  - **stopId**: string
  - **routeId**: string
  - **vid?**: string
  - **predictedArrivalTime**: number
  - **isDelayed**: boolean
  - **minutes**: number
- **IBulkTransitData** (from common/transit.interface.ts)
  - **routes**: IRoute[]
  - **patterns**: Record<string, IPattern[]>
  - **stops**: Record<string, IStop[]>
- **IConfig** (from common/map.interface.ts)
  - **apiKey**: string
  - **lat**: number
  - **lon**: number
  - **defaultZoom**: number
- **ISuccess<T>** (from common/server.responses.ts)
  - **name**: SuccessName
  - **message?**: string
  - **payload**: T | null

### **1.2 Discover-Specific Payload Interfaces (Proposed)**

These interfaces are recommended for this use case and are intended to be used with a dedicated nearby-stops endpoint.

- **INearbyStop**
  - **stop**: IStop
  - **distanceMeters**: number
  - **walkMinutesEstimate**: number
  - **routesServingStop**: string[]
- **INearbyStopsPayload** (payload object inside ISuccess)
  - **center**: { lat: number; lon: number }
  - **radiusMeters**: number
  - **expandedRadiusApplied**: boolean
  - **stops**: INearbyStop[]

---

## **2. REST API Endpoints**

| Status | Method | Path | Function | Response Type | Body Type |
| :-- | :-- | :-- | :-- | :-- | :-- |
| **Implemented** | **GET** | /transit/bulk | Fetch all routes/patterns/stops for client-side filtering and rendering | ISuccess (IBulkTransitData payload) | _None_ |
| **Implemented** | **GET** | /transit/stops/:stopId/predictions | Fetch real-time arrivals for selected stop | ISuccess (IPrediction[] payload) | _None_ |
| **Implemented** | **GET** | /map/config | Fetch Google Maps key/config for map bootstrapping | ISuccess (IConfig payload) | _None_ |
| **Proposed** | **GET** | /transit/stops/nearbystops | Fetch stops and route summaries within radius of Member location | ISuccess (INearbyStopsPayload payload) | _None_ |

### **2.1 Relationship to Route Visualization Endpoints**

The nearby-stops endpoint is additive. It does not replace the existing route visualization endpoints.

- **Route-centric rendering and tracking** continue using route visualization APIs (for example, /transit/routes, /transit/routes/:id, /transit/stops/:routeId, /transit/vehicles/:routeId).
- **Discover-centric nearby-stop lookup** is served by /transit/stops/nearbystops when the feature is implemented.
- **Predictions for a selected stop** continue using /transit/stops/:stopId/predictions.

### **2.2 External Directions Request (Client-Side)**

No ScottyGo REST endpoint is required for walking directions in the recommended design.  
The frontend calls Google Directions only when the Member presses **Directions** in the stop popup.

---

## **3. Request Payload Details**

### **3.1 Get Bulk Transit Data (GET /transit/bulk)**

- **Path Parameters:** _None_
- **Query Parameters:** _None_
- **Headers:** Authorization: Bearer token (JWT)
- **Purpose in Discover:** Provides routes/stops dataset used to derive candidate nearby stops.

### **3.2 Get Stop Predictions (GET /transit/stops/:stopId/predictions)**

- **Path Parameters:** stopId (string, required)
- **Query Parameters:** _None_
- **Headers:** Authorization: Bearer token (JWT)
- **Purpose in Discover:** Populates stop popup arrival section.

### **3.3 Get Map Config (GET /map/config)**

- **Path Parameters:** _None_
- **Query Parameters:** _None_
- **Headers:** Authorization: Bearer token (JWT)
- **Purpose in Discover:** Provides Google Maps API key and map defaults.

### **3.4 Get Nearby Stops (GET /transit/stops/nearbystops) - Proposed**

- **Path Parameters:** _None_
- **Headers:** Authorization: Bearer token (JWT)
- **Query Parameters:**
  - **lat** (number, required)
  - **lon** (number, required)
  - **radiusMeters** (number, optional, default 1000)
  - **includeRoutes** (boolean, optional, default true)
  - **routeId** (string, optional): when provided, return only stops served by that route (for example, 71C).
  - **system** (string, optional): PRT or CMU.
  - **direction** (string, optional): INBOUND or OUTBOUND.
  - **date** (string, optional): YYYY-MM-DD, for schedule-aware filtering.
  - **time** (string, optional): HH:MM, for schedule-aware filtering.
- **Rules:**
  - If no stops are found for 1000m and Discover A6 is enabled, server retries with 2000m and sets expandedRadiusApplied=true.
  - Server computes walkMinutesEstimate using simple heuristic: 1 km equals 15 minutes.
  - If routeId is provided, nearby stops are limited to that route before sorting by distance.
  - If system, direction, date, or time are provided, those filters are applied before radius cutoff is finalized.

**Example Request:**

GET /transit/stops/nearbystops?lat=40.4433&lon=-79.9436&radiusMeters=1000&includeRoutes=true

---

## **4. Response Payload Details (HTTP 200)**

### **4.1 BulkDataRetrieved**

- **Success Name:** BulkDataRetrieved
- **Payload Type:** IBulkTransitData
- **Notes:** This is the current implemented source for stop discovery if nearby endpoint is not yet added.

### **4.2 PredictionsRetrieved**

- **Success Name:** PredictionsRetrieved
- **Payload Type:** IPrediction[]

### **4.3 ConfigFound**

- **Success Name:** ConfigFound
- **Payload Type:** IConfig

### **4.4 NearbyStopsRetrieved (Proposed)**

- **Success Name:** NearbyStopsRetrieved
- **Payload Type:** INearbyStopsPayload

**Example Response:**

```json
{
  "name": "NearbyStopsRetrieved",
  "message": "Found 7 nearby stops within 1000m",
  "payload": {
    "center": { "lat": 40.4433, "lon": -79.9436 },
    "radiusMeters": 1000,
    "expandedRadiusApplied": false,
    "stops": [
      {
        "stop": {
          "stopId": "4407",
          "stopName": "Forbes Ave at Morewood Ave",
          "lat": 40.4441,
          "lon": -79.9422,
          "routes": ["61A", "61B", "61C", "61D"]
        },
        "distanceMeters": 210,
        "walkMinutesEstimate": 4,
        "routesServingStop": ["61A", "61B", "61C", "61D"]
      }
    ]
  }
}
```

---

## **5. Directions Workflow (Recommended Behavior)**

### **5.1 Stop Selection Stage (No Google Directions Call Yet)**

On stop marker click:

1. App calls /transit/stops/:stopId/predictions.
2. App obtains distance and walk-time estimate from server-provided discover data for the selected stop.
3. Server-side walk estimate follows the rule: walkMinutesEstimate = ceil((distanceMeters / 1000) \* 15).
4. App renders popup with:
   - stop name
   - next arrivals
   - estimated walking time
   - close button
   - **Directions** button (walking icon)

### **5.2 Directions Stage (Google Call Triggered by Explicit Member Action)**

On Directions button click:

1. App hides non-selected stops/routes for visual focus.
2. App requests walking route from Google Directions service.
3. App renders polyline, duration, and distance.
4. App refreshes route based on defined UC reroute rules.

This aligns with non-obtrusive UX and minimizes route API usage.

---

## **6. Error Names and Conditions**

### **6.1 Existing Errors Reused**

| HTTP Code | Error Name | Condition |
| :-- | :-- | :-- |
| **400** | MissingParameter | Missing required query/body fields (e.g., date, dir) |
| **401** | MissingToken, InvalidToken | Missing or invalid JWT |
| **404** | StopNotFound | Stop or stop data unavailable |
| **500** | GetRequestFailure | Unexpected transit retrieval failure |
| **500** | UpstreamError | External provider failure |

### **6.2 Proposed Nearby Endpoint Errors**

| HTTP Code | Error Name | Condition |
| :-- | :-- | :-- |
| **400** | MissingParameter | lat or lon not provided |
| **400** | OutOfBounds | Coordinates outside supported service area |
| **200** | NearbyStopsRetrieved (empty list) | No stops found even after radius expansion |
| **500** | GetRequestFailure | Server-side geospatial query failed |

---

## **7. Mapping to Team Use Case**

- Use case source: [docs/UC/TUC 4 - Discover Stops & Schedules.md](../UC/TUC%204%20-%20Discover%20Stops%20%26%20Schedules.md)
- Related REST documents:
  - [docs/REST_API/REST_Auth.md](REST_Auth.md)
  - [docs/REST_API/REST_ManageAcct.md](REST_ManageAcct.md)
  - [docs/REST_API/REST_RouteVisualization](REST_RouteVisualization)

### **7.1 Rule Alignment**

- **R1 Tap Debounce Rule:** apply debounce only to Directions-triggered route generation.
- **R2 One In-Flight Route Request Rule:** cancel previous in-flight Google route request before issuing another.
- **R3 Auto-Reroute Throttle Rule:** enforce 45-second floor for automatic reroute requests.

### **7.2 Practical Implementation Note**

The current backend does not yet expose /transit/stops/nearbystops. A dedicated nearby-stops endpoint is recommended for this use case. The Discover workflow can be delivered in two phases:

1. **Phase 1 (Backend alignment):** provide server-side distance and walk-time estimates for selected/nearbystops stops using the 1 km = 15 min heuristic.
2. **Phase 2 (Backend optimization):** add /transit/stops/nearbystops for dedicated server-side geospatial filtering, route summaries, and reduced payload.
