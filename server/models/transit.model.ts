// Transit model – caching layer that uses GTFS as the primary data source
// for routes, stops, and patterns.  TrueTime is called ONCE (on startup)
// solely to obtain route colors.  Everything is cached in MongoDB so that
// client requests never hit GTFS parsing or the TrueTime API directly.
//
// Vehicles & predictions remain live (not cached) — they change every few seconds.

import DAC from '../db/dac';
import trueTimeService from '../services/truetime.service';
import gtfsService from '../services/gtfs.service';
import {
  IRoute,
  IStop,
  IPattern,
  IDetour,
  ITransitCache,
  IBulkTransitData
} from '../../common/transit.interface';

/** How long a cache entry is considered fresh (24 hours in ms). */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Retry interval for TrueTime color fetch when it fails (5 minutes). */
const COLOR_RETRY_INTERVAL_MS = 5 * 60 * 1000;

/** Maximum number of color retry attempts before giving up until next daily refresh. */
const COLOR_MAX_RETRIES = 12; // 12 × 5 min = 1 hour of retrying

// ── Helpers ────────────────────────────────────────────────────────────

/** Build a Date that is `ttl` ms from now. */
function expiresAt(ttl: number = CACHE_TTL_MS): Date {
  return new Date(Date.now() + ttl);
}

/** Try to read a non-expired cache entry from MongoDB. */
async function readCache<T>(cacheKey: string): Promise<T | null> {
  const entry = await DAC.db.getTransitCache(cacheKey);
  if (!entry) return null;
  return entry.data as T;
}

/** Write (upsert) a cache entry into MongoDB. */
async function writeCache(
  cacheKey: string,
  dataType: ITransitCache['dataType'],
  data: ITransitCache['data']
): Promise<void> {
  const now = new Date();
  await DAC.db.upsertTransitCache({
    cacheKey,
    dataType,
    data,
    lastUpdated: now,
    expiresAt: expiresAt()
  });
}

// ── Public API ─────────────────────────────────────────────────────────

export class TransitModel {
  /** Whether TrueTime colors have been successfully fetched. */
  private static hasColors = false;

  /** Handle for the color-retry timer (cleared once colors are obtained). */
  private static colorRetryTimer: ReturnType<typeof setInterval> | null = null;

  /** Number of consecutive color-retry failures. */
  private static colorRetryCount = 0;

  /** Whether route colors were fetched from TrueTime. */
  static get colorsAvailable(): boolean {
    return TransitModel.hasColors;
  }

  // -------------------------------------------------------------------
  // Routes  (GTFS + TrueTime colors, cached in MongoDB)
  // -------------------------------------------------------------------

  /** Return PRT routes from cache. Cache is populated by refreshAllCaches(). */
  static async getRoutes(): Promise<IRoute[]> {
    const CACHE_KEY = 'routes';
    const cached = await readCache<IRoute[]>(CACHE_KEY);
    if (cached) {
      console.log('[TransitModel] Routes served from cache');
      return cached;
    }

    // Cache miss — build routes from GTFS & color them
    console.log('[TransitModel] Routes cache miss — building from GTFS');
    const routes = await TransitModel.buildColoredRoutes();
    if (routes.length > 0) {
      await writeCache(CACHE_KEY, 'routes', routes);
    }
    return routes;
  }

  // -------------------------------------------------------------------
  // Patterns  (GTFS only, cached in MongoDB)
  // -------------------------------------------------------------------

  /** Return patterns for a route from cache; on miss, read from GTFS and cache. */
  static async getPatterns(routeId: string): Promise<IPattern[]> {
    const CACHE_KEY = `patterns:${routeId}`;
    const cached = await readCache<IPattern[]>(CACHE_KEY);
    if (cached) {
      console.log(`[TransitModel] Patterns for ${routeId} served from cache`);
      return cached;
    }

    console.log(
      `[TransitModel] Patterns cache miss for ${routeId} — reading from GTFS`
    );
    if (!gtfsService.isLoaded()) return [];
    const patterns = gtfsService.getPatterns(routeId);
    if (patterns.length > 0) {
      await writeCache(CACHE_KEY, 'patterns', patterns);
    }
    return patterns;
  }

  // -------------------------------------------------------------------
  // Stops  (GTFS only, direction-aware, cached in MongoDB)
  // -------------------------------------------------------------------

  /** Return stops for a route/direction from cache; on miss, read from GTFS and cache. */
  static async getStops(routeId: string, direction: string): Promise<IStop[]> {
    const CACHE_KEY = `stops:${routeId}:${direction}`;
    const cached = await readCache<IStop[]>(CACHE_KEY);
    if (cached) {
      console.log(
        `[TransitModel] Stops for ${routeId}/${direction} served from cache`
      );
      return cached;
    }

    console.log(
      `[TransitModel] Stops cache miss for ${routeId}/${direction} — reading from GTFS`
    );
    if (!gtfsService.isLoaded()) return [];
    const stops = gtfsService.getStopsByDirection(routeId, direction);
    if (stops.length > 0) {
      await writeCache(CACHE_KEY, 'stops', stops);
    }
    return stops;
  }

