/**
 * Vehicle Tracker
 * Manages real-time vehicle position updates and rendering
 * Polls backend every 30 seconds to match the GTFS-RT feed refresh rate
 */

import axios from 'axios';
import type { IMapProvider, IMapMarker } from '../../../common/map.interface';
import type { IVehicle } from '../../../common/transit.interface';
import { MapStateManager } from '../state/map-state';

export class VehicleTracker {
  private static instance: VehicleTracker;
  private mapProvider: IMapProvider | null = null;
  private stateManager: MapStateManager;
  
  private pollingInterval: number | null = null;
  private currentRouteId: string | null = null;
  private vehicleMarkers = new Map<string, IMapMarker>(); // vehicleId → marker
  private vehicleData = new Map<string, IVehicle>();       // vehicleId → latest data
  private hasShownStaticToast = false;

  private constructor() {
    this.stateManager = MapStateManager.getInstance();
  }

  static getInstance(): VehicleTracker {
    if (!VehicleTracker.instance) {
      VehicleTracker.instance = new VehicleTracker();
    }
    return VehicleTracker.instance;
  }

  /**
   * Initialize with map provider
   */
  initialize(mapProvider: IMapProvider): void {
    this.mapProvider = mapProvider;
  }

  /**
   * Start polling for vehicle positions on a specific route
   */
  startPolling(routeId: string): void {
    if (!this.mapProvider) {
      console.error('Map provider not initialized');
      return;
    }

    // Stop previous polling
    this.stopPolling();

    this.currentRouteId = routeId;
    this.hasShownStaticToast = false;

    // Initial fetch
    this.updateVehiclePositions();

    // Poll every 30 seconds (matches GTFS-RT feed refresh rate)
    this.pollingInterval = window.setInterval(() => {
      this.updateVehiclePositions();
    }, 30000);

    console.log(`Started vehicle polling for route ${routeId}`);
  }

  /**
   * Stop polling vehicle positions
   */
  stopPolling(): void {
    if (this.pollingInterval !== null) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('Stopped vehicle polling');
    }

