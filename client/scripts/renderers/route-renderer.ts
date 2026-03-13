/**
 * Route Renderer
 * Handles rendering route geometries, stops, and managing their visibility
 */

import type { IMapProvider, IMapPolyline, IMapMarker } from '../../../common/map.interface';
import type { IRoute, IStop } from '../../../common/transit.interface';

// GeoJSON type definitions
interface GeoJSONGeometry {
  type: string;
  coordinates: number[][];
}

interface GeoJSONFeature {
  type: string;
  geometry?: GeoJSONGeometry;
  properties?: Record<string, unknown>;
}

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

type GeoJSON = GeoJSONFeature | GeoJSONFeatureCollection;

// Custom route path format from backend (exported for use in other modules)
export interface RoutePathSegment {
  direction: string;
  path: Array<{ lat: number; lng: number }>;
}

// Union type for route data (exported for use in other modules)
export type RouteData = GeoJSON | RoutePathSegment[];

export class RouteRenderer {
  private static instance: RouteRenderer;
  private mapProvider: IMapProvider | null = null;
  
  // Store references to map elements
  private routePolylines = new Map<string, IMapPolyline[]>(); // routeId_direction → polylines
  private stopMarkers = new Map<string, IMapMarker[]>();      // routeId_direction → markers
  private routeColors = new Map<string, string>();            // routeId → color

  private constructor() {}

  static getInstance(): RouteRenderer {
    if (!RouteRenderer.instance) {
      RouteRenderer.instance = new RouteRenderer();
    }
    return RouteRenderer.instance;
  }

  /**
   * Initialize with map provider
   */
  initialize(mapProvider: IMapProvider): void {
    this.mapProvider = mapProvider;
  }

  /**
   * Render route geometry from GeoJSON Feature or custom route format
   */
  renderRouteGeometry(routeId: string, routeData: RouteData, color: string): void {
    if (!this.mapProvider) {
      console.error('Map provider not initialized');
      return;
    }

    // Store color for this route
    this.routeColors.set(routeId, color);

    // Clear existing polylines for this route
    this.clearRoutePolylines(routeId);

    const polylines: IMapPolyline[] = [];

    // Validate route data structure
    if (!routeData || typeof routeData !== 'object') {
      console.warn(`Invalid route data for route ${routeId}:`, routeData);
      return;
    }

    // Check if it's the custom format (array of direction/path objects)
    if (Array.isArray(routeData)) {
      // Custom format: [{direction: "INBOUND", path: [{lat, lng}, ...]}, ...]
      routeData.forEach((segment: RoutePathSegment) => {
        if (segment.path && Array.isArray(segment.path) && segment.path.length > 0) {
          const polyline = this.mapProvider!.addPolyline({
            path: segment.path,
            color: color,
            weight: 4,
            opacity: 1.0
          });
          
          // Store with direction-specific key
          const directionKey = `${routeId}_${segment.direction}`;
          if (!this.routePolylines.has(directionKey)) {
            this.routePolylines.set(directionKey, []);
          }
          this.routePolylines.get(directionKey)!.push(polyline);
        }
      });
    } else {
      // GeoJSON format
      const geoJson = routeData as GeoJSON;
      
      // Handle both Feature and FeatureCollection
      const features: GeoJSONFeature[] = 
        geoJson.type === 'FeatureCollection' 
          ? (geoJson as GeoJSONFeatureCollection).features 
          : [geoJson as GeoJSONFeature];

      if (!features || !Array.isArray(features)) {
        console.warn(`No valid features found for route ${routeId}`);
        return;
      }

      features.forEach((feature: GeoJSONFeature) => {
        // Validate feature structure
        if (!feature || !feature.geometry || typeof feature.geometry !== 'object') {
          console.warn(`Invalid feature geometry for route ${routeId}`);
          return;
        }

        if (feature.geometry.type === 'LineString') {
          // Validate coordinates
          if (!feature.geometry.coordinates || !Array.isArray(feature.geometry.coordinates)) {
            console.warn(`Invalid coordinates for route ${routeId}`);
            return;
          }

          // GeoJSON uses [lng, lat], need to convert to {lat, lng}
          const path = feature.geometry.coordinates.map((coord: number[]) => ({
            lat: coord[1],
            lng: coord[0]
          }));

          const polyline = this.mapProvider!.addPolyline({
            path,
            color: color,
            weight: 4,
            opacity: 1.0
          });

          polylines.push(polyline);
        }
      });
      
      // For GeoJSON format, store without direction (or use a default key)
      if (polylines.length > 0) {
        this.routePolylines.set(routeId, polylines);
      }
    }

    console.log(`Rendered route ${routeId} with polylines`);
  }

  /**
   * Render stop markers for a route
   * @param onStopClick  Optional callback invoked with the stop when its marker is clicked
   */
  renderStopMarkers(
    routeId: string,
    stops: IStop[],
    direction: string,
    onStopClick?: (stop: IStop) => void
  ): void {
    if (!this.mapProvider) {
      console.error('Map provider not initialized');
      return;
    }

    const key = `${routeId}_${direction}`;
    
    // Clear existing markers for this route+direction
    this.clearStopMarkers(key);

    const color = this.routeColors.get(routeId) || '#FF0000';
    const dotIcon = this.createDotMarker(color, 10);

    const markers: IMapMarker[] = [];

    stops.forEach((stop, index) => {
      const marker = this.mapProvider!.addMarker({
        position: { lat: stop.lat, lng: stop.lon },
        title: `${stop.stopName} (Stop #${index + 1})`,
        icon: dotIcon
      });

      if (onStopClick) {
        marker.onClick(() => onStopClick(stop));
      }

      markers.push(marker);
    });

    this.stopMarkers.set(key, markers);
    console.log(`Rendered ${markers.length} stop markers for route ${routeId} ${direction}`);
  }

