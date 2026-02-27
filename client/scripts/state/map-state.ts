/**
 * Central State Management for Map Filters
 * Manages all filter state and notifies subscribers of changes
 */

import type { IRoute, IVehicle } from '../../../common/transit.interface';

export interface IMapState {
  selectedRouteId: string | null;      // Route filter (Rule R1 - single route)
  selectedSystems: {                    // System filter (Rule R2 - PRT default ON)
    prt: boolean;
    cmu: boolean;
  };
  selectedDate: Date | null;            // Calendar filter
  selectedTime: {                       // Time filter
    hour: number;
    minute: number;
    period: 'AM' | 'PM';
  } | null;
  selectedDirections: {                 // Direction filter
    inbound: boolean;
    outbound: boolean;
  };
  availableRoutes: IRoute[];           // All routes from backend
  filteredRoutes: IRoute[];            // Routes after applying all filters
  activeVehicles: IVehicle[];          // Current vehicles on selected route
}

type StateChangeListener = (state: IMapState) => void;

export class MapStateManager {
  private static instance: MapStateManager;
  private state: IMapState;
  private listeners: Set<StateChangeListener> = new Set();

  private constructor() {
    // Initialize with default state (Rule R2: PRT ON, CMU OFF)
    this.state = {
      selectedRouteId: null,
      selectedSystems: {
        prt: true,
        cmu: false
      },
      selectedDate: null,
      selectedTime: null,
      selectedDirections: {
        inbound: true,
        outbound: true
      },
      availableRoutes: [],
      filteredRoutes: [],
      activeVehicles: []
    };
  }

  static getInstance(): MapStateManager {
    if (!MapStateManager.instance) {
      MapStateManager.instance = new MapStateManager();
    }
    return MapStateManager.instance;
  }

  /**
   * Get current state (readonly copy)
   */
  getState(): Readonly<IMapState> {
    return { ...this.state };
  }

  /**
   * Update a specific filter
   */
  updateFilter<K extends keyof IMapState>(filterType: K, value: IMapState[K]): void {
    this.state[filterType] = value;
    this.notifyListeners();
  }

  /**
   * Update multiple filters at once
   */
  updateFilters(updates: Partial<IMapState>): void {
    this.state = { ...this.state, ...updates };
    this.notifyListeners();
  }

  /**
   * Set available routes from API
   */
  setAvailableRoutes(routes: IRoute[]): void {
    this.state.availableRoutes = routes;
    this.applyFilters();
    this.notifyListeners();
  }

  /**
   * Set active vehicles for selected route
   */
  setActiveVehicles(vehicles: IVehicle[]): void {
    this.state.activeVehicles = vehicles;
    this.notifyListeners();
  }

  /**
   * Apply current filters to available routes
   */
  private applyFilters(): void {
    let filtered = [...this.state.availableRoutes];

    // Apply system filter
    filtered = filtered.filter(route => {
      if (route.system === 'PRT') return this.state.selectedSystems.prt;
      if (route.system === 'CMU') return this.state.selectedSystems.cmu;
      return false;
    });

    // Apply route filter (Rule R1: single route selection)
    if (this.state.selectedRouteId) {
      filtered = filtered.filter(route => route.id === this.state.selectedRouteId);
    }

    this.state.filteredRoutes = filtered;
  }

  /**
   * Reset all filters to default state
   */
  resetFilters(): void {
    this.state = {
      selectedRouteId: null,
      selectedSystems: {
        prt: true,
        cmu: false
      },
      selectedDate: null,
      selectedTime: null,
      selectedDirections: {
        inbound: true,
        outbound: true
      },
      availableRoutes: this.state.availableRoutes, // Keep available routes
      filteredRoutes: [],
      activeVehicles: []
    };
    this.applyFilters();
    this.notifyListeners();
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.getState()));
  }

  /**
   * Re-apply filters (call after backend filtering)
   */
  reapplyFilters(): void {
    this.applyFilters();
    this.notifyListeners();
  }
}
