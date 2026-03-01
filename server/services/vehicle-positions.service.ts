/**
 * GTFS-RT Vehicle Positions Service
 *
 * Fetches the PRT GTFS-RT vehicle positions protobuf feed every 30 seconds
 * and stores the decoded data **in memory** (Map keyed by routeId) so that
 * API responses have near-zero latency.
 *
 * Public access:
 *   vehiclePositionsService.getVehicles(routeId) → IVehicle[]
 *   vehiclePositionsService.start()  — begins the 30-second polling loop
 *   vehiclePositionsService.stop()   — clears the interval
 */

import { transit_realtime } from 'gtfs-realtime-bindings';
import { IVehicle } from '../../common/transit.interface';

const GTFSRT_VEHICLE_URL =
  'https://truetime.portauthority.org/gtfsrt-bus/vehicles';

/** How often we re-fetch the feed (milliseconds). */
const POLL_INTERVAL_MS = 30_000; // 30 seconds

class VehiclePositionsService {
  /**
   * In-memory store: routeId → IVehicle[]
   * Vehicles without a route_id are stored under the key "__no_route__".
   */
  private vehiclesByRoute = new Map<string, IVehicle[]>();

  /** All vehicles in a flat list (useful for diagnostics / future use). */
  private allVehicles: IVehicle[] = [];

  /** Polling interval handle, if active. */
  private intervalId: ReturnType<typeof setInterval> | null = null;

  /** Timestamp of the last successful fetch. */
  private lastFetched: Date | null = null;

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Return vehicles currently active on the given route.
   * Returns an empty array when the route has no active vehicles or the
   * feed hasn't been fetched yet.
   */
  getVehicles(routeId: string): IVehicle[] {
    return this.vehiclesByRoute.get(routeId) ?? [];
  }

  /** Return every vehicle from the latest fetch. */
  getAllVehicles(): IVehicle[] {
    return this.allVehicles;
  }

  /** When the feed was last successfully fetched. */
  getLastFetched(): Date | null {
    return this.lastFetched;
  }

  /**
   * Start the polling loop.  The first fetch is performed immediately so
   * that data is available as soon as the server is ready.
   */
  start(): void {
    if (this.intervalId) {
      console.warn('[VehiclePositions] Polling already running');
      return;
    }

    console.log(
      `[VehiclePositions] Starting polling (every ${POLL_INTERVAL_MS / 1000}s)`
    );

    // Immediate first fetch
    this.fetchAndStore();

    this.intervalId = setInterval(() => {
      this.fetchAndStore();
    }, POLL_INTERVAL_MS);
  }

  /** Stop the polling loop. */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[VehiclePositions] Polling stopped');
    }
  }

  // ── Internal ─────────────────────────────────────────────────────────

  /**
   * Fetch the GTFS-RT binary feed, decode it, and rebuild the in-memory
   * index.  Errors are logged but never thrown — the old data remains
   * available until the next successful fetch.
   */
  private async fetchAndStore(): Promise<void> {
    try {
      const response = await fetch(GTFSRT_VEHICLE_URL, {
        headers: { Accept: 'application/x-protobuf' }
      });

      if (!response.ok) {
        console.error(
          `[VehiclePositions] Feed returned HTTP ${response.status}`
        );
        return;
      }

      const buffer = await response.arrayBuffer();
      const feed = transit_realtime.FeedMessage.decode(
        new Uint8Array(buffer)
      );

      const byRoute = new Map<string, IVehicle[]>();
      const all: IVehicle[] = [];

      for (const entity of feed.entity) {
        const vp = entity.vehicle;
        if (!vp?.position) continue; // skip entities without a position

        const routeId = vp.trip?.routeId ?? '';
        const vehicle: IVehicle = {
          vid: vp.vehicle?.id ?? entity.id,
          lat: vp.position.latitude,
          lon: vp.position.longitude,
          routeId,
          heading: vp.position.bearing ?? 0,
          source: 'live',
          lastUpdate: vp.timestamp
            ? new Date(
                (typeof vp.timestamp === 'number'
                  ? vp.timestamp
                  : vp.timestamp.toNumber()) * 1000
              ).toISOString()
            : new Date().toISOString(),
          isDetoured: false
        };

        all.push(vehicle);

        if (routeId) {
          const list = byRoute.get(routeId);
          if (list) {
            list.push(vehicle);
          } else {
            byRoute.set(routeId, [vehicle]);
          }
        }
      }

      // Atomic swap — readers never see a half-built index
      this.vehiclesByRoute = byRoute;
      this.allVehicles = all;
      this.lastFetched = new Date();

      console.log(
        `[VehiclePositions] Updated: ${all.length} vehicles across ${byRoute.size} routes`
      );
    } catch (err) {
      console.error('[VehiclePositions] Fetch failed:', err);
    }
  }
}

/** Singleton instance */
const vehiclePositionsService = new VehiclePositionsService();
export default vehiclePositionsService;