  /**
   * Hide a specific route (make invisible but keep in memory)
   */
  hideRoute(routeId: string): void {
    // Check for direction-specific keys first
    const inboundKey = `${routeId}_INBOUND`;
    const outboundKey = `${routeId}_OUTBOUND`;
    
    const inboundPolylines = this.routePolylines.get(inboundKey);
    const outboundPolylines = this.routePolylines.get(outboundKey);
    const regularPolylines = this.routePolylines.get(routeId);
    
    if (inboundPolylines) {
      inboundPolylines.forEach(polyline => polyline.setVisible(false));
    }
    if (outboundPolylines) {
      outboundPolylines.forEach(polyline => polyline.setVisible(false));
    }
    if (regularPolylines) {
      regularPolylines.forEach(polyline => polyline.setVisible(false));
    }
  }

  /**
   * Show a specific route
   */
  showRoute(routeId: string): void {
    // Check for direction-specific keys first
    const inboundKey = `${routeId}_INBOUND`;
    const outboundKey = `${routeId}_OUTBOUND`;
    
    const inboundPolylines = this.routePolylines.get(inboundKey);
    const outboundPolylines = this.routePolylines.get(outboundKey);
    const regularPolylines = this.routePolylines.get(routeId);
    
    if (inboundPolylines) {
      inboundPolylines.forEach(polyline => polyline.setVisible(true));
    }
    if (outboundPolylines) {
      outboundPolylines.forEach(polyline => polyline.setVisible(true));
    }
    if (regularPolylines) {
      regularPolylines.forEach(polyline => polyline.setVisible(true));
    }
  }

  /**
   * Hide a specific direction for a route
   */
  hideDirectionPolylines(routeId: string, direction: string): void {
    const key = `${routeId}_${direction}`;
    const polylines = this.routePolylines.get(key);
    if (polylines) {
      polylines.forEach(polyline => polyline.setVisible(false));
    }
  }

  /**
   * Show a specific direction for a route
   */
  showDirectionPolylines(routeId: string, direction: string): void {
    const key = `${routeId}_${direction}`;
    const polylines = this.routePolylines.get(key);
    if (polylines) {
      polylines.forEach(polyline => polyline.setVisible(true));
    }
  }

  /**
   * Check if a route already has geometry rendered
   */
  hasRouteGeometry(routeId: string): boolean {
    // Check for direction-specific polylines
    const inboundKey = `${routeId}_INBOUND`;
    const outboundKey = `${routeId}_OUTBOUND`;
    
    if (this.routePolylines.has(inboundKey) || this.routePolylines.has(outboundKey)) {
      return true;
    }
    
    // Check for regular polylines
    return this.routePolylines.has(routeId);
  }

  /**
   * Clear route polylines (remove from map)
   */
  clearRoutePolylines(routeId: string): void {
    // Clear direction-specific polylines
    const inboundKey = `${routeId}_INBOUND`;
    const outboundKey = `${routeId}_OUTBOUND`;
    
    const inboundPolylines = this.routePolylines.get(inboundKey);
    if (inboundPolylines) {
      inboundPolylines.forEach(polyline => polyline.remove());
      this.routePolylines.delete(inboundKey);
    }
    
    const outboundPolylines = this.routePolylines.get(outboundKey);
    if (outboundPolylines) {
      outboundPolylines.forEach(polyline => polyline.remove());
      this.routePolylines.delete(outboundKey);
    }
    
    // Clear regular polylines
    const polylines = this.routePolylines.get(routeId);
    if (polylines) {
      polylines.forEach(polyline => polyline.remove());
      this.routePolylines.delete(routeId);
    }
  }

  /**
   * Clear stop markers for a route+direction
   */
  clearStopMarkers(key: string): void {
    const markers = this.stopMarkers.get(key);
    if (markers) {
      markers.forEach(marker => marker.remove());
      this.stopMarkers.delete(key);
    }
  }

  /**
   * Clear all routes from map
   */
  clearAllRoutes(): void {
    // Clear all polylines
    this.routePolylines.forEach(polylines => {
      polylines.forEach(polyline => polyline.remove());
    });
    this.routePolylines.clear();

    // Clear all stop markers
    this.stopMarkers.forEach(markers => {
      markers.forEach(marker => marker.remove());
    });
    this.stopMarkers.clear();

    console.log('Cleared all routes and stops from map');
  }

  /**
   * Show only filtered routes, hide others
   */
  updateVisibleRoutes(visibleRouteIds: string[]): void {
    const visibleSet = new Set(visibleRouteIds);

    // Hide routes not in the visible set
    this.routePolylines.forEach((polylines, routeId) => {
      if (visibleSet.has(routeId)) {
        this.showRoute(routeId);
      } else {
        this.hideRoute(routeId);
      }
    });
  }

  /**
   * Generate SVG marker icon as data URL
   */
  private createDotMarker(color: string, size: number = 12): string {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="${color}" stroke="white" stroke-width="1.5"/>
      </svg>
    `;
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg.trim());
  }

  /**
   * Get all currently rendered route IDs
   */
  getRenderedRouteIds(): string[] {
    return Array.from(this.routePolylines.keys());
  }
}
