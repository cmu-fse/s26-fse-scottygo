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
