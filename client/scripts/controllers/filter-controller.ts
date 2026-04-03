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

  /** Earth radius in meters for haversine */
  private static readonly EARTH_RADIUS_M = 6_371_000;
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
        const routeOptions = routes.map((r) => ({
          id: r.id,
          name: this.formatRouteName(r)
        }));
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

  private showConnectionErrorModal(): void {
    const showModal = window.showModal;
    if (showModal && typeof showModal === 'function') {
      showModal(
        'Connection Lost',
        'Unable to connect to the server. Please check your internet connection.'
      );
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
      this.showConnectionErrorModal();
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
      this.showConnectionErrorModal();
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
      const routeOptions = filteredRoutes.map((r) => ({
        id: r.id,
        name: this.formatRouteName(r)
      }));
      this.routeSelectorUpdateCallback(routeOptions);
    }

    await this.renderFilteredRoutes();

    // If a route is still selected after system filter, re-render it fully (geometry + stops)
    const updatedState = this.stateManager.getState();
    if (updatedState.selectedRouteId) {
      await this.applyRouteFilter(updatedState.selectedRouteId);
    }

    this.urlSync.updateURL(updatedState);
  }

  /**
   * Prefetch routes for newly enabled systems.
   * Uses bulk endpoint to also cache patterns and stops for new routes.
   */
  private async prefetchRoutes(): Promise<void> {
    try {
      const routes = this.bulkLoaded
        ? await this.fetchBulkData()
        : await this.fetchAllRoutes();
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
        const routeOptions = filteredRoutes.map((r) => ({
          id: r.id,
          name: this.formatRouteName(r)
        }));
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
   * Format route name for display - removes "Transit" word for CMU routes
   */
  private formatRouteName(route: IRoute): string {
    if (route.system === 'CMU') {
      // Remove "Transit" from CMU route names
      return route.name.replace(/\s+Transit\s+/g, ' ').trim();
    }
    // For PRT routes, just use the ID
    return route.id;
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

      // Start vehicle polling for this route
      this.vehicleTracker.startPolling(routeId);

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
        const routeOptions = availableRoutes.map((r) => ({
          id: r.id,
          name: this.formatRouteName(r)
        }));
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
   * Apply direction filter
   */
  async applyDirectionFilter(): Promise<void> {
    const state = this.stateManager.getState();

    if (!state.selectedRouteId) {
      console.log('No route selected for direction filter');
      return;
    }

    try {
      // Get the selected route to check available directions
      const selectedRoute = state.availableRoutes.find(
        (r) => r.id === state.selectedRouteId
      );
      if (!selectedRoute) {
        console.error('Selected route not found in available routes');
        return;
      }

      // Build list of directions to fetch based on:
      // 1. What directions are available for this route
      // 2. What directions are enabled in the toggle
      const directions: string[] = [];

      if (
        state.selectedDirections.inbound &&
        selectedRoute.directions.includes('INBOUND')
      ) {
        directions.push('INBOUND');
      }
      if (
        state.selectedDirections.outbound &&
        selectedRoute.directions.includes('OUTBOUND')
      ) {
        directions.push('OUTBOUND');
      }

      // Control route geometry visibility based on direction toggles
      // Only show/hide if the route actually has that direction
      if (selectedRoute.directions.includes('INBOUND')) {
        if (state.selectedDirections.inbound) {
          this.routeRenderer.showDirectionPolylines(
            state.selectedRouteId,
            'INBOUND'
          );
        } else {
          this.routeRenderer.hideDirectionPolylines(
            state.selectedRouteId,
            'INBOUND'
          );
        }
      }

      if (selectedRoute.directions.includes('OUTBOUND')) {
        if (state.selectedDirections.outbound) {
          this.routeRenderer.showDirectionPolylines(
            state.selectedRouteId,
            'OUTBOUND'
          );
        } else {
          this.routeRenderer.hideDirectionPolylines(
            state.selectedRouteId,
            'OUTBOUND'
          );
        }
      }

      // Clear existing stop markers
      this.routeRenderer.clearStopMarkers(`${state.selectedRouteId}_INBOUND`);
      this.routeRenderer.clearStopMarkers(`${state.selectedRouteId}_OUTBOUND`);

      // Fetch and render stops for each enabled direction
      for (const direction of directions) {
        const stops = await this.fetchStops(state.selectedRouteId, direction);
        if (stops.length > 0) {
          this.routeRenderer.renderStopMarkers(
            state.selectedRouteId,
            stops,
            direction,
            (stop) => this.handleStopClick(stop)
          );
        }
      }

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

    // Bulk data was loaded but this route has no patterns — no geometry available
    if (this.bulkLoaded) {
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
    // Clear minimised state since we're opening a new popup
    this.minimisedStop = null;

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

    // Predictions list
    if (predictions.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'map-popup__empty';
      empty.textContent = 'No upcoming arrivals';
      popup.appendChild(empty);
    } else {
      const list = document.createElement('ul');
      list.className = 'map-popup__list';
      // Show up to 8 next arrivals
      for (const p of predictions.slice(0, 8)) {
        const li = document.createElement('li');
        li.className = 'map-popup__arrival';

        const routeBadge = document.createElement('span');
        routeBadge.className = 'map-popup__route-badge';
        const color = this.routeColorCache.get(p.routeId) || '#c41230';
        routeBadge.style.backgroundColor = color;
        routeBadge.textContent = p.routeId;

        const mins = document.createElement('span');
        mins.className = 'map-popup__minutes';
        mins.textContent = p.minutes <= 0 ? 'NOW' : `${p.minutes} min`;

        const meta = document.createElement('span');
        meta.className = 'map-popup__meta';
        const parts: string[] = [];
        if (p.vid) parts.push(`Bus ${p.vid}`);
        if (p.isDelayed) parts.push('Delayed');
        meta.textContent = parts.join(' · ');

        li.appendChild(routeBadge);
        li.appendChild(mins);
        li.appendChild(meta);
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
      closeBtn.addEventListener('click', () => closeMapPopup());
    }

    // Minimize button handler (A3)
    const minBtn = popup.querySelector('.map-popup__minimize');
    if (minBtn) {
      minBtn.addEventListener('click', () => {
        this.minimisedStop = stop;
        this.minimisedPredictions = predictions;
        closeMapPopup();
      });
    }

    // Directions button handler (TUC4 Step 5)
    directionsBtn.addEventListener('click', () => {
      this.directionsController.startDirections(stop);
    });
  }

  /**
   * Restore a minimised stop popup (A3).
   * Called when the user clicks the same stop marker again.
   */
  restoreMinimisedPopup(stop: IStop): boolean {
    if (
      this.minimisedStop &&
      this.minimisedStop.stopId === stop.stopId
    ) {
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

    try {
      const nearbyData = await this.fetchNearbyStops(position.lat, position.lng);
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
    console.log('[FilterController] Cleared nearby stop markers and restored routes');
  }

  /**
   * Fetch nearby stops from the server endpoint.
   * GET /transit/stops/nearbystops?lat=...&lon=...
   */
  private async fetchNearbyStops(
    lat: number,
    lon: number
  ): Promise<INearbyStopsPayload | null> {
    try {
      const response: AxiosResponse = await axios.get(
        '/transit/stops/nearbystops',
        {
          params: { lat, lon },
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
      console.warn('[FilterController] Nearby stops request failed:', response.data);
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
   * Haversine distance between two points in meters.
   */
  private haversine(a: ILatLng, b: ILatLng): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const h =
      sinDLat * sinDLat +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
    return 2 * FilterController.EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
  }

  /**
   * Estimate walking time in minutes using the R4 heuristic (1 km ≈ 15 min).
   */
  private estimateWalkMinutes(stopLat: number, stopLon: number): number | null {
    if (!this.userLocation) return null;
    const dist = this.haversine(this.userLocation, { lat: stopLat, lng: stopLon });
    return Math.ceil((dist / 1000) * FilterController.WALK_MINUTES_PER_KM);
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

    banner.innerHTML = `
      <div class="service-status-banner__content">
        <span class="material-icons-outlined service-status-banner__icon">cloud_off</span>
        <div class="service-status-banner__text">
          <strong>Some services are currently unavailable</strong>
          <ul>${issues.map((i) => `<li>${i}</li>`).join('')}</ul>
        </div>
        <button class="service-status-banner__close" aria-label="Dismiss">&times;</button>
      </div>
    `;
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
