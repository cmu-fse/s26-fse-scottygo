// Service for interfacing with the Tripshot API for CMU Shuttle routes
// Tripshot provides real-time transit data for Carnegie Mellon University shuttle services

import { IRoute, IPattern, IStop, IVehicle } from '../../common/transit.interface';
import { IAppError } from '../../common/server.responses';

const TIMEOUT_MS = 5000; // 5 seconds timeout for API requests
const TRIPSHOT_BASE_URL = 'https://cmu.tripshot.com/v2/p';

// CMU Shuttle Route metadata with actual Tripshot route IDs
interface CMURouteMetadata {
  name: string;
  shortName: string;
  color: string;
  routeId: string; // Tripshot UUID
}

const CMU_ROUTE_METADATA: Record<number, CMURouteMetadata> = {
  1: { 
    name: 'A Route- N. Oakland / W. Shadyside', 
    shortName: 'A', 
    color: '#C41230',
    routeId: 'A9E22E1E-A366-4FE4-973C-871EB78E2349'
  },
  2: { 
    name: 'AB Route- N. Oak & Shadyside Comb.', 
    shortName: 'AB', 
    color: '#8E44AD',
    routeId: '967E607E-34FD-4451-A33F-01D4B8157CD3'
  },
  3: { 
    name: 'B Route- E. Shadyside', 
    shortName: 'B', 
    color: '#006AB3',
    routeId: '825C4CAF-C531-4DBC-B11B-F90580ABB70A'
  },
  4: { 
    name: 'Bakery Square (Long)', 
    shortName: 'BKL', 
    color: '#FF6B35',
    routeId: 'AF900FBF-8D7B-4F7C-B8BD-D0FE1453BC19'
  },
  5: { 
    name: 'Bakery Square (Short)', 
    shortName: 'BKS', 
    color: '#FFA630',
    routeId: '07C26A10-420F-4324-8F36-C91BC1630E9F'
  },
  6: { 
    name: 'C Route- Squirrel Hill', 
    shortName: 'C', 
    color: '#2ECC71',
    routeId: 'A9E22E1E-A366-4FE4-973C-871EB78E2349'
  },
  7: { 
    name: 'Contemporary Craft - Lawrenceville', 
    shortName: 'CCL', 
    color: '#9B59B6',
    routeId: 'BFF8598D-6782-4B41-8C62-D3A1E4F4B4DB'
  },
  8: { 
    name: 'NightSafe Transit Blue Zone (Shadyside)', 
    shortName: 'NSB', 
    color: '#3498DB',
    routeId: '38C552F5-A569-446F-97E1-2F72C06EB0AD'
  },
  9: { 
    name: 'NightSafe Transit Blue/Green Combined', 
    shortName: 'NSBG', 
    color: '#1ABC9C',
    routeId: '7F7F4951-FD17-49F4-A129-1551B04F063E'
  },
  10: { 
    name: 'NightSafe Transit Green Zone (Oakland)', 
    shortName: 'NSG', 
    color: '#27AE60',
    routeId: 'B90432CE-5B11-4C6E-BC09-431F54ED5970'
  },
  11: { 
    name: 'NightSafe Transit Red Zone (Sq. Hill 2)', 
    shortName: 'NSR', 
    color: '#E74C3C',
    routeId: '00A55A76-231F-4CF2-8B89-F6DBD518C117'
  },
  12: { 
    name: 'NightSafe Transit Red/Yellow Combined', 
    shortName: 'NSRY', 
    color: '#F39C12',
    routeId: 'CB8AD8C3-6F50-4CD5-888E-84DD11A1E95B'
  },
  13: { 
    name: 'NightSafe Transit Yellow Zone (Sq. Hill 1)', 
    shortName: 'NSY', 
    color: '#F1C40F',
    routeId: 'D156D457-473E-405F-AF31-22E9A44AD2F2'
  },
  14: { 
    name: 'PTC', 
    shortName: 'PTC', 
    color: '#34495E',
    routeId: 'D2DBA04E-C0EA-4BDD-BFEE-4A89612087FD'
  },
  15: { 
    name: 'PTC & Mill 19', 
    shortName: 'PTC19', 
    color: '#7F8C8D',
    routeId: 'D73A82B6-627D-405B-9431-421535F4E021'
  }
};

// Interfaces for Tripshot API responses

interface TripshotLocation {
  lt: number; // latitude
  lg: number; // longitude
}

interface TripshotStop {
  stopId: string;
  name: string;
  location: TripshotLocation;
}

interface TripshotViaStop {
  ViaStop: {
    stop: TripshotStop;
  };
}

interface TripshotStep {
  polyline: string; // Google encoded polyline
  distanceMeters: number;
  durationSec: number;
}

interface TripshotLeg {
  startPoint: { NavViaStop: { stopId: string } };
  endPoint: { NavViaStop: { stopId: string } };
  steps: TripshotStep[];
}

interface TripshotRide {
  vias: TripshotViaStop[];
}

interface TripshotServiceData {
  legs: TripshotLeg[];
}

interface TripshotRouteResponse {
  rides: TripshotRide[];
  services: TripshotServiceData[];
}

/**
 * Decode Google's encoded polyline algorithm to lat/lng coordinates
 * Ported from Python implementation provided by user
 */
function decodePolyline(polylineStr: string): Array<{ lat: number; lng: number }> {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: Array<{ lat: number; lng: number }> = [];

  while (index < polylineStr.length) {
    let shift = 0;
    let result = 0;

    // Decode latitude
    while (true) {
      const b = polylineStr.charCodeAt(index) - 63;
      index += 1;
      result |= (b & 0x1f) << shift;
      shift += 5;
      if (b < 0x20) break;
    }

    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;

    // Decode longitude
    while (true) {
      const b = polylineStr.charCodeAt(index) - 63;
      index += 1;
      result |= (b & 0x1f) << shift;
      shift += 5;
      if (b < 0x20) break;
    }

    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coordinates.push({
      lat: lat / 1e5,
      lng: lng / 1e5
    });
  }

  return coordinates;
}

