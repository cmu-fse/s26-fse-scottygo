# CMU Shuttle Integration with Tripshot API

## Overview

ScottyGo now supports CMU Shuttle routes in addition to PRT (Port Authority Transit) routes. The CMU Shuttle data is fetched from the Tripshot API, which provides real-time transit information for Carnegie Mellon University's shuttle services.

## Features

- **15 CMU Shuttle Routes** including:
  - A Route (N. Oakland / W. Shadyside)
  - B Route (E. Shadyside)
  - C Route (Squirrel Hill)
  - Bakery Square (Long & Short)
  - NightSafe Transit routes (Blue, Green, Red, Yellow zones)
  - PTC routes
  - And more...

- **Route Visualization**: Full route geometries with polyline rendering on Google Maps
- **Stop Information**: Complete stop listings with lat/lng coordinates
- **System Toggle**: CMU routes appear when "CMU Shuttle" system is toggled on
- **Prefetching**: Routes are automatically fetched when CMU system is enabled
- **Graceful Degradation**: System works even if Tripshot API is not configured (CMU routes simply won't appear)

## Architecture

### Backend Components

#### 1. Tripshot Service (`server/services/tripshot.service.ts`)
- **Polyline Decoder**: Implements Google's encoded polyline algorithm to decode route geometries
- **Route Metadata**: Maintains color schemes and route names for all 15 CMU routes
- **API Integration**: Fetches route data from Tripshot API endpoints
- **Data Processing**: Converts Tripshot's JSON format to ScottyGo's `IPattern` format

#### 2. Transit Controller Updates (`server/controllers/transit.controller.ts`)
- **Dual System Support**: Routes PRT requests to TrueTime service, CMU requests to Tripshot service
- **Route Detection**: Uses route ID prefix (`CMU-{index}`) to identify shuttle routes
- **Unified Response**: Returns consistent `IPattern[]` format regardless of data source

#### 3. Environment Configuration (`server/env.ts`)
- `TRIPSHOT_API_KEY`: Your Tripshot API authentication key
- `TRIPSHOT_BASE_URL`: Base URL for Tripshot API (default: `https://api.tripshot.com`)
- `TRIPSHOT_AGENCY_ID`: CMU's agency ID in Tripshot system (default: `157`)

### Frontend Components

#### 1. Filter Controller (`client/scripts/controllers/filter-controller.ts`)
- **Prefetching Logic**: Automatically fetches CMU routes when system is toggled on
- **Route Selector Update**: Populates route selector with CMU route IDs when available
- **System Filtering**: Filters displayed routes based on PRT/CMU toggle state

#### 2. Route Format Support (`client/scripts/renderers/route-renderer.ts`)
- Handles custom `[{direction, path}]` format from both TrueTime and Tripshot
- Gracefully falls back to GeoJSON format if needed
- Renders multiple direction segments for each route

## Configuration

### 1. Environment Variables

Add the following to your `.env` file:

```env
# Tripshot API (CMU Shuttle Routes)
TRIPSHOT_API_KEY=your_api_key_here
TRIPSHOT_BASE_URL=https://api.tripshot.com
TRIPSHOT_AGENCY_ID=157
```

**Note**: If you don't have Tripshot API access, leave `TRIPSHOT_API_KEY` empty. The system will gracefully handle the missing configuration and simply not display CMU routes.

### 2. How to Get Tripshot API Access

1. Contact CMU Transportation Services
2. Request API credentials for shuttle tracking integration
3. Alternatively, contact Tripshot directly for developer access

### 3. Testing Without Tripshot API

The system is designed to work without Tripshot configuration:
- PRT routes will work normally
- CMU toggle will be available but won't show routes
- No errors will occur - system logs warnings only

## Data Flow

### Route Fetching
```
1. User toggles "CMU Shuttle" ON
   ↓
2. Filter Controller detects CMU system enabled
   ↓
3. Calls fetchAllRoutes() with system=CMU
   ↓
4. Transit Controller routes to Tripshot Service
   ↓
5. Tripshot Service fetches from API
   ↓
6. Returns array of IRoute objects with CMU-prefix IDs
   ↓
7. Route Selector updates with CMU route options
```

### Route Geometry Fetching
```
1. User selects route (e.g., "CMU-1" for A Route)
   ↓
2. Filter Controller calls getPatterns(routeId)
   ↓
3. Transit Controller detects "CMU-" prefix
   ↓
4. Routes to Tripshot Service getPatterns()
   ↓
5. Tripshot fetches route data from API
   ↓
6. Decodes polylines using Google algorithm
   ↓
7. Converts to IPattern format: [{direction, path: [{lat, lng}]}]
   ↓
8. Route Renderer displays on map
```

## Route ID Format

CMU Shuttle routes use the format: `CMU-{index}`

- `CMU-1` = A Route
- `CMU-2` = AB Route
- `CMU-3` = B Route
- `CMU-4` = Bakery Square (Long)
- ... and so on through `CMU-15`

This prefix-based system allows the backend to easily distinguish between PRT and CMU routes.

## API Endpoints Used

All endpoints follow the existing REST API specification with system-aware routing:

### GET `/transit/routes?system=CMU`
Returns all CMU shuttle routes with metadata

**Response:**
```json
{
  "name": "RoutesRetrieved",
  "message": "Found 15 routes",
  "payload": [
    {
      "id": "CMU-1",
      "name": "A Route- N. Oakland / W. Shadyside",
      "system": "CMU",
      "color": "#C41230",
      "directions": ["OUTBOUND"],
      "activeStatus": true,
      "operatingDays": [0,1,2,3,4,5,6]
    },
    ...
  ]
}
```

### GET `/transit/routes/CMU-1`
Returns route geometry for CMU route #1

**Response:**
```json
{
  "name": "PathGenerated",
  "message": "Found 1 patterns for route CMU-1",
  "payload": [
    {
      "direction": "OUTBOUND",
      "path": [
        {"lat": 40.4433, "lng": -79.9436},
        {"lat": 40.4445, "lng": -79.9450},
        ...
      ]
    }
  ]
}
```

### GET `/transit/stops/CMU-1?dir=OUTBOUND`
Returns stops for CMU route #1

**Response:**
```json
{
  "name": "StopsRetrieved",
  "message": "Found 12 stops for route CMU-1 OUTBOUND",
  "payload": [
    {
      "stopId": "stop123",
      "stopName": "Warner Hall",
      "lat": 40.4433,
      "lon": -79.9436,
      "routes": ["CMU-1"],
      "dtradd": [],
      "dtrrem": []
    },
    ...
  ]
}
```

## Polyline Decoding

The Tripshot API returns route geometries as Google-encoded polylines. The service includes a decoder that:

1. Reads ASCII-encoded characters
2. Extracts 5-bit chunks
3. Builds latitude and longitude deltas
4. Accumulates to form coordinate arrays
5. Returns `{lat, lng}` objects compatible with Google Maps

**Python Reference** (provided by user):
```python
def decode_polyline(polyline_str):
    # ... decoding logic ...
    coordinates.append((lat / 1e5, lng / 1e5))
    return coordinates
```

**TypeScript Implementation** (in tripshot.service.ts):
```typescript
function decodePolyline(polylineStr: string): Array<{lat: number, lng: number}> {
    // ... ported decoding logic ...
    coordinates.push({ lat: lat / 1e5, lng: lng / 1e5 });
    return coordinates;
}
```

## User Experience

### Before CMU Toggle
- Map shows only PRT routes (default state)
- Route selector lists PRT route IDs (61A, 61C, P1, etc.)

### After CMU Toggle ON
1. Filter controller detects CMU system enabled
2. Prefetches CMU routes if not already loaded
3. Route selector updates to show CMU routes (CMU-1, CMU-2, etc.)
4. User can select and visualize CMU shuttle routes
5. Stops and route geometry render on map

### If Tripshot API Not Configured
- No errors displayed to user
- CMU toggle available but selecting CMU routes returns empty
- Console shows warning: `[Tripshot] Service not configured, skipping CMU routes`

## Troubleshooting

### CMU Routes Not Appearing

1. **Check Environment Variables**
   ```bash
   echo $TRIPSHOT_API_KEY
   ```
   Should return your API key (not empty)

2. **Check Server Logs**
   Look for:
   ```
   [Tripshot] Service not configured, skipping CMU routes
   ```
   This means API key is missing.

3. **Check API Endpoint**
   Test API directly:
   ```bash
   curl -H "Authorization: Bearer YOUR_KEY" \
        "https://api.tripshot.com/routeplanner/route/157/1"
   ```

4. **Check Browser Console**
   Look for errors when toggling CMU system or selecting routes

### Routes Render But No Stops

- Verify API returns stop data in `vias` array
- Check that `ViaStop.stop` structure matches expected format
- Enable debug logging in tripshot.service.ts

### Polyline Decoding Errors

- Verify polyline string is not corrupted
- Check that API returns valid encoded polylines
- Test decoder with known good polyline strings

## Future Enhancements

- [ ] Real-time vehicle tracking integration (when Tripshot API supports it)
- [ ] Arrival predictions for CMU stops
- [ ] Service alerts and detours from Tripshot
- [ ] Schedule-based filtering for CMU routes
- [ ] CMU route search and autocomplete

## Testing

### Manual Testing Steps

1. **Build the project**
   ```bash
   npm run build
   npm run start
   ```

2. **Enable CMU System**
   - Click system toggle button
   - Turn ON "CMU Shuttle"
   - Verify console logs: "CMU system enabled - prefetching CMU routes..."

3. **Select CMU Route**
   - Open route selector
   - Search for "CMU-" routes
   - Select route (e.g., "CMU-1")
   - Verify route polyline renders on map

4. **Check Stops**
   - Verify direction toggle works (INBOUND/OUTBOUND)
   - Check that stop markers appear at correct coordinates

### Automated Testing

Currently, the integration relies on manual testing. Future work should include:
- Unit tests for polyline decoder
- Integration tests for Tripshot service
- Mock API responses for CI/CD pipeline

## References

- [Tripshot API Documentation](https://tripshot.com) (contact for access)
- [Google Polyline Encoding Algorithm](https://developers.google.com/maps/documentation/utilities/polylinealgorithm)
- [CMU Transportation Services](https://www.cmu.edu/parking/)
- [ScottyGo REST API Documentation](../REST_API/REST_RouteVisualization.md)

---

**Last Updated**: February 27, 2026  
**Author**: ScottyGo Development Team
