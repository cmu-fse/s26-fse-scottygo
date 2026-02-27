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