  // -------------------------------------------------------------------
  // Detours  (TrueTime only, cached)
  // -------------------------------------------------------------------

  /** Filter a detour list by route IDs using detour.routeIds metadata. */
  private static filterDetoursByRouteIds(
    detours: IDetour[],
    routeIds?: string[]
  ): IDetour[] {
    if (!routeIds || routeIds.length === 0) return detours;
    // Note that ".filter(Boolean)" filters for truthy values, removing falsy values
    const wanted = new Set(routeIds.map((r) => r.trim()).filter(Boolean));
    if (wanted.size === 0) return detours;

    return detours.filter((d) => {
      const impacted = d.routeIds ?? [];
      return impacted.some((rt) => wanted.has(rt));
    });
  }

  /**
   * Return detours for route(s) using the all-routes cache as the source of truth.
   *
   * This avoids a cache-key mismatch where route-specific requests (e.g., detours:61C)
   * would miss even though detours:all was already cached.
   */
  static async getDetours(routeIds?: string[]): Promise<IDetour[]> {
    const CACHE_KEY = 'detours:all';

    const cached = await readCache<IDetour[]>(CACHE_KEY);
    if (cached) {
      console.log(`[TransitModel] Detours (${CACHE_KEY}) served from cache`);
      return TransitModel.filterDetoursByRouteIds(cached, routeIds);
    }

    console.log(
      `[TransitModel] Detours cache miss (${CACHE_KEY}) — fetching from TrueTime`
    );
    // Cache ALL route detours at once to limit TrueTime API calls
    try {
      const detours = await trueTimeService.getDetours();
      await writeCache(CACHE_KEY, 'detours', detours);
      console.log(`[TransitModel] Cached ${detours.length} detours`);

      return TransitModel.filterDetoursByRouteIds(detours, routeIds);
    } catch (err) {
      console.warn('[TransitModel] Failed to cache detours:', err);
      return [];
    }
  }

  // -------------------------------------------------------------------
  // Bulk data  (routes + patterns + stops in a single response)
  // -------------------------------------------------------------------

  /**
   * Return every piece of static transit data the client needs in one shot.
   * The response is assembled from whatever is already in the MongoDB cache
   * (populated by refreshAllCaches on startup / daily).
   */
  static async getAllTransitData(): Promise<IBulkTransitData> {
    const routes = await TransitModel.getRoutes();

    const patterns: Record<string, IPattern[]> = {};
    const stops: Record<string, IStop[]> = {};

    for (const route of routes) {
      // Patterns keyed by routeId
      const routePatterns = await TransitModel.getPatterns(route.id);
      if (routePatterns.length > 0) {
        patterns[route.id] = routePatterns;
      }

      // Stops keyed by "routeId:DIRECTION"
      for (const dir of route.directions) {
        const dirStops = await TransitModel.getStops(route.id, dir);
        if (dirStops.length > 0) {
          stops[`${route.id}:${dir}`] = dirStops;
        }
      }
    }

    console.log(
      `[TransitModel] Bulk data: ${routes.length} routes, ` +
        `${Object.keys(patterns).length} pattern sets, ` +
        `${Object.keys(stops).length} stop sets`
    );

    return { routes, patterns, stops };
  }

  // -------------------------------------------------------------------
  // Bulk Refresh  (called once on startup / scheduled daily)
  // -------------------------------------------------------------------

  /**
   * Populate the MongoDB cache from GTFS data.
   *
   * 1. Call TrueTime getRoutes **once** to obtain route colors.
   * 2. Merge those colors into the GTFS route list.
   * 3. Cache routes, patterns (all routes), and stops (all routes × both directions).
   *
   * After this, every client request is served entirely from MongoDB.
   */
  static async refreshAllCaches(): Promise<void> {
    console.log('[TransitModel] ── Starting full cache refresh ──');

    if (!gtfsService.isLoaded()) {
      console.warn(
        '[TransitModel] GTFS not loaded yet — skipping cache refresh'
      );
      return;
    }

    try {
      // 1. Build routes (GTFS base + TrueTime colors) and cache
      const routes = await TransitModel.buildColoredRoutes();
      if (routes.length > 0) {
        await writeCache('routes', 'routes', routes);
      }
      console.log(`[TransitModel] Cached ${routes.length} routes`);

      // 2. Cache patterns for every route
      for (const route of routes) {
        const patterns = gtfsService.getPatterns(route.id);
        if (patterns.length > 0) {
          await writeCache(`patterns:${route.id}`, 'patterns', patterns);
        }
      }
      console.log('[TransitModel] Cached patterns for all routes');

      // 3. Cache stops for every route × direction
      for (const route of routes) {
        for (const dir of route.directions) {
          const stops = gtfsService.getStopsByDirection(route.id, dir);
          if (stops.length > 0) {
            await writeCache(`stops:${route.id}:${dir}`, 'stops', stops);
          }
        }
      }
      console.log('[TransitModel] Cached stops for all routes');

      // 4. Cache detours (all routes at once)
      try {
        const detours = await trueTimeService.getDetours();
        await writeCache('detours:all', 'detours', detours);
        console.log(`[TransitModel] Cached ${detours.length} detours`);
      } catch (err) {
        console.warn('[TransitModel] Failed to cache detours:', err);
      }

      console.log('[TransitModel] ── Cache refresh complete ──');
    } catch (err) {
      console.error('[TransitModel] Cache refresh failed:', err);
    }
  }

