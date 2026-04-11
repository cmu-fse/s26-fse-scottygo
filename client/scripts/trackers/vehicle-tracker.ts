/**
 * Vehicle Tracker
 * Manages real-time vehicle position updates and rendering
 * Polls backend every 30 seconds to match the GTFS-RT feed refresh rate
 */

/** Haversine distance in miles between two lat/lon points (R9). */
function haversineDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

import axios from 'axios';
import type { IMapProvider, IMapMarker } from '../../../common/map.interface';
import type { IVehicle } from '../../../common/transit.interface';
import { MapStateManager } from '../state/map-state';
import { MAP_POPUP_ID, closeMapPopup } from '../utils/map-popup';
import { showToast } from '../utils/toast';

export class VehicleTracker {
  private static instance: VehicleTracker;
  private mapProvider: IMapProvider | null = null;
  private stateManager: MapStateManager;
  private isAdminProximityBypass = false;
  private userLocation: { lat: number; lng: number } | null = null;

  private pollingInterval: number | null = null;
  private currentRouteId: string | null = null;
  private currentRouteColor = '#4285F4';
  private multiRouteIds: string[] = [];
  private multiRoutePollingInterval: number | null = null;
  private vehicleMarkers = new Map<string, IMapMarker>(); // vehicleId → marker
  private vehicleData = new Map<string, IVehicle>(); // vehicleId → vehicle data for icon rebuilds
  private hasShownStaticToast = false;
  private hasShownNoVehiclesToast = false;
  private currentZoom = 14;
  private openPopupVehicleId: string | null = null;
  private popupUpdatedInterval: number | null = null;

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
   * Enable proximity-check bypass for administrators.
   */
  setAdminProximityBypass(enabled: boolean): void {
    this.isAdminProximityBypass = enabled;
  }

  /**
   * Update the cached user location (called from map.ts watchPosition).
   */
  updateUserLocation(position: { lat: number; lng: number }): void {
    this.userLocation = position;
  }

  /**
   * Start polling for vehicle positions on a specific route.
   * @param routeColor Hex color of the route used to tint the bus icon.
   */
  startPolling(routeId: string, routeColor = '#4285F4'): void {
    this.currentRouteColor = routeColor;
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

    this.stopMultiRoutePolling();

    // Clear all vehicle markers
    this.clearVehicles();
    this.currentRouteId = null;
    this.hasShownStaticToast = false;
    this.hasShownNoVehiclesToast = false;
  }

  /**
   * Start polling vehicle positions for multiple routes simultaneously.
   * Used during directions mode to show selected bus locations.
   */
  startMultiRoutePolling(routeIds: string[]): void {
    if (!this.mapProvider || routeIds.length === 0) return;

    this.stopMultiRoutePolling();
    this.multiRouteIds = routeIds;

    // Initial fetch
    this.updateMultiRoutePositions();

    // Poll every 30 seconds
    this.multiRoutePollingInterval = window.setInterval(() => {
      this.updateMultiRoutePositions();
    }, 30000);

    console.log(
      `Started multi-route vehicle polling for routes: ${routeIds.join(', ')}`
    );
  }

  /**
   * Stop multi-route polling (called by stopPolling or independently).
   */
  private stopMultiRoutePolling(): void {
    if (this.multiRoutePollingInterval !== null) {
      clearInterval(this.multiRoutePollingInterval);
      this.multiRoutePollingInterval = null;
    }
    this.multiRouteIds = [];
  }

