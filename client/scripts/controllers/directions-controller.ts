/**
 * Directions Controller (TUC4)
 *
 * Manages walking directions from the user's current location to a selected stop.
 * Handles Google Directions API calls, walking path rendering, rerouting logic,
 * arrival detection, and directions-mode state (R1–R5).
 */

/// <reference types="google.maps" />

import type {
  IMapProvider,
  IMapPolyline,
  ILatLng
} from '../../../common/map.interface';
import type { IStop, IPrediction } from '../../../common/transit.interface';
import { RouteRenderer } from '../renderers/route-renderer';
import { VehicleTracker } from '../trackers/vehicle-tracker';
import { closeMapPopup } from '../utils/map-popup';

/** Result of a Google Directions API call */
export interface IDirectionsResult {
  polyline: ILatLng[];
  durationSeconds: number;
  distanceMeters: number;
}

/** Minimum interval between automatic reroute requests (R3) */
const AUTO_REROUTE_THROTTLE_MS = 45_000;
/** Periodic reroute interval (TUC4 Step 9) */
const PERIODIC_REROUTE_MS = 120_000;
/** Path deviation threshold in meters (A5) */
const DEVIATION_THRESHOLD_M = 50;
/** Arrival threshold in meters (Step 10) */
const ARRIVAL_THRESHOLD_M = 20;
/** Tap debounce for Directions button (R1) */
const TAP_DEBOUNCE_MS = 500;
/** Earth radius in meters for haversine */
const EARTH_RADIUS_M = 6_371_000;

export class DirectionsController {
  private static instance: DirectionsController;
  private mapProvider: IMapProvider | null = null;
  private routeRenderer: RouteRenderer;
  private vehicleTracker: VehicleTracker;

  // Directions mode state
  private _isActive = false;
  private selectedStop: IStop | null = null;
  private _selectedPredictions: IPrediction[] = [];
  private walkingPolyline: IMapPolyline | null = null;
  private walkingPath: ILatLng[] = [];
  private userLocation: ILatLng | null = null;

  // Timing / throttle state
  private lastRerouteTime = 0;
  private periodicRerouteInterval: number | null = null;
  private lastDirectionsTap = 0;

  // In-flight request abort controller (R2)
  private inflightAbort: AbortController | null = null;

  // Callback to show toast
  private toastCallback: ((message: string) => void) | null = null;
  // Callback to update the directions info panel
  private infoPanelCallback:
    | ((
        info: {
          durationMin: number;
          eta: string;
          predictions: IPrediction[];
        } | null
      ) => void)
    | null = null;
  // Callback executed when exiting directions mode
  private exitCallback: (() => void) | null = null;

  private constructor() {
    this.routeRenderer = RouteRenderer.getInstance();
    this.vehicleTracker = VehicleTracker.getInstance();
  }

  static getInstance(): DirectionsController {
    if (!DirectionsController.instance) {
      DirectionsController.instance = new DirectionsController();
    }
    return DirectionsController.instance;
  }

  initialize(mapProvider: IMapProvider): void {
    this.mapProvider = mapProvider;
  }

  /** Register a callback for toast notifications */
  setToastCallback(cb: (message: string) => void): void {
    this.toastCallback = cb;
  }

  /** Register a callback for directions info updates (duration + ETA + selected bus predictions) */
  setInfoPanelCallback(
    cb: (
      info: {
        durationMin: number;
        eta: string;
        predictions: IPrediction[];
      } | null
    ) => void
  ): void {
    this.infoPanelCallback = cb;
  }

  /** Register a callback for when directions mode exits */
  setExitCallback(cb: () => void): void {
    this.exitCallback = cb;
  }

  /** Whether directions mode is currently active */
  get isActive(): boolean {
    return this._isActive;
  }

  /** The stop currently being navigated to, if any */
  get targetStop(): IStop | null {
    return this.selectedStop;
  }

  /** The bus predictions the user selected before starting directions */
  get selectedPredictions(): IPrediction[] {
    return this._selectedPredictions;
  }