  // -------------------------------------------------------------------
  // Manual cache invalidation
  // -------------------------------------------------------------------

  /** Clear all transit cache entries, or only entries of a specific type. */
  static async clearCache(dataType?: ITransitCache['dataType']): Promise<void> {
    await DAC.db.clearTransitCache(dataType);
    console.log(
      `[TransitModel] Cache cleared${dataType ? ` (type: ${dataType})` : ''}`
    );
  }

  // -------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------

  /**
   * Build the route list from GTFS, then call TrueTime getRoutes **once**
   * to merge real colors.  If TrueTime is unavailable the GTFS default
   * color (#1e90ff) is used instead, and a retry timer is started.
   */
  private static async buildColoredRoutes(): Promise<IRoute[]> {
    if (!gtfsService.isLoaded()) return [];

    const gtfsRoutes = gtfsService.getRoutes();

    // One TrueTime call for colors
    let colorMap = new Map<string, string>();
    try {
      const ttRoutes = await trueTimeService.getRoutes();
      colorMap = new Map(ttRoutes.map((r) => [r.id, r.color]));
      console.log(
        `[TransitModel] Fetched colors for ${colorMap.size} routes from TrueTime`
      );
      TransitModel.hasColors = true;
      TransitModel.stopColorRetry(); // cancel any pending retries
    } catch (err) {
      console.warn(
        '[TransitModel] TrueTime unavailable — using GTFS default colors'
      );
      TransitModel.startColorRetry(); // schedule retry if not already running
    }

    // Merge: use TrueTime color if available, otherwise keep GTFS color
    return gtfsRoutes.map((r) => ({
      ...r,
      color: colorMap.get(r.id) ?? r.color
    }));
  }

  /**
   * Start a periodic retry to fetch TrueTime colors if not already running.
   * Retries every 5 minutes, up to COLOR_MAX_RETRIES times.
   */
  private static startColorRetry(): void {
    if (TransitModel.colorRetryTimer) return; // already running

    TransitModel.colorRetryCount = 0;
    console.log(
      `[TransitModel] Scheduling TrueTime color retry every ${COLOR_RETRY_INTERVAL_MS / 1000}s`
    );

    TransitModel.colorRetryTimer = setInterval(async () => {
      TransitModel.colorRetryCount++;
      console.log(
        `[TransitModel] Color retry attempt ${TransitModel.colorRetryCount}/${COLOR_MAX_RETRIES}`
      );

      try {
        const ttRoutes = await trueTimeService.getRoutes();
        const colorMap = new Map(ttRoutes.map((r) => [r.id, r.color]));
        console.log(
          `[TransitModel] Color retry succeeded — ${colorMap.size} route colors`
        );
        TransitModel.hasColors = true;

        // Rebuild routes with colors and update cache
        if (gtfsService.isLoaded()) {
          const gtfsRoutes = gtfsService.getRoutes();
          const coloredRoutes = gtfsRoutes.map((r) => ({
            ...r,
            color: colorMap.get(r.id) ?? r.color
          }));
          if (coloredRoutes.length > 0) {
            await writeCache('routes', 'routes', coloredRoutes);
            console.log(
              '[TransitModel] Updated route cache with TrueTime colors'
            );
          }
        }

        TransitModel.stopColorRetry();
      } catch (err) {
        console.warn(
          `[TransitModel] Color retry ${TransitModel.colorRetryCount} failed:`,
          err instanceof Error ? err.message : err
        );
        if (TransitModel.colorRetryCount >= COLOR_MAX_RETRIES) {
          console.warn(
            '[TransitModel] Max color retries reached — giving up until next daily refresh'
          );
          TransitModel.stopColorRetry();
        }
      }
    }, COLOR_RETRY_INTERVAL_MS);
  }

  /** Stop the color-retry timer. */
  private static stopColorRetry(): void {
    if (TransitModel.colorRetryTimer) {
      clearInterval(TransitModel.colorRetryTimer);
      TransitModel.colorRetryTimer = null;
      TransitModel.colorRetryCount = 0;
    }
  }
}
