/**
 * Route Data Service
 * Loads and manages CMU Shuttle route data from CSV files
 */

import { fetchCSV } from '../utils/csv-parser';

// Data interfaces matching CSV structure
export interface IStop {
  order: number;
  stop_id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface IShapePoint {
  index: number;
  lat: number;
  lng: number;
}

export interface ISegment {
  segment_index: number;
  from_stop_id: string;
  to_stop_id: string;
  distance_meters: number;
  duration_seconds: number;
}

export interface IRouteData {
  stops: IStop[];
  shape: IShapePoint[];
  segments: ISegment[];
}

// Route color mapping
export const ROUTE_COLORS: { [key: string]: string } = {
  CMU_Shuttle: '#C41230', // CMU red
  Route_A: '#0000A0', // Dark blue
  Route_B: '#00A000', // Green
  Route_C: '#FF8C00', // Dark orange
  Route_D: '#8B008B' // Dark magenta
};

/**
 * Route Data Service for loading and managing route data
 */
export class RouteDataService {
  private static instance: RouteDataService;
  private routeData: IRouteData | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): RouteDataService {
    if (!RouteDataService.instance) {
      RouteDataService.instance = new RouteDataService();
    }
    return RouteDataService.instance;
  }

  /**
   * Load route data from CSV files
   */
  async loadRouteData(): Promise<IRouteData> {
    try {
      console.log('Loading route data from CSV files...');

      const [stops, shape, segments] = await Promise.all([
        fetchCSV<IStop>('/assets/stops.csv'),
        fetchCSV<IShapePoint>('/assets/shape.csv'),
        fetchCSV<ISegment>('/assets/segments.csv')
      ]);

      this.routeData = { stops, shape, segments };
      console.log(
        `Loaded ${stops.length} stops, ${shape.length} shape points, ${segments.length} segments`
      );

      return this.routeData;
    } catch (error) {
      console.error('Failed to load route data:', error);
      throw error;
    }
  }

  /**
   * Get loaded route data
   */
  getRouteData(): IRouteData | null {
    return this.routeData;
  }

  /**
   * Get stops as array of {lat, lng} for mapping
   */
  getStopsAsLatLng(): Array<{ lat: number; lng: number }> {
    if (!this.routeData) return [];
    return this.routeData.stops.map((stop) => ({
      lat: stop.lat,
      lng: stop.lng
    }));
  }

  /**
   * Get shape path as array of {lat, lng} for polyline
   */
  getShapeAsLatLng(): Array<{ lat: number; lng: number }> {
    if (!this.routeData) return [];
    return this.routeData.shape.map((point) => ({
      lat: point.lat,
      lng: point.lng
    }));
  }

  /**
   * Get route bounds for map centering
   */
  getRouteBounds(): {
    north: number;
    south: number;
    east: number;
    west: number;
  } | null {
    if (!this.routeData || this.routeData.shape.length === 0) return null;

    const lats = this.routeData.shape.map((p) => p.lat);
    const lngs = this.routeData.shape.map((p) => p.lng);

    return {
      north: Math.max(...lats),
      south: Math.min(...lats),
      east: Math.max(...lngs),
      west: Math.min(...lngs)
    };
  }
}
