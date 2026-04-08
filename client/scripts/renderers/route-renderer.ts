/**
 * Route Renderer
 * Handles rendering route geometries, stops, and managing their visibility
 */

import type {
  IMapProvider,
  IMapPolyline,
  IMapMarker
} from '../../../common/map.interface';
import type { IRoute, IStop, IDetour } from '../../../common/transit.interface';

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
  private detourPolylines = new Map<string, IMapPolyline[]>(); // routeId_direction → detour overlays
  private stopMarkers = new Map<string, IMapMarker[]>(); // routeId_direction → markers
  private routeColors = new Map<string, string>(); // routeId → color

  private constructor() {}

  static getInstance(): RouteRenderer {
    if (!RouteRenderer.instance) {
      RouteRenderer.instance = new RouteRenderer();
    }
    return RouteRenderer.instance;
  }

  /**
   * Render detour overlays for a route.
   *
   * Draw only the impacted detour segments (non-overlapping portions) so
   * the base route remains visible and only the rerouted section is highlighted.
   */
  renderDetourGeometry(routeId: string, detours: IDetour[]): void {
    if (!this.mapProvider) {
      console.error('Map provider not initialized');
      return;
    }

    this.clearDetourPolylines(routeId);

    for (const detour of detours) {
      for (const geometry of detour.geometry ?? []) {
        const directionKey = `${routeId}_${geometry.direction}`;

        const impactedSegments = this.extractImpactedSegments(
          geometry.detourPath,
          geometry.originalPath ?? []
        );

        for (const segment of impactedSegments) {
          const activePolyline = this.mapProvider.addPolyline({
            path: segment,
            color: '#ff2d20',
            weight: 6,
            opacity: 0.95
          });

          if (!this.detourPolylines.has(directionKey)) {
            this.detourPolylines.set(directionKey, []);
          }
          this.detourPolylines.get(directionKey)!.push(activePolyline);
        }
      }
    }
  }

  /**
   * Return only detour-path segments that diverge from the original path.
   * Falls back to the full detour path when no original path is available.
   */
  private extractImpactedSegments(
    detourPath: Array<{ lat: number; lng: number }>,
    originalPath: Array<{ lat: number; lng: number }>
  ): Array<Array<{ lat: number; lng: number }>> {
    if (detourPath.length < 2) return [];
    if (originalPath.length < 2) return [detourPath];

    const toleranceDeg = 0.00025; // ~25m, enough to avoid noise around shared geometry
    const segments: Array<Array<{ lat: number; lng: number }>> = [];
    let current: Array<{ lat: number; lng: number }> = [];

    for (const point of detourPath) {
      const isShared = originalPath.some(
        (orig) =>
          Math.abs(point.lat - orig.lat) <= toleranceDeg &&
          Math.abs(point.lng - orig.lng) <= toleranceDeg
      );

      if (!isShared) {
        current.push(point);
      } else if (current.length > 0) {
        if (current.length > 1) {
          segments.push(current);
        }
        current = [];
      }
    }

    if (current.length > 1) {
      segments.push(current);
    }

    return segments.length > 0 ? segments : [detourPath];
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
  renderRouteGeometry(
    routeId: string,
    routeData: RouteData,
    color: string
  ): void {
    if (!this.mapProvider) {
      console.error('Map provider not initialized');
      return;
    }

    // Store color for this route
    this.routeColors.set(routeId, color);

    // Clear existing polylines for this route
    this.clearRoutePolylines(routeId);

    // Validate route data structure
    if (!routeData || typeof routeData !== 'object') {
      console.warn(`Invalid route data for route ${routeId}:`, routeData);
      return;
    }

    // Check if it's the custom format (array of direction/path objects)
    if (Array.isArray(routeData)) {
      this.renderCustomFormatPolylines(routeId, routeData, color);
    } else {
      this.renderGeoJSONPolylines(routeId, routeData as GeoJSON, color);
    }

    console.log(`Rendered route ${routeId} with polylines`);
  }

  /**
   * Render polylines from the custom direction/path array format.
   */
  private renderCustomFormatPolylines(
    routeId: string,
    segments: RoutePathSegment[],
    color: string
  ): void {
    segments.forEach((segment: RoutePathSegment) => {
      if (
        segment.path &&
        Array.isArray(segment.path) &&
        segment.path.length > 0
      ) {
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
  }

  /**
   * Render polylines from GeoJSON Feature or FeatureCollection format.
   */
  private renderGeoJSONPolylines(
    routeId: string,
    geoJson: GeoJSON,
    color: string
  ): void {
    const features: GeoJSONFeature[] =
      geoJson.type === 'FeatureCollection'
        ? (geoJson as GeoJSONFeatureCollection).features
        : [geoJson as GeoJSONFeature];

    if (!features || !Array.isArray(features)) {
      console.warn(`No valid features found for route ${routeId}`);
      return;
    }

    const polylines: IMapPolyline[] = [];

    features.forEach((feature: GeoJSONFeature) => {
      if (
        !feature ||
        !feature.geometry ||
        typeof feature.geometry !== 'object'
      ) {
        console.warn(`Invalid feature geometry for route ${routeId}`);
        return;
      }

      if (feature.geometry.type === 'LineString') {
        if (
          !feature.geometry.coordinates ||
          !Array.isArray(feature.geometry.coordinates)
        ) {
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
    console.log(
      `Rendered ${markers.length} stop markers for route ${routeId} ${direction}`
    );
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
      inboundPolylines.forEach((polyline) => polyline.setVisible(false));
    }
    if (outboundPolylines) {
      outboundPolylines.forEach((polyline) => polyline.setVisible(false));
    }
    if (regularPolylines) {
      regularPolylines.forEach((polyline) => polyline.setVisible(false));
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
      inboundPolylines.forEach((polyline) => polyline.setVisible(true));
    }
    if (outboundPolylines) {
      outboundPolylines.forEach((polyline) => polyline.setVisible(true));
    }
    if (regularPolylines) {
      regularPolylines.forEach((polyline) => polyline.setVisible(true));
    }
  }

  /**
   * Hide a specific direction for a route
   */
  hideDirectionPolylines(routeId: string, direction: string): void {
    const key = `${routeId}_${direction}`;
    const polylines = this.routePolylines.get(key);
    if (polylines) {
      polylines.forEach((polyline) => polyline.setVisible(false));
    }

    const detourPolylines = this.detourPolylines.get(key);
    if (detourPolylines) {
      detourPolylines.forEach((polyline) => polyline.setVisible(false));
    }
  }

  /**
   * Show a specific direction for a route
   */
  showDirectionPolylines(routeId: string, direction: string): void {
    const key = `${routeId}_${direction}`;
    const polylines = this.routePolylines.get(key);
    if (polylines) {
      polylines.forEach((polyline) => polyline.setVisible(true));
    }

    const detourPolylines = this.detourPolylines.get(key);
    if (detourPolylines) {
      detourPolylines.forEach((polyline) => polyline.setVisible(true));
    }
  }

  /**
   * Check if a route already has geometry rendered
   */
  hasRouteGeometry(routeId: string): boolean {
    // Check for direction-specific polylines
    const inboundKey = `${routeId}_INBOUND`;
    const outboundKey = `${routeId}_OUTBOUND`;

    if (
      this.routePolylines.has(inboundKey) ||
      this.routePolylines.has(outboundKey)
    ) {
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
      inboundPolylines.forEach((polyline) => polyline.remove());
      this.routePolylines.delete(inboundKey);
    }

    const outboundPolylines = this.routePolylines.get(outboundKey);
    if (outboundPolylines) {
      outboundPolylines.forEach((polyline) => polyline.remove());
      this.routePolylines.delete(outboundKey);
    }

    // Clear regular polylines
    const polylines = this.routePolylines.get(routeId);
    if (polylines) {
      polylines.forEach((polyline) => polyline.remove());
      this.routePolylines.delete(routeId);
    }

    this.clearDetourPolylines(routeId);
  }

  /**
   * Clear detour polylines (remove from map)
   */
  clearDetourPolylines(routeId: string): void {
    const inboundKey = `${routeId}_INBOUND`;
    const outboundKey = `${routeId}_OUTBOUND`;

    const inboundPolylines = this.detourPolylines.get(inboundKey);
    if (inboundPolylines) {
      inboundPolylines.forEach((polyline) => polyline.remove());
      this.detourPolylines.delete(inboundKey);
    }

    const outboundPolylines = this.detourPolylines.get(outboundKey);
    if (outboundPolylines) {
      outboundPolylines.forEach((polyline) => polyline.remove());
      this.detourPolylines.delete(outboundKey);
    }
  }

  /**
   * Clear stop markers for a route+direction
   */
  clearStopMarkers(key: string): void {
    const markers = this.stopMarkers.get(key);
    if (markers) {
      markers.forEach((marker) => marker.remove());
      this.stopMarkers.delete(key);
    }
  }

  /**
   * Clear all routes from map
   */
  clearAllRoutes(): void {
    // Clear all polylines
    this.routePolylines.forEach((polylines) => {
      polylines.forEach((polyline) => polyline.remove());
    });
    this.routePolylines.clear();

    this.detourPolylines.forEach((polylines) => {
      polylines.forEach((polyline) => polyline.remove());
    });
    this.detourPolylines.clear();

    // Clear all stop markers
    this.stopMarkers.forEach((markers) => {
      markers.forEach((marker) => marker.remove());
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
  private createDotMarker(color: string, _size: number = 12): string {
    // Bus-stop pin: teardrop shape with a bus-stop icon inside
    const w = 24;
    const h = 32;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
        <path d="M12 0C6 0 1 5 1 11c0 8 11 20 11 20s11-12 11-20C23 5 18 0 12 0z"
              fill="${color}" stroke="white" stroke-width="1.5"/>
        <circle cx="12" cy="11" r="5.5" fill="white"/>
        <rect x="9" y="7.5" width="6" height="5" rx="1" fill="${color}"/>
        <rect x="9.5" y="8.5" width="2" height="1.5" rx="0.3" fill="white"/>
        <rect x="12.5" y="8.5" width="2" height="1.5" rx="0.3" fill="white"/>
        <rect x="9" y="12" width="6" height="0.8" fill="${color}"/>
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

  /**
   * Get bounding box for a rendered route's stop markers and polyline paths
   */
  getRouteBounds(
    routeId: string
  ): { north: number; south: number; east: number; west: number } | null {
    return null;
  }

  /**
   * Zoom the map to fit the given route data
   */
  fitToRouteData(routeData: RouteData): void {
    if (!this.mapProvider) return;

    const points: Array<{ lat: number; lng: number }> = [];

    if (Array.isArray(routeData)) {
      routeData.forEach((segment) => {
        if (segment.path && Array.isArray(segment.path)) {
          segment.path.forEach((p) => points.push(p));
        }
      });
    } else {
      const geoJson = routeData as GeoJSON;
      const features: GeoJSONFeature[] =
        geoJson.type === 'FeatureCollection'
          ? (geoJson as GeoJSONFeatureCollection).features
          : [geoJson as GeoJSONFeature];

      features.forEach((feature) => {
        if (
          feature?.geometry?.type === 'LineString' &&
          feature.geometry.coordinates
        ) {
          feature.geometry.coordinates.forEach((coord) => {
            points.push({ lat: coord[1], lng: coord[0] });
          });
        }
      });
    }

    if (points.length === 0) return;

    let north = -Infinity,
      south = Infinity,
      east = -Infinity,
      west = Infinity;
    points.forEach((p) => {
      if (p.lat > north) north = p.lat;
      if (p.lat < south) south = p.lat;
      if (p.lng > east) east = p.lng;
      if (p.lng < west) west = p.lng;
    });

    this.mapProvider.fitBounds({ north, south, east, west });
  }

  /**
   * Center and zoom the map on a specific position
   */
  zoomToPosition(lat: number, lng: number, zoom: number = 16): void {
    if (!this.mapProvider) return;
    this.mapProvider.setCenter({ lat, lng });
    this.mapProvider.setZoom(zoom);
  }
}
