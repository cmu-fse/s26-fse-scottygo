/**
 * GTFS-RT Trip Updates Service
 *
 * Fetches the PRT GTFS-RT trip updates protobuf feed every 30 seconds
 * and stores decoded arrival predictions **in memory** indexed by stopId
 * so that prediction lookups have near-zero latency.
 *
 * This replaces the per-request TrueTime `getpredictions` API call and
 * removes all remaining TrueTime per-request overhead.
 *
 * Public access:
 *   tripUpdatesService.getPredictions(stopId)  → IPrediction[]
 *   tripUpdatesService.start()  — begins the 30-second polling loop
 *   tripUpdatesService.stop()   — clears the interval
 */

import { transit_realtime } from 'gtfs-realtime-bindings';
import { IPrediction } from '../../common/transit.interface';

const GTFSRT_TRIPS_URL =
  'https://truetime.portauthority.org/gtfsrt-bus/trips';

/** How often we re-fetch the feed (milliseconds). */
const POLL_INTERVAL_MS = 30_000; // 30 seconds

class TripUpdatesService {
  /**
   * In-memory store: stopId → IPrediction[]
   * Sorted by arrival time (soonest first).
   */
  private predictionsByStop = new Map<string, IPrediction[]>();

  /** Polling interval handle, if active. */
  private intervalId: ReturnType<typeof setInterval> | null = null;

  /** Timestamp of the last successful fetch. */
  private lastFetched: Date | null = null;

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Return upcoming predictions for the given stop.
   * Returns an empty array when no predictions exist or the feed
   * hasn't been fetched yet.
   */
  getPredictions(stopId: string): IPrediction[] {
    return this.predictionsByStop.get(stopId) ?? [];
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
      console.warn('[TripUpdates] Polling already running');
      return;
    }

    console.log(
      `[TripUpdates] Starting polling (every ${POLL_INTERVAL_MS / 1000}s)`
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
      console.log('[TripUpdates] Polling stopped');
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
      const response = await fetch(GTFSRT_TRIPS_URL, {
        headers: { Accept: 'application/x-protobuf' }
      });

      if (!response.ok) {
        console.error(
          `[TripUpdates] Feed returned HTTP ${response.status}`
        );
        return;
      }

      const buffer = await response.arrayBuffer();
      const feed = transit_realtime.FeedMessage.decode(
        new Uint8Array(buffer)
      );

      const nowSec = Math.floor(Date.now() / 1000);
      const byStop = new Map<string, IPrediction[]>();
      let totalPredictions = 0;

      for (const entity of feed.entity) {
        const tu = entity.tripUpdate;
        if (!tu?.trip) continue;

        const routeId = tu.trip.routeId ?? '';
        const vid = tu.vehicle?.id ?? '';

        if (!tu.stopTimeUpdate) continue;

        for (const stu of tu.stopTimeUpdate) {
          const stopId = stu.stopId;
          if (!stopId) continue;

          // Use arrival time if available, fall back to departure
          const arrivalTimeSec =
            (stu.arrival?.time != null
              ? typeof stu.arrival.time === 'number'
                ? stu.arrival.time
                : stu.arrival.time.toNumber()
              : null) ??
            (stu.departure?.time != null
              ? typeof stu.departure.time === 'number'
                ? stu.departure.time
                : stu.departure.time.toNumber()
              : null);

          if (!arrivalTimeSec || arrivalTimeSec < nowSec) continue; // skip past stops

          const minutes = Math.round((arrivalTimeSec - nowSec) / 60);

          const prediction: IPrediction = {
            stopId,
            routeId,
            vid: vid || undefined,
            predictedArrivalTime: arrivalTimeSec * 1000, // store as ms
            isDelayed: false, // GTFS-RT doesn't have a simple boolean
            minutes
          };

          totalPredictions++;
          const list = byStop.get(stopId);
          if (list) {
            list.push(prediction);
          } else {
            byStop.set(stopId, [prediction]);
          }
        }
      }

      // Sort each stop's predictions by arrival time (soonest first)
      for (const predictions of byStop.values()) {
        predictions.sort(
          (a, b) => a.predictedArrivalTime - b.predictedArrivalTime
        );
      }

      // Atomic swap
      this.predictionsByStop = byStop;
      this.lastFetched = new Date();

      console.log(
        `[TripUpdates] Updated: ${totalPredictions} predictions across ${byStop.size} stops`
      );
    } catch (err) {
      console.error('[TripUpdates] Fetch failed:', err);
    }
  }
}

/** Singleton instance */
const tripUpdatesService = new TripUpdatesService();
export default tripUpdatesService;