  /**
   * Update the user's current position (called from map.ts watchPosition).
   * While in directions mode this triggers deviation & arrival checks.
   */
  updateUserLocation(position: ILatLng): void {
    this.userLocation = position;

    if (!this._isActive || !this.selectedStop) return;

    // Check arrival (Step 10: within 20m of stop)
    const distToStop = this.haversine(position, {
      lat: this.selectedStop.lat,
      lng: this.selectedStop.lon
    });

    if (distToStop <= ARRIVAL_THRESHOLD_M) {
      this.handleArrival();
      return;
    }

    // Check path deviation (A5: >50m from planned route)
    if (this.walkingPath.length > 0) {
      const distToPath = this.distanceToPolyline(position, this.walkingPath);
      if (distToPath > DEVIATION_THRESHOLD_M) {
        this.handleDeviation();
      }
    }
  }

  /**
   * Start directions mode to a selected stop (TUC4 Step 5).
   * Enforces tap debounce (R1).
   */
  async startDirections(
    stop: IStop,
    selectedPredictions: IPrediction[] = []
  ): Promise<void> {
    // R1: Tap debounce
    const now = Date.now();
    if (now - this.lastDirectionsTap < TAP_DEBOUNCE_MS) return;
    this.lastDirectionsTap = now;

    if (!this.mapProvider || !this.userLocation) {
      console.warn('[DirectionsController] No map provider or user location');
      return;
    }

    // Enter directions mode
    this._isActive = true;
    this.selectedStop = stop;
    this._selectedPredictions = selectedPredictions;

    // R5: Hide non-selected stops and route overlays
    this.routeRenderer.clearAllRoutes();
    this.vehicleTracker.stopPolling();
    closeMapPopup();

    // Fetch and render initial route
    await this.fetchAndRenderRoute();

    // Start periodic reroute (Step 9: every 120s)
    this.startPeriodicReroute();
  }

  /**
   * Exit directions mode (A4).
   * Clears walking path, restores stops/routes.
   */
  exitDirections(): void {
    this._isActive = false;
    this.selectedStop = null;
    this._selectedPredictions = [];

    // Cancel in-flight request (R2)
    this.cancelInflightRequest();

    // Stop periodic reroute
    this.stopPeriodicReroute();

    // Remove walking path polyline
    this.removeWalkingPolyline();

    // Clear info panel
    this.infoPanelCallback?.(null);

    // Notify map.ts to restore routes/stops
    this.exitCallback?.();
  }

  // ── Private helpers ──────────────────────────────────────────────────

  /**
   * Fetch directions from Google Directions API and render on map.
   */
  private async fetchAndRenderRoute(): Promise<void> {
    if (!this.mapProvider || !this.userLocation || !this.selectedStop) return;

    // R2: Cancel any in-flight request
    this.cancelInflightRequest();
    this.inflightAbort = new AbortController();

    const origin = this.userLocation;
    const destination: ILatLng = {
      lat: this.selectedStop.lat,
      lng: this.selectedStop.lon
    };

    try {
      const result = await this.fetchDirections(
        origin,
        destination,
        this.inflightAbort.signal
      );

      if (!result) return;

      this.walkingPath = result.polyline;
      this.lastRerouteTime = Date.now();

      // Remove old polyline and render new one
      this.removeWalkingPolyline();
      this.walkingPolyline = this.mapProvider.addPolyline({
        path: result.polyline,
        color: '#4285F4',
        weight: 7,
        opacity: 0.9,
        zIndex: 10
      });

      // Update info panel with duration + ETA
      const durationMin = Math.ceil(result.durationSeconds / 60);
      const eta = new Date(Date.now() + result.durationSeconds * 1000);
      const etaStr = eta.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      });
      this.infoPanelCallback?.({
        durationMin,
        eta: etaStr,
        predictions: this._selectedPredictions
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return; // cancelled
      console.error('[DirectionsController] Failed to fetch directions:', err);
    }
  }

