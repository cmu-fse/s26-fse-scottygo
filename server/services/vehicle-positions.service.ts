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

/** Return a formatted log prefix with ISO timestamp. */
function tag(): string {
  return `[VehiclePositions ${new Date().toISOString()}]`;
}

/** Log current process memory usage in MB. */
function logMemoryUsage(): void {
  const mem = process.memoryUsage();
  console.log(
    `${tag()} Memory — rss: ${(mem.rss / 1048576).toFixed(1)}MB, ` +
      `heapUsed: ${(mem.heapUsed / 1048576).toFixed(1)}MB, ` +
      `heapTotal: ${(mem.heapTotal / 1048576).toFixed(1)}MB, ` +
      `external: ${(mem.external / 1048576).toFixed(1)}MB`
  );
}

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

  /** True while a feed fetch/decode cycle is in progress. */
  private fetchInProgress = false;

  /** Whether an extra poll should run immediately after the current one finishes. */
  private pendingPollTick = false;

  /** Timestamp of the last successful fetch. */
  private lastFetched: Date | null = null;

  /** Number of consecutive fetch failures (resets on success). */
  private consecutiveFailures = 0;

  /** Last error message, if the most recent fetch failed. */
  private lastError: string | null = null;

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

  /** True when the last fetch succeeded (or we haven't fetched yet). */
  isHealthy(): boolean {
    return this.consecutiveFailures === 0;
  }

  /** Number of consecutive failed fetches. */
  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  /** Last error message (null if last fetch succeeded). */
  getLastError(): string | null {
    return this.lastError;
  }

  /**
   * Start the polling loop.  The first fetch is performed immediately so
   * that data is available as soon as the server is ready.
   */
  start(): void {
    if (this.intervalId) {
      console.warn(`${tag()} Polling already running`);
      return;
    }

    console.log(
      `${tag()} Starting polling (every ${POLL_INTERVAL_MS / 1000}s)`
    );

    // Immediate first fetch
    this.pollTick();

    this.intervalId = setInterval(() => {
      this.pollTick();
    }, POLL_INTERVAL_MS);
  }

  /** Stop the polling loop. */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log(`${tag()} Polling stopped`);
    }
  }

  // ── Internal ─────────────────────────────────────────────────────────

  /** Run one poll cycle, skipping if a previous cycle is still in progress. */
  private pollTick(): void {
    if (this.fetchInProgress) {
      this.pendingPollTick = true;
      console.warn(
        `${tag()} Skipping poll tick: previous fetch still in progress`
      );
      return;
    }

    this.fetchAndStore();
  }

  /**
   * Fetch the GTFS-RT binary feed, decode it, and rebuild the in-memory
   * index.  Errors are logged but never thrown — the old data remains
   * available until the next successful fetch.
   */
  private async fetchAndStore(): Promise<void> {
    this.fetchInProgress = true;
    try {
      const buffer = await this.fetchFeed();
      if (!buffer) return; // HTTP error already logged

      const feed = transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

      const all: IVehicle[] = [];
      for (const entity of feed.entity) {
        const vehicle = this.decodeVehicleEntity(entity);
        if (vehicle) all.push(vehicle);
      }

      // Atomic swap — readers never see a half-built index
      this.vehiclesByRoute = this.buildRouteIndex(all);
      this.allVehicles = all;
      this.lastFetched = new Date();
      this.consecutiveFailures = 0;
      this.lastError = null;

      console.log(
        `${tag()} Updated: ${all.length} vehicles across ${this.vehiclesByRoute.size} routes`
      );
      logMemoryUsage();
    } catch (err) {
      this.consecutiveFailures++;
      this.lastError = err instanceof Error ? err.message : String(err);
      console.error(
        `${tag()} Fetch failed (failures: ${this.consecutiveFailures}):`,
        err
      );
    } finally {
      this.fetchInProgress = false;
      if (this.pendingPollTick) {
        this.pendingPollTick = false;
        this.fetchAndStore();
      }
    }
  }

  /**
   * Fetch the GTFS-RT protobuf feed. Returns the raw ArrayBuffer on success,
   * or null if the HTTP request failed (error state is recorded internally).
   */
  private async fetchFeed(): Promise<ArrayBuffer | null> {
    const response = await fetch(GTFSRT_VEHICLE_URL, {
      headers: { Accept: 'application/x-protobuf' }
    });

    if (!response.ok) {
      this.consecutiveFailures++;
      this.lastError = `HTTP ${response.status}`;
      console.error(
        `${tag()} Feed returned HTTP ${response.status} (failures: ${this.consecutiveFailures})`
      );
      return null;
    }

    return response.arrayBuffer();
  }

  /**
   * Decode a single GTFS-RT FeedEntity into an IVehicle, or return null
   * if the entity lacks a vehicle position.
   */
  private decodeVehicleEntity(
    entity: transit_realtime.IFeedEntity
  ): IVehicle | null {
    const vp = entity.vehicle;
    if (!vp?.position) return null;

    const routeId = vp.trip?.routeId ?? '';

    // Map GTFS-RT VehicleStopStatus enum to string
    let currentStatus: IVehicle['currentStatus'];
    if (
      vp.currentStatus ===
      transit_realtime.VehiclePosition.VehicleStopStatus.INCOMING_AT
    ) {
      currentStatus = 'INCOMING_AT';
    } else if (
      vp.currentStatus ===
      transit_realtime.VehiclePosition.VehicleStopStatus.STOPPED_AT
    ) {
      currentStatus = 'STOPPED_AT';
    } else if (
      vp.currentStatus ===
      transit_realtime.VehiclePosition.VehicleStopStatus.IN_TRANSIT_TO
    ) {
      currentStatus = 'IN_TRANSIT_TO';
    }

    return {
      vid: vp.vehicle?.id ?? entity.id,
      lat: vp.position.latitude,
      lon: vp.position.longitude,
      routeId,
      heading: vp.position.bearing ?? 0,
      speed: vp.position.speed != null ? vp.position.speed : undefined,
      source: 'live',
      lastUpdate: vp.timestamp
        ? new Date(
            (typeof vp.timestamp === 'number'
              ? vp.timestamp
              : vp.timestamp.toNumber()) * 1000
          ).toISOString()
        : new Date().toISOString(),
      isDetoured: false,
      tripId: vp.trip?.tripId || undefined,
      currentStatus,
      currentStopSequence: vp.currentStopSequence ?? undefined,
      currentStopId: vp.stopId || undefined
    };
  }

  /**
   * Group a flat list of vehicles into a Map keyed by routeId.
   * Vehicles without a routeId are excluded from the index.
   */
  private buildRouteIndex(vehicles: IVehicle[]): Map<string, IVehicle[]> {
    const byRoute = new Map<string, IVehicle[]>();
    for (const vehicle of vehicles) {
      if (!vehicle.routeId) continue;
      const list = byRoute.get(vehicle.routeId);
      if (list) {
        list.push(vehicle);
      } else {
        byRoute.set(vehicle.routeId, [vehicle]);
      }
    }
    return byRoute;
  }
}

/** Singleton instance */
const vehiclePositionsService = new VehiclePositionsService();
export default vehiclePositionsService;
