/**
 * Filter Controller
 * Coordinates filter application and manages API calls
 * Implements the progressive filtering strategy
 */

import axios, { AxiosResponse } from 'axios';
import type {
  IRoute,
  IStop,
  IPattern,
  IBulkTransitData,
  IDetour,
  IPrediction,
  INearbyStop,
  INearbyStopsPayload
} from '../../../common/transit.interface';
import type { ILatLng } from '../../../common/map.interface';
import { MapStateManager } from '../state/map-state';
import { RouteRenderer, type RouteData } from '../renderers/route-renderer';
import { MAP_POPUP_ID, closeMapPopup } from '../utils/map-popup';
import { VehicleTracker } from '../trackers/vehicle-tracker';
import { DirectionsController } from './directions-controller';
import { URLSyncManager } from '../state/url-sync';
import type { IRouteOption } from '../components/route-selector';
import {
  buildRouteOptions,
  buildServiceBannerMarkup,
  estimateWalkMinutes,
  formatRouteName
} from './filter-controller.helpers';

// Augment the global Window interface with the showModal utility
declare global {
  interface Window {
    showModal?: (title: string, message: string) => void;
  }
}

export class FilterController {
  private static instance: FilterController;
  private stateManager: MapStateManager;
  private routeRenderer: RouteRenderer;
  private vehicleTracker: VehicleTracker;
  private urlSync: URLSyncManager;
  private token: string | null = null;
  private routeSelectorUpdateCallback:
    | ((routes: IRouteOption[]) => void)
    | null = null;
  private routeColorCache = new Map<string, string>(); // Persists TrueTime colors across filter changes
  /** Client-side pattern store populated from /transit/bulk */
  private patternCache = new Map<string, IPattern[]>();
  /** Client-side stop store populated from /transit/bulk, keyed "routeId:DIRECTION" */
  private stopCache = new Map<string, IStop[]>();
  /** Whether bulk data has been loaded */
  private bulkLoaded = false;

  /** Return the stop cache (routeId:DIRECTION → stops) for the search component. */
  getStopsData(): Record<string, IStop[]> {
    const result: Record<string, IStop[]> = {};
    for (const [key, stops] of this.stopCache.entries()) {
      result[key] = stops;
    }
    return result;
  }
  /** Interval handle for health polling */
  private healthPollInterval: number | null = null;
  /** Tracks whether colors were available on the last health check (for detecting recovery). */
  private colorsWereAvailable = false;
  /** Directions controller reference */
  private directionsController: DirectionsController;
  /** Currently minimised stop (for A3 restore) */
  private minimisedStop: IStop | null = null;
  /** Cached predictions for minimised stop */
  private minimisedPredictions: IPrediction[] = [];
  /** Member's current location for TUC4 walk-time estimates */
  private userLocation: ILatLng | null = null;
  /** Whether nearby stops are currently rendered on the map */
  private nearbyStopsActive = false;
  /** Route IDs that have nearby stops (used to restore hidden routes) */
  private nearbyRouteIds = new Set<string>();
  /** Stop ID of the currently open prediction popup (for live refresh) */
  private openPopupStopId: string | null = null;
  /** Interval handle for prediction auto-refresh (30 s) */
  private predictionPollInterval: number | null = null;
  /** Interval handle for 1-second countdown ticker */
  private predictionTickerInterval: number | null = null;

  /** Walk-time heuristic: 1 km ≈ 15 min (TUC4 R4) */
  private static readonly WALK_MINUTES_PER_KM = 15;

  private constructor() {
    this.stateManager = MapStateManager.getInstance();
    this.routeRenderer = RouteRenderer.getInstance();
    this.vehicleTracker = VehicleTracker.getInstance();
    this.directionsController = DirectionsController.getInstance();
    this.urlSync = URLSyncManager.getInstance();
    this.token = localStorage.getItem('token');
  }

  static getInstance(): FilterController {
    if (!FilterController.instance) {
      FilterController.instance = new FilterController();
    }
    return FilterController.instance;
  }

  /**
   * Register callback to update route selector when available routes change
   */
  setRouteSelectorCallback(callback: (routes: IRouteOption[]) => void): void {
    this.routeSelectorUpdateCallback = callback;
  }

  /**
   * Update the Member's current location (called from map.ts watchPosition).
   * Used for walk-time heuristic in stop popups (TUC4 R4).
   */
  setUserLocation(position: ILatLng): void {
    this.userLocation = position;
  }

  /**
   * Initialize - load all transit data from the bulk endpoint in one call
   */
  async initialize(): Promise<void> {
    try {
      console.log('Fetching bulk transit data from backend...');
      const routes = await this.fetchBulkData();
      routes.forEach((r) => this.routeColorCache.set(r.id, r.color));
      this.stateManager.setAvailableRoutes(routes);

      // Update route selector with available routes
      if (this.routeSelectorUpdateCallback) {
        const routeOptions = buildRouteOptions(routes);
        this.routeSelectorUpdateCallback(routeOptions);
      }

      // Render initial routes based on default filters (Rule R2: PRT ON, CMU OFF)
      await this.renderFilteredRoutes();

      // Start polling service health status every 60 seconds
      this.startHealthPolling();

      console.log(
        'Filter controller initialized with',
        routes.length,
        'routes (bulk)'
      );
    } catch (error) {
      console.error('Failed to initialize filter controller:', error);
      throw error;
    }
  }

  /**
   * Fetch all available routes from backend
   */
  private async fetchAllRoutes(): Promise<IRoute[]> {
    try {
      const response: AxiosResponse = await axios.get('/transit/routes', {
        headers: { Authorization: `Bearer ${this.token}` },
        validateStatus: () => true
      });

      if (response.status === 200 && response.data.name === 'RoutesRetrieved') {
        // Check if we're using fallback data (A2: PRT API is down)
        if (response.data.metadata?.usingFallback) {
          console.warn(
            'Using fallback route data - real-time tracking unavailable'
          );
          const showModal = window.showModal;
          if (showModal && typeof showModal === 'function') {
            showModal(
              'Real-time Tracking Unavailable',
              'Real-time tracking is currently unavailable. Showing scheduled times only.'
            );
          }
        }
        return response.data.payload || [];
      } else {
        console.error('Failed to fetch routes:', response.data);
        return [];
      }
    } catch (error) {
      console.error('Error fetching routes:', error);
      // A1: No Network Access
      const showModal = window.showModal;
      if (showModal && typeof showModal === 'function') {
        showModal(
          'Connection Lost',
          'Unable to connect to the server. Please check your internet connection.'
        );
      }
      return [];
    }
  }

