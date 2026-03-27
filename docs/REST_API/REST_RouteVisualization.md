Transit & Map Visualization API Documentation
1. Overview
Base Router Path: /transit
This section covers the transit data endpoints, providing access to routes, real-time vehicle locations, stop information, arrival predictions, detours, and bulk data for both PRT and CMU systems.
Base Router Path: /map
This section covers the map configuration endpoints. The /map/config endpoint requires authentication (Bearer token).

1.1 Interface Definitions
IRoute
id: string (e.g., "P1", "61C", "CMU-1")
name: string (Short description)
system: "PRT" | "CMU"
color: string (Hex code for map rendering)
directions: string[] (e.g., ["INBOUND", "OUTBOUND"])
activeStatus: boolean (Currently operational?)
operatingDays: number[] (0-6, Sunday-Saturday)

IVehicle
vid: string (Vehicle ID)
lat: number (Latitude)
lon: number (Longitude)
routeId: string
heading: number (0-359 degrees)
speed?: number (m/s, optional)
source: "live" | "static" (Indicates real-time or scheduled data)
lastUpdate: string (ISO Timestamp)
isDetoured: boolean
delay?: number (optional)
tripId?: string (GTFS trip_id, optional)
currentStatus?: "INCOMING_AT" | "STOPPED_AT" | "IN_TRANSIT_TO" (optional)
currentStopSequence?: number (optional)
currentStopId?: string (optional)

IStop
stopId: string
stopName: string
lat: number
lon: number
routes?: string[]
dtradd: string[]
dtrrem: string[]

IPrediction
stopId: string
routeId: string
vid?: string
predictedArrivalTime: number (milliseconds since epoch)
isDelayed: boolean
minutes: number (minutes until arrival)

IDetour
id: string
description: string
startdt: string (ISO date string)
enddt: string (ISO date string)
routeIds?: string[] (optional, routes affected by detour)
geometry?: IDetourGeometry[] (optional, present when fetched with geometry)

IDetourGeometry
detourId: string
direction: string
detourPath: {lat: number, lng: number}[]
originalPath?: {lat: number, lng: number}[] (optional)

IPattern
direction: string (e.g., "INBOUND", "OUTBOUND")
path: {lat: number, lng: number}[]

IBulkTransitData
routes: IRoute[]
patterns: Record<string, IPattern[]> (keyed by routeId)
stops: Record<string, IStop[]> (keyed by "routeId:DIRECTION")

ISuccess
name: SuccessName (see Section 5 for valid names)
message?: string (optional descriptive message)
authorizedUser?: string (optional, set by auth middleware)
metadata?: Record<string, unknown> (optional)
payload: T | null

IConfig
apiKey: string
lat: number
lon: number
defaultZoom: number

2. REST API Endpoints
Method  Path                              Function                                        Success Response Type        Body Type
GET     /transit/health                   Get upstream feed health status                  JSON (non-standard)          None
GET     /transit/bulk                     Fetch all routes, patterns, and stops in bulk    ISuccess<IBulkTransitData>   None
GET     /transit/routes                   Fetch all available routes                       ISuccess<IRoute[]>           None
POST    /transit/routes/available         Filter routes by Date/Time                       ISuccess<IRoute[]>           { date, time? }
GET     /transit/routes/:id               Get route patterns (polyline paths per dir)      ISuccess<IPattern[]>         None
GET     /transit/vehicles/:routeId        Get real-time vehicle positions for a route      ISuccess<IVehicle[]>         None
GET     /transit/stops/:routeId           Get stops for a route (requires dir param)       ISuccess<IStop[]>            None
GET     /transit/stops/:stopId/predictions Get arrival predictions for a stop              ISuccess<IPrediction[]>      None
GET     /transit/detours/:routeId         Fetch active detours (metadata only)             ISuccess<IDetour[]>          None
GET     /transit/detours/:routeId/geometry Fetch active detours with path geometry         ISuccess<IDetour[]>          None
GET     /map/                             Get main map page                                Static page: map.html       None
GET     /map/config                       Get map configuration (auth required)            ISuccess<IConfig>            None
GET     /map/users/:username              Get user info (auth required)                    ISuccess                     None

3. Request Payload Details
3.1 Get Bulk Data (GET /transit/bulk)
Purpose: Fetches all routes, patterns, and stops in a single request. Used by the client on map initialization to populate local caches.
Query Parameters: None
Example Request: GET /transit/bulk
Response: IBulkTransitData containing routes[], patterns (Record<routeId, IPattern[]>), and stops (Record<"routeId:DIRECTION", IStop[]>).

