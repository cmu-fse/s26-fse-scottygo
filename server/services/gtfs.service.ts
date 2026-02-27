// Service for Pittsburgh Regional Transit GTFS static schedule data
// GTFS spec: https://gtfs.org/schedule/reference/
// Feed URL: https://www.portauthority.org/business-center/developer-resources/

import AdmZip from 'adm-zip';
import { parse } from 'csv-parse/sync';
import { parse as createCsvParser } from 'csv-parse';
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

/** Convert a GTFS time string "HH:MM:SS" (hours may exceed 23) to minutes from midnight. */
function timeToMinutes(gtfsTime: string): number {
  const parts = gtfsTime.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

/** Format a Date as YYYYMMDD for comparison against GTFS date strings. */
function toGtfsDate(date: Date): string {
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

  // Schedule data
  private calendar = new Map<string, ServiceCalendar>(); // serviceId → calendar
  private calendarExceptions = new Map<
    string,
    { added: Set<string>; removed: Set<string> }
  >(); // date (YYYYMMDD) → exceptions
  private tripService = new Map<string, string>(); // tripId → serviceId
  private tripRoute = new Map<string, string>(); // tripId → routeId
  // First and last departure minute (from midnight) per trip — used for time-based route filtering
  private tripTimeRange = new Map<string, { first: number; last: number }>();

  /**
   * Download the GTFS zip and parse all relevant files.
   * Called once at server startup — non-blocking (fire-and-forget).
   */
  async load(): Promise<void> {
    console.log('[GTFS] Downloading feed from PRT...');
    const res = await fetch(GTFS_URL);
    if (!res.ok) {
      throw new Error(`[GTFS] Failed to download feed: HTTP ${res.status}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const zip = new AdmZip(buffer);

    const readEntry = (name: string): string => {
      const entry = zip.getEntry(name);
      if (!entry) throw new Error(`[GTFS] Missing file in zip: ${name}`);
      return entry.getData().toString('utf8');
    };

    const opts = { columns: true as const, skip_empty_lines: true };

    console.log('[GTFS] Parsing routes.txt...');
    const rawRoutes = parse(readEntry('routes.txt'), opts) as Record<
      string,
      string
    >[];

    console.log('[GTFS] Parsing stops.txt...');
    const rawStops = parse(readEntry('stops.txt'), opts) as Record<
      string,
      string
    >[];

    console.log('[GTFS] Parsing trips.txt...');
    const rawTrips = parse(readEntry('trips.txt'), opts) as Record<
      string,
      string
    >[];

    console.log('[GTFS] Parsing shapes.txt...');
    const rawShapes = parse(readEntry('shapes.txt'), opts) as Record<
      string,
      string
    >[];

    console.log('[GTFS] Parsing calendar.txt...');
    const rawCalendar = parse(readEntry('calendar.txt'), opts) as Record<
      string,
      string
    >[];

    console.log('[GTFS] Parsing calendar_dates.txt...');
    const rawCalendarDates = parse(
      readEntry('calendar_dates.txt'),
      opts
    ) as Record<string, string>[];

    // stop_times.txt is deferred to stream-parsing below to avoid OOM on
    // memory-constrained hosts (the sync parse would materialise millions of
    // rows into a single massive JS array).

    // --- Build route map ---
    // operatingDays is left empty here and computed below once calendar data is available
    for (const r of rawRoutes) {
      this.routeMap.set(r.route_id, {
        id: r.route_id,
        name: r.route_short_name || r.route_long_name,
        system: 'PRT',
        color: r.route_color ? `#${r.route_color}` : '#1e90ff',
        directions: ['INBOUND', 'OUTBOUND'],
        activeStatus: true,
        operatingDays: []
      });
    }

    // --- Build stop map (stopId → IStop) for static stop lookups and A2 fallback ---
    for (const s of rawStops) {
      this.stopMap.set(s.stop_id, {
        stopId: s.stop_id,
        stopName: s.stop_name,
        lat: parseFloat(s.stop_lat),
        lon: parseFloat(s.stop_lon),
        dtradd: [],
        dtrrem: []
      });
    }

    // --- Build shape points (shapeId → sorted lat/lng array) ---
    const shapeSeqs = new Map<
      string,
      { seq: number; lat: number; lng: number }[]
    >();
    for (const p of rawShapes) {
      if (!shapeSeqs.has(p.shape_id)) shapeSeqs.set(p.shape_id, []);
      shapeSeqs.get(p.shape_id)!.push({
        seq: parseFloat(p.shape_pt_sequence),
        lat: parseFloat(p.shape_pt_lat),
        lng: parseFloat(p.shape_pt_lon)
      });
    }
    const shapePoints = new Map<string, { lat: number; lng: number }[]>();
    for (const [id, pts] of shapeSeqs) {
      pts.sort((a, b) => a.seq - b.seq);
      shapePoints.set(
        id,
        pts.map((p) => ({ lat: p.lat, lng: p.lng }))
      );
    }

    // --- Build trip maps and route patterns ---
    const seenPatterns = new Set<string>(); // "routeId:shapeId" dedup key
    for (const t of rawTrips) {
      this.tripService.set(t.trip_id, t.service_id);
      this.tripRoute.set(t.trip_id, t.route_id);

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

    // --- Build calendar (regular service periods) ---
    for (const c of rawCalendar) {
      const days = GTFS_DAY_COLS.map((col) => c[col] === '1');
      this.calendar.set(c.service_id, {
        days,
        start: c.start_date,
        end: c.end_date
      });
    }

    // --- Build calendar exceptions ---
    for (const d of rawCalendarDates) {
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

    // --- Compute operatingDays per route by joining trips → services → calendar days ---
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

    // --- Build trip time ranges and route→stops by STREAMING stop_times.txt ---
    // Stream-parsing avoids holding the entire parsed array in memory, which
    // was causing OOM crashes on Render's 256 MB default heap.
    console.log('[GTFS] Parsing stop_times.txt (streaming to save memory)...');
    const routeStopIds = new Map<string, Set<string>>();
    const stopTimesContent = readEntry('stop_times.txt');
    await new Promise<void>((resolve, reject) => {
      const parser = createCsvParser({ columns: true, skip_empty_lines: true });
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
            if (!routeStopIds.has(routeId))
              routeStopIds.set(routeId, new Set());
            routeStopIds.get(routeId)!.add(st.stop_id);
          }
        }
      });
      parser.on('end', resolve);
      parser.on('error', reject);
      parser.write(stopTimesContent);
      parser.end();
    });

    // Resolve stop IDs to IStop objects for each route
    for (const [routeId, stopIds] of routeStopIds) {
      const stops: IStop[] = [];
      for (const stopId of stopIds) {
        const stop = this.stopMap.get(stopId);
        if (stop) stops.push(stop);
      }
      this.routeStops.set(routeId, stops);
    }

    this.loaded = true;
    console.log(
      `[GTFS] Ready: ${this.routeMap.size} routes, ${this.tripRoute.size} trips, ${this.stopMap.size} stops`
    );
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

  /** Return all stops for a route from static GTFS data. Used as A2 fallback when TrueTime is unavailable. */
  getStops(routeId: string): IStop[] {
    return this.routeStops.get(routeId) ?? [];
  }

  /**
   * Return routes that have at least one trip running on the given date,
   * based on GTFS calendar.txt and calendar_dates.txt.
   */
  filterRoutesByDate(date: Date): IRoute[] {
    if (!this.loaded) {
      const err: IAppError = {
        type: 'ServerError',
        name: 'GetRequestFailure',
        message: 'GTFS schedule data is not yet loaded'
      };
      throw err;
    }

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
    if (!this.loaded) {
      const err: IAppError = {
        type: 'ServerError',
        name: 'GetRequestFailure',
        message: 'GTFS schedule data is not yet loaded'
      };
      throw err;
    }

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