  /**
   * Fetch all transit data (routes, patterns, stops) in a single call.
   * Populates local patternCache and stopCache so subsequent render
   * operations never need additional network requests for static data.
   */
  private async fetchBulkData(): Promise<IRoute[]> {
    try {
      const response: AxiosResponse = await axios.get('/transit/bulk', {
        headers: { Authorization: `Bearer ${this.token}` },
        validateStatus: () => true
      });

      if (
        response.status === 200 &&
        response.data.name === 'BulkDataRetrieved'
      ) {
        const bulk: IBulkTransitData = response.data.payload;

        // Populate local caches
        this.patternCache.clear();
        this.stopCache.clear();

        for (const [routeId, patterns] of Object.entries(bulk.patterns)) {
          this.patternCache.set(routeId, patterns);
        }
        for (const [key, stops] of Object.entries(bulk.stops)) {
          this.stopCache.set(key, stops);
        }

        this.bulkLoaded = true;
        console.log(
          `Bulk data loaded: ${bulk.routes.length} routes, ` +
            `${this.patternCache.size} pattern sets, ` +
            `${this.stopCache.size} stop sets`
        );

        return bulk.routes;
      } else {
        console.warn('Bulk endpoint failed, falling back to /transit/routes');
        return this.fetchAllRoutes();
      }
    } catch (error) {
      console.error('Error fetching bulk data:', error);
      const showModal = window.showModal;
      if (showModal && typeof showModal === 'function') {
        showModal(
          'Connection Lost',
          'Unable to connect to the server. Please check your internet connection.'
        );
      }
      return [];
    }
  }

  /**
   * Apply system filter (PRT/CMU toggle)
   */
  async applySystemFilter(): Promise<void> {
    const state = this.stateManager.getState();

    // A8: Multi-System Toggle - both OFF
    if (!state.selectedSystems.prt && !state.selectedSystems.cmu) {
      this.routeRenderer.clearAllRoutes();
      this.vehicleTracker.stopPolling();
      console.log('All systems disabled - showing base map only');
      return;
    }

    // Check if selected route belongs to a disabled system
    if (state.selectedRouteId) {
      const selectedRoute = state.availableRoutes.find(
        (r) => r.id === state.selectedRouteId
      );
      if (selectedRoute) {
        const systemDisabled =
          (selectedRoute.system === 'PRT' && !state.selectedSystems.prt) ||
          (selectedRoute.system === 'CMU' && !state.selectedSystems.cmu);

        if (systemDisabled) {
          // Clear the route and stop polling
          console.log(
            `Clearing route ${state.selectedRouteId} - system ${selectedRoute.system} is disabled`
          );
          this.routeRenderer.clearRoutePolylines(state.selectedRouteId);
          this.routeRenderer.clearStopMarkers(
            `${state.selectedRouteId}_INBOUND`
          );
          this.routeRenderer.clearStopMarkers(
            `${state.selectedRouteId}_OUTBOUND`
          );
          this.vehicleTracker.stopPolling();
          // Clear selected route from state
          this.stateManager.updateFilter('selectedRouteId', null);
        }
      }
    }

    // Check if we need to prefetch routes for newly enabled systems
    const currentRoutes = state.availableRoutes;
    const hasPRTRoutes = currentRoutes.some((r) => r.system === 'PRT');
    const hasCMURoutes = currentRoutes.some((r) => r.system === 'CMU');

    // If CMU is enabled but we don't have CMU routes yet, fetch all routes
    if (state.selectedSystems.cmu && !hasCMURoutes) {
      console.log('CMU system enabled - prefetching CMU routes...');
      await this.prefetchRoutes();
    }

    // Re-apply all filters
    this.stateManager.reapplyFilters();

    // Update route selector with filtered routes based on enabled systems
    if (this.routeSelectorUpdateCallback) {
      const updatedState = this.stateManager.getState();
      const filteredRoutes = updatedState.availableRoutes.filter((r) => {
        if (r.system === 'PRT') return updatedState.selectedSystems.prt;
        if (r.system === 'CMU') return updatedState.selectedSystems.cmu;
        return false;
      });
      const routeOptions = buildRouteOptions(filteredRoutes);
      this.routeSelectorUpdateCallback(routeOptions);
    }

    await this.renderFilteredRoutes();

    // If a route is still selected after system filter, re-render it fully (geometry + stops)
    const updatedState = this.stateManager.getState();
    if (updatedState.selectedRouteId) {
      await this.applyRouteFilter(updatedState.selectedRouteId);
    }

    // Re-render nearby stops filtered to the newly enabled systems (TUC4).
    // Use userLocation (not nearbyStopsActive) because showNearbyStops sets the flag
    // to false when it returns empty (e.g. CMU-only mode before CMU stops load),
    // which would prevent subsequent toggles from re-fetching.
    if (this.userLocation && !updatedState.selectedRouteId) {
      await this.showNearbyStops(this.userLocation);
    }

    this.urlSync.updateURL(updatedState);
  }

  /**
   * Prefetch routes for newly enabled systems.
   * Always uses the /transit/routes endpoint so that CMU routes (which are
   * absent from the bulk/GTFS payload) are included alongside PRT routes.
   */
  private async prefetchRoutes(): Promise<void> {
    try {
      const routes = await this.fetchAllRoutes();
      routes.forEach((r) => this.routeColorCache.set(r.id, r.color));
      this.stateManager.setAvailableRoutes(routes);

      // Update route selector with new routes
      if (this.routeSelectorUpdateCallback) {
        const state = this.stateManager.getState();
        // Filter route IDs based on enabled systems
        const filteredRoutes = routes.filter((r) => {
          if (r.system === 'PRT') return state.selectedSystems.prt;
          if (r.system === 'CMU') return state.selectedSystems.cmu;
          return false;
        });
        const routeOptions = buildRouteOptions(filteredRoutes);
        this.routeSelectorUpdateCallback(routeOptions);
      }

      console.log(
        'Routes prefetched successfully:',
        routes.length,
        'total routes'
      );
    } catch (error) {
      console.error('Failed to prefetch routes:', error);
    }
  }

