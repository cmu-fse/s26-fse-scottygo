import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';
import { IPattern, IStop } from '../../common/transit.interface';

interface IRouteNameRow {
  index: string;
  route_name: string;
}

interface IRouteIdRow {
  route_id?: string;
  Route_ID?: string;
}

interface IRouteShapeRow {
  route_id?: string;
  pattern_id?: string;
  point_index?: string;
  index?: string;
  lat: string;
  lng: string;
}

interface IRouteStopRow {
  route_id?: string;
  stop_id: string;
  stop_name?: string;
  name?: string;
  lat: string;
  lng: string;
  stop_order?: string;
  order?: string;
}

interface IOrderedStop extends IStop {
  order: number;
}

const CSV_OPTS = { columns: true as const, skip_empty_lines: true };

const ASSETS_DIR = join(process.cwd(), 'assets');
const ROUTE_NAMES_CSV = join(ASSETS_DIR, 'CMU_Shuttle_Route_Names.csv');
const ROUTE_SCOPED_SHAPES_CSV = join(ASSETS_DIR, 'cmu_route_shapes.csv');
const ROUTE_SCOPED_STOPS_CSV = join(ASSETS_DIR, 'cmu_route_stops.csv');

class CmuStaticDataService {
  private loaded = false;
  private routeNameByCmuRouteId = new Map<string, string>();
  private routePatternsByTripshotRouteId = new Map<string, IPattern[]>();
  private routeStopsByTripshotRouteId = new Map<string, IStop[]>();

  private static normalizeRouteId(routeId: string): string {
    return routeId.trim().toLowerCase();
  }