3.2 Get All Routes (GET /transit/routes)
Query Parameters:
system (string, optional): Filter by "PRT" or "CMU".
Example Request: GET /transit/routes?system=PRT
Notes: If system is omitted, returns PRT routes. If CMU is requested or no filter, also fetches CMU shuttle routes from TripShot API (if configured).

3.3 Get Route Patterns (GET /transit/routes/:id)
Purpose: Fetches the route geometry (polyline paths) for a single route, one per direction.
Returns: IPattern[] — an array of {direction, path} objects, NOT GeoJSON.
Path Parameters:
id (string, required): The unique route identifier (e.g., "P1", "CMU-1").
Example Request: GET /transit/routes/P1
Notes: For CMU routes (id starts with "CMU-"), patterns are fetched from the TripShot API. For PRT routes, patterns are served from the MongoDB transit cache (populated from GTFS static data). Returns 404 RouteNotFound if no patterns exist.

3.4 Get Route Vehicles (GET /transit/vehicles/:routeId)
Purpose: Fetches vehicle positions for the selected route from the server's in-memory GTFS-RT cache.
Path Parameters:
routeId (string, required): The unique identifier (e.g., "P1", "61C").
Query Parameters: None
Example Request: GET /transit/vehicles/P1
Notes: For PRT routes, positions come from the GTFS-RT vehicle positions feed (polled every 30 seconds server-side, stored in-memory). For CMU routes (id starts with "CMU-"), vehicle positions are requested from the TripShot API (currently returns an empty array — not yet implemented). Returns an empty array if no vehicles are active.

3.5 Get Route Stops (GET /transit/stops/:routeId)
Path Parameters:
routeId (string, required): The ID of the route.
Query Parameters:
dir (string, required): Travel direction ("INBOUND" or "OUTBOUND"). Returns 400 MissingParameter if omitted.
Example Request: GET /transit/stops/P1?dir=INBOUND
Notes: For CMU routes, stops are fetched from TripShot API. For PRT, served from MongoDB transit cache. Returns 404 StopNotFound if no stops exist for the given route/direction.

3.6 Get Stop Predictions (GET /transit/stops/:stopId/predictions)
Path Parameters:
stopId (string, required): The stop identifier (e.g., "7079", "8192")
Query Parameters: None
Example Request: GET /transit/stops/7079/predictions
Notes: Predictions are served from the server's in-memory GTFS-RT trip-updates cache (polled every 30 seconds). Returns an empty array if no predictions are available.

3.7 Get Route Detours (GET /transit/detours/:routeId)
Path Parameters:
routeId (string, required): The route identifier.
Query Parameters: None
Example Request: GET /transit/detours/P1
Notes: Returns detour metadata only (no geometry). Detours are cached in MongoDB (fetched from TrueTime API).

3.8 Get Route Detours with Geometry (GET /transit/detours/:routeId/geometry)
Path Parameters:
routeId (string, required): The route identifier.
Query Parameters: None
Example Request: GET /transit/detours/P1/geometry
Notes: Returns detours that have associated geometry data. The geometry contains detourPath and optionally originalPath for each direction. Used by the client to render detour overlay polylines on the map.

3.9 Get Health Status (GET /transit/health)
Purpose: Returns upstream feed health status for monitoring.
Query Parameters: None
Example Request: GET /transit/health
Notes: Returns a non-standard JSON response (not wrapped in ISuccess) containing health status for vehiclePositions, tripUpdates, and trueTimeColors.

3.10 Get Map Configuration (GET /map/config)
Purpose: Returns Google Maps API key and default map center/zoom.
Authentication: Required (Bearer token in Authorization header).
Query Parameters: None
Example Request: GET /map/config (with Authorization: Bearer <token>)
Notes: Returns 401 MissingToken if no token provided, 401 InvalidToken if token is invalid.

