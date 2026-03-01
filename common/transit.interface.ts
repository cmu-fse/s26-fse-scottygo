// Interfaces for PRT transit data (routes, vehicles, stops, predictions, detours)

export interface IRoute {
  id: string; // e.g., "P1", "61C"
  name: string; // Short description
  system: 'PRT' | 'CMU';
  color: string; // Hex code for map rendering
  directions: string[]; // e.g., ["INBOUND", "OUTBOUND"]
  activeStatus: boolean; // Currently operational?
  operatingDays: number[]; // 0-6 (Sunday-Saturday)
}

export interface IVehicle {
  vid: string; // Vehicle ID
  lat: number; // Latitude
  lon: number; // Longitude
  routeId: string;
  heading: number;
  source: 'live' | 'static'; // "live" from PRT API, "static" from local cache
  lastUpdate: string; // ISO Timestamp
  isDetoured: boolean;
  delay?: number;
}

export interface IStop {
  stopId: string;
  stopName: string; // Stop Name
  lat: number;
  lon: number;
  routes?: string[];
  dtradd: string[];
  dtrrem: string[];
}

export interface IPrediction {
  stopId: string;
  routeId: string;
  vid?: string;
  predictedArrivalTime: number;
  isDelayed: boolean;
  minutes: number;
}

export interface IDetour {
  id: string;
  description: string;
  startdt: string; // Start date and time (ISO string)
  enddt: string; // End date and time (ISO string)
}

export interface IPattern {
  direction: string; // e.g. "INBOUND" or "OUTBOUND"
  path: { lat: number; lng: number }[]; // Ordered sequence of points forming the route geometry
}

// ── Bulk Transit Data ──────────────────────────────────────────────────
// Single-payload response containing all static transit data so the client
// can do every bit of filtering on the frontend without extra API calls.

export interface IBulkTransitData {
  routes: IRoute[];
  /** Patterns keyed by routeId, e.g. { "61C": [{ direction, path }] } */
  patterns: Record<string, IPattern[]>;
  /** Stops keyed by "routeId:DIRECTION", e.g. { "61C:INBOUND": [stop, …] } */
  stops: Record<string, IStop[]>;
}

// ── Transit Cache ──────────────────────────────────────────────────────
// Cached TrueTime data stored in MongoDB to respect the daily API limit.

export type ITransitCacheType = 'routes' | 'stops' | 'patterns' | 'detours';

export interface ITransitCache {
  cacheKey: string; // e.g. "routes", "stops:61C:INBOUND", "patterns:61C", "detours:61C"
  dataType: ITransitCacheType;
  data: IRoute[] | IStop[] | IPattern[] | IDetour[];
  lastUpdated: Date;
  expiresAt: Date;
}