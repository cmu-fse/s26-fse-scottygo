// Service for interfacing with the Tripshot API for CMU Shuttle routes
// Tripshot provides real-time transit data for Carnegie Mellon University shuttle services

import {
  IRoute,
  IPattern,
  IStop,
  IVehicle
} from '../../common/transit.interface';
import { IAppError } from '../../common/server.responses';
import {
  CMU_ROUTE_METADATA,
  CMURouteMetadata,
  extractRouteIndex
} from './tripshot-metadata';
import {
  TRIPSHOT_BASE_URL,
  TripshotRouteResponse,
  decodePolyline,
  fetchWithTimeout
} from './tripshot-api';

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
    const { metadata } = extractRouteIndex(routeId);
    const tripshotRouteId = metadata.routeId;

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
      console.error(
        `[Tripshot ${new Date().toISOString()}] Failed to fetch patterns for ${routeId}:`,
        error
      );

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
    const { metadata } = extractRouteIndex(routeId);

    // CMU shuttles run as loops and only have OUTBOUND direction
    if (direction && direction.toUpperCase() === 'INBOUND') {
      console.log(
        `[Tripshot ${new Date().toISOString()}] CMU routes only support OUTBOUND direction, returning empty for INBOUND request`
      );
      return [];
    }

    const tripshotRouteId = metadata.routeId;

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
      console.error(
        `[Tripshot ${new Date().toISOString()}] Failed to fetch stops for ${routeId}:`,
        error
      );

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
    console.warn(
      `[Tripshot ${new Date().toISOString()}] Real-time vehicle tracking not yet implemented for ${routeId}`
    );
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