4. Response Payload Details & Examples
4.1 BulkDataRetrieved (HTTP 200)
Payload Type: IBulkTransitData
Example Body:
JSON
{
  "name": "BulkDataRetrieved",
  "payload": {
    "routes": [
      {"id": "P1", "name": "East Busway All-Stops", "system": "PRT", "color": "#00518B", "directions": ["INBOUND", "OUTBOUND"], "activeStatus": true, "operatingDays": [1,2,3,4,5]}
    ],
    "patterns": {
      "P1": [
        {"direction": "INBOUND", "path": [{"lat": 40.441, "lng": -80.002}, {"lat": 40.445, "lng": -79.995}]},
        {"direction": "OUTBOUND", "path": [{"lat": 40.445, "lng": -79.995}, {"lat": 40.441, "lng": -80.002}]}
      ]
    },
    "stops": {
      "P1:INBOUND": [
        {"stopId": "7079", "stopName": "East Busway at Negley", "lat": 40.4521, "lon": -79.9321, "dtradd": [], "dtrrem": []}
      ],
      "P1:OUTBOUND": [
        {"stopId": "8192", "stopName": "East Busway at Penn", "lat": 40.4612, "lon": -79.9198, "dtradd": [], "dtrrem": []}
      ]
    }
  }
}

4.2 RoutesRetrieved (HTTP 200)
Payload Type: IRoute[]
Example Body:
JSON
{
  "name": "RoutesRetrieved",
  "payload": [
    {
      "id": "P1",
      "name": "East Busway All-Stops",
      "system": "PRT",
      "color": "#00518B",
      "directions": ["INBOUND", "OUTBOUND"],
      "activeStatus": true,
      "operatingDays": [1, 2, 3, 4, 5]
    },
    {
      "id": "CMU-1",
      "name": "A Route- N. Oakland / W. Shadyside",
      "system": "CMU",
      "color": "#C41230",
      "directions": ["OUTBOUND"],
      "activeStatus": true,
      "operatingDays": [1, 2, 3, 4, 5]
    }
  ]
}

4.3 PathGenerated (HTTP 200) — IPattern[] Format
Payload Type: IPattern[]
direction: Travel direction (e.g., "INBOUND", "OUTBOUND").
path: Array of {lat, lng} coordinate pairs defining the polyline.
Example Body:
JSON
{
  "name": "PathGenerated",
  "payload": [
    {
      "direction": "INBOUND",
      "path": [
        {"lat": 40.441, "lng": -80.002},
        {"lat": 40.445, "lng": -79.995},
        {"lat": 40.452, "lng": -79.982}
      ]
    },
    {
      "direction": "OUTBOUND",
      "path": [
        {"lat": 40.452, "lng": -79.982},
        {"lat": 40.445, "lng": -79.995},
        {"lat": 40.441, "lng": -80.002}
      ]
    }
  ]
}

4.4 VehiclesLocated (HTTP 200)
Payload Type: IVehicle[]
Example Body:
JSON
{
  "name": "VehiclesLocated",
  "payload": [
    {
      "vid": "3301",
      "lat": 40.441,
      "lon": -80.002,
      "routeId": "P1",
      "heading": 180,
      "speed": 8.5,
      "source": "live",
      "lastUpdate": "2026-03-26T10:00:00Z",
      "isDetoured": false,
      "delay": 0,
      "tripId": "12345",
      "currentStatus": "IN_TRANSIT_TO",
      "currentStopSequence": 5,
      "currentStopId": "7079"
    }
  ]
}

4.5 StopsRetrieved (HTTP 200)
Payload Type: IStop[]
Example Body:
JSON
{
  "name": "StopsRetrieved",
  "payload": [
    {
      "stopId": "7079",
      "stopName": "East Busway at Negley",
      "lat": 40.4521,
      "lon": -79.9321,
      "dtradd": [],
      "dtrrem": []
    }
  ]
}

4.6 PredictionsRetrieved (HTTP 200)
Payload Type: IPrediction[]
Example Body:
JSON
{
  "name": "PredictionsRetrieved",
  "payload": [
    {
      "stopId": "7079",
      "routeId": "P1",
      "vid": "3301",
      "predictedArrivalTime": 1711443600000,
      "isDelayed": false,
      "minutes": 5
    }
  ]
}

4.7 DetoursRetrieved (HTTP 200)
Payload Type: IDetour[]
Example Body (metadata only, from /transit/detours/:routeId):
JSON
{
  "name": "DetoursRetrieved",
  "payload": [
    {
      "id": "DTR_201",
      "description": "Route P1 diverted due to construction on East Busway at Negley Station.",
      "startdt": "2026-03-20T08:00:00Z",
      "enddt": "2026-04-01T17:00:00Z",
      "routeIds": ["P1"]
    }
  ]
}
Example Body (with geometry, from /transit/detours/:routeId/geometry):
JSON
{
  "name": "DetoursRetrieved",
  "payload": [
    {
      "id": "DTR_201",
      "description": "Route P1 diverted due to construction on East Busway at Negley Station.",
      "startdt": "2026-03-20T08:00:00Z",
      "enddt": "2026-04-01T17:00:00Z",
      "routeIds": ["P1"],
      "geometry": [
        {
          "detourId": "DTR_201",
          "direction": "INBOUND",
          "detourPath": [{"lat": 40.451, "lng": -79.934}, {"lat": 40.453, "lng": -79.930}],
          "originalPath": [{"lat": 40.452, "lng": -79.932}, {"lat": 40.453, "lng": -79.930}]
        }
      ]
    }
  ]
}