  /**
   * Apply route filter (single route selection - Rule R1)
   */
  async applyRouteFilter(routeId: string): Promise<void> {
    try {
      console.log('Applying route filter:', routeId);

      // TUC4: Clear nearby stop markers when a specific route is selected
      this.clearNearbyStops();

      // Clear all existing routes
      this.routeRenderer.clearAllRoutes();
      this.vehicleTracker.stopPolling();

      // Fetch route geometry
      const geometry = await this.fetchRouteGeometry(routeId);
      if (!geometry) {
        console.error('Failed to fetch geometry for route', routeId);
        // Continue anyway to show stops and vehicles
      } else {
        // Find route info for color
        const state = this.stateManager.getState();
        const route = state.availableRoutes.find((r) => r.id === routeId);
        const color = route?.color || '#FF0000';

        // Render route geometry
        this.routeRenderer.renderRouteGeometry(routeId, geometry, color);
      }

      // Fetch and render stops for both directions (if both enabled)
      await this.applyDirectionFilter();

      // Fetch and display detours for this route
      await this.fetchAndShowDetours(routeId);

      // Start vehicle polling, passing the route colour so bus icons are tinted
      // to match the route polyline already drawn on the map.
      const pollingState = this.stateManager.getState();
      const pollingRoute = pollingState.availableRoutes.find(
        (r) => r.id === routeId
      );
      this.vehicleTracker.startPolling(
        routeId,
        this.routeColorCache.get(routeId) ?? pollingRoute?.color ?? '#4285F4'
      );

      const state = this.stateManager.getState();
      this.urlSync.updateURL(state);
    } catch (error) {
      console.error('Error applying route filter:', error);
    }
  }

  /**
   * Fetch detours for the given route and display a banner if any are active.
   */
  private async fetchAndShowDetours(routeId: string): Promise<void> {
    try {
      const geometryRes = await axios.get(
        `/transit/detours/${routeId}/geometry`,
        {
          headers: { Authorization: `Bearer ${this.token}` },
          validateStatus: () => true
        }
      );

      let geometryDetours: IDetour[] = [];
      if (
        geometryRes.status === 200 &&
        geometryRes.data.name === 'DetoursRetrieved'
      ) {
        geometryDetours = geometryRes.data.payload || [];
      }

      this.routeRenderer.clearDetourPolylines(routeId);
      if (geometryDetours.some((d) => (d.geometry?.length ?? 0) > 0)) {
        this.routeRenderer.renderDetourGeometry(routeId, geometryDetours);
      }
    } catch (error) {
      console.error('Error fetching detours:', error);
      this.routeRenderer.clearDetourPolylines(routeId);
    }
  }

  /**
   * Clear the active route filter and re-render all filtered routes
   */
  async clearRouteFilter(): Promise<void> {
    this.stateManager.updateFilter('selectedRouteId', null);
    this.vehicleTracker.stopPolling();
    this.routeRenderer.clearAllRoutes();
    await this.renderFilteredRoutes();
    this.urlSync.updateURL(this.stateManager.getState());
  }

  /**
   * Apply date/time filter
   */
  async applyDateTimeFilter(): Promise<void> {
    const state = this.stateManager.getState();

    // If neither date nor time is selected, nothing to do
    if (!state.selectedDate && !state.selectedTime) {
      console.log('Date and time not selected');
      return;
    }

    // Use current date if only time is selected
    const dateToUse = state.selectedDate || new Date();

    // If only date is selected without time, we can't filter properly
    if (!state.selectedTime) {
      console.log('Time not selected, cannot apply time-based filter');
      return;
    }

    try {
      console.log('Applying date/time filter', {
        date: dateToUse,
        time: state.selectedTime
      });

      // Call backend to get available routes for this date/time
      const availableRoutes = await this.fetchAvailableRoutes(
        dateToUse,
        state.selectedTime
      );

      // A7: No Service Available
      if (availableRoutes.length === 0) {
        this.routeRenderer.clearAllRoutes();
        this.vehicleTracker.stopPolling();
        console.log('A7: No service available for this selection');
        // Use modal instead of alert
        const showModal = window.showModal;
        if (showModal && typeof showModal === 'function') {
          showModal(
            'No Service Available',
            'No service available for this selection.'
          );
        } else {
          console.error('showModal function not available');
          alert('No service available for this selection.');
        }
        return;
      }

      // Preserve route colors from TrueTime (GTFS routes.txt uses FFFFFF for most PRT routes)
      const routesWithColors = availableRoutes.map((r) => ({
        ...r,
        color: this.routeColorCache.get(r.id) ?? r.color
      }));

      // Update available routes
      this.stateManager.setAvailableRoutes(routesWithColors);

      // Update route selector with filtered routes
      if (this.routeSelectorUpdateCallback) {
        const routeOptions = buildRouteOptions(availableRoutes);
        this.routeSelectorUpdateCallback(routeOptions);
      }

      // If a specific route is selected, re-render it fully (geometry + stops)
      if (state.selectedRouteId) {
        await this.applyRouteFilter(state.selectedRouteId);
      } else {
        // Re-render filtered routes
        await this.renderFilteredRoutes();
      }

      // Update URL with latest state
      this.urlSync.updateURL(this.stateManager.getState());
    } catch (error) {
      console.error('Error applying date/time filter:', error);
    }
  }

  /**
   * Return directions that are both available for the route and enabled in the toggle.
   */
  private getEnabledDirections(
    selectedDirections: { inbound: boolean; outbound: boolean },
    routeDirections: string[]
  ): string[] {
    const directions: string[] = [];
    if (selectedDirections.inbound && routeDirections.includes('INBOUND')) {
      directions.push('INBOUND');
    }
    if (selectedDirections.outbound && routeDirections.includes('OUTBOUND')) {
      directions.push('OUTBOUND');
    }
    return directions;
  }

  /**
   * Show or hide polylines for each direction based on toggle state.
   */
  private updateDirectionVisibility(
    routeId: string,
    routeDirections: string[],
    selectedDirections: { inbound: boolean; outbound: boolean }
  ): void {
    for (const dir of ['INBOUND', 'OUTBOUND'] as const) {
      if (!routeDirections.includes(dir)) continue;
      const enabled =
        dir === 'INBOUND'
          ? selectedDirections.inbound
          : selectedDirections.outbound;
      if (enabled) {
        this.routeRenderer.showDirectionPolylines(routeId, dir);
      } else {
        this.routeRenderer.hideDirectionPolylines(routeId, dir);
      }
    }
  }

  /**
   * Clear stop markers for both directions then re-render markers for enabled directions.
   */
  private async refreshStopMarkers(
    routeId: string,
    directions: string[]
  ): Promise<void> {
    this.routeRenderer.clearStopMarkers(`${routeId}_INBOUND`);
    this.routeRenderer.clearStopMarkers(`${routeId}_OUTBOUND`);

    for (const direction of directions) {
      const stops = await this.fetchStops(routeId, direction);
      // Guard against deselection that may have occurred during the async fetch
      if (this.stateManager.getState().selectedRouteId !== routeId) return;
      if (stops.length > 0) {
        this.routeRenderer.renderStopMarkers(
          routeId,
          stops,
          direction,
          (stop) => this.handleStopClick(stop)
        );
      }
    }
  }

