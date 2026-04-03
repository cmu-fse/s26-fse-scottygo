/**
 * GTFS-RT Service Alerts Service
 *
 * Fetches the PRT GTFS-RT alerts protobuf feed and stores decoded alerts
 * in memory. Alerts are refreshed periodically (every 5 minutes).
 *
 * Public access:
 *   alertsService.getAlerts()  → IServiceAlert[]
 *   alertsService.start()      — begins the polling loop
 *   alertsService.stop()       — clears the interval
 */

import { transit_realtime } from 'gtfs-realtime-bindings';
import { IServiceAlert } from '../../common/transit.interface';

const GTFSRT_ALERTS_URL =
  'https://truetime.portauthority.org/gtfsrt-bus/alerts';

/** How often we re-fetch the alert feed (milliseconds). */
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function tag(): string {
  return `[AlertsService ${new Date().toISOString()}]`;
}

class AlertsService {
  private alerts: IServiceAlert[] = [];

  private intervalId: ReturnType<typeof setInterval> | null = null;

  private fetchInProgress = false;

  private lastError: string | null = null;

  private healthy = false;

  // ── Public API ───────────────────────────────────────────────────────

  getAlerts(): IServiceAlert[] {
    return this.alerts;
  }

  isHealthy(): boolean {
    return this.healthy;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  /**
   * Returns the previous alerts so the caller can diff for changes.
   */
  private previousAlerts: IServiceAlert[] = [];

  start(): void {
    if (this.intervalId) return;
    console.log(
      `${tag()} Starting alert feed polling (every ${POLL_INTERVAL_MS / 1000}s)`
    );

    // Initial fetch
    this.fetchAlerts().catch(() => {});

    this.intervalId = setInterval(() => {
      if (!this.fetchInProgress) {
        this.fetchAlerts().catch(() => {});
      }
    }, POLL_INTERVAL_MS);

    this.intervalId.unref?.();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log(`${tag()} Stopped alert feed polling`);
    }
  }

  /**
   * Callback invoked when alerts change. Set by the app to push via Socket.io.
   */
  onAlertsChanged: ((alerts: IServiceAlert[]) => void) | null = null;

  // ── Private ──────────────────────────────────────────────────────────

  private async fetchAlerts(): Promise<void> {
    this.fetchInProgress = true;
    try {
      const response = await fetch(GTFSRT_ALERTS_URL);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      const feed = transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

      const newAlerts: IServiceAlert[] = [];

      for (const entity of feed.entity) {
        if (!entity.alert) continue;

        const alert = entity.alert;

        const headerText = alert.headerText?.translation?.[0]?.text ?? '';
        const descriptionText =
          alert.descriptionText?.translation?.[0]?.text ?? '';

        const routeIds: string[] = [];
        if (alert.informedEntity) {
          for (const ie of alert.informedEntity) {
            if (ie.routeId) {
              routeIds.push(ie.routeId);
            }
          }
        }

        const activePeriods: { start: string; end: string }[] = [];
        if (alert.activePeriod) {
          for (const ap of alert.activePeriod) {
            activePeriods.push({
              start: ap.start
                ? new Date(Number(ap.start) * 1000).toISOString()
                : '',
              end: ap.end ? new Date(Number(ap.end) * 1000).toISOString() : ''
            });
          }
        }

        newAlerts.push({
          id: entity.id,
          headerText,
          descriptionText,
          routeIds,
          activePeriods
        });
      }

      // Check if alerts changed
      const changed =
        JSON.stringify(newAlerts) !== JSON.stringify(this.previousAlerts);

      this.previousAlerts = this.alerts;
      this.alerts = newAlerts;
      this.healthy = true;
      this.lastError = null;

      if (changed && this.onAlertsChanged) {
        this.onAlertsChanged(newAlerts);
      }

      console.log(`${tag()} Fetched ${newAlerts.length} service alerts`);
    } catch (err) {
      this.healthy = false;
      this.lastError =
        err instanceof Error ? err.message : 'Unknown error fetching alerts';
      console.error(`${tag()} Failed to fetch alerts:`, this.lastError);
    } finally {
      this.fetchInProgress = false;
    }
  }
}

const alertsService = new AlertsService();
export default alertsService;
