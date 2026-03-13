import {
  IMapProvider,
  IMapMarker,
  IMapPolyline,
  IMapMarkerOptions,
  IMapPolylineOptions,
  ILatLng,
  IConfig
} from '../../../common/map.interface';

/**
 * Google Maps implementation of IMapProvider.
 *
 * All feature code (route overlays, bus markers, stop markers) should depend
 * on IMapProvider, not on this class directly. To swap providers, create a new
 * class implementing IMapProvider and change the instantiation site.
 */
export class GoogleMapProvider implements IMapProvider {
  private map!: google.maps.Map;
  private markers: Map<string, google.maps.Marker> = new Map();
  private polylines: Map<string, google.maps.Polyline> = new Map();
  private markerIdCounter = 0;
  private polylineIdCounter = 0;

  async initialize(container: HTMLElement, config: IConfig): Promise<void> {
    await this.loadScript(config.apiKey);
    this.map = new google.maps.Map(container, {
      center: { lat: config.lat, lng: config.lon },
      zoom: config.defaultZoom,
      gestureHandling: 'greedy', // Allow single-finger drag on mobile
      zoomControl: false, // Disable default zoom controls (we have custom ones)
      mapTypeControl: false, // Disable map type selector
      streetViewControl: false, // Disable street view pegman
      fullscreenControl: false, // Disable fullscreen button
      zoomControlOptions: {
        position: google.maps.ControlPosition.RIGHT_BOTTOM
      }
    });
  }

  setCenter(position: ILatLng): void {
    this.map.setCenter(position);
  }

  setZoom(level: number): void {
    this.map.setZoom(level);
  }

  getCenter(): ILatLng {
    const center = this.map.getCenter()!;
    return { lat: center.lat(), lng: center.lng() };
  }

  getZoom(): number {
    return this.map.getZoom()!;
  }

  addMarker(options: IMapMarkerOptions): IMapMarker {
    const id = `marker-${this.markerIdCounter++}`;
    const marker = new google.maps.Marker({
      position: options.position,
      map: this.map,
      title: options.title,
      draggable: options.draggable,
      icon: options.icon
    });
    this.markers.set(id, marker);

    return {
      id,
      setPosition: (pos: ILatLng) => marker.setPosition(pos),
      animatePosition: (pos: ILatLng, durationMs = 1000) => {
        const start = marker.getPosition();
        if (!start) { marker.setPosition(pos); return; }
        const startLat = start.lat();
        const startLng = start.lng();
        const dLat = pos.lat - startLat;
        const dLng = pos.lng - startLng;
        // Skip animation for tiny moves or teleports (> ~5 km)
        if (Math.abs(dLat) < 0.00001 && Math.abs(dLng) < 0.00001) return;
        if (Math.abs(dLat) > 0.05 || Math.abs(dLng) > 0.05) {
          marker.setPosition(pos); return;
        }
        const t0 = performance.now();
        const step = (now: number) => {
          const elapsed = now - t0;
          const progress = Math.min(elapsed / durationMs, 1);
          // Ease-out cubic for a natural deceleration feel
          const ease = 1 - Math.pow(1 - progress, 3);
          marker.setPosition({
            lat: startLat + dLat * ease,
            lng: startLng + dLng * ease
          });
          if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      },
      setIcon: (icon: string) => marker.setIcon(icon),
      setVisible: (visible: boolean) => marker.setVisible(visible),
      onClick: (callback: () => void) => {
        google.maps.event.addListener(marker, 'click', callback);
      },
      remove: () => {
        marker.setMap(null);
        this.markers.delete(id);
      }
    };
  }

  addPolyline(options: IMapPolylineOptions): IMapPolyline {
    const id = `polyline-${this.polylineIdCounter++}`;
    const polyline = new google.maps.Polyline({
      path: options.path,
      strokeColor: options.color ?? '#0000FF',
      strokeWeight: options.weight ?? 3,
      strokeOpacity: options.opacity ?? 1.0,
      map: this.map
    });
    this.polylines.set(id, polyline);

    return {
      id,
      setVisible: (visible: boolean) => polyline.setVisible(visible),
      remove: () => {
        polyline.setMap(null);
        this.polylines.delete(id);
      }
    };
  }

  clearMarkers(): void {
    this.markers.forEach((m) => m.setMap(null));
    this.markers.clear();
  }

  clearPolylines(): void {
    this.polylines.forEach((p) => p.setMap(null));
    this.polylines.clear();
  }

  clearAll(): void {
    this.clearMarkers();
    this.clearPolylines();
  }

  onMapClick(callback: (position: ILatLng) => void): void {
    this.map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        callback({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      }
    });
  }

  fitBounds(bounds: { north: number; south: number; east: number; west: number }): void {
    const googleBounds = new google.maps.LatLngBounds(
      { lat: bounds.south, lng: bounds.west },
      { lat: bounds.north, lng: bounds.east }
    );
    this.map.fitBounds(googleBounds);
  }

  /**
   * Dynamically loads the Google Maps JavaScript SDK into the page.
   * Resolves immediately if already loaded.
   */
  private loadScript(apiKey: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof google !== 'undefined' && google.maps) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error('Failed to load Google Maps SDK'));
      document.head.appendChild(script);
    });
  }
}
