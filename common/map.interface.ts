// Interfaces for Google Maps API configuration and transit response wrapper

export interface IConfig {
  apiKey: string;
  lat: number; // Default center latitude
  lon: number; // Default center longitude
  defaultZoom: number;
}

// Generic success response for transit endpoints
// Extends the base success pattern with a source field for live/static data
export interface ITransitSuccess<T> {
  name: string;
  desc?: string;
  source: 'live' | 'static'; // Indicates if data is real-time or from local cache
  payload: T | null;
}

// Map abstraction layer interfaces
// These decouple the app from any specific map SDK (Google Maps, Leaflet, etc.)

export interface ILatLng {
  lat: number;
  lng: number;
}

export interface IMapMarkerOptions {
  position: ILatLng;
  title?: string;
  icon?: string;
  draggable?: boolean;
}

export interface IMapPolylineOptions {
  path: ILatLng[];
  color?: string;
  weight?: number;
  opacity?: number;
}

export interface IMapMarker {
  id: string;
  setPosition(position: ILatLng): void;
  animatePosition(position: ILatLng, durationMs?: number): void;
  setIcon(icon: string): void;
  setVisible(visible: boolean): void;
  onClick(callback: () => void): void;
  remove(): void;
}

export interface IMapPolyline {
  id: string;
  setVisible(visible: boolean): void;
  remove(): void;
}

export interface IMapProvider {
  initialize(container: HTMLElement, config: IConfig): Promise<void>;
  setCenter(position: ILatLng): void;
  setZoom(level: number): void;
  getCenter(): ILatLng;
  getZoom(): number;
  addMarker(options: IMapMarkerOptions): IMapMarker;
  addPolyline(options: IMapPolylineOptions): IMapPolyline;
  clearMarkers(): void;
  clearPolylines(): void;
  clearAll(): void;
  onMapClick(callback: (position: ILatLng) => void): void;
  fitBounds(bounds: { north: number; south: number; east: number; west: number }): void;
}
