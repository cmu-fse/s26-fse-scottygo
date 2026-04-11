// Service for Pittsburgh Regional Transit GTFS static schedule data
// GTFS spec: https://gtfs.org/schedule/reference/
// Feed URL: https://www.portauthority.org/business-center/developer-resources/

import AdmZip from 'adm-zip';
import { parse } from 'csv-parse/sync';
import { parse as createCsvParser } from 'csv-parse';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { IRoute, IPattern, IStop } from '../../common/transit.interface';
import { IAppError } from '../../common/server.responses';

const GTFS_URL = 'https://www.rideprt.org/developerresources/GTFS.zip';

// GTFS calendar days array indexed by JS getDay() (0=Sun, 1=Mon, ..., 6=Sat)
const GTFS_DAY_COLS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday'
];

interface ServiceCalendar {
  days: boolean[]; // indexed by JS getDay() — true if service runs that day
  start: string; // YYYYMMDD
  end: string; // YYYYMMDD
}

/** Options for csv-parse/sync calls in the GTFS parsing pipeline. */
const CSV_OPTS = { columns: true as const, skip_empty_lines: true };

/** Convert a GTFS time string "HH:MM:SS" (hours may exceed 23) to minutes from midnight. */
export function timeToMinutes(gtfsTime: string): number {
  const parts = gtfsTime.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

/** Format a Date as YYYYMMDD for comparison against GTFS date strings. */
export function toGtfsDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

class GTFSService {
  private loaded = false;

  private routeMap = new Map<string, IRoute>();
  private patternMap = new Map<string, IPattern[]>(); // routeId → patterns
  private stopMap = new Map<string, IStop>(); // stopId → stop details
  private routeStops = new Map<string, IStop[]>(); // routeId → stops (unordered unique)
  private routeDirectionStops = new Map<string, IStop[]>(); // "routeId:DIRECTION" → ordered stops

  // Schedule data
  private tripDirection = new Map<string, string>(); // tripId → direction (INBOUND|OUTBOUND)
  private calendar = new Map<string, ServiceCalendar>(); // serviceId → calendar
  private calendarExceptions = new Map<
    string,
    { added: Set<string>; removed: Set<string> }
  >(); // date (YYYYMMDD) → exceptions
  private tripService = new Map<string, string>(); // tripId → serviceId
  private tripRoute = new Map<string, string>(); // tripId → routeId
  // First and last departure minute (from midnight) per trip — used for time-based route filtering
  private tripTimeRange = new Map<string, { first: number; last: number }>();

  // ---------------------------------------------------------------------------
  // load() and its decomposed stages
  // ---------------------------------------------------------------------------

  /**
   * Download the GTFS zip and parse all relevant files.
   * Called once at server startup — non-blocking (fire-and-forget).
   */
  async load(): Promise<void> {
    const zipPath = await this.downloadFeed();
    try {
      this.parseStaticFiles(zipPath);
      this.computeOperatingDays();
      await this.streamStopTimes(zipPath);
    } finally {
      await unlink(zipPath).catch(() => undefined);
    }
    this.loaded = true;
    console.log(
      `[GTFS ${new Date().toISOString()}] Ready: ${this.routeMap.size} routes, ${this.tripRoute.size} trips, ${this.stopMap.size} stops`
    );
  }

  /** Download the GTFS feed and persist the zip to a temp file. */
  private async downloadFeed(): Promise<string> {
    console.log(
      `[GTFS ${new Date().toISOString()}] Downloading feed from PRT...`
    );
    const res = await fetch(GTFS_URL);
    if (!res.ok) {
      throw new Error(`[GTFS] Failed to download feed: HTTP ${res.status}`);
    }
    const zipPath = join(tmpdir(), `scottygo-gtfs-${randomUUID()}.zip`);
    let zipBuffer: Buffer | null = Buffer.from(await res.arrayBuffer());
    await writeFile(zipPath, zipBuffer);
    zipBuffer = null;
    return zipPath;
  }

  /**
   * Open the zip and parse routes, stops, shapes, trips, calendar, and
   * calendar_dates into in-memory maps.
   */
  private parseStaticFiles(zipPath: string): void {
    let zip: AdmZip | null = new AdmZip(zipPath);
    const read = (name: string): string => {
      const entry = zip!.getEntry(name);
      if (!entry) throw new Error(`[GTFS] Missing file in zip: ${name}`);
      return entry.getData().toString('utf8');
    };

    this.parseRoutes(read);
    this.parseStops(read);
    const shapePoints = this.parseShapes(read);
    this.parseTrips(read, shapePoints);
    this.parseCalendars(read);

    // Release the zip handle before processing the huge stop_times.txt stream.
    zip = null;
  }

  /** Parse routes.txt → routeMap. */
  private parseRoutes(read: (name: string) => string): void {
    console.log(`[GTFS ${new Date().toISOString()}] Parsing routes.txt...`);
    for (const r of parse(read('routes.txt'), CSV_OPTS) as Record<
      string,
      string
    >[]) {
      this.routeMap.set(r.route_id, {
        id: r.route_id,
        name: r.route_short_name || r.route_long_name,
        system: 'PRT',
        color:
          r.route_color && r.route_color.toUpperCase() !== 'FFFFFF'
            ? `#${r.route_color}`
            : '#1e90ff',
        directions: ['INBOUND', 'OUTBOUND'],
        activeStatus: true,
        operatingDays: []
      });
    }
  }

  /** Parse stops.txt → stopMap. */
  private parseStops(read: (name: string) => string): void {
    console.log(`[GTFS ${new Date().toISOString()}] Parsing stops.txt...`);
    for (const s of parse(read('stops.txt'), CSV_OPTS) as Record<
      string,
      string
    >[]) {
      this.stopMap.set(s.stop_id, {
        stopId: s.stop_id,
        stopName: s.stop_name,
        lat: parseFloat(s.stop_lat),
        lon: parseFloat(s.stop_lon),
        dtradd: [],
        dtrrem: []
      });
    }
  }

  /** Parse shapes.txt → sorted shape-point map (shapeId → lat/lng[]). */
  private parseShapes(
    read: (name: string) => string
  ): Map<string, { lat: number; lng: number }[]> {
    console.log(`[GTFS ${new Date().toISOString()}] Parsing shapes.txt...`);
    const seqs = new Map<string, { seq: number; lat: number; lng: number }[]>();
    for (const p of parse(read('shapes.txt'), CSV_OPTS) as Record<
      string,
      string
    >[]) {
      if (!seqs.has(p.shape_id)) seqs.set(p.shape_id, []);
      seqs.get(p.shape_id)!.push({
        seq: parseFloat(p.shape_pt_sequence),
        lat: parseFloat(p.shape_pt_lat),
        lng: parseFloat(p.shape_pt_lon)
      });
    }
    const points = new Map<string, { lat: number; lng: number }[]>();
    for (const [id, pts] of seqs) {
      pts.sort((a, b) => a.seq - b.seq);
      points.set(
        id,
        pts.map((p) => ({ lat: p.lat, lng: p.lng }))
      );
    }
    return points;
  }

  /**
   * Parse trips.txt → tripService, tripRoute, tripDirection, patternMap.
   * Consumes the shapePoints map built by parseShapes().
   */
  private parseTrips(
    read: (name: string) => string,
    shapePoints: Map<string, { lat: number; lng: number }[]>
  ): void {
    console.log(`[GTFS ${new Date().toISOString()}] Parsing trips.txt...`);
    const seenPatterns = new Set<string>();
    for (const t of parse(read('trips.txt'), CSV_OPTS) as Record<
      string,
      string
    >[]) {
      this.tripService.set(t.trip_id, t.service_id);
      this.tripRoute.set(t.trip_id, t.route_id);
      this.tripDirection.set(
        t.trip_id,
        t.direction_id === '0' ? 'OUTBOUND' : 'INBOUND'
      );

      const patternKey = `${t.route_id}:${t.shape_id}`;
      if (t.shape_id && !seenPatterns.has(patternKey)) {
        seenPatterns.add(patternKey);
        const path = shapePoints.get(t.shape_id) ?? [];
        const direction = t.direction_id === '0' ? 'OUTBOUND' : 'INBOUND';
        if (!this.patternMap.has(t.route_id)) {
          this.patternMap.set(t.route_id, []);
        }
        this.patternMap.get(t.route_id)!.push({ direction, path });
      }
    }
  }

  /** Parse calendar.txt + calendar_dates.txt → calendar, calendarExceptions. */
  private parseCalendars(read: (name: string) => string): void {
    console.log(`[GTFS ${new Date().toISOString()}] Parsing calendar.txt...`);
    for (const c of parse(read('calendar.txt'), CSV_OPTS) as Record<
      string,
      string
    >[]) {
      const days = GTFS_DAY_COLS.map((col) => c[col] === '1');
      this.calendar.set(c.service_id, {
        days,
        start: c.start_date,
        end: c.end_date
      });
    }

    console.log(
      `[GTFS ${new Date().toISOString()}] Parsing calendar_dates.txt...`
    );
    for (const d of parse(read('calendar_dates.txt'), CSV_OPTS) as Record<
      string,
      string
    >[]) {
      if (!this.calendarExceptions.has(d.date)) {
        this.calendarExceptions.set(d.date, {
          added: new Set(),
          removed: new Set()
        });
      }
      const ex = this.calendarExceptions.get(d.date)!;
      if (d.exception_type === '1') ex.added.add(d.service_id);
      else if (d.exception_type === '2') ex.removed.add(d.service_id);
    }
  }

  /** Derive operatingDays per route by joining trips → services → calendar days. */
  private computeOperatingDays(): void {
    const routeActiveDays = new Map<string, Set<number>>();
    for (const [tripId, routeId] of this.tripRoute) {
      const serviceId = this.tripService.get(tripId);
      if (!serviceId) continue;
      const cal = this.calendar.get(serviceId);
      if (!cal) continue;
      if (!routeActiveDays.has(routeId))
        routeActiveDays.set(routeId, new Set());
      const days = routeActiveDays.get(routeId)!;
      for (let day = 0; day <= 6; day++) {
        if (cal.days[day]) days.add(day);
      }
    }
    for (const [routeId, days] of routeActiveDays) {
      const route = this.routeMap.get(routeId);
      if (route) route.operatingDays = [...days].sort((a, b) => a - b);
    }
  }

  /**
   * Stream-parse stop_times.txt to build trip time ranges, route→stop and
   * route+direction→stop mappings.  Uses `unzip -p` to avoid loading the
   * entire decompressed file into memory.
   */
  private async streamStopTimes(zipPath: string): Promise<void> {
    console.log(
      `[GTFS ${new Date().toISOString()}] Parsing stop_times.txt (streaming to save memory)...`
    );
    const routeStopIds = new Map<string, Set<string>>();
    const routeDirStopIds = new Map<string, Set<string>>();

    await new Promise<void>((resolve, reject) => {
      const parser = createCsvParser({
        columns: true,
        skip_empty_lines: true
      });
      const unzipProc = spawn('unzip', ['-p', zipPath, 'stop_times.txt']);
      let unzipErr = '';

      unzipProc.stderr.setEncoding('utf8');
      unzipProc.stderr.on('data', (chunk: string) => {
        unzipErr += chunk;
      });

      parser.on('readable', () => {
        let st: Record<string, string>;
        while ((st = parser.read()) !== null) {
          const minutes = timeToMinutes(st.departure_time);
          const existing = this.tripTimeRange.get(st.trip_id);
          if (!existing) {
            this.tripTimeRange.set(st.trip_id, {
              first: minutes,
              last: minutes
            });
          } else {
            if (minutes < existing.first) existing.first = minutes;
            if (minutes > existing.last) existing.last = minutes;
          }

          const routeId = this.tripRoute.get(st.trip_id);
          if (routeId && st.stop_id) {
            if (!routeStopIds.has(routeId)) {
              routeStopIds.set(routeId, new Set());
            }
            routeStopIds.get(routeId)!.add(st.stop_id);

            // Also track stops per route+direction
            const dir = this.tripDirection.get(st.trip_id);
            if (dir) {
              const dirKey = `${routeId}:${dir}`;
              if (!routeDirStopIds.has(dirKey)) {
                routeDirStopIds.set(dirKey, new Set());
              }
              routeDirStopIds.get(dirKey)!.add(st.stop_id);
            }
          }
        }
      });

      parser.on('end', resolve);
      parser.on('error', (err) => reject(err));

      unzipProc.on('error', (err) => reject(err));
      unzipProc.on('close', (code) => {
        if (code !== 0) {
          reject(
            new Error(
              `[GTFS] unzip stop_times.txt failed (code ${code}): ${unzipErr.trim()}`
            )
          );
        }
      });

      unzipProc.stdout.pipe(parser);
    });

    this.resolveStopIds(routeStopIds, routeDirStopIds);
  }

  /** Map route→stopIds and direction→stopIds to resolved IStop objects. */
  private resolveStopIds(
    routeStopIds: Map<string, Set<string>>,
    routeDirStopIds: Map<string, Set<string>>
  ): void {
    for (const [routeId, stopIds] of routeStopIds) {
      const stops: IStop[] = [];
      for (const stopId of stopIds) {
        const stop = this.stopMap.get(stopId);
        if (stop) stops.push(stop);
      }
      this.routeStops.set(routeId, stops);
    }
    for (const [dirKey, stopIds] of routeDirStopIds) {
      const stops: IStop[] = [];
      for (const stopId of stopIds) {
        const stop = this.stopMap.get(stopId);
        if (stop) stops.push(stop);
      }
      this.routeDirectionStops.set(dirKey, stops);
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  isLoaded(): boolean {
    return this.loaded;
  }

  getRoutes(): IRoute[] {
    return [...this.routeMap.values()];
  }

  getPatterns(routeId: string): IPattern[] {
    return this.patternMap.get(routeId) ?? [];
  }

  /** Return all stops for a route from static GTFS data. */
  getStops(routeId: string): IStop[] {
    return this.routeStops.get(routeId) ?? [];
  }

  /** Return stops for a route filtered by direction (INBOUND or OUTBOUND). */
  getStopsByDirection(routeId: string, direction: string): IStop[] {
    return this.routeDirectionStops.get(`${routeId}:${direction}`) ?? [];
  }

  /**
   * Return all unique stops across every route, with the `routes` field
   * populated to indicate which route IDs serve each stop.
   * Used by TransitSearchStrategy for keyword-based stop search.
   */
  getAllStops(): IStop[] {
    const stopRoutes = new Map<string, Set<string>>();

    for (const [routeId, stops] of this.routeStops.entries()) {
      for (const stop of stops) {
        if (!stopRoutes.has(stop.stopId)) {
          stopRoutes.set(stop.stopId, new Set());
        }
        stopRoutes.get(stop.stopId)!.add(routeId);
      }
    }

    const result: IStop[] = [];
    for (const stop of this.stopMap.values()) {
      result.push({
        ...stop,
        routes: [...(stopRoutes.get(stop.stopId) ?? [])]
      });
    }
    return result;
  }

  /**
   * Return routes that have at least one trip running on the given date,
   * based on GTFS calendar.txt and calendar_dates.txt.
   */

  private assertGtfsLoaded(): void {
    if (!this.loaded) {
      const err: IAppError = {
        type: 'ServerError',
        name: 'GetRequestFailure',
        message: 'GTFS schedule data is not yet loaded'
      };
      throw err;
    }
  }

  filterRoutesByDate(date: Date): IRoute[] {
    this.assertGtfsLoaded();

    const activeServices = this.getActiveServiceIds(date);
    const activeRouteIds = new Set<string>();

    for (const [tripId, serviceId] of this.tripService) {
      if (activeServices.has(serviceId)) {
        const routeId = this.tripRoute.get(tripId);
        if (routeId) activeRouteIds.add(routeId);
      }
    }

    return [...this.routeMap.values()].filter((r) => activeRouteIds.has(r.id));
  }

  /**
   * Return routes that have at least one trip actively running at `time` on the given date.
   * A trip is active if the query time falls within its first–last departure window.
   * @param time "HH:MM" in 24-hour format
   */
  filterRoutesByDateTime(date: Date, time: string): IRoute[] {
    this.assertGtfsLoaded();

    const [h, m] = time.split(':').map(Number);
    const queryMinutes = h * 60 + m;

    const activeServices = this.getActiveServiceIds(date);
    const activeRouteIds = new Set<string>();

    // A trip is considered active if the query time falls within its first–last departure window
    for (const [tripId, range] of this.tripTimeRange) {
      if (range.first <= queryMinutes && range.last >= queryMinutes) {
        const serviceId = this.tripService.get(tripId);
        if (serviceId && activeServices.has(serviceId)) {
          const routeId = this.tripRoute.get(tripId);
          if (routeId) activeRouteIds.add(routeId);
        }
      }
    }

    return [...this.routeMap.values()].filter((r) => activeRouteIds.has(r.id));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Compute the set of service_ids active on a given date by applying
   * calendar.txt (regular schedule) and calendar_dates.txt (exceptions).
   */
  private getActiveServiceIds(date: Date): Set<string> {
    const dateStr = toGtfsDate(date);
    const dayIdx = date.getDay(); // 0=Sun...6=Sat

    const active = new Set<string>();

    // Regular schedule
    for (const [serviceId, cal] of this.calendar) {
      if (dateStr >= cal.start && dateStr <= cal.end && cal.days[dayIdx]) {
        active.add(serviceId);
      }
    }

    // Exceptions (added or removed service on specific dates)
    const ex = this.calendarExceptions.get(dateStr);
    if (ex) {
      for (const id of ex.added) active.add(id);
      for (const id of ex.removed) active.delete(id);
    }

    return active;
  }
}

export default new GTFSService();