  /**
   * Apply direction filter
   */
  async applyDirectionFilter(): Promise<void> {
    const state = this.stateManager.getState();

    if (!state.selectedRouteId) {
      console.log('No route selected for direction filter');
      return;
    }

    try {
      const selectedRoute = state.availableRoutes.find(
        (r) => r.id === state.selectedRouteId
      );
      if (!selectedRoute) {
        console.error('Selected route not found in available routes');
        return;
      }

      const directions = this.getEnabledDirections(
        state.selectedDirections,
        selectedRoute.directions
      );

      this.updateDirectionVisibility(
        state.selectedRouteId,
        selectedRoute.directions,
        state.selectedDirections
      );

      await this.refreshStopMarkers(state.selectedRouteId, directions);

      this.urlSync.updateURL(state);
    } catch (error) {
      console.error('Error applying direction filter:', error);
    }
  }

  /**
   * Render routes based on current filter state
   */
  private async renderFilteredRoutes(): Promise<void> {
    const state = this.stateManager.getState();
    const routesToRender = state.filteredRoutes;

    console.log(`Rendering ${routesToRender.length} filtered routes`);

    // Get set of route IDs that should be visible
    const visibleRouteIds = new Set(routesToRender.map((r) => r.id));

    // Clear routes that are no longer in the filtered set
    // This ensures system toggle overrides route selection
    const allKnownRoutes = state.availableRoutes;
    for (const route of allKnownRoutes) {
      if (!visibleRouteIds.has(route.id)) {
        this.routeRenderer.clearRoutePolylines(route.id);
        this.routeRenderer.clearStopMarkers(`${route.id}_INBOUND`);
        this.routeRenderer.clearStopMarkers(`${route.id}_OUTBOUND`);
      }
    }

    // Fetch and render each route in the filtered set
    for (const route of routesToRender) {
      try {
        // Check if we already have geometry for this route
        if (this.routeRenderer.hasRouteGeometry(route.id)) {
          console.log(
            `Route ${route.id} already has geometry, showing existing polylines`
          );
          // Route is already rendered, just ensure it's visible
          // The polylines are already on the map, we just filtered which routes to show
          continue;
        }

        // Need to fetch geometry for this route
        const geometry = await this.fetchRouteGeometry(route.id);
        if (geometry) {
          this.routeRenderer.renderRouteGeometry(
            route.id,
            geometry,
            route.color
          );
        } else {
          console.warn(`No geometry data available for route ${route.id}`);
        }
      } catch (error: unknown) {
        // Silently skip routes without geometry (404 errors from GTFS routes without shape data)
        const err = error as Record<string, unknown>;
        const response = err?.response as Record<string, unknown> | undefined;
        if (response?.status === 404 || err?.type === 'ClientError') {
          console.debug(
            `Route ${route.id} geometry not available - skipping render`
          );
        } else {
          console.error(`Failed to render route ${route.id}:`, error);
        }
      }
    }
  }

  /**
   * Fetch route geometry — uses local cache from bulk data when available,
   * otherwise falls back to the per-route API call.
   */
  private async fetchRouteGeometry(routeId: string): Promise<RouteData | null> {
    // Try local pattern cache first (populated by fetchBulkData)
    if (this.bulkLoaded && this.patternCache.has(routeId)) {
      console.log(`Route ${routeId} geometry served from local cache`);
      return this.patternCache.get(routeId) as unknown as RouteData;
    }

    // PRT routes not found in the bulk payload genuinely have no geometry.
    // CMU routes are never in the bulk payload (lazy-loaded), so always fall
    // through to the per-route API call for them.
    if (this.bulkLoaded && !routeId.startsWith('CMU-')) {
      console.debug(`Route ${routeId} has no geometry in bulk data — skipping`);
      return null;
    }

    const response: AxiosResponse = await axios.get(
      `/transit/routes/${routeId}`,
      {
        headers: { Authorization: `Bearer ${this.token}` },
        validateStatus: () => true
      }
    );

    if (response.status === 200 && response.data.name === 'PathGenerated') {
      return response.data.payload as RouteData;
    } else if (response.status === 404) {
      // Route has no geometry data - throw so caller can handle gracefully
      throw { response, type: 'ClientError', name: 'RouteNotFound' };
    } else {
      console.error('Failed to fetch route geometry:', response.data);
      return null;
    }
  }

  /**
   * Fetch available routes for a specific date/time
   */
  private async fetchAvailableRoutes(
    date: Date,
    time: { hour: number; minute: number; period: 'AM' | 'PM' }
  ): Promise<IRoute[]> {
    try {
      // Convert date to YYYY-MM-DD format
      const dateStr = date.toISOString().split('T')[0];

      // Convert time object to HH:MM 24-hour format
      let hour24 = time.hour;
      if (time.period === 'PM' && time.hour !== 12) {
        hour24 = time.hour + 12;
      } else if (time.period === 'AM' && time.hour === 12) {
        hour24 = 0;
      }
      const timeStr = `${hour24.toString().padStart(2, '0')}:${time.minute.toString().padStart(2, '0')}`;

      console.log('Fetching routes for:', { date: dateStr, time: timeStr });

      const response: AxiosResponse = await axios.post(
        '/transit/routes/available',
        { date: dateStr, time: timeStr },
        {
          headers: { Authorization: `Bearer ${this.token}` },
          validateStatus: () => true
        }
      );

      if (response.status === 200 && response.data.name === 'RoutesRetrieved') {
        return response.data.payload || [];
      } else {
        console.error('Failed to fetch available routes:', response.data);
        // Don't show error modal for expected errors like no service available
        // The caller will handle showing the "No Service Available" modal
        if (response.status === 500 && window.showModal) {
          window.showModal(
            'Service Error',
            'Unable to fetch route schedules. Please try again later.'
          );
        }
        return [];
      }
    } catch (error) {
      console.error('Error fetching available routes:', error);
      // Show error modal for network errors
      if (window.showModal) {
        window.showModal(
          'Network Error',
          'Unable to connect to the server. Please check your internet connection.'
        );
      }
      return [];
    }
  }

