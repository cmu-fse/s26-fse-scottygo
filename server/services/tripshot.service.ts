// Service for interfacing with the Tripshot API for CMU Shuttle routes
// Tripshot provides real-time transit data for Carnegie Mellon University shuttle services

import {
  IRoute,
  IPattern,
  IStop,
  IVehicle,
  IPrediction,
  IDirectionSchedule
} from '../../common/transit.interface';
import {
  CMU_ROUTE_METADATA,
  CMURouteMetadata,
  CMUScheduleWindow,
  extractRouteIndex,
  findCmuRouteIdByTripshotRouteId
} from './tripshot-metadata';
import tripshotLiveStatusService from './tripshot-livestatus.service';
import cmuStaticDataService from './cmu-static-data.service';

class TripshotService {
  /**
   * Get all CMU Shuttle routes
   */
  async getRoutes(): Promise<IRoute[]> {
    const routes: IRoute[] = [];

    for (const [index, metadata] of Object.entries(CMU_ROUTE_METADATA)) {
      const cmuRouteId = `CMU-${index}`;
      routes.push({
        id: cmuRouteId,
        name: cmuStaticDataService.getRouteName(cmuRouteId) ?? metadata.name,
        system: 'CMU',
        color: metadata.color,
        directions: ['OUTBOUND'], // CMU shuttles typically run as loops
        activeStatus: true,
        operatingDays: metadata.operatingDays
      });
    }

    return routes;
  }

  /**
   * Fetch route geometry (patterns) from static route-scoped CMU CSVs.
   * @param routeId - Format: "CMU-{index}" (e.g., "CMU-1" for A Route)
   */
  async getPatterns(routeId: string): Promise<IPattern[]> {
    const { metadata } = extractRouteIndex(routeId);
    const tripshotRouteId = metadata.routeId;

    const staticPatterns =
      cmuStaticDataService.getPatternsForTripshotRoute(tripshotRouteId);
    if (staticPatterns.length === 0) {
      console.warn(
        `[Tripshot ${new Date().toISOString()}] No static patterns found for ${routeId} (${tripshotRouteId})`
      );
    }

    return staticPatterns;
  }

  /**
   * Warm static pattern reads for all known CMU routes.
   * Called once after the liveStatus service completes its first poll.
   */
  async warmPatternCache(): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    const routeIds = Object.keys(CMU_ROUTE_METADATA).map((k) => `CMU-${k}`);
    console.log(
      `[Tripshot ${new Date().toISOString()}] Pre-warming pattern cache for ${routeIds.length} routes`
    );
    for (const routeId of routeIds) {
      try {
        await this.getPatterns(routeId);
      } catch {
        // Non-fatal — static data may be incomplete for this route.
      }
    }
    console.log(
      `[Tripshot ${new Date().toISOString()}] Static pattern warm-up complete`
    );
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

    const staticStops = cmuStaticDataService.getStopsForTripshotRoute(
      tripshotRouteId,
      routeId
    );
    if (staticStops.length > 0) {
      return staticStops;
    }

    if (staticStops.length === 0) {
      console.warn(
        `[Tripshot ${new Date().toISOString()}] No static stops found for ${routeId} (${tripshotRouteId})`
      );
    }

    return staticStops;
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
  getPredictions(stopId: string, routeIdFilter?: string): IPrediction[] {
    const hasCmuRouteFilter =
      typeof routeIdFilter === 'string' && routeIdFilter.startsWith('CMU-');

    let filterTripshotRouteId: string | null = null;
    if (hasCmuRouteFilter && routeIdFilter) {
      try {
        filterTripshotRouteId = extractRouteIndex(routeIdFilter)
          .metadata.routeId.trim()
          .toLowerCase();
      } catch {
        filterTripshotRouteId = null;
      }
    }

    return tripshotLiveStatusService
      .getPredictions(stopId)
      .filter(
        (p) =>
          !filterTripshotRouteId ||
          p.routeId.trim().toLowerCase() === filterTripshotRouteId
      )
      .map((p) => {
        // When a CMU route filter is applied, preserve that route ID in the
        // response so aliases that share a TripShot UUID (e.g., A/C) still
        // display the member-selected route consistently.
        if (hasCmuRouteFilter && routeIdFilter) {
          return { ...p, routeId: routeIdFilter };
        }

        const cmuRouteId = findCmuRouteIdByTripshotRouteId(p.routeId);
        return cmuRouteId ? { ...p, routeId: cmuRouteId } : p;
      })
      .sort((a, b) => a.predictedArrivalTime - b.predictedArrivalTime);
  }

  /**
   * Return the schedule summary (operating days + first/last trip per
   * direction) for a CMU shuttle route.
   *
   * Routes with a known timetable in CMU_ROUTE_METADATA use that static data
   * directly so the popup is always correct regardless of the current day or
   * liveStatus feed availability.  Routes without static schedule data (e.g.
   * NightSafe, CCL) fall back to the TripShot liveStatus feed.
   *
   * @param routeId - Format: "CMU-{index}" (e.g., "CMU-1")
   */
  getRouteSchedule(routeId: string): {
    operatingDays: number[];
    directions: IDirectionSchedule[];
  } | null {
    const { metadata } = extractRouteIndex(routeId);

    // --- Static timetable path (preferred) ---
    if (metadata.schedule && metadata.schedule.length > 0) {
      const directions: IDirectionSchedule[] = metadata.schedule.map(
        (window: CMUScheduleWindow) => ({
          direction: this.formatDayRangeLabel(window.days),
          firstTrip: window.firstTrip,
          lastTrip: window.lastTrip
        })
      );
      return { operatingDays: metadata.operatingDays, directions };
    }

    // --- liveStatus fallback (NightSafe, CCL, etc.) ---
    const liveSchedule = tripshotLiveStatusService.getScheduleByTsRouteId(
      metadata.routeId
    );
    if (!liveSchedule) {
      return null;
    }
    return {
      operatingDays: metadata.operatingDays,
      directions: [
        {
          direction: 'OUTBOUND',
          firstTrip: liveSchedule.firstTrip,
          lastTrip: liveSchedule.lastTrip
        }
      ]
    };
  }

  /**
   * Convert an array of weekday indices (0=Sun…6=Sat) into a compact label
   * suitable for the route-info popup, e.g. [1,2,3,4,5] → "Mon–Fri".
   */
  private formatDayRangeLabel(days: number[]): string {
    const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    if (days.length === 7) return 'Mon–Sun';
    if (days.length === 5 && days.every((d, i) => d === i + 1))
      return 'Mon–Fri';
    if (days.length === 2 && days.includes(0) && days.includes(6))
      return 'Sat–Sun';
    if (
      days.length === 3 &&
      days.includes(4) &&
      days.includes(5) &&
      days.includes(6)
    )
      return 'Thu–Sat';
    // Generic: list abbreviated day names
    return days.map((d) => SHORT[d]).join(', ');
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