/**
 * Fetch with timeout to prevent hanging requests
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeout);
    return response;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

class TripshotService {
  /**
   * Get all CMU Shuttle routes
   */
  async getRoutes(): Promise<IRoute[]> {
    const routes: IRoute[] = [];

    for (const [index, metadata] of Object.entries(CMU_ROUTE_METADATA)) {
      routes.push({
        id: `CMU-${index}`,
        name: metadata.name,
        system: 'CMU',
        color: metadata.color,
        directions: ['OUTBOUND'], // CMU shuttles typically run as loops
        activeStatus: true,
        operatingDays: [0, 1, 2, 3, 4, 5, 6] // Operates all days (varies by route)
      });
    }

    return routes;
  }

  /**
   * Fetch route geometry (patterns) from Tripshot API
   * @param routeId - Format: "CMU-{index}" (e.g., "CMU-1" for A Route)
   */
  async getPatterns(routeId: string): Promise<IPattern[]> {
    // Extract route index from ID
    const match = routeId.match(/^CMU-(\d+)$/);
    if (!match) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'RouteNotFound',
        message: `Invalid CMU route ID format: ${routeId}`
      };
      throw error;
    }

    const routeIndex = parseInt(match[1]);
    if (!CMU_ROUTE_METADATA[routeIndex]) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'RouteNotFound',
        message: `CMU route ${routeId} not found`
      };
      throw error;
    }

    const tripshotRouteId = CMU_ROUTE_METADATA[routeIndex].routeId;
    
    try {
      // Get current date for the API call (format: YYYY-MM-DD)
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];
      
      // Fetch route data from Tripshot API
      const url = `${TRIPSHOT_BASE_URL}/routeSummary/${tripshotRouteId}?day=${dateStr}&withNavigation=true&embedStops=true`;
      
      const response = await fetchWithTimeout(url);

      if (!response.ok) {
        throw new Error(`Tripshot API returned ${response.status}`);
      }

      const data: TripshotRouteResponse = await response.json();

      // Process the response to extract route geometry
      return this.processTripshotResponse(data);
    } catch (error) {
      console.error(`[Tripshot ${new Date().toISOString()}] Failed to fetch patterns for ${routeId}:`, error);
      
      // Return empty array if API fails (client will show error)
      const appError: IAppError = {
        type: 'ServerError',
        name: 'UpstreamError',
        message: `Failed to fetch CMU route geometry from Tripshot`
      };
      throw appError;
    }
  }

  /**
   * Process Tripshot API response to extract route geometry as IPattern[]
   */
  private processTripshotResponse(data: TripshotRouteResponse): IPattern[] {
    if (!data.services || data.services.length === 0) {
      return [];
    }

    const service = data.services[0];
    const shapePoints: Array<{ lat: number; lng: number }> = [];

    // Iterate through all legs and steps to decode polylines
    for (const leg of service.legs) {
      for (const step of leg.steps) {
        const decoded = decodePolyline(step.polyline);
        shapePoints.push(...decoded);
      }
    }

    // Return as single OUTBOUND pattern (CMU shuttles run as loops)
    return [
      {
        direction: 'OUTBOUND',
        path: shapePoints
      }
    ];
  }

  /**
   * Get stops for a specific route
   * @param routeId - Format: "CMU-{index}"
   * @param direction - INBOUND or OUTBOUND (CMU routes only support OUTBOUND)
   */
  async getStops(routeId: string, direction?: string): Promise<IStop[]> {
    // Extract route index from ID
    const match = routeId.match(/^CMU-(\d+)$/);
    if (!match) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'RouteNotFound',
        message: `Invalid CMU route ID format: ${routeId}`
      };
      throw error;
    }

    const routeIndex = parseInt(match[1]);
    
    if (!CMU_ROUTE_METADATA[routeIndex]) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'RouteNotFound',
        message: `CMU route ${routeId} not found in metadata`
      };
      throw error;
    }

    // CMU shuttles run as loops and only have OUTBOUND direction
    if (direction && direction.toUpperCase() === 'INBOUND') {
      console.log(`[Tripshot ${new Date().toISOString()}] CMU routes only support OUTBOUND direction, returning empty for INBOUND request`);
      return [];
    }

    const tripshotRouteId = CMU_ROUTE_METADATA[routeIndex].routeId;

    try {
      // Get current date for the API call (format: YYYY-MM-DD)
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];
      
      const url = `${TRIPSHOT_BASE_URL}/routeSummary/${tripshotRouteId}?day=${dateStr}&withNavigation=true&embedStops=true`;
      
      const response = await fetchWithTimeout(url);

      if (!response.ok) {
        throw new Error(`Tripshot API returned ${response.status}`);
      }

      const data: TripshotRouteResponse = await response.json();

      // Extract stops from vias
      if (!data.rides || data.rides.length === 0) {
        return [];
      }

      const ride = data.rides[0];
      const stops: IStop[] = [];

      for (const via of ride.vias) {
        const stop = via.ViaStop.stop;
        stops.push({
          stopId: stop.stopId,
          stopName: stop.name,
          lat: stop.location.lt,
          lon: stop.location.lg,
          routes: [routeId],
          dtradd: [],
          dtrrem: []
        });
      }

      return stops;
    } catch (error) {
      console.error(`[Tripshot ${new Date().toISOString()}] Failed to fetch stops for ${routeId}:`, error);
      
      const appError: IAppError = {
        type: 'ServerError',
        name: 'UpstreamError',
        message: `Failed to fetch CMU route stops from Tripshot`
      };
      throw appError;
    }
  }

  /**
   * Get real-time vehicle positions
   * Note: Tripshot API may or may not support real-time vehicle tracking
   * This is a placeholder that would need actual API endpoint configuration
   */
  async getVehicles(routeId: string): Promise<IVehicle[]> {
    // TODO: Implement when Tripshot vehicle tracking API is available
    console.warn(`[Tripshot ${new Date().toISOString()}] Real-time vehicle tracking not yet implemented for ${routeId}`);
    return [];
  }

  /**
   * Get route metadata by index
   */
  getRouteMetadata(index: number): CMURouteMetadata | null {
    return CMU_ROUTE_METADATA[index] || null;
  }

  /**
   * Check if service is configured
   * Tripshot CMU API is public, so always returns true
   */
  isConfigured(): boolean {
    return true;
  }
}

// Export singleton instance
const tripshotService = new TripshotService();
export default tripshotService;