  /**
   * Fetch stops for a specific route and direction — uses local cache from
   * bulk data when available, otherwise falls back to the per-route API call.
   */
  private async fetchStops(
    routeId: string,
    direction: string
  ): Promise<IStop[]> {
    // Try local stop cache first (populated by fetchBulkData)
    const cacheKey = `${routeId}:${direction}`;
    if (this.bulkLoaded && this.stopCache.has(cacheKey)) {
      console.log(`Stops for ${cacheKey} served from local cache`);
      return this.stopCache.get(cacheKey) || [];
    }

    try {
      const response: AxiosResponse = await axios.get(
        `/transit/stops/${routeId}?dir=${direction}`,
        {
          headers: { Authorization: `Bearer ${this.token}` },
          validateStatus: () => true
        }
      );

      if (response.status === 200 && response.data.name === 'StopsRetrieved') {
        return response.data.payload || [];
      } else {
        console.error('Failed to fetch stops:', response.data);
        return [];
      }
    } catch (error) {
      console.error('Error fetching stops:', error);
      return [];
    }
  }

  /**
   * Public helper for map search stop selections.
   * Reuses the same prediction + popup flow as marker clicks.
   */
  async showStopDetailsFromSearch(stop: IStop): Promise<void> {
    await this.handleStopClick(stop);
  }

  /**
   * Handle a stop marker click: fetch predictions and show popup.
   * Supports A3 (restore minimised popup) and A1 (select another stop before directions).
   */
  private async handleStopClick(stop: IStop): Promise<void> {
    // If in directions mode, ignore stop clicks
    if (this.directionsController.isActive) return;

    // A3: If this stop was minimised, restore its popup
    if (this.restoreMinimisedPopup(stop)) return;

    try {
      const predictions = await this.fetchPredictions(stop.stopId);
      this.showStopPopup(stop, predictions);
    } catch (error) {
      console.error('Error handling stop click:', error);
    }
  }

  /**
   * Fetch arrival predictions for a stop from the backend (served from the
   * in-memory GTFS-RT trip-updates cache).
   */
  private async fetchPredictions(stopId: string): Promise<IPrediction[]> {
    try {
      const response: AxiosResponse = await axios.get(
        `/transit/stops/${stopId}/predictions`,
        {
          headers: { Authorization: `Bearer ${this.token}` },
          validateStatus: () => true
        }
      );

      if (
        response.status === 200 &&
        response.data.name === 'PredictionsRetrieved'
      ) {
        return response.data.payload || [];
      }
      return [];
    } catch (error) {
      console.error('Error fetching predictions:', error);
      return [];
    }
  }