4.8 ConfigFound (HTTP 200)
Payload Type: IConfig
Example Body:
JSON
{
  "name": "ConfigFound",
  "message": "Google Maps configuration",
  "payload": {
    "apiKey": "<YOUR_RESTRICTED_API_KEY>",
    "lat": 40.4433,
    "lon": -79.9436,
    "defaultZoom": 14
  }
}

4.9 Health Status (HTTP 200)
Non-standard response (not wrapped in ISuccess).
Example Body:
JSON
{
  "vehiclePositions": {
    "healthy": true,
    "consecutiveFailures": 0,
    "lastFetched": "2026-03-26T10:00:00Z",
    "error": null
  },
  "tripUpdates": {
    "healthy": true,
    "consecutiveFailures": 0,
    "lastFetched": "2026-03-26T10:00:00Z",
    "error": null
  },
  "trueTimeColors": {
    "available": true
  },
  "overall": "healthy"
}

5. Error Codes and Error Names

Code  Error Name          Trigger & Description
400   MissingParameter    Missing required parameter. Returned when: dir query param missing on GET /transit/stops/:routeId; date missing in body on POST /transit/routes/available.
401   MissingToken        No Authorization header or Bearer token on endpoints requiring auth (GET /map/config, GET /map/users/:username).
401   InvalidToken        Bearer token provided but JWT verification fails (expired, malformed, or invalid signature).
404   RouteNotFound       Route ID does not exist or has no patterns. Returned by GET /transit/routes/:id when no patterns are found for the given route.
404   StopNotFound        No stops found for the given route and direction. Returned by GET /transit/stops/:routeId when the route/direction combination yields no results.
451   ServiceUnavailable  External service not configured. Returned when TripShot API is not configured but CMU route data is requested.
500   GetRequestFailure   Unhandled server error during a GET request handler. Wraps unexpected exceptions.

6. Implementation Notes
Google Maps Integration:
Route geometries are served as IPattern[] (array of {direction, path} objects with {lat, lng} coordinates), NOT as GeoJSON. The client's RouteRenderer renders these as IMapPolyline objects via the IMapProvider abstraction layer.
Google Maps JavaScript SDK is loaded dynamically and requires a properly restricted API key configured in Google Cloud Console.

Polling:
Vehicle positions: The server polls the GTFS-RT protobuf feed every 30 seconds and stores results in-memory. The client's VehicleTracker polls GET /transit/vehicles/:routeId every 30 seconds and animates marker movement using ease-out cubic easing over 5 seconds.
Predictions: The server polls the GTFS-RT trip-updates feed every 30 seconds. Predictions are fetched on-demand when a user clicks a stop marker.
Health: The client polls GET /transit/health every 60 seconds to detect upstream feed failures and color availability changes.

Caching Strategy:
In-memory: Vehicle positions and predictions (high-frequency, updated every 30 seconds). No database writes.
MongoDB TTL (24-hour): Routes (with TrueTime-merged colors), patterns, stops, and detours. Shared across all clients.
Client-side: Bulk data cached in FilterController's local Maps (patternCache, stopCache, routeColorCache). Zero additional API calls for route/stop data after initial bulk load.

State Management:
All filter state is persisted in the URL hash (not query parameters). The url-sync module reads/writes the hash using history.replaceState().
Hash format: #/map?r=<routeId>&s=<systems>&d=<YYYYMMDD>&t=<HHMM>&dir=<IB,OB>
Parameters (all optional):
  r: Selected route ID (e.g., r=P1)
  s: Comma-separated systems (e.g., s=PRT,CMU; omitted if default PRT-only)
  d: Date filter, 8 digits no separators (e.g., d=20260326)
  t: Time filter, 24-hour 4 digits (e.g., t=1430; converted to 12-hour AM/PM internally)
  dir: Directions, comma-separated shorthand (e.g., dir=IB or dir=OB; omitted if both active)

On page refresh, the app reads the URL hash and restores the exact filter state, so users do not lose their view.
