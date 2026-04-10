/**
 * TripShot liveStatus Service
 *
 * Polls the TripShot /v1/p/liveStatus endpoint every 30 seconds and stores
 * the decoded data in memory so that API responses have near-zero latency.
 *
 * Public access:
 *   tripshotLiveStatusService.getVehiclesByTsRouteId(tsRouteId) → IVehicle[]
 *   tripshotLiveStatusService.getPredictions(stopId)            → IPrediction[]
 *   tripshotLiveStatusService.start()  — begins the 30-second polling loop
 *   tripshotLiveStatusService.stop()   — clears the interval
 *
 * Only rides whose state contains an "Active" key are considered.  Vehicles
 * are keyed by TripShot route UUID (matches CMURouteMetadata.routeId); callers
 * are responsible for translating "CMU-n" route IDs to TripShot UUIDs before
 * querying this service.
 */

import { IVehicle, IPrediction, IStop } from '../../common/transit.interface';
import {
  TRIPSHOT_LIVE_STATUS_URL,
  TsLiveStatus,
  TsLiveVehicleStatus,
  TsLiveRide,
  TsStopState,
  isTsViaStop
} from './tripshot-api';

/** How often we re-fetch the feed (milliseconds). */
const POLL_INTERVAL_MS = 30_000; // 30 seconds

/** AbortSignal timeout for each fetch. */
const FETCH_TIMEOUT_MS = 10_000;

function tag(): string {
  return `[TripShotLiveStatus ${new Date().toISOString()}]`;
}

/** Normalize TripShot UUIDs so map keys are case-insensitive. */
function normalizeTsRouteId(routeId: string): string {
  return routeId.trim().toLowerCase();
}

class TripShotLiveStatusService {
  /**
   * In-memory store: TripShot routeId UUID → IVehicle[]
   * Only active rides with live GPS data are included.
   */
  private vehiclesByTsRouteId = new Map<string, IVehicle[]>();

  /**
   * In-memory store: TripShot stopId UUID → IPrediction[]
   * Populated from the "Awaiting" entries in each active ride's stopStatus.
   */
  private predictionsByStopId = new Map<string, IPrediction[]>();

  /**
   * In-memory store: TripShot routeId UUID → IStop[]
   * Ordered stop list extracted from the vias of each active ride.
   * Only ViaStop entries are included (waypoints are skipped).
   */
  private stopsByTsRouteId = new Map<string, IStop[]>();

  /** Polling interval handle, if active. */
  private intervalId: ReturnType<typeof setInterval> | null = null;

  /** True while a feed fetch/decode cycle is in progress. */
  private fetchInProgress = false;

  /** Timestamp of the last successful fetch. */
  private lastFetched: Date | null = null;

  /** Number of consecutive fetch failures (resets on success). */
  private consecutiveFailures = 0;

  /** Last error message, if the most recent fetch failed. */
  private lastError: string | null = null;

  /**
   * Optional callback invoked once after the first successful feed fetch.
   * Set by the composition root (app.ts) to trigger pattern cache warm-up
   * without creating a circular import between this service and tripshot.service.
   */
  onFirstSuccess: (() => void) | null = null;

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Return vehicles for a TripShot route UUID.
   * Returns an empty array when no active vehicles are found or the feed
   * has not been fetched yet.
   */
  getVehiclesByTsRouteId(tsRouteId: string): IVehicle[] {
    return this.vehiclesByTsRouteId.get(normalizeTsRouteId(tsRouteId)) ?? [];
  }

  /**
   * Return ETA predictions for a TripShot stop UUID.
   * Returns an empty array when no awaiting vehicles are found.
   */
  getPredictions(stopId: string): IPrediction[] {
    return this.predictionsByStopId.get(stopId) ?? [];
  }