  private static parseOrder(value: string | undefined): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
  }

  private extractRouteId(row: IRouteIdRow): string | null {
    const raw = row.route_id ?? row.Route_ID;
    if (typeof raw !== 'string') {
      return null;
    }
    const normalized = CmuStaticDataService.normalizeRouteId(raw);
    return normalized.length > 0 ? normalized : null;
  }

  private ensureLoaded(): void {
    if (this.loaded) {
      return;
    }

    this.loaded = true;

    this.loadRouteNames();
    this.loadRouteScopedShapes();
    this.loadRouteScopedStops();

    console.log(
      `[CMU Static ${new Date().toISOString()}] Loaded static CSV data: ` +
        `${this.routeNameByCmuRouteId.size} route names, ` +
        `${this.routePatternsByTripshotRouteId.size} route patterns, ` +
        `${this.routeStopsByTripshotRouteId.size} route stop sets`
    );
  }

  private loadRouteNames(): void {
    if (!existsSync(ROUTE_NAMES_CSV)) {
      return;
    }

    const rows = parse(readFileSync(ROUTE_NAMES_CSV, 'utf8'), CSV_OPTS) as
      | IRouteNameRow[]
      | undefined;
    if (!rows) {
      return;
    }

    for (const row of rows) {
      const index = row.index?.trim();
      const routeName = row.route_name?.trim();
      if (!index || !routeName) {
        continue;
      }
      this.routeNameByCmuRouteId.set(`CMU-${index}`, routeName);
    }
  }

  private loadRouteScopedShapes(): void {
    if (!existsSync(ROUTE_SCOPED_SHAPES_CSV)) {
      return;
    }

    const rows = parse(
      readFileSync(ROUTE_SCOPED_SHAPES_CSV, 'utf8'),
      CSV_OPTS
    ) as IRouteShapeRow[] | undefined;
    if (!rows || rows.length === 0) {
      return;
    }

    const groupedRows = new Map<
      string,
      Map<string, Array<{ pointIndex: number; lat: number; lng: number }>>
    >();

    for (const row of rows) {
      const routeId = this.extractRouteId(row);
      if (!routeId) {
        continue;
      }

      const pointIndexRaw = row.point_index ?? row.index;
      const pointIndex = Number(pointIndexRaw);
      const lat = Number(row.lat);
      const lng = Number(row.lng);

      if (
        !Number.isFinite(pointIndex) ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
      ) {
        continue;
      }

      const patternId = row.pattern_id?.trim() || 'p0';
      const routePatterns = groupedRows.get(routeId) ?? new Map();
      const points = routePatterns.get(patternId) ?? [];
      points.push({ pointIndex, lat, lng });
      routePatterns.set(patternId, points);
      groupedRows.set(routeId, routePatterns);
    }

    for (const [routeId, routePatterns] of groupedRows.entries()) {
      const patterns: IPattern[] = [];

      const sortedPatternEntries = [...routePatterns.entries()].sort((a, b) =>
        a[0].localeCompare(b[0])
      );

      for (const [, points] of sortedPatternEntries) {
        points.sort((a, b) => a.pointIndex - b.pointIndex);
        const path = points
          .map((point) => ({ lat: point.lat, lng: point.lng }))
          .filter(
            (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)
          );

        if (path.length < 2) {
          continue;
        }

        patterns.push({
          direction: 'OUTBOUND',
          path
        });
      }

      if (patterns.length > 0) {
        this.routePatternsByTripshotRouteId.set(routeId, patterns);
      }
    }
  }

  private loadRouteScopedStops(): void {
    if (!existsSync(ROUTE_SCOPED_STOPS_CSV)) {
      return;
    }

    const rows = parse(
      readFileSync(ROUTE_SCOPED_STOPS_CSV, 'utf8'),
      CSV_OPTS
    ) as IRouteStopRow[] | undefined;
    if (!rows || rows.length === 0) {
      return;
    }

    const groupedStops = new Map<string, Map<string, IOrderedStop>>();

    for (const row of rows) {
      const routeId = this.extractRouteId(row);
      const stopId = row.stop_id?.trim();
      const stopName = (row.stop_name ?? row.name)?.trim();
      const lat = Number(row.lat);
      const lon = Number(row.lng);
      const order = CmuStaticDataService.parseOrder(
        row.stop_order ?? row.order
      );

      if (!routeId || !stopId || !stopName) {
        continue;
      }

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        continue;
      }

      const routeStops = groupedStops.get(routeId) ?? new Map();
      const existing = routeStops.get(stopId);
      if (!existing || order < existing.order) {
        routeStops.set(stopId, {
          stopId,
          stopName,
          lat,
          lon,
          dtradd: [],
          dtrrem: [],
          order
        });
      }
      groupedStops.set(routeId, routeStops);
    }

    for (const [routeId, routeStopsMap] of groupedStops.entries()) {
      const sortedStops = [...routeStopsMap.values()]
        .sort((a, b) => {
          if (a.order !== b.order) {
            return a.order - b.order;
          }
          return a.stopName.localeCompare(b.stopName);
        })
        .map((stop) => ({
          stopId: stop.stopId,
          stopName: stop.stopName,
          lat: stop.lat,
          lon: stop.lon,
          dtradd: [],
          dtrrem: []
        }));

      if (sortedStops.length > 0) {
        this.routeStopsByTripshotRouteId.set(routeId, sortedStops);
      }
    }
  }

  getRouteName(cmuRouteId: string): string | null {
    this.ensureLoaded();
    return this.routeNameByCmuRouteId.get(cmuRouteId) ?? null;
  }

  getPatternsForTripshotRoute(tripshotRouteId: string): IPattern[] {
    this.ensureLoaded();
    const normalizedRouteId =
      CmuStaticDataService.normalizeRouteId(tripshotRouteId);
    const routePatterns =
      this.routePatternsByTripshotRouteId.get(normalizedRouteId);
    return routePatterns ?? [];
  }

  getStopsForTripshotRoute(
    tripshotRouteId: string,
    cmuRouteId: string
  ): IStop[] {
    this.ensureLoaded();
    const normalizedRouteId =
      CmuStaticDataService.normalizeRouteId(tripshotRouteId);
    const routeStops = this.routeStopsByTripshotRouteId.get(normalizedRouteId);
    if (!routeStops || routeStops.length === 0) {
      return [];
    }

    return routeStops.map((stop) => ({
      ...stop,
      routes: [cmuRouteId]
    }));
  }
}

const cmuStaticDataService = new CmuStaticDataService();
export default cmuStaticDataService;