    // Clear all vehicle markers
    this.clearVehicles();
    this.currentRouteId = null;
    this.hasShownStaticToast = false;
  }

  /**
   * Fetch and update vehicle positions from backend
   */
  private async updateVehiclePositions(): Promise<void> {
    if (!this.currentRouteId || !this.mapProvider) return;

    try {
      const state = this.stateManager.getState();
      let url = `/transit/vehicles/${this.currentRouteId}`;

      // Add time parameter if time filter is applied (Rule R3)
      if (state.selectedTime && state.selectedDate) {
        const timeString = this.formatTimeForAPI(state.selectedDate, state.selectedTime);
        url += `?tm=${encodeURIComponent(timeString)}`;
      }

      const token = localStorage.getItem('token');
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: () => true
      });

      if (response.status === 200 && response.data.name === 'VehiclesLocated') {
        // Check if data is from static cache (A2: PRT API Down)
        if (response.data.source === 'static' && !this.hasShownStaticToast) {
          this.showToast('Real-time tracking unavailable. Showing scheduled times only.');
          this.hasShownStaticToast = true;
        }

        const vehicles: IVehicle[] = response.data.payload || [];
        this.stateManager.setActiveVehicles(vehicles);
        this.renderVehicles(vehicles);
      } else {
        console.error('Failed to fetch vehicles:', response.data);
      }
    } catch (error) {
      console.error('Error fetching vehicle positions:', error);
      // Don't stop polling on transient errors
    }
  }

  /**
   * Render vehicle markers on map
   */
  private renderVehicles(vehicles: IVehicle[]): void {
    if (!this.mapProvider) return;

    const currentVehicleIds = new Set<string>();

    vehicles.forEach(vehicle => {
      currentVehicleIds.add(vehicle.vid);

      // Always update the stored data so popup shows fresh info
      this.vehicleData.set(vehicle.vid, vehicle);

      if (this.vehicleMarkers.has(vehicle.vid)) {
        // Smoothly animate existing marker to new position
        const marker = this.vehicleMarkers.get(vehicle.vid)!;
        marker.animatePosition({ lat: vehicle.lat, lng: vehicle.lon }, 5000);
        // Update icon in case heading changed
        marker.setIcon(this.createBusIcon(vehicle));
      } else {
        // Create new marker
        const marker = this.mapProvider!.addMarker({
          position: { lat: vehicle.lat, lng: vehicle.lon },
          title: `Bus ${vehicle.vid}${vehicle.isDetoured ? ' (Detoured)' : ''}`,
          icon: this.createBusIcon(vehicle)
        });

        // Attach click handler for info popup
        marker.onClick(() => this.showVehiclePopup(vehicle.vid));

        this.vehicleMarkers.set(vehicle.vid, marker);
      }
    });

    // Remove markers for vehicles no longer in response
    this.removeStaleVehicles(currentVehicleIds);
  }

  /**
   * Remove vehicle markers that are no longer active
   */
  private removeStaleVehicles(currentVehicleIds: Set<string>): void {
    const markersToRemove: string[] = [];

    this.vehicleMarkers.forEach((marker, vid) => {
      if (!currentVehicleIds.has(vid)) {
        marker.remove();
        markersToRemove.push(vid);
      }
    });

    markersToRemove.forEach(vid => {
      this.vehicleMarkers.delete(vid);
      this.vehicleData.delete(vid);
    });
  }

  /**
   * Clear all vehicle markers from map
   */
  clearVehicles(): void {
    this.vehicleMarkers.forEach(marker => marker.remove());
    this.vehicleMarkers.clear();
    this.vehicleData.clear();
    this.closeVehiclePopup();
    console.log('Cleared all vehicle markers');
  }

  /**
   * Create bus icon based on vehicle state, with a heading direction indicator.
   * The entire SVG is rotated so the arrow-tip points in the vehicle's heading.
   */
  private createBusIcon(vehicle: IVehicle): string {
    const color = vehicle.isDetoured ? '#FFA500' : '#4285F4';
    const size = 32;
    const half = size / 2;
    const heading = vehicle.heading ?? 0;

    // A teardrop / navigation-pointer shape:
    //   - wide circle body for the bus
    //   - pointed top as the direction arrow
    // Drawn pointing UP (0°), then rotated by heading degrees.
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <g transform="rotate(${heading}, ${half}, ${half})">
    <!-- direction pointer (triangle on top) -->
    <polygon points="${half},2 ${half - 6},13 ${half + 6},13" fill="${color}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
    <!-- bus body -->
    <circle cx="${half}" cy="${half + 2}" r="9" fill="${color}" stroke="white" stroke-width="2"/>
    <!-- bus icon (simple rectangle + windows) -->
    <rect x="${half - 4}" y="${half - 2}" width="8" height="8" rx="1.5" fill="white"/>
    <rect x="${half - 2.5}" y="${half - 0.5}" width="5" height="2" rx="0.5" fill="${color}"/>
    <rect x="${half - 2.5}" y="${half + 3}" width="5" height="1.5" rx="0.5" fill="${color}"/>
  </g>
</svg>`;
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg.trim());
  }

  /**
   * Format date and time for API (YYYYMMDD HH:MM)
   */
  private formatTimeForAPI(date: Date, time: { hour: number; minute: number; period: 'AM' | 'PM' }): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    // Convert to 24-hour format
    let hour24 = time.hour;
    if (time.period === 'PM' && time.hour !== 12) {
      hour24 += 12;
    } else if (time.period === 'AM' && time.hour === 12) {
      hour24 = 0;
    }

    const hourStr = String(hour24).padStart(2, '0');
    const minuteStr = String(time.minute).padStart(2, '0');

    return `${year}${month}${day} ${hourStr}:${minuteStr}`;
  }

  /**
   * Show toast notification
   */
  private showToast(message: string): void {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      z-index: 10000;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;

    document.body.appendChild(toast);

    // Remove after 5 seconds
    setTimeout(() => {
      toast.remove();
    }, 5000);
  }

  /**
   * Show info popup for a clicked bus marker.
   * Reads the latest stored data for the vehicle.
   */
  private showVehiclePopup(vid: string): void {
    const vehicle = this.vehicleData.get(vid);
    if (!vehicle) return;

    // Remove any existing bus popup
    this.closeVehiclePopup();

    const popup = document.createElement('div');
    popup.id = 'bus-popup';
    popup.className = 'bus-popup';

    // Header
    const header = document.createElement('div');
    header.className = 'bus-popup__header';
    header.innerHTML = `
      <span class="material-icons-outlined bus-popup__icon">directions_bus</span>
      <strong class="bus-popup__title">Bus ${vehicle.vid}</strong>
      <button class="bus-popup__close" aria-label="Close">&times;</button>
    `;
    popup.appendChild(header);

    // Subheader — route
    const subheader = document.createElement('div');
    subheader.className = 'bus-popup__subheader';
    subheader.textContent = `Route ${vehicle.routeId}`;
    popup.appendChild(subheader);

    // Detail rows
    const details = document.createElement('div');
    details.className = 'bus-popup__details';

    // Status
    if (vehicle.currentStatus) {
      const statusLabel = this.formatStatus(vehicle.currentStatus);
      this.addDetailRow(details, 'Status', statusLabel);
    }

    // Speed
    if (vehicle.speed != null) {
      // GTFS-RT speed is m/s → convert to mph
      const mph = (vehicle.speed * 2.23694).toFixed(1);
      this.addDetailRow(details, 'Speed', `${mph} mph`);
    }

    // Heading
    if (vehicle.heading != null) {
      this.addDetailRow(details, 'Heading', `${this.formatHeading(vehicle.heading)}`);
    }

    // Next stop
    if (vehicle.currentStopId) {
      this.addDetailRow(details, 'Next Stop', `#${vehicle.currentStopId}`);
    }

    // Trip ID
    if (vehicle.tripId) {
      this.addDetailRow(details, 'Trip', vehicle.tripId);
    }

    // Last update
    const lastUpdate = new Date(vehicle.lastUpdate);
    const secsAgo = Math.round((Date.now() - lastUpdate.getTime()) / 1000);
    this.addDetailRow(details, 'Updated', secsAgo < 60 ? `${secsAgo}s ago` : `${Math.round(secsAgo / 60)}m ago`);

    // Coordinates
    this.addDetailRow(details, 'Position', `${vehicle.lat.toFixed(5)}, ${vehicle.lon.toFixed(5)}`);

    popup.appendChild(details);

    // Source badge
    const badge = document.createElement('div');
    badge.className = `bus-popup__source bus-popup__source--${vehicle.source}`;
    badge.textContent = vehicle.source === 'live' ? 'LIVE' : 'SCHEDULED';
    popup.appendChild(badge);

    // Append to map container
    const container = document.querySelector('.map-container');
    if (container) {
      container.appendChild(popup);
    }

    // Close button
    const closeBtn = popup.querySelector('.bus-popup__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeVehiclePopup());
    }
  }

  /**
   * Close the bus info popup.
   */
  private closeVehiclePopup(): void {
    const existing = document.getElementById('bus-popup');
    if (existing) existing.remove();
  }

  /**
   * Add a key-value detail row to the popup.
   */
  private addDetailRow(container: HTMLElement, label: string, value: string): void {
    const row = document.createElement('div');
    row.className = 'bus-popup__row';

    const lbl = document.createElement('span');
    lbl.className = 'bus-popup__label';
    lbl.textContent = label;

    const val = document.createElement('span');
    val.className = 'bus-popup__value';
    val.textContent = value;

    row.appendChild(lbl);
    row.appendChild(val);
    container.appendChild(row);
  }

  /**
   * Format GTFS-RT VehicleStopStatus to human-readable text.
   */
  private formatStatus(status: string): string {
    switch (status) {
      case 'INCOMING_AT': return 'Arriving at stop';
      case 'STOPPED_AT': return 'Stopped at stop';
      case 'IN_TRANSIT_TO': return 'In transit to next stop';
      default: return status;
    }
  }

  /**
   * Convert heading degrees to compass direction + degrees.
   */
  private formatHeading(degrees: number): string {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const idx = Math.round(degrees / 45) % 8;
    return `${dirs[idx]} (${Math.round(degrees)}°)`;
  }

  /**
   * Check if currently polling
   */
  isPolling(): boolean {
    return this.pollingInterval !== null;
  }

  /**
   * Get current route being tracked
   */
  getCurrentRouteId(): string | null {
    return this.currentRouteId;
  }
}
