// Tripshot API utilities: timeout-wrapped fetch, polyline decoder, response interfaces
// Extracted from tripshot.service.ts to reduce unit size (Sigrid Item 10)

const TIMEOUT_MS = 5000; // 5 seconds timeout for API requests

export const TRIPSHOT_BASE_URL = 'https://cmu.tripshot.com/v2/p';

// Interfaces for Tripshot API responses

export interface TripshotLocation {
  lt: number; // latitude
  lg: number; // longitude
}

export interface TripshotStop {
  stopId: string;
  name: string;
  location: TripshotLocation;
}

export interface TripshotViaStop {
  ViaStop: {
    stop: TripshotStop;
  };
}

export interface TripshotStep {
  polyline: string; // Google encoded polyline
  distanceMeters: number;
  durationSec: number;
}

export interface TripshotLeg {
  startPoint: { NavViaStop: { stopId: string } };
  endPoint: { NavViaStop: { stopId: string } };
  steps: TripshotStep[];
}

export interface TripshotRide {
  vias: TripshotViaStop[];
}

export interface TripshotServiceData {
  legs: TripshotLeg[];
}

export interface TripshotRouteResponse {
  rides: TripshotRide[];
  services: TripshotServiceData[];
}

/**
 * Decode Google's encoded polyline algorithm to lat/lng coordinates
 * Ported from Python implementation provided by user
 */

function decodeNextValue(str: string, index: number): { value: number; index: number } {
  let shift = 0;
  let result = 0;
  while (true) {
    const b = str.charCodeAt(index) - 63;
    index += 1;
    result |= (b & 0x1f) << shift;
    shift += 5;
    if (b < 0x20) break;
  }
  const value = result & 1 ? ~(result >> 1) : result >> 1;
  return { value, index };
}

export function decodePolyline(
  polylineStr: string
): Array<{ lat: number; lng: number }> {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: Array<{ lat: number; lng: number }> = [];

  while (index < polylineStr.length) {
    const latDecode = decodeNextValue(polylineStr, index);
    lat += latDecode.value;
    index = latDecode.index;

    const lngDecode = decodeNextValue(polylineStr, index);
    lng += lngDecode.value;
    index = lngDecode.index;

    coordinates.push({
      lat: lat / 1e5,
      lng: lng / 1e5
    });
  }

  return coordinates;
}

/**
 * Fetch with timeout to prevent hanging requests
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeout);
    return response;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}
