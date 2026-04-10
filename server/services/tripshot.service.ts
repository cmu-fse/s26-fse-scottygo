// Service for interfacing with the Tripshot API for CMU Shuttle routes
// Tripshot provides real-time transit data for Carnegie Mellon University shuttle services

import {
  IRoute,
  IPattern,
  IStop,
  IVehicle,
  IPrediction
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
  fetchWithTimeout,
  isTsViaStop
} from './tripshot-api';
import tripshotLiveStatusService from './tripshot-livestatus.service';

/** How long a cached pattern set is considered fresh (24 hours). */
const PATTERN_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CachedPatterns {
  patterns: IPattern[];
  cachedAt: number;
}

class TripshotService {
  /** Server-side in-memory cache: routeId → patterns + timestamp. */
  private patternCache = new Map<string, CachedPatterns>();

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
   * Fetch route geometry (patterns) from Tripshot API.
   * Results are cached in memory for 24 hours so repeated selections of the
   * same route are served instantly without a TripShot network call.
   * @param routeId - Format: "CMU-{index}" (e.g., "CMU-1" for A Route)
   */
  async getPatterns(routeId: string): Promise<IPattern[]> {
    const { metadata } = extractRouteIndex(routeId);
    const tripshotRouteId = metadata.routeId;

    // Return from cache if still fresh
    const cached = this.patternCache.get(routeId);
    if (cached && Date.now() - cached.cachedAt < PATTERN_CACHE_TTL_MS) {
      console.log(
        `[Tripshot ${new Date().toISOString()}] Patterns for ${routeId} served from cache`
      );
      return cached.patterns;
    }

    try {
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];
      const url = `${TRIPSHOT_BASE_URL}/routeSummary/${tripshotRouteId}?day=${dateStr}&withNavigation=true&embedStops=true`;

      const response = await fetchWithTimeout(url);

      if (!response.ok) {
        throw new Error(`Tripshot API returned ${response.status}`);
      }

      const data: TripshotRouteResponse = await response.json();
      const patterns = this.processTripshotResponse(data);

      // Store in cache (even empty results, to avoid hammering a failing route)
      this.patternCache.set(routeId, { patterns, cachedAt: Date.now() });
      return patterns;
    } catch (error) {
      console.error(
        `[Tripshot ${new Date().toISOString()}] Failed to fetch patterns for ${routeId}:`,
        error
      );

      const appError: IAppError = {
        type: 'ServerError',
        name: 'UpstreamError',
        message: `Failed to fetch CMU route geometry from Tripshot`
      };
      throw appError;
    }
  }

  /**
   * Pre-warm the pattern cache for all known CMU routes in the background.
   * Called once after the liveStatus service completes its first poll so that
   * patterns are ready before a user selects a CMU route.
   * Failures are logged but never thrown — warming is best-effort.
   */
  async warmPatternCache(): Promise<void> {
    const routeIds = Object.keys(CMU_ROUTE_METADATA).map((k) => `CMU-${k}`);
    console.log(
      `[Tripshot ${new Date().toISOString()}] Pre-warming pattern cache for ${routeIds.length} routes`
    );
    for (const routeId of routeIds) {
      // Skip routes already cached
      const cached = this.patternCache.get(routeId);
      if (cached && Date.now() - cached.cachedAt < PATTERN_CACHE_TTL_MS) {
        continue;
      }
      try {
        await this.getPatterns(routeId);
      } catch {
        // Non-fatal — route may not be running today
      }
    }
    console.log(
      `[Tripshot ${new Date().toISOString()}] Pattern cache warm-up complete ` +
        `(${this.patternCache.size} routes cached)`
    );
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

    // Primary: liveStatus cache (in-memory, no network call).
    // This covers routes that are currently active but may not have rides
    // in today's routeSummary response (e.g. routes that started later).
    const liveStops = tripshotLiveStatusService.getStopsByTsRouteId(
      tripshotRouteId,
      routeId
    );
    if (liveStops.length > 0) {
      console.log(
        `[Tripshot ${new Date().toISOString()}] Stops for ${routeId} served from liveStatus cache`
      );
      return liveStops;
    }

    // Fallback: routeSummary API (needed when the route isn't currently active)
    try {
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];

      const url = `${TRIPSHOT_BASE_URL}/routeSummary/${tripshotRouteId}?day=${dateStr}&withNavigation=true&embedStops=true`;

      const response = await fetchWithTimeout(url);

      if (!response.ok) {
        throw new Error(`Tripshot API returned ${response.status}`);
      }

      const data: TripshotRouteResponse = await response.json();

      if (!data.rides || data.rides.length === 0) {
        return [];
      }

      const ride = data.rides[0];
      const stops: IStop[] = [];

      for (const via of ride.vias) {
        // Skip waypoints — only ViaStop entries carry stop coordinates
        if (!isTsViaStop(via)) continue;
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
   * Get real-time vehicle positions for a CMU shuttle route.
   * Data is sourced from the liveStatus poller (updated every 30 s).
   * @param routeId - Format: "CMU-{index}" (e.g., "CMU-1")
   */
  async getVehicles(routeId: string): Promise<IVehicle[]> {
    const { metadata } = extractRouteIndex(routeId);
    const vehicles = tripshotLiveStatusService.getVehiclesByTsRouteId(
      metadata.routeId
    );
    // Rewrite internal TripShot UUID to our CMU-n route ID so the client
    // receives a consistent routeId regardless of data source.
    return vehicles.map((v) => ({ ...v, routeId }));
  }

  /**
   * Get ETA predictions for a TripShot stop UUID.
   * Data is sourced from the liveStatus poller (updated every 30 s).
   * @param stopId - TripShot stop UUID
   */
  getPredictions(stopId: string): IPrediction[] {
    return tripshotLiveStatusService.getPredictions(stopId);
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
