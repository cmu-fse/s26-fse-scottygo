/**
 * Filter Controller
 * Coordinates filter application and manages API calls
 * Implements the progressive filtering strategy
 */

import { transitApiService } from '../services/transit-api.service';
import type {
  IRoute,
  IStop,
  IPattern,
  IBulkTransitData,
  IDetour,
  INearbyStop,
  INearbyStopsPayload,
  IRouteSchedule
} from '../../../common/transit.interface';
import type { ILatLng } from '../../../common/map.interface';
import { MapStateManager } from '../state/map-state';
import { RouteRenderer, type RouteData } from '../renderers/route-renderer';
import { MAP_POPUP_ID, dismissPopup, minimizePopup } from '../utils/map-popup';
import { VehicleTracker } from '../trackers/vehicle-tracker';
import { DirectionsController } from './directions-controller';
import { PredictionController } from './prediction-controller';
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
  /** Member's current location for TUC4 walk-time estimates */
  private userLocation: ILatLng | null = null;
  /** Whether nearby stops are currently rendered on the map */
  private nearbyStopsActive = false;
  /** Route IDs that have nearby stops (used to restore hidden routes) */
  private nearbyRouteIds = new Set<string>();

  /** Walk-time heuristic: 1 km ≈ 15 min (TUC4 R4) */
  private static readonly WALK_MINUTES_PER_KM = 15;

  private constructor() {
    this.stateManager = MapStateManager.getInstance();
    this.routeRenderer = RouteRenderer.getInstance();
    this.vehicleTracker = VehicleTracker.getInstance();
    this.directionsController = DirectionsController.getInstance();
    this.urlSync = URLSyncManager.getInstance();

    const predCtrl = PredictionController.getInstance();
    predCtrl.setRouteColorProvider(
      (routeId) => this.routeColorCache.get(routeId) || this.getFallbackRouteColor(routeId)
    );
    predCtrl.setWalkTimeProvider(
      (lat, lon) => this.estimateWalkMinutes(lat, lon)
    );
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

  /** Fallback route color when metadata is temporarily unavailable. */
  private getFallbackRouteColor(routeId: string): string {
    return routeId.startsWith('CMU-') ? '#C41230' : '#4285F4';
  }

  /** Update route selector options from current system-filtered state. */
  private updateRouteSelectorFromState(routes: IRoute[]): void {
    if (!this.routeSelectorUpdateCallback) return;

    const state = this.stateManager.getState();
    const filteredRoutes = routes.filter((r) => {
      if (r.system === 'PRT') return state.selectedSystems.prt;
      if (r.system === 'CMU') return state.selectedSystems.cmu;
      return false;
    });

    const routeOptions = buildRouteOptions(filteredRoutes);
    this.routeSelectorUpdateCallback(routeOptions);
  }

  /**
   * Initialize - load all transit data from the bulk endpoint in one call
   */
  async initialize(): Promise<void> {
    try {
      console.log('Fetching bulk transit data from backend...');
      let routes = await this.fetchBulkData();

      // If URL-restored state references CMU, hydrate full route list now so
      // route restoration after navigation has metadata (color/directions/stops).
      const restoredState = this.stateManager.getState();
      const needsCMURoutes =
        restoredState.selectedSystems.cmu ||
        (!!restoredState.selectedRouteId &&
          restoredState.selectedRouteId.startsWith('CMU-'));

      if (needsCMURoutes && !routes.some((r) => r.system === 'CMU')) {
        const allRoutes = await this.fetchAllRoutes();
        if (allRoutes.length > 0) {
          routes = allRoutes;
          console.log(
            'Restored CMU route context detected - initialized with full route list'
          );
        }
      }

      routes.forEach((r) => this.routeColorCache.set(r.id, r.color));
      this.stateManager.setAvailableRoutes(routes);

      // Update route selector with available routes
      this.updateRouteSelectorFromState(routes);

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
    return transitApiService.getRoutes();
  }

  /**
   * Fetch all transit data (routes, patterns, stops) in a single call.
   * Populates local patternCache and stopCache so subsequent render
   * operations never need additional network requests for static data.
   */
  private async fetchBulkData(): Promise<IRoute[]> {
    const bulk = await transitApiService.getBulkData();
    if (!bulk) {
      console.warn('Bulk endpoint failed, falling back to /transit/routes');
      return this.fetchAllRoutes();
    }

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

    const updatedState = this.stateManager.getState();
    this.updateRouteSelectorFromState(updatedState.availableRoutes);

    await this.renderFilteredRoutes();

    // If a route is still selected after system filter, re-render it fully (geometry + stops)
    const postRenderState = this.stateManager.getState();
    if (postRenderState.selectedRouteId) {
      await this.applyRouteFilter(postRenderState.selectedRouteId);
    }

    // Re-render nearby stops filtered to the newly enabled systems (TUC4).
    // Use userLocation (not nearbyStopsActive) because showNearbyStops sets the flag
    // to false when it returns empty (e.g. CMU-only mode before CMU stops load),
    // which would prevent subsequent toggles from re-fetching.
    if (this.userLocation && !postRenderState.selectedRouteId) {
      await this.showNearbyStops(this.userLocation);
    }

    this.urlSync.updateURL(postRenderState);
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
      this.updateRouteSelectorFromState(routes);

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
   * Ensure route metadata exists in state (useful after back-navigation when
   * URL state restores a CMU route before CMU routes have been prefetched).
   */
  private async ensureRouteAvailable(routeId: string): Promise<IRoute | null> {
    let state = this.stateManager.getState();
    let route = state.availableRoutes.find((r) => r.id === routeId);
    if (route) return route;

    const routes = await this.fetchAllRoutes();
    if (routes.length === 0) {
      return null;
    }

    routes.forEach((r) => this.routeColorCache.set(r.id, r.color));
    this.stateManager.setAvailableRoutes(routes);
    this.updateRouteSelectorFromState(routes);

    state = this.stateManager.getState();
    route = state.availableRoutes.find((r) => r.id === routeId);
    return route ?? null;
  }

  /**
   * Apply route filter (single route selection - Rule R1)
   */
  async applyRouteFilter(routeId: string): Promise<void> {
    try {
      console.log('Applying route filter:', routeId);

      const selectedRoute = await this.ensureRouteAvailable(routeId);

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
        const color =
          selectedRoute?.color ||
          this.routeColorCache.get(routeId) ||
          this.getFallbackRouteColor(routeId);

        // Render route geometry
        this.routeRenderer.renderRouteGeometry(routeId, geometry, color);

        // Zoom map to fit the route
        this.routeRenderer.fitToRouteData(geometry);
      }

      // Fetch and render stops for both directions (if both enabled)
      if (selectedRoute) {
        await this.applyDirectionFilter();
      } else {
        const state = this.stateManager.getState();
        const fallbackDirections = routeId.startsWith('CMU-')
          ? ['OUTBOUND']
          : ['INBOUND', 'OUTBOUND'];
        const enabledDirections = this.getEnabledDirections(
          state.selectedDirections,
          fallbackDirections
        );
        await this.refreshStopMarkers(routeId, enabledDirections);
      }

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
      const geometryDetours = await transitApiService.getDetourGeometry(routeId);
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
          (stop) => PredictionController.getInstance().handleStopClick(stop)
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

    const patterns = await transitApiService.getPatterns(routeId);
    if (patterns === null) {
      // Route has no geometry data - throw so caller can handle gracefully
      throw { type: 'ClientError', name: 'RouteNotFound' };
    }
    return patterns as unknown as RouteData;
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
      return transitApiService.filterRoutesByDateTime(dateStr, timeStr);
    } catch (error) {
      console.error('Error fetching available routes:', error);
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

    return transitApiService.getStops(routeId, direction);
  }

  /**
   * Public helper for map search stop selections.
   * Delegates to PredictionController which owns the popup lifecycle.
   */
  async showStopDetailsFromSearch(stop: IStop): Promise<void> {
    await PredictionController.getInstance().handleStopClick(stop);
  }

  // -------------------------------------------------------------------
  // Route Info Popup
  // -------------------------------------------------------------------

  /**
   * Show the Route Info popup for the selected route.
   * Fetches schedule, alerts, and detours from the backend.
   */
  async showRouteInfoPopup(routeId: string): Promise<void> {
    // Dismiss any existing popup / docked tab
    dismissPopup();

    const state = this.stateManager.getState();
    const route = state.availableRoutes.find((r) => r.id === routeId);
    const routeName = route ? route.name : routeId;
    const routeColor = route?.color || this.routeColorCache.get(routeId) || '#4285F4';

    // Build popup shell immediately (shows loading state)
    const popup = document.createElement('div');
    popup.id = MAP_POPUP_ID;
    popup.className = 'map-popup';

    const header = document.createElement('div');
    header.className = 'map-popup__header';
    header.innerHTML = `
      <span class="material-icons-outlined map-popup__icon map-popup__icon--route" style="color:${routeColor}">route</span>
      <strong class="map-popup__title">${routeName}</strong>
      <button class="map-popup__minimize" aria-label="Minimize">&minus;</button>
    `;
    popup.appendChild(header);

    // Loading body
    const body = document.createElement('div');
    body.className = 'map-popup__body';
    body.innerHTML = '<div class="map-popup__loading">Loading schedule&hellip;</div>';
    popup.appendChild(body);

    const container = document.querySelector('.map-container');
    if (container) container.appendChild(popup);

    // Bind minimize immediately
    this.bindRouteInfoMinimize(popup, routeId, routeName, routeColor);

    // Fetch schedule data
    try {
      const schedule = await transitApiService.getRouteSchedule(routeId);
      if (!schedule) {
        body.innerHTML = '<div class="map-popup__empty">Schedule not available</div>';
        return;
      }
      this.renderRouteInfoBody(body, schedule, routeColor);

      // Re-bind minimize after body replaced
      this.bindRouteInfoMinimize(popup, routeId, routeName, routeColor);
    } catch (err) {
      console.error('Error fetching route schedule:', err);
      body.innerHTML = '<div class="map-popup__empty">Failed to load schedule</div>';
    }
  }

  /**
   * Render the route info popup body content.
   */
  private renderRouteInfoBody(
    body: HTMLElement,
    schedule: IRouteSchedule,
    routeColor: string
  ): void {
    let html = '';

    // Operating days
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    html += '<div class="route-info__section">';
    html += '<div class="route-info__days">';
    for (let d = 0; d < 7; d++) {
      const active = schedule.operatingDays.includes(d);
      html += `<span class="route-info__day${active ? ' route-info__day--active' : ''}" style="${active ? `background:${routeColor};color:#fff` : ''}">${dayNames[d]}</span>`;
    }
    html += '</div></div>';

    // Direction schedules
    if (schedule.directions.length > 0) {
      html += '<div class="route-info__section">';
      html += '<div class="route-info__label">Service Hours</div>';
      for (const dir of schedule.directions) {
        html += `<div class="route-info__hours">`;
        html += `<span class="route-info__dir">${dir.direction}</span>`;
        html += `<span class="route-info__times">${dir.firstTrip} &ndash; ${dir.lastTrip}</span>`;
        html += '</div>';
      }
      html += '</div>';
    }

    // Alerts
    if (schedule.alerts.length > 0) {
      html += '<div class="route-info__section route-info__section--alerts">';
      html += '<div class="route-info__label"><span class="material-icons-outlined" style="font-size:16px;vertical-align:text-bottom">warning_amber</span> Alerts</div>';
      for (const alert of schedule.alerts) {
        html += `<div class="route-info__alert">${alert.headerText}</div>`;
      }
      html += '</div>';
    }

    // Detours
    if (schedule.detours.length > 0) {
      html += '<div class="route-info__section route-info__section--detours">';
      html += '<div class="route-info__label"><span class="material-icons-outlined" style="font-size:16px;vertical-align:text-bottom">alt_route</span> Detours</div>';
      for (const detour of schedule.detours) {
        html += `<div class="route-info__detour">${detour.description}</div>`;
      }
      html += '</div>';
    }

    body.innerHTML = html;
  }

  /**
   * Bind the minimize button on the route info popup.
   */
  private bindRouteInfoMinimize(
    popup: HTMLElement,
    routeId: string,
    routeName: string,
    routeColor: string
  ): void {
    const minBtn = popup.querySelector('.map-popup__minimize');
    if (!minBtn) return;
    // Remove old listeners by cloning
    const fresh = minBtn.cloneNode(true);
    minBtn.replaceWith(fresh);
    fresh.addEventListener('click', () => {
      minimizePopup(
        routeName,
        () => this.rebindRouteInfoPopupEvents(routeId, routeName, routeColor),
        undefined,
        routeColor
      );
    });
  }

  /**
   * Re-bind event listeners on the route info popup after restoring from a docked tab.
   */
  private rebindRouteInfoPopupEvents(
    routeId: string,
    routeName: string,
    routeColor: string
  ): void {
    const popup = document.getElementById(MAP_POPUP_ID);
    if (!popup) return;

    this.bindRouteInfoMinimize(popup, routeId, routeName, routeColor);
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
        if (this.routeRenderer.hasRouteGeometry(routeId)) {
          continue;
        }

        try {
          const geometry = await this.fetchRouteGeometry(routeId);
          if (!geometry) {
            continue;
          }

          const route = state.availableRoutes.find((r) => r.id === routeId);
          const color =
            route?.color ||
            this.routeColorCache.get(routeId) ||
            this.getFallbackRouteColor(routeId);
          this.routeRenderer.renderRouteGeometry(routeId, geometry, color);
        } catch (error: unknown) {
          // Nearby stops should still render even if one route has no geometry.
          const err = error as Record<string, unknown>;
          const response = err?.response as Record<string, unknown> | undefined;
          if (response?.status === 404 || err?.type === 'ClientError') {
            console.debug(
              `[FilterController] Nearby route geometry unavailable for ${routeId}; continuing with stops`
            );
          } else {
            console.error(
              `[FilterController] Failed to render nearby route geometry for ${routeId}:`,
              error
            );
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
          (stop) => PredictionController.getInstance().handleStopClick(stop)
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
    PredictionController.getInstance().stopPolling();
    dismissPopup();

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
    return transitApiService.getNearbyStops(lat, lon, system);
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
    dismissPopup();
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
      const health = await transitApiService.getHealth();
      if (!health) return;

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
      const freshRoutes = await transitApiService.getRoutes();
      if (!freshRoutes.length) return;

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