  /**
   * Render the stop-info popup on the map overlay.
   * Includes Directions button (TUC4 Step 5) and minimize button (A3).
   */
  private showStopPopup(stop: IStop, predictions: IPrediction[]): void {
    // Remove any existing map popup (stop or bus) first
    closeMapPopup();
    this.stopPredictionPolling();
    // Clear minimised state since we're opening a new popup
    this.minimisedStop = null;

    // Track which predictions the user selects (by index)
    const selectedIndices = new Set<number>();
    const displayPredictions = predictions.slice(0, 8);

    const popup = document.createElement('div');
    popup.id = MAP_POPUP_ID;
    popup.className = 'map-popup';

    // Header with close (×) and minimize (–) buttons
    const header = document.createElement('div');
    header.className = 'map-popup__header';
    header.innerHTML = `
      <span class="material-icons-outlined map-popup__icon map-popup__icon--stop">place</span>
      <strong class="map-popup__title">${stop.stopName}</strong>
      <button class="map-popup__minimize" aria-label="Minimize" title="Minimize">&ndash;</button>
      <button class="map-popup__close" aria-label="Close">&times;</button>
    `;
    popup.appendChild(header);

    const subheader = document.createElement('div');
    subheader.className = 'map-popup__subheader';
    subheader.textContent = `Stop #${stop.stopId}`;
    popup.appendChild(subheader);

    // Walking time estimate (TUC4 Step 4, R4: 1km ≈ 15 min)
    const walkMin = this.estimateWalkMinutes(stop.lat, stop.lon);
    if (walkMin !== null) {
      const walkRow = document.createElement('div');
      walkRow.className = 'map-popup__walk-time';
      walkRow.innerHTML = `
        <span class="material-icons-outlined map-popup__walk-icon">directions_walk</span>
        <span>~${walkMin} min walk</span>
      `;
      popup.appendChild(walkRow);
    }

    // Hint for selection
    if (displayPredictions.length > 0) {
      const hint = document.createElement('p');
      hint.className = 'map-popup__select-hint';
      hint.textContent = 'Tap buses to include in directions';
      popup.appendChild(hint);
    }

    // Predictions list (selectable)
    if (displayPredictions.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'map-popup__empty';
      empty.textContent = 'No upcoming arrivals';
      popup.appendChild(empty);
    } else {
      const list = document.createElement('ul');
      list.className = 'map-popup__list';
      for (let i = 0; i < displayPredictions.length; i++) {
        const p = displayPredictions[i];
        const li = document.createElement('li');
        li.className = 'map-popup__arrival map-popup__arrival--selectable';
        li.dataset.predIndex = String(i);
        li.dataset.arrival = String(p.predictedArrivalTime);

        const routeBadge = document.createElement('span');
        routeBadge.className = 'map-popup__route-badge';
        const color = this.routeColorCache.get(p.routeId) || '#c41230';
        routeBadge.style.backgroundColor = color;
        routeBadge.textContent = p.routeId;

        const mins = document.createElement('span');
        mins.className = 'map-popup__minutes';
        mins.textContent = this.formatCountdown(p.predictedArrivalTime);

        const meta = document.createElement('span');
        meta.className = 'map-popup__meta';
        const parts: string[] = [];
        if (p.vid) parts.push(`Bus ${p.vid}`);
        if (p.isDelayed) parts.push('Delayed');
        meta.textContent = parts.join(' · ');

        li.appendChild(routeBadge);
        li.appendChild(mins);
        li.appendChild(meta);

        // Toggle selection on click
        li.addEventListener('click', () => {
          if (selectedIndices.has(i)) {
            selectedIndices.delete(i);
            li.classList.remove('map-popup__arrival--selected');
          } else {
            selectedIndices.add(i);
            li.classList.add('map-popup__arrival--selected');
          }
          // Update directions button label
          this.updateDirectionsBtnLabel(directionsBtn, selectedIndices.size);
        });

        list.appendChild(li);
      }
      popup.appendChild(list);
    }

    // Directions button (TUC4 Step 5)
    const directionsBtn = document.createElement('button');
    directionsBtn.className = 'map-popup__directions-btn';
    directionsBtn.innerHTML = `
      <span class="material-icons-outlined">directions_walk</span>
      Directions
    `;
    popup.appendChild(directionsBtn);

    // Append to map container
    const container = document.querySelector('.map-container');
    if (container) {
      container.appendChild(popup);
    }

    // Close button handler (A2: deselect stop)
    const closeBtn = popup.querySelector('.map-popup__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.stopPredictionPolling();
        closeMapPopup();
      });
    }

    // Minimize button handler (A3)
    const minBtn = popup.querySelector('.map-popup__minimize');
    if (minBtn) {
      minBtn.addEventListener('click', () => {
        this.minimisedStop = stop;
        this.minimisedPredictions = predictions;
        this.stopPredictionPolling();
        closeMapPopup();
      });
    }

    // Directions button handler (TUC4 Step 5)
    directionsBtn.addEventListener('click', async () => {
      const selectedPreds = displayPredictions.filter((_, idx) =>
        selectedIndices.has(idx)
      );
      await this.directionsController.startDirections(stop, selectedPreds);
      // Render routes/stops/vehicles for selected bus predictions
      if (selectedPreds.length > 0) {
        await this.renderSelectedBusRoutes(selectedPreds);
      }
    });

    // Start live prediction refresh (30 s)
    this.startPredictionPolling(stop, selectedIndices, displayPredictions);
  }

  /** Update the directions button label to reflect selection count. */
  private updateDirectionsBtnLabel(
    btn: HTMLButtonElement,
    count: number
  ): void {
    const label =
      count > 0
        ? `Directions (${count} bus${count > 1 ? 'es' : ''})`
        : 'Directions';
    btn.innerHTML = `
      <span class="material-icons-outlined">directions_walk</span>
      ${label}
    `;
  }

  // -------------------------------------------------------------------
  // Prediction Auto-Refresh
  // -------------------------------------------------------------------

  /** Start polling predictions every 30 s for the open stop popup. */
  private startPredictionPolling(
    stop: IStop,
    selectedIndices: Set<number>,
    displayPredictions: IPrediction[]
  ): void {
    this.stopPredictionPolling();
    this.openPopupStopId = stop.stopId;

    // 1-second countdown ticker
    this.predictionTickerInterval = window.setInterval(() => {
      if (!document.getElementById(MAP_POPUP_ID)) {
        this.stopPredictionPolling();
        return;
      }
      this.tickPredictionCountdowns();
    }, 1000);

    // 30-second full refresh from server
    this.predictionPollInterval = window.setInterval(async () => {
      if (!document.getElementById(MAP_POPUP_ID)) {
        this.stopPredictionPolling();
        return;
      }

      const fresh = await this.fetchPredictions(stop.stopId);
      this.refreshPredictionList(
        fresh.slice(0, 8),
        selectedIndices,
        displayPredictions
      );
    }, 30_000);
  }

  /** Stop prediction polling. */
  private stopPredictionPolling(): void {
    if (this.predictionPollInterval !== null) {
      clearInterval(this.predictionPollInterval);
      this.predictionPollInterval = null;
    }
    if (this.predictionTickerInterval !== null) {
      clearInterval(this.predictionTickerInterval);
      this.predictionTickerInterval = null;
    }
    this.openPopupStopId = null;
  }

  /** Tick all visible prediction countdowns by recalculating from arrival time. */
  private tickPredictionCountdowns(): void {
    const popup = document.getElementById(MAP_POPUP_ID);
    if (!popup) return;

    const items = popup.querySelectorAll<HTMLElement>('.map-popup__arrival');
    items.forEach((li) => {
      const arrival = Number(li.dataset.arrival);
      if (!arrival) return;
      const minsEl = li.querySelector('.map-popup__minutes');
      if (minsEl) minsEl.textContent = this.formatCountdown(arrival);
    });
  }

  /** Format a predicted arrival timestamp as a live countdown string. */
  private formatCountdown(arrivalTimestamp: number): string {
    const secsLeft = Math.round((arrivalTimestamp - Date.now()) / 1000);
    if (secsLeft <= 0) return 'NOW';
    if (secsLeft < 60) return `${secsLeft}s`;
    return `${Math.ceil(secsLeft / 60)} min`;
  }

  /**
   * Update prediction minutes and metadata in the open popup DOM without
   * rebuilding the list (so user selections are preserved).
   */
  private refreshPredictionList(
    freshPreds: IPrediction[],
    selectedIndices: Set<number>,
    displayPredictions: IPrediction[]
  ): void {
    const popup = document.getElementById(MAP_POPUP_ID);
    if (!popup) return;

    const items = popup.querySelectorAll<HTMLElement>('.map-popup__arrival');

    // Update existing items with fresh data (matched by index)
    items.forEach((li) => {
      const idx = Number(li.dataset.predIndex);
      if (idx >= freshPreds.length) {
        // This prediction is gone — remove from DOM
        li.remove();
        selectedIndices.delete(idx);
        return;
      }
      const p = freshPreds[idx];
      // Sync backing array so directions button picks up fresh data
      displayPredictions[idx] = p;

      // Update arrival timestamp for the countdown ticker
      li.dataset.arrival = String(p.predictedArrivalTime);

      const minsEl = li.querySelector('.map-popup__minutes');
      if (minsEl)
        minsEl.textContent = this.formatCountdown(p.predictedArrivalTime);

      const metaEl = li.querySelector('.map-popup__meta');
      if (metaEl) {
        const parts: string[] = [];
        if (p.vid) parts.push(`Bus ${p.vid}`);
        if (p.isDelayed) parts.push('Delayed');
        metaEl.textContent = parts.join(' · ');
      }

      // Update route badge in case routeId changed
      const badge = li.querySelector('.map-popup__route-badge') as HTMLElement;
      if (badge) {
        badge.textContent = p.routeId;
        badge.style.backgroundColor =
          this.routeColorCache.get(p.routeId) || '#c41230';
      }
    });

    // Handle "No upcoming arrivals" ↔ predictions toggle
    const emptyEl = popup.querySelector('.map-popup__empty');
    if (freshPreds.length === 0 && !emptyEl) {
      const list = popup.querySelector('.map-popup__list');
      if (list) list.remove();
      const hint = popup.querySelector('.map-popup__select-hint');
      if (hint) hint.remove();
      const empty = document.createElement('p');
      empty.className = 'map-popup__empty';
      empty.textContent = 'No upcoming arrivals';
      const dirBtn = popup.querySelector('.map-popup__directions-btn');
      if (dirBtn) popup.insertBefore(empty, dirBtn);
    } else if (freshPreds.length > 0 && emptyEl) {
      emptyEl.remove();
    }
  }

  /**
   * Render routes, stops, patterns, and start vehicle polling for routes
   * associated with the user's selected bus predictions during directions mode.
   */
  private async renderSelectedBusRoutes(
    predictions: IPrediction[]
  ): Promise<void> {
    // Deduplicate route IDs
    const routeIds = [...new Set(predictions.map((p) => p.routeId))];
    const state = this.stateManager.getState();

    for (const routeId of routeIds) {
      // Render route geometry
      const geometry = await this.fetchRouteGeometry(routeId);
      if (geometry) {
        const route = state.availableRoutes.find((r) => r.id === routeId);
        const color =
          route?.color || this.routeColorCache.get(routeId) || '#FF0000';
        this.routeRenderer.renderRouteGeometry(routeId, geometry, color);
      }

      // Render stop markers for both directions
      for (const direction of ['INBOUND', 'OUTBOUND']) {
        const stops = await this.fetchStops(routeId, direction);
        if (stops.length > 0) {
          this.routeRenderer.renderStopMarkers(
            routeId,
            stops,
            direction,
            () => {} // No-op click handler while in directions mode
          );
        }
      }
    }

    // Start vehicle polling for selected routes
    this.vehicleTracker.startMultiRoutePolling(routeIds);
  }

  /**
   * Restore a minimised stop popup (A3).
   * Called when the user clicks the same stop marker again.
   */
  restoreMinimisedPopup(stop: IStop): boolean {
    if (this.minimisedStop && this.minimisedStop.stopId === stop.stopId) {
      this.showStopPopup(stop, this.minimisedPredictions);
      this.minimisedStop = null;
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------------
  // Nearby Stops Discovery  (TUC4 — Discover Stops & Schedules)
  // -------------------------------------------------------------------

  /**
   * Fetch nearby stops from the server and render them on the map.
   * Called once when the user's location is first obtained (TUC4 Step 2).
   * Stops are cleared automatically when a route is explicitly selected.
   */
  async showNearbyStops(position: ILatLng): Promise<void> {
    this.userLocation = position;

    // Don't show nearby stops if a route is already selected (TUC1 takes precedence)
    const state = this.stateManager.getState();
    if (state.selectedRouteId) return;

    // Clear stale markers before (re-)rendering so system-filter changes don't stack
    if (this.nearbyStopsActive) {
      for (const routeId of this.nearbyRouteIds) {
        this.routeRenderer.clearStopMarkers(`${routeId}_NEARBY`);
      }
      this.routeRenderer.clearStopMarkers('NEARBY_NEARBY');
      this.nearbyStopsActive = false;
      this.nearbyRouteIds.clear();
    }

    // Derive system filter from the active toggles
    const { prt, cmu } = state.selectedSystems;
    const system: string | undefined =
      prt && cmu ? undefined : prt ? 'PRT' : cmu ? 'CMU' : undefined;

    try {
      const nearbyData = await this.fetchNearbyStops(
        position.lat,
        position.lng,
        system
      );
      if (!nearbyData || nearbyData.stops.length === 0) return;

      // Collect route IDs that serve nearby stops
      this.nearbyRouteIds.clear();
      for (const ns of nearbyData.stops) {
        for (const rid of ns.routesServingStop) {
          this.nearbyRouteIds.add(rid);
        }
      }

      // Hide routes that have no nearby stops (TUC4 Step 2: show only nearby routes)
      for (const route of state.availableRoutes) {
        if (!this.nearbyRouteIds.has(route.id)) {
          this.routeRenderer.hideRoute(route.id);
        }
      }

      // Render route geometry for nearby routes that aren't rendered yet
      for (const routeId of this.nearbyRouteIds) {
        if (!this.routeRenderer.hasRouteGeometry(routeId)) {
          const geometry = await this.fetchRouteGeometry(routeId);
          if (geometry) {
            const route = state.availableRoutes.find((r) => r.id === routeId);
            const color =
              route?.color || this.routeColorCache.get(routeId) || '#FF0000';
            this.routeRenderer.renderRouteGeometry(routeId, geometry, color);
          }
        }
      }

      // Render each nearby stop as a marker (grouped under per-route keys)
      const stopsByRoute = new Map<string, IStop[]>();

      for (const ns of nearbyData.stops) {
        // Group stops by the first route that serves them for rendering keys
        const routeKey = ns.routesServingStop[0] ?? 'NEARBY';
        const arr = stopsByRoute.get(routeKey) || [];
        arr.push(ns.stop);
        stopsByRoute.set(routeKey, arr);
      }

      for (const [routeKey, stops] of stopsByRoute.entries()) {
        this.routeRenderer.renderStopMarkers(
          routeKey,
          stops,
          'NEARBY',
          (stop) => this.handleStopClick(stop)
        );
      }

      this.nearbyStopsActive = true;

      console.log(
        `[FilterController] Rendered ${nearbyData.stops.length} nearby stops ` +
          `(${this.nearbyRouteIds.size} routes, radius: ${nearbyData.radiusMeters}m` +
          `${nearbyData.expandedRadiusApplied ? ', expanded' : ''})`
      );
    } catch (error) {
      console.error('[FilterController] Error showing nearby stops:', error);
    }
  }

  /**
   * Restore the default map state: user location, nearby stops, and their
   * route/pattern geometry — without real-time bus locations.
   * Called when exiting directions mode or any overlay that replaced the
   * default view.
   */
  async restoreDefaultState(position: ILatLng): Promise<void> {
    // Clear everything from the map
    this.routeRenderer.clearAllRoutes();
    this.vehicleTracker.stopPolling();
    this.stopPredictionPolling();
    closeMapPopup();

    // Reset all filters to defaults
    this.stateManager.updateFilter('selectedRouteId', null);
    this.stateManager.updateFilter('selectedDate', null);
    this.stateManager.updateFilter('selectedTime', null);
    this.stateManager.updateFilter('selectedDirections', {
      inbound: true,
      outbound: true
    });
    this.nearbyStopsActive = false;
    this.nearbyRouteIds.clear();

    // Re-show nearby stops with their route geometry (no vehicles)
    await this.showNearbyStops(position);
  }

  /**
   * Clear nearby stop markers from the map.
   * Called when the user selects a specific route.
   */
  clearNearbyStops(): void {
    if (!this.nearbyStopsActive) return;

    // The nearby markers are keyed as "{routeId}_NEARBY"
    for (const route of this.stateManager.getState().availableRoutes) {
      this.routeRenderer.clearStopMarkers(`${route.id}_NEARBY`);
    }
    this.routeRenderer.clearStopMarkers('NEARBY_NEARBY');

    // Restore routes that were hidden during nearby-stops mode
    for (const route of this.stateManager.getState().availableRoutes) {
      if (!this.nearbyRouteIds.has(route.id)) {
        this.routeRenderer.showRoute(route.id);
      }
    }

    this.nearbyRouteIds.clear();
    this.nearbyStopsActive = false;
    console.log(
      '[FilterController] Cleared nearby stop markers and restored routes'
    );
  }

  /**
   * Fetch nearby stops from the server endpoint.
   * GET /transit/stops/nearbystops?lat=...&lon=...
   */
  private async fetchNearbyStops(
    lat: number,
    lon: number,
    system?: string
  ): Promise<INearbyStopsPayload | null> {
    try {
      const params: Record<string, string | number> = { lat, lon };
      if (system) params.system = system;
      const response: AxiosResponse = await axios.get(
        '/transit/stops/nearbystops',
        {
          params,
          headers: { Authorization: `Bearer ${this.token}` },
          validateStatus: () => true
        }
      );

      if (
        response.status === 200 &&
        response.data.name === 'NearbyStopsRetrieved'
      ) {
        return response.data.payload as INearbyStopsPayload;
      }
      console.warn(
        '[FilterController] Nearby stops request failed:',
        response.data
      );
      return null;
    } catch (error) {
      console.error('[FilterController] Error fetching nearby stops:', error);
      return null;
    }
  }

  // -------------------------------------------------------------------
  // Haversine utility (TUC4 R4 — walk-time heuristic)
  // -------------------------------------------------------------------

  /**
   * Estimate walking time in minutes using the R4 heuristic (1 km ≈ 15 min).
   */
  private estimateWalkMinutes(stopLat: number, stopLon: number): number | null {
    return estimateWalkMinutes(
      this.userLocation,
      stopLat,
      stopLon,
      FilterController.WALK_MINUTES_PER_KM
    );
  }

  /**
   * Reset all filters to default
   */
  async resetFilters(): Promise<void> {
    this.stopHealthPolling();
    this.vehicleTracker.stopPolling();
    this.routeRenderer.clearAllRoutes();
    this.stateManager.resetFilters();
    await this.initialize();
    this.urlSync.updateURL(this.stateManager.getState());
  }

  // -------------------------------------------------------------------
  // Service Health Monitoring
  // -------------------------------------------------------------------

  /** Poll /transit/health every 60 seconds and update the banner. */
  private startHealthPolling(): void {
    if (this.healthPollInterval) return;

    // Initial check
    this.checkServiceHealth();

    // Poll every 60 seconds
    this.healthPollInterval = window.setInterval(() => {
      this.checkServiceHealth();
    }, 60_000);
  }

  /** Stop the health polling interval. */
  private stopHealthPolling(): void {
    if (this.healthPollInterval) {
      clearInterval(this.healthPollInterval);
      this.healthPollInterval = null;
    }
  }

  /** Fetch health status and show/hide the service-status banner. */
  private async checkServiceHealth(): Promise<void> {
    try {
      const response: AxiosResponse = await axios.get('/transit/health', {
        headers: { Authorization: `Bearer ${this.token}` },
        validateStatus: () => true
      });

      if (response.status !== 200) return;

      const health = response.data as {
        vehiclePositions: {
          healthy: boolean;
          consecutiveFailures: number;
          error: string | null;
        };
        tripUpdates: {
          healthy: boolean;
          consecutiveFailures: number;
          error: string | null;
        };
        trueTimeColors: { available: boolean };
        overall: boolean;
      };

      // If colors just became available, re-fetch routes to get real colors
      if (health.trueTimeColors.available && !this.colorsWereAvailable) {
        console.log(
          '[FilterController] TrueTime colors now available — refreshing routes'
        );
        this.refreshRouteColors();
      }
      this.colorsWereAvailable = health.trueTimeColors.available;

      // Determine if we need to show a banner
      const allHealthy = health.overall && health.trueTimeColors.available;

      if (allHealthy) {
        this.hideServiceBanner();
      } else {
        const issues: string[] = [];
        if (!health.vehiclePositions.healthy) {
          issues.push('Real-time vehicle tracking is unavailable');
        }
        if (!health.tripUpdates.healthy) {
          issues.push('Arrival predictions are unavailable');
        }
        if (!health.trueTimeColors.available) {
          issues.push('Route colors are temporarily using defaults');
        }
        this.showServiceBanner(issues);
      }
    } catch {
      // Don't show banner for network errors on the health check itself
    }
  }

  /**
   * Re-fetch routes from the server to pick up TrueTime colors after
   * a successful color retry.  Updates the local cache and re-renders
   * any currently-displayed route polylines with the correct color.
   */
  private async refreshRouteColors(): Promise<void> {
    try {
      const response: AxiosResponse = await axios.get('/transit/routes', {
        headers: { Authorization: `Bearer ${this.token}` },
        validateStatus: () => true
      });

      if (response.status !== 200 || response.data.name !== 'RoutesRetrieved')
        return;

      const freshRoutes: IRoute[] = response.data.payload || [];

      // Update the local route cache and color cache
      const state = this.stateManager.getState();
      for (const route of freshRoutes) {
        this.routeColorCache.set(route.id, route.color);
      }
      this.stateManager.setAvailableRoutes(freshRoutes);

      // Re-render polylines for any currently-selected route
      if (state.selectedRouteId) {
        const route = freshRoutes.find((r) => r.id === state.selectedRouteId);
        const patterns = this.patternCache.get(state.selectedRouteId);
        if (route && patterns) {
          this.routeRenderer.renderRouteGeometry(
            route.id,
            patterns,
            route.color
          );
        }
      }

      console.log('[FilterController] Route colors refreshed from server');
    } catch (err) {
      console.warn('[FilterController] Failed to refresh route colors:', err);
    }
  }

  /** Show the service-degraded banner with a list of issues. */
  private showServiceBanner(issues: string[]): void {
    const banner = document.getElementById('service-status-banner');
    if (!banner) return;

    banner.innerHTML = buildServiceBannerMarkup(issues);
    banner.hidden = false;

    const closeBtn = banner.querySelector('.service-status-banner__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hideServiceBanner());
    }
  }

  /** Hide the service-status banner. */
  private hideServiceBanner(): void {
    const banner = document.getElementById('service-status-banner');
    if (banner) {
      banner.hidden = true;
      banner.innerHTML = '';
    }
  }
}