  /**
   * Return the ordered stop list for a TripShot route UUID.
   * @param tsRouteId - TripShot route UUID (CMURouteMetadata.routeId)
   * @param cmuRouteId - Our "CMU-n" route ID written into each IStop.routes[]
   */
  getStopsByTsRouteId(tsRouteId: string, cmuRouteId: string): IStop[] {
    return (this.stopsByTsRouteId.get(normalizeTsRouteId(tsRouteId)) ?? []).map(
      (s) => ({
        ...s,
        routes: [cmuRouteId]
      })
    );
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
   * Start the polling loop. The first fetch runs immediately so data is
   * available as soon as the server is ready.
   */
  start(): void {
    if (this.intervalId) {
      console.warn(`${tag()} Polling already running`);
      return;
    }
    console.log(
      `${tag()} Starting polling (every ${POLL_INTERVAL_MS / 1000}s)`
    );
    this.pollTick();
    this.intervalId = setInterval(() => this.pollTick(), POLL_INTERVAL_MS);
    this.intervalId.unref?.();
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

  private pollTick(): void {
    if (this.fetchInProgress) {
      console.warn(`${tag()} Skipping poll: previous fetch still in progress`);
      return;
    }
    this.fetchAndStore();
  }

  private async fetchAndStore(): Promise<void> {
    this.fetchInProgress = true;
    try {
      const res = await fetch(TRIPSHOT_LIVE_STATUS_URL, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data: TsLiveStatus = await res.json();

      const { newVehicles, newPredictions, newStops } = this.buildIndex(data);

      // Atomic swap — readers never see a half-built index
      this.vehiclesByTsRouteId = newVehicles;
      this.predictionsByStopId = newPredictions;
      this.stopsByTsRouteId = newStops;
      const isFirstSuccess = this.lastFetched === null;
      this.lastFetched = new Date();
      this.consecutiveFailures = 0;
      this.lastError = null;

      // Trigger a one-time background pattern warm-up after the first successful
      // poll so CMU route polylines are cached before any user selects them.
      if (isFirstSuccess && this.onFirstSuccess) {
        try {
          this.onFirstSuccess();
        } catch (err) {
          console.error(`${tag()} onFirstSuccess callback failed:`, err);
        }
      }

      const totalVehicles = [...newVehicles.values()].reduce(
        (sum, list) => sum + list.length,
        0
      );
      console.log(
        `${tag()} Updated: ${totalVehicles} active vehicles across ` +
          `${newVehicles.size} routes, ` +
          `${newPredictions.size} stops with predictions`
      );
    } catch (err) {
      this.consecutiveFailures++;
      this.lastError = err instanceof Error ? err.message : String(err);
      console.error(
        `${tag()} Fetch failed (failures: ${this.consecutiveFailures}):`,
        err
      );
    } finally {
      this.fetchInProgress = false;
    }
  }

  /**
   * Build fresh in-memory indexes from a raw liveStatus payload.
   * Only active rides are considered for vehicles and predictions.
   * Stops are extracted from ALL rides (active or not) so that routes
   * that have a scheduled ride today but aren't yet/currently active
   * still expose their stop list.
   */
  private buildIndex(data: TsLiveStatus): {
    newVehicles: Map<string, IVehicle[]>;
    newPredictions: Map<string, IPrediction[]>;
    newStops: Map<string, IStop[]>;
  } {
    const vsMap = new Map<string, TsLiveVehicleStatus>(
      data.vehicleStatuses.map((vs) => [vs.vehicleId, vs])
    );

    const newVehicles = new Map<string, IVehicle[]>();
    const newPredictions = new Map<string, IPrediction[]>();
    const newStops = new Map<string, IStop[]>();

    for (const ride of data.rides) {
      // ── Stops — extracted from every ride, not just active ones ─────
      // Only record the first ride's stops per route to avoid duplicates
      // (all rides for a route share the same stop sequence).
      const normalizedRouteId = normalizeTsRouteId(ride.routeId);

      if (!newStops.has(normalizedRouteId)) {
        const stops: IStop[] = [];
        for (const via of ride.vias) {
          if (!isTsViaStop(via)) continue;
          const s = via.ViaStop.stop;
          stops.push({
            stopId: s.stopId,
            stopName: s.name,
            lat: s.location.lt,
            lon: s.location.lg,
            routes: [], // caller fills in CMU-n route ID
            dtradd: [],
            dtrrem: []
          });
        }
        if (stops.length > 0) {
          newStops.set(normalizedRouteId, stops);
        }
      }

      if (!this.isActive(ride)) continue;

      const vs = ride.vehicleId ? vsMap.get(ride.vehicleId) : null;
      if (!vs || !vs.liveDataAvailable) continue;

      // ── Vehicle record ───────────────────────────────────────────────
      const displayVid = (vs.name || '').trim() || vs.vehicleId;

      const vehicle: IVehicle = {
        vid: displayVid,
        lat: vs.location.lt,
        lon: vs.location.lg,
        routeId: normalizedRouteId, // TripShot UUID; callers rewrite to CMU-n
        heading: vs.bearing ?? 0,
        speed: vs.speed,
        source: 'live',
        lastUpdate: vs.when,
        isDetoured: false
      };

      const vehicleList = newVehicles.get(normalizedRouteId) ?? [];
      vehicleList.push(vehicle);
      newVehicles.set(normalizedRouteId, vehicleList);

      // ── Stop predictions from Awaiting entries ───────────────────────
      for (const ss of ride.stopStatus) {
        if (!('Awaiting' in ss)) continue;
        this.addPrediction(newPredictions, ss, ride, displayVid);
      }
    }

    return { newVehicles, newPredictions, newStops };
  }

  /** True only for rides whose state object contains the "Active" key. */
  private isActive(ride: TsLiveRide): boolean {
    return 'Active' in ride.state;
  }

  /** Push one IPrediction derived from an Awaiting stop status into the map. */
  private addPrediction(
    map: Map<string, IPrediction[]>,
    ss: TsStopState & { Awaiting: unknown },
    ride: TsLiveRide,
    vehicleId: string
  ): void {
    const awaiting = (ss as Extract<TsStopState, { Awaiting: unknown }>)
      .Awaiting;
    const eta = new Date(awaiting.expectedArrivalTime).getTime();
    const minutesFromNow = Math.max(0, Math.round((eta - Date.now()) / 60_000));

    const prediction: IPrediction = {
      stopId: awaiting.stopId,
      routeId: ride.routeId,
      vid: vehicleId,
      predictedArrivalTime: eta,
      isDelayed: false, // TripShot does not expose a delay flag
      minutes: minutesFromNow
    };

    const list = map.get(awaiting.stopId) ?? [];
    list.push(prediction);
    map.set(awaiting.stopId, list);
  }
}

/** Singleton instance */
const tripshotLiveStatusService = new TripShotLiveStatusService();
export default tripshotLiveStatusService;
