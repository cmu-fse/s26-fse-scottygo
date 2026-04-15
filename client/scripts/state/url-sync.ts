/**
 * URL State Synchronization Manager
 * Syncs filter state with browser URL hash for RESTful behavior
 * Format: /#/map?r=P1&s=PRT,CMU&d=20260227&t=1430&dir=IB,OB
 */

import type { IMapState } from './map-state';
import { MapStateManager } from './map-state';

export class URLSyncManager {
  private static instance: URLSyncManager;
  private stateManager: MapStateManager;

  private constructor() {
    this.stateManager = MapStateManager.getInstance();
    this.setupListeners();
  }

  static getInstance(): URLSyncManager {
    if (!URLSyncManager.instance) {
      URLSyncManager.instance = new URLSyncManager();
    }
    return URLSyncManager.instance;
  }

  /**
   * Setup event listeners for browser navigation
   */
  private setupListeners(): void {
    // Listen for hash changes (back/forward navigation)
    window.addEventListener('hashchange', () => {
      this.restoreStateFromURL();
    });
  }

  /**
   * Parse URL hash and return state object
   */
  private parseURL(): Partial<IMapState> {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.split('?')[1] || '');

    const state: Partial<IMapState> = {};

    // Route filter
    const routeId = params.get('r');
    if (routeId) {
      state.selectedRouteId = routeId;
    }

    // System filter
    const systems = params.get('s');
    if (systems) {
      const systemArray = systems.split(',');
      state.selectedSystems = {
        prt: systemArray.includes('PRT'),
        cmu: systemArray.includes('CMU')
      };
    }

    // Direction filter
    const directions = params.get('dir');
    if (directions) {
      const dirArray = directions.split(',');
      state.selectedDirections = {
        inbound: dirArray.includes('IB'),
        outbound: dirArray.includes('OB')
      };
    }

    return state;
  }

  /**
   * Build URL hash from current state
   */
  private buildURL(state: Readonly<IMapState>): string {
    const params = new URLSearchParams();

    // Route filter
    if (state.selectedRouteId) {
      params.set('r', state.selectedRouteId);
    }

    // System filter (only if not default)
    const systems: string[] = [];
    if (state.selectedSystems.prt) systems.push('PRT');
    if (state.selectedSystems.cmu) systems.push('CMU');
    if (
      systems.length > 0 &&
      !(state.selectedSystems.prt && !state.selectedSystems.cmu)
    ) {
      // Don't add if it's the default (PRT only)
      params.set('s', systems.join(','));
    }

    // Direction filter (only if not default)
    const directions: string[] = [];
    if (state.selectedDirections.inbound) directions.push('IB');
    if (state.selectedDirections.outbound) directions.push('OB');
    if (directions.length > 0 && directions.length < 2) {
      // Only add if not showing both (default)
      params.set('dir', directions.join(','));
    }

    const queryString = params.toString();
    return queryString ? `#/map?${queryString}` : '#/map';
  }

  /**
   * Update URL from current state (without triggering hashchange)
   */
  updateURL(state: Readonly<IMapState>): void {
    const newHash = this.buildURL(state);
    if (window.location.hash !== newHash) {
      history.replaceState(null, '', newHash);
    }
  }

  /**
   * Restore state from URL (called on page load or hash change)
   */
  restoreStateFromURL(): Partial<IMapState> {
    const urlState = this.parseURL();
    if (Object.keys(urlState).length > 0) {
      this.stateManager.updateFilters(urlState);
    }
    return urlState;
  }

  /**
   * Initialize URL sync on page load
   */
  initialize(): void {
    const urlState = this.restoreStateFromURL();
    console.log('Restored state from URL:', urlState);
  }
}