  /**
   * Fetch and render vehicle positions for all multi-route IDs.
   */
  private async updateMultiRoutePositions(): Promise<void> {
    if (!this.mapProvider || this.multiRouteIds.length === 0) return;

    const token = localStorage.getItem('token');

    for (const routeId of this.multiRouteIds) {
      try {
        const response = await axios.get(`/transit/vehicles/${routeId}`, {
          headers: { Authorization: `Bearer ${token}` },
          validateStatus: () => true
        });

        if (
          response.status === 200 &&
          response.data.name === 'VehiclesLocated'
        ) {
          const vehicles: IVehicle[] = response.data.payload || [];
          this.renderVehicles(vehicles);
        }
      } catch (error) {
        console.error(`Error fetching vehicles for route ${routeId}:`, error);
      }
    }
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
        if (this.openPopupVehicleId === vid) {
          this.closeVehiclePopup();
        }
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
    this.closeVehiclePopup();
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
   * Create a bus icon tinted with the route color.
   *
   * Design notes:
   * - The bus is drawn as a side-view facing RIGHT (+x = East) at origin.
   * - For eastward headings (0–179°) the group is simply rotated.
   * - For westward headings (180–359°) the bus is mirrored horizontally
   *   (scale -1 on x) and then rotated by a corrected angle so the front
   *   still faces the direction of travel without the icon appearing
   *   upside-down (which a plain 180° rotation would cause).
   * - The 40×40 viewBox gives enough clearance at every rotation angle so
   *   no part of the icon is clipped by the bounding box.
   */
  private createBusIcon(vehicle: IVehicle): {
    url: string;
    anchor: { x: number; y: number };
    size: { width: number; height: number };
  } {
    // Detoured buses keep an amber override so they stand out on the map.
    const color = vehicle.isDetoured ? '#FFA500' : this.currentRouteColor;
    const scale = Math.max(
      0.5,
      Math.min(2.5, (this.currentZoom - 10) * 0.3 + 1)
    );

    // Normalise heading to [0, 360).
    const heading = (((vehicle.heading ?? 0) % 360) + 360) % 360;

    // Westward headings (180–359°): mirror the bus so the front stays
    // visually "correct" (windows above chassis, headlight at nose).
    // Eastward headings (0–179°): standard rotation only.
    const flip = heading >= 180;

    // Rotation angle that makes the bus front point toward `heading`.
    //
    // Without flip: front is +x; rotate(heading-90) maps +x → compass heading.
    // With flip:    after scale(-1,1) the effective front is -x;
    //              rotate(-(heading+90)) then maps -x → compass heading.
    const rotDeg = flip ? -(heading + 90) : heading - 90;

    // 40×40 viewBox; bus max radius from centre ≈ 15 px → well inside 20 px margin.
    const vbSize = 40;
    const cx = vbSize / 2; // 20
    const cy = vbSize / 2; // 20
    const sz = Math.round(vbSize * scale);

    // Build the SVG transform that centres the bus and applies mirror + rotation.
    // Transform order (SVG applies left → right on the coordinate system):
    //   translate  → move origin to the icon centre on screen
    //   scale      → optional horizontal mirror for westward headings
    //   rotate     → point the bus nose toward the heading
    const groupTransform = flip
      ? `translate(${cx},${cy}) scale(-1,1) rotate(${rotDeg})`
      : `translate(${cx},${cy}) rotate(${rotDeg})`;

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}" viewBox="0 0 ${vbSize} ${vbSize}">` +
      `<g transform="${groupTransform}">` +
      // Bus body — main fill is the route colour
      `<rect x="-12" y="-5" width="24" height="10" rx="2" fill="${color}" stroke="rgba(0,0,0,0.35)" stroke-width="0.6"/>` +
      // Front accent panel (covers the right side to mark the nose)
      `<rect x="9" y="-5" width="3" height="10" fill="rgba(0,0,0,0.18)"/>` +
      // Windshield (front pane, right side of body)
      `<rect x="4.5" y="-3.5" width="5" height="7" rx="1" fill="rgba(210,235,255,0.9)" stroke="rgba(0,0,0,0.25)" stroke-width="0.4"/>` +
      // Passenger side window 1
      `<rect x="-1.5" y="-3.5" width="3.5" height="5" rx="0.5" fill="rgba(210,235,255,0.75)" stroke="rgba(0,0,0,0.2)" stroke-width="0.3"/>` +
      // Passenger side window 2
      `<rect x="-7" y="-3.5" width="3.5" height="5" rx="0.5" fill="rgba(210,235,255,0.75)" stroke="rgba(0,0,0,0.2)" stroke-width="0.3"/>` +
      // Headlight at nose
      `<circle cx="12" cy="0" r="1.3" fill="rgba(255,255,200,0.95)"/>` +
      // Front wheel
      `<rect x="5" y="4.5" width="4.5" height="2.5" rx="0.8" fill="rgba(30,30,30,0.85)"/>` +
      // Rear wheel
      `<rect x="-9.5" y="4.5" width="4.5" height="2.5" rx="0.8" fill="rgba(30,30,30,0.85)"/>` +
      `</g>` +
      `</svg>`;

    return {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
      anchor: { x: Math.round(cx * scale), y: Math.round(cy * scale) },
      size: { width: sz, height: sz }
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
    showToast(message);
  }

  /**
   * Show info popup for a clicked bus marker.
   * Reads the latest stored data for the vehicle.
   */
  private showVehiclePopup(vid: string): void {
    const vehicle = this.vehicleData.get(vid);
    if (!vehicle) return;

    // Remove any existing map popup (stop or bus)
    this.closeVehiclePopup();
    this.openPopupVehicleId = vid;

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
    const timeText = this.formatElapsedTime(vehicle.lastUpdate);

    if (vehicle.source === 'live') {
      this.addUpdatedRowWithDot(details, timeText);
    } else {
      this.addDetailRow(
        details,
        'Updated',
        timeText,
        'map-popup__updated-time'
      );
    }

    popup.appendChild(details);

    // Source badge — only for scheduled (live uses the green dot instead)
    if (vehicle.source !== 'live') {
      const badge = document.createElement('div');
      badge.className = `map-popup__source map-popup__source--${vehicle.source}`;
      badge.textContent = 'SCHEDULED';
      popup.appendChild(badge);
    }

    // Action buttons — Report only available for live buses (server validates against GTFS-RT)
    const actions = document.createElement('div');
    actions.className = 'map-popup__actions';
    const reportBtnHtml =
      vehicle.source === 'live'
        ? `<button class="map-popup__action-btn map-popup__action-btn--report">
           <span class="material-icons-outlined">warning_amber</span>
           <strong>Report</strong>
         </button>`
        : `<button class="map-popup__action-btn map-popup__action-btn--report" disabled title="Reporting only available for live buses">
           <span class="material-icons-outlined">warning_amber</span>
           <strong>Report</strong>
         </button>`;
    actions.innerHTML = `
      ${reportBtnHtml}
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
      closeBtn.addEventListener('click', () => this.closeVehiclePopup());
    }

    // Report button — proximity check using cached location (R9, R10, A16, A17)
    const reportBtn = popup.querySelector(
      '.map-popup__action-btn--report'
    ) as HTMLButtonElement | null;
    if (reportBtn) {
      reportBtn.addEventListener('click', () => {
        if (!this.userLocation) {
          this.showToast(
            'Location access is required to submit a bus report. Please enable location services.'
          );
          return;
        }

        const userLat = this.userLocation.lat;
        const userLon = this.userLocation.lng;
        const latestVehicle = this.vehicleData.get(vid) ?? vehicle;
        if (!this.isAdminProximityBypass) {
          const dist = haversineDistanceMiles(
            userLat,
            userLon,
            latestVehicle.lat,
            latestVehicle.lon
          );
          if (dist > 0.5) {
            this.showToast('You need to be near this bus to submit a report.');
            return;
          }
        }
        document.dispatchEvent(
          new CustomEvent('busReport', {
            detail: {
              vid: latestVehicle.vid,
              routeId: latestVehicle.routeId,
              lat: userLat,
              lon: userLon
            }
          })
        );
      });
    }

    // Check button — navigate to notifications page pre-filtered by bus (A3)
    const checkBtn = popup.querySelector('.map-popup__action-btn--check');
    if (checkBtn) {
      checkBtn.addEventListener('click', () => {
        window.location.href = `/notifications?bus=${encodeURIComponent(vehicle.vid)}`;
      });
    }

    this.startPopupUpdatedTicker();
    this.refreshOpenPopupUpdatedTime();
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
    val.innerHTML = `<span class="map-popup__live-dot"></span><span class="map-popup__updated-time">${timeText}</span>`;

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
    value: string,
    valueClass?: string
  ): void {
    const row = document.createElement('div');
    row.className = 'map-popup__row';

    const lbl = document.createElement('span');
    lbl.className = 'map-popup__label';
    lbl.textContent = label;

    const val = document.createElement('span');
    val.className = 'map-popup__value';
    if (valueClass) {
      val.classList.add(valueClass);
    }
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

  private formatElapsedTime(lastUpdate: string): string {
    const updatedAt = new Date(lastUpdate);
    const secsAgo = Math.max(
      0,
      Math.round((Date.now() - updatedAt.getTime()) / 1000)
    );
    return secsAgo < 60
      ? `${secsAgo}s ago`
      : `${Math.round(secsAgo / 60)}m ago`;
  }

  private startPopupUpdatedTicker(): void {
    this.stopPopupUpdatedTicker();
    this.popupUpdatedInterval = window.setInterval(() => {
      this.refreshOpenPopupUpdatedTime();
    }, 1000);
  }

  private stopPopupUpdatedTicker(): void {
    if (this.popupUpdatedInterval !== null) {
      clearInterval(this.popupUpdatedInterval);
      this.popupUpdatedInterval = null;
    }
  }

  private refreshOpenPopupUpdatedTime(): void {
    if (!this.openPopupVehicleId) return;

    const popup = document.getElementById(MAP_POPUP_ID);
    if (!popup) {
      this.openPopupVehicleId = null;
      this.stopPopupUpdatedTicker();
      return;
    }

    const vehicle = this.vehicleData.get(this.openPopupVehicleId);
    if (!vehicle) return;

    const updatedNode = popup.querySelector<HTMLElement>(
      '.map-popup__updated-time'
    );
    if (updatedNode) {
      updatedNode.textContent = this.formatElapsedTime(vehicle.lastUpdate);
    }
  }

  private closeVehiclePopup(): void {
    this.openPopupVehicleId = null;
    this.stopPopupUpdatedTicker();
    closeMapPopup();
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