  /**
   * Call Google Directions API (client-side, walking mode).
   * Uses the REST Directions API via fetch.
   */
  private async fetchDirections(
    origin: ILatLng,
    destination: ILatLng,
    signal: AbortSignal
  ): Promise<IDirectionsResult | null> {
    // Use the Google Maps DirectionsService (already loaded with the SDK)
    return new Promise((resolve, reject) => {
      if (
        typeof google === 'undefined' ||
        !google.maps ||
        !google.maps.DirectionsService
      ) {
        console.error('[DirectionsController] Google Maps SDK not loaded');
        resolve(null);
        return;
      }

      // Handle abort
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }

      const service = new google.maps.DirectionsService();

      const onAbort = () => {
        reject(new DOMException('Aborted', 'AbortError'));
      };
      signal.addEventListener('abort', onAbort, { once: true });

      service.route(
        {
          origin: { lat: origin.lat, lng: origin.lng },
          destination: { lat: destination.lat, lng: destination.lng },
          travelMode: google.maps.TravelMode.WALKING
        },
        (result, status) => {
          signal.removeEventListener('abort', onAbort);

          if (signal.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }

          if (
            status === google.maps.DirectionsStatus.OK &&
            result?.routes?.[0]
          ) {
            const route = result.routes[0];
            const leg = route.legs[0];

            // Decode overview polyline path
            const polyline: ILatLng[] = route.overview_path.map(
              (p: google.maps.LatLng) => ({
                lat: p.lat(),
                lng: p.lng()
              })
            );

            resolve({
              polyline,
              durationSeconds: leg.duration?.value ?? 0,
              distanceMeters: leg.distance?.value ?? 0
            });
          } else {
            console.warn(
              '[DirectionsController] Directions request failed:',
              status
            );
            resolve(null);
          }
        }
      );
    });
  }

  /** Handle path deviation (A5) with throttle (R3) */
  private handleDeviation(): void {
    const now = Date.now();
    const elapsed = now - this.lastRerouteTime;

    if (elapsed >= AUTO_REROUTE_THROTTLE_MS) {
      console.log('[DirectionsController] Path deviation detected – rerouting');
      this.fetchAndRenderRoute();
    } else {
      // Delay reroute until throttle period expires
      const delay = AUTO_REROUTE_THROTTLE_MS - elapsed;
      console.log(
        `[DirectionsController] Deviation reroute deferred by ${delay}ms (R3)`
      );
      setTimeout(() => {
        if (this._isActive) this.fetchAndRenderRoute();
      }, delay);
    }
  }

  /** Handle arrival at stop (Step 10) */
  private handleArrival(): void {
    console.log('[DirectionsController] Arrived at stop!');
    this.toastCallback?.('Arrived!');
    this.exitDirections();
  }

  /** Start periodic reroute interval (Step 9) */
  private startPeriodicReroute(): void {
    this.stopPeriodicReroute();
    this.periodicRerouteInterval = window.setInterval(() => {
      if (!this._isActive) return;

      const elapsed = Date.now() - this.lastRerouteTime;
      if (elapsed >= AUTO_REROUTE_THROTTLE_MS) {
        console.log('[DirectionsController] Periodic reroute (120s)');
        this.fetchAndRenderRoute();
      } else {
        // Defer per R3
        const delay = AUTO_REROUTE_THROTTLE_MS - elapsed;
        setTimeout(() => {
          if (this._isActive) this.fetchAndRenderRoute();
        }, delay);
      }
    }, PERIODIC_REROUTE_MS);
  }

  /** Stop periodic reroute interval */
  private stopPeriodicReroute(): void {
    if (this.periodicRerouteInterval !== null) {
      clearInterval(this.periodicRerouteInterval);
      this.periodicRerouteInterval = null;
    }
  }

  /** Cancel any in-flight directions request (R2) */
  private cancelInflightRequest(): void {
    if (this.inflightAbort) {
      this.inflightAbort.abort();
      this.inflightAbort = null;
    }
  }

  /** Remove walking polyline from map */
  private removeWalkingPolyline(): void {
    if (this.walkingPolyline) {
      this.walkingPolyline.remove();
      this.walkingPolyline = null;
    }
    this.walkingPath = [];
  }

  // ── Geo utilities ────────────────────────────────────────────────────

  /** Haversine distance between two points in meters */
  private haversine(a: ILatLng, b: ILatLng): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const h =
      sinDLat * sinDLat +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
  }

  /** Minimum distance from a point to a polyline (in meters) */
  private distanceToPolyline(point: ILatLng, path: ILatLng[]): number {
    let minDist = Infinity;
    for (let i = 0; i < path.length - 1; i++) {
      const dist = this.distanceToSegment(point, path[i], path[i + 1]);
      if (dist < minDist) minDist = dist;
    }
    return minDist;
  }

  /** Distance from a point to a line segment (in meters, approximate) */
  private distanceToSegment(p: ILatLng, a: ILatLng, b: ILatLng): number {
    const dx = b.lng - a.lng;
    const dy = b.lat - a.lat;
    if (dx === 0 && dy === 0) return this.haversine(p, a);

    let t = ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));

    const closest: ILatLng = {
      lat: a.lat + t * dy,
      lng: a.lng + t * dx
    };
    return this.haversine(p, closest);
  }
}
