/**
 * Filter Controller
 * Coordinates filter application and manages API calls
 * Implements the progressive filtering strategy
 */

import axios, { AxiosResponse } from 'axios';
import type { IRoute, IStop } from '../../../common/transit.interface';
import { MapStateManager } from '../state/map-state';
import { RouteRenderer, type RouteData } from '../renderers/route-renderer';
import { VehicleTracker } from '../trackers/vehicle-tracker';
import { URLSyncManager } from '../state/url-sync';
import type { IRouteOption } from '../components/route-selector';

export class FilterController {
  private static instance: FilterController;
  private token: string | null = null;
  private routeSelectorUpdateCallback:
    | ((routes: IRouteOption[]) => void)
    | null = null;
  private routeColorCache = new Map<string, string>(); // Persists TrueTime colors across filter changes

  private constructor() {
    this.stateManager = MapStateManager.getInstance();
    this.routeRenderer = RouteRenderer.getInstance();
    this.vehicleTracker = VehicleTracker.getInstance();
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
   * Initialize - load all routes from backend
   */
  async initialize(): Promise<void> {
    try {
      console.log('Fetching all routes from backend...');
      const routes = await this.fetchAllRoutes();
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

      console.log(
        'Filter controller initialized with',
        routes.length,
        'routes'
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
    await this.renderFilteredRoutes();
    this.urlSync.updateURL(state);
  }

  /**
   * Prefetch routes for newly enabled systems
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

      // Start vehicle polling for this route
      this.vehicleTracker.startPolling(routeId);

      const state = this.stateManager.getState();
      this.urlSync.updateURL(state);
    } catch (error) {
      console.error('Error applying route filter:', error);
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

      // If a specific route is selected, restart polling with time parameter
      if (state.selectedRouteId && this.vehicleTracker.isPolling()) {
        this.vehicleTracker.startPolling(state.selectedRouteId);
      } else {
        // Re-render filtered routes
        await this.renderFilteredRoutes();
      }

      this.urlSync.updateURL(state);
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
            direction
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
   * Fetch route geometry from backend
   */
  private async fetchRouteGeometry(routeId: string): Promise<RouteData | null> {
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
   * Fetch stops for a specific route and direction
   */
  private async fetchStops(
    routeId: string,
    direction: string
  ): Promise<IStop[]> {
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
   * Reset all filters to default
   */
  async resetFilters(): Promise<void> {
    this.vehicleTracker.stopPolling();
    this.routeRenderer.clearAllRoutes();
    this.stateManager.resetFilters();
    await this.initialize();
    this.urlSync.updateURL(this.stateManager.getState());
  }
}
