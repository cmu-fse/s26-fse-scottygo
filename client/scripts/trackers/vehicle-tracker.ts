/**
 * Vehicle Tracker
 * Manages real-time vehicle position updates and rendering
 * Polls backend every 30 seconds to match the GTFS-RT feed refresh rate
 */

import axios from 'axios';
import type { IMapProvider, IMapMarker } from '../../../common/map.interface';
import type { IVehicle } from '../../../common/transit.interface';
import { MapStateManager } from '../state/map-state';
import { MAP_POPUP_ID, closeMapPopup } from '../utils/map-popup';

export class VehicleTracker {
  private static instance: VehicleTracker;
  private mapProvider: IMapProvider | null = null;
  private stateManager: MapStateManager;

  private pollingInterval: number | null = null;
  private currentRouteId: string | null = null;
  private vehicleMarkers = new Map<string, IMapMarker>(); // vehicleId → marker
  private vehicleData = new Map<string, IVehicle>(); // vehicleId → vehicle data for icon rebuilds
  private hasShownStaticToast = false;
  private hasShownNoVehiclesToast = false;
  private currentZoom = 14;

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
    this.currentZoom = mapProvider.getZoom();

    // Listen for zoom changes and resize bus icons accordingly
    mapProvider.onZoomChanged((zoom: number) => {
      this.currentZoom = zoom;
      this.updateAllIcons();
    });
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
    this.hasShownNoVehiclesToast = false;

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
    this.hasShownNoVehiclesToast = false;
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
        const timeString = this.formatTimeForAPI(
          state.selectedDate,
          state.selectedTime
        );
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
          this.showToast(
            'Real-time tracking unavailable. Showing scheduled times only.'
          );
          this.hasShownStaticToast = true;
        }

        const vehicles: IVehicle[] = response.data.payload || [];

        if (vehicles.length === 0) {
          if (!this.hasShownNoVehiclesToast) {
            this.showToast('No active buses found for this route');
            this.hasShownNoVehiclesToast = true;
          }
        } else {
          this.hasShownNoVehiclesToast = false;
        }

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

    vehicles.forEach((vehicle) => {
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

    markersToRemove.forEach((vid) => {
      this.vehicleMarkers.delete(vid);
      this.vehicleData.delete(vid);
    });
  }

  /**
   * Clear all vehicle markers from map
   */
  clearVehicles(): void {
    this.vehicleMarkers.forEach((marker) => marker.remove());
    this.vehicleMarkers.clear();
    this.vehicleData.clear();
    closeMapPopup();
    console.log('Cleared all vehicle markers');
  }

  /**
   * Get current vehicle positions (for zoom-to-bus)
   */
  getVehiclePositions(): Array<{ lat: number; lng: number }> {
    const positions: Array<{ lat: number; lng: number }> = [];
    this.vehicleData.forEach((vehicle) => {
      positions.push({ lat: vehicle.lat, lng: vehicle.lon });
    });
    return positions;
  }

  /**
   * Update all existing bus marker icons (called on zoom change)
   */
  private updateAllIcons(): void {
    this.vehicleMarkers.forEach((marker, vid) => {
      const vehicle = this.vehicleData.get(vid);
      if (vehicle) {
        marker.setIcon(this.createBusIcon(vehicle));
      }
    });
  }

  /**
   * Create bus icon with heading rotation and directional triangle.
   * Returns icon data with proper anchor so bus center sits on the route.
   */
  private createBusIcon(vehicle: IVehicle): {
    url: string;
    anchor: { x: number; y: number };
    size: { width: number; height: number };
  } {
    const color = vehicle.isDetoured ? '#FFA500' : '#FFB84D';
    const scale = Math.max(
      0.5,
      Math.min(2.5, (this.currentZoom - 10) * 0.3 + 1)
    );
    const heading = vehicle.heading || 0;

    // ViewBox dimensions — bus centered with triangle attached below
    const vbW = 40;
    const vbH = 32;
    const cx = vbW / 2; // center x
    const cy = 12; // bus vertical center (where route coordinate should anchor)

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(vbW * scale)}" height="${Math.round(vbH * scale)}" viewBox="0 0 ${vbW} ${vbH}">
        <g transform="rotate(${heading - 90}, ${cx}, ${cy})">
          <!-- Bus body -->
          <rect x="${cx - 13}" y="${cy - 6}" width="26" height="12" rx="2" fill="${color}" stroke="#333" stroke-width="1"/>
          <!-- Windshield -->
          <rect x="${cx - 11}" y="${cy - 4}" width="6" height="6" rx="1" fill="#B3D9FF" stroke="#333" stroke-width="0.5"/>
          <!-- Windows -->
          <rect x="${cx - 4}" y="${cy - 4}" width="4" height="6" rx="0.5" fill="#B3D9FF" stroke="#333" stroke-width="0.5"/>
          <rect x="${cx + 1}" y="${cy - 4}" width="4" height="6" rx="0.5" fill="#B3D9FF" stroke="#333" stroke-width="0.5"/>
          <rect x="${cx + 6}" y="${cy - 4}" width="4" height="6" rx="0.5" fill="#B3D9FF" stroke="#333" stroke-width="0.5"/>
          <!-- Black stripe -->
          <rect x="${cx - 11}" y="${cy + 3}" width="22" height="1.5" fill="#333"/>
          <!-- Wheels -->
          <circle cx="${cx - 7}" cy="${cy + 6}" r="2.5" fill="#333" stroke="#666" stroke-width="0.5"/>
          <circle cx="${cx - 7}" cy="${cy + 6}" r="1.2" fill="#E85D4E"/>
          <circle cx="${cx + 7}" cy="${cy + 6}" r="2.5" fill="#333" stroke="#666" stroke-width="0.5"/>
          <circle cx="${cx + 7}" cy="${cy + 6}" r="1.2" fill="#E85D4E"/>
          <!-- Headlight -->
          <circle cx="${cx - 13}" cy="${cy - 1}" r="1" fill="#333"/>
          <!-- Side mirror -->
          <rect x="${cx - 15}" y="${cy - 3}" width="2" height="1.5" rx="0.5" fill="#333"/>
          <!-- Blue directional triangle (front of bus) -->
          <polygon points="${cx + 15},${cy} ${cx + 11},${cy - 4} ${cx + 11},${cy + 4}" fill="#4285F4" stroke="#3367D6" stroke-width="0.5"/>
        </g>
      </svg>
    `;

    const pixelW = Math.round(vbW * scale);
    const pixelH = Math.round(vbH * scale);

    return {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg.trim()),
      anchor: { x: Math.round(cx * scale), y: Math.round(cy * scale) },
      size: { width: pixelW, height: pixelH }
    };
  }

  /**
   * Format date and time for API (YYYYMMDD HH:MM)
   */
  private formatTimeForAPI(
    date: Date,
    time: { hour: number; minute: number; period: 'AM' | 'PM' }
  ): string {
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

    // Remove any existing map popup (stop or bus)
    closeMapPopup();

    const popup = document.createElement('div');
    popup.id = MAP_POPUP_ID;
    popup.className = 'map-popup';

    // Header
    const header = document.createElement('div');
    header.className = 'map-popup__header';
    header.innerHTML = `
      <span class="material-icons-outlined map-popup__icon map-popup__icon--bus">directions_bus</span>
      <strong class="map-popup__title">Bus ${vehicle.vid}</strong>
      <button class="map-popup__close" aria-label="Close">&times;</button>
    `;
    popup.appendChild(header);

    // Subheader — route
    const subheader = document.createElement('div');
    subheader.className = 'map-popup__subheader';
    subheader.textContent = `Route ${vehicle.routeId}`;
    popup.appendChild(subheader);

    // Detail rows
    const details = document.createElement('div');
    details.className = 'map-popup__details';

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

    // Next stop
    if (vehicle.currentStopId) {
      this.addDetailRow(details, 'Next Stop', `#${vehicle.currentStopId}`);
    }

    // Last update
    const lastUpdate = new Date(vehicle.lastUpdate);
    const secsAgo = Math.round((Date.now() - lastUpdate.getTime()) / 1000);
    const timeText =
      secsAgo < 60 ? `${secsAgo}s ago` : `${Math.round(secsAgo / 60)}m ago`;

    if (vehicle.source === 'live') {
      this.addUpdatedRowWithDot(details, timeText);
    } else {
      this.addDetailRow(details, 'Updated', timeText);
    }

    popup.appendChild(details);

    // Source badge — only for scheduled (live uses the green dot instead)
    if (vehicle.source !== 'live') {
      const badge = document.createElement('div');
      badge.className = `map-popup__source map-popup__source--${vehicle.source}`;
      badge.textContent = 'SCHEDULED';
      popup.appendChild(badge);
    }

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'map-popup__actions';
    actions.innerHTML = `
      <button class="map-popup__action-btn map-popup__action-btn--report">
        <span class="material-icons-outlined">warning_amber</span>
        <strong>Report</strong>
      </button>
      <button class="map-popup__action-btn map-popup__action-btn--check">
        <span class="material-icons-outlined">task_alt</span>
        <strong>Check</strong>
      </button>
    `;
    popup.appendChild(actions);

    // Append to map container
    const container = document.querySelector('.map-container');
    if (container) {
      container.appendChild(popup);
    }

    // Close button
    const closeBtn = popup.querySelector('.map-popup__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => closeMapPopup());
    }

    // Report button → open bus report form
    const reportBtn = popup.querySelector('.map-popup__action-btn--report');
    if (reportBtn) {
      reportBtn.addEventListener('click', () => {
        document.dispatchEvent(
          new CustomEvent('busReport', {
            detail: { vid: vehicle.vid, routeId: vehicle.routeId }
          })
        );
      });
    }
  }

  /**
   * Add the "Updated" row with a green live dot before the time text.
   */
  private addUpdatedRowWithDot(container: HTMLElement, timeText: string): void {
    const row = document.createElement('div');
    row.className = 'map-popup__row';

    const lbl = document.createElement('span');
    lbl.className = 'map-popup__label';
    lbl.textContent = 'Updated';

    const val = document.createElement('span');
    val.className = 'map-popup__value map-popup__value--live';
    val.innerHTML = `<span class="map-popup__live-dot"></span>${timeText}`;

    row.appendChild(lbl);
    row.appendChild(val);
    container.appendChild(row);
  }

  /**
   * Add a key-value detail row to the popup.
   */
  private addDetailRow(
    container: HTMLElement,
    label: string,
    value: string
  ): void {
    const row = document.createElement('div');
    row.className = 'map-popup__row';

    const lbl = document.createElement('span');
    lbl.className = 'map-popup__label';
    lbl.textContent = label;

    const val = document.createElement('span');
    val.className = 'map-popup__value';
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
      case 'INCOMING_AT':
        return 'Arriving at stop';
      case 'STOPPED_AT':
        return 'Stopped at stop';
      case 'IN_TRANSIT_TO':
        return 'In transit to next stop';
      default:
        return status;
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
