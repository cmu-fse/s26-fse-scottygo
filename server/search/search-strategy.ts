/**
 * Search Strategy Pattern — SearchInfo Use Case (R1, R2)
 *
 * Implements the Strategy Design Pattern for contextual keyword search on the backend.
 * The server selects the appropriate concrete strategy based on which endpoint (context)
 * the client calls. Each strategy encapsulates its own search algorithm and data source.
 *
 * Contexts and their strategies:
 *  1. UserSearchStrategy        — GET /account/users/search    (Manage Account)
 *  2. RouteSearchStrategy       — GET /map/routes/search       (Route Search on Map)
 *  3. TransitSearchStrategy     — GET /map/search              (Stop & Route Search on Map)
 *  4. SubscriptionSearchStrategy— GET /map/routes/search       (Add Route on Subscriptions page)
 *  5. NotificationSearchStrategy— GET /notifications/notifications (Notification Search)
 *
 * Rule R1: Search is contextual — each endpoint picks a different strategy.
 * Rule R2: Stop words are filtered before search (applied in strategies that search
 *          natural-language fields: transit stops/routes names, notification messages).
 */

import { TransitModel } from '../models/transit.model';
import { User } from '../models/user.model';
import { NotificationModel } from '../models/notification.model';
import gtfsService from '../services/gtfs.service';
import alertsService from '../services/alerts.service';
import notificationSourcesService from '../services/notification-sources.service';
import type {
  IRoute,
  INotification,
  IServiceAlert,
  ITransitSearchResult
} from '../../common/transit.interface';
import type { ISearchSuggestion } from '../../common/socket.interface';

// ── Stop Word List (R2) ───────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a',
  'able',
  'about',
  'across',
  'after',
  'all',
  'almost',
  'also',
  'am',
  'among',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'because',
  'been',
  'but',
  'by',
  'can',
  'cannot',
  'could',
  'dear',
  'did',
  'do',
  'does',
  'either',
  'else',
  'ever',
  'every',
  'for',
  'from',
  'get',
  'got',
  'had',
  'has',
  'have',
  'he',
  'her',
  'hers',
  'him',
  'his',
  'how',
  'however',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'just',
  'least',
  'let',
  'like',
  'likely',
  'may',
  'me',
  'might',
  'most',
  'must',
  'my',
  'neither',
  'no',
  'nor',
  'not',
  'of',
  'off',
  'often',
  'on',
  'only',
  'or',
  'other',
  'our',
  'own',
  'rather',
  'said',
  'say',
  'says',
  'she',
  'should',
  'since',
  'so',
  'some',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'tis',
  'to',
  'too',
  'twas',
  'us',
  'wants',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'why',
  'will',
  'with',
  'would',
  'yet',
  'you',
  'your'
]);

/**
 * Removes stop words from a raw query string (R2).
 * Returns the meaningful tokens joined as a string,
 * or null if every token is a stop word (triggers empty-result short-circuit).
 */
export function filterStopWords(query: string): string | null {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const meaningful = tokens.filter((t) => !STOP_WORDS.has(t));
  return meaningful.length > 0 ? meaningful.join(' ') : null;
}

// ── Strategy Interface ────────────────────────────────────────────────────────

/**
 * Generic search strategy interface.
 * T is the shape of the result payload (e.g. IRoute[], ITransitSearchResult).
 */
export interface ISearchStrategy<T> {
  search(query: string): Promise<T>;
}

// ── Search Context ────────────────────────────────────────────────────────────

/**
 * Context class — holds and delegates to the active ISearchStrategy.
 * Controllers create one of these with the appropriate concrete strategy,
 * then call executeSearch() to get results.
 */
export class SearchContext<T> {
  private strategy: ISearchStrategy<T>;

  constructor(strategy: ISearchStrategy<T>) {
    this.strategy = strategy;
  }

  setStrategy(strategy: ISearchStrategy<T>): void {
    this.strategy = strategy;
  }

  executeSearch(query: string): Promise<T> {
    return this.strategy.search(query);
  }
}

// ── Concrete Strategy 1: User Search ─────────────────────────────────────────

/**
 * Searches all usernames for partial keyword matches (case-insensitive).
 * Stop word filtering is NOT applied — usernames are not natural language.
 *
 * Context : Manage Account page (Admin combobox, GET /account/users/search).
 * Criteria: One or more words matching an existing username (or part of one).
 * Results : Matching usernames in alphabetical order.
 */
export class UserSearchStrategy implements ISearchStrategy<string[]> {
  async search(query: string): Promise<string[]> {
    const lower = query.trim().toLowerCase();
    const usernames = await User.getAllUsernames();

    const filtered = lower
      ? usernames.filter((u) => u.toLowerCase().includes(lower))
      : usernames;

    return filtered.sort((a, b) => a.localeCompare(b));
  }
}

// ── Concrete Strategy 2: Route Search ────────────────────────────────────────

/**
 * Searches the cached route list by route ID or route name (case-insensitive).
 * Applies stop word filtering (R2).
 * Returns up to 5 matching routes.
 *
 * Context : Route Selector / Route Search on the Map page (GET /map/routes/search).
 *           Also reused by the Subscriptions page "Add Route" sheet.
 * Criteria: Keywords matching route IDs (e.g. "61C") or route names (e.g. "Murray").
 * Results : Up to 5 matching IRoute objects.
 */
export class RouteSearchStrategy implements ISearchStrategy<IRoute[]> {
  async search(query: string): Promise<IRoute[]> {
    const filtered = filterStopWords(query);
    if (filtered === null) return [];

    const routes = await TransitModel.getRoutes();
    const lower = filtered;

    return routes
      .filter(
        (r) =>
          r.id.toLowerCase().includes(lower) ||
          r.name.toLowerCase().includes(lower)
      )
      .slice(0, 5);
  }
}

// ── Concrete Strategy 3: Transit Search (routes + stops) ─────────────────────

/**
 * Searches both routes and stops by keywords (case-insensitive).
 * Applies stop word filtering (R2).
 * Returns up to 5 matching routes and up to 5 matching stops.
 * Stops include a populated `routes` array (which route IDs serve each stop).
 *
 * Context : Main transit search bar on the Map page (GET /map/search).
 * Criteria: Keywords matching stop names, stop IDs, route IDs, or route names.
 * Results : { routes: IRoute[], stops: IStop[] } — up to 5 of each.
 */
export class TransitSearchStrategy implements ISearchStrategy<ITransitSearchResult> {
  async search(query: string): Promise<ITransitSearchResult> {
    const filtered = filterStopWords(query);
    if (filtered === null) return { routes: [], stops: [] };
    const lower = filtered;

    const [allRoutes, allStops] = await Promise.all([
      TransitModel.getRoutes(),
      Promise.resolve(gtfsService.getAllStops())
    ]);

    const routes = allRoutes
      .filter(
        (r) =>
          r.id.toLowerCase().includes(lower) ||
          r.name.toLowerCase().includes(lower)
      )
      .slice(0, 5);

    const stops = allStops
      .filter(
        (s) =>
          s.stopName.toLowerCase().includes(lower) ||
          s.stopId.toLowerCase().includes(lower)
      )
      .slice(0, 5);

    return { routes, stops };
  }
}

// ── Concrete Strategy 4: Subscription Search ─────────────────────────────────

/**
 * Searches routes for the purpose of subscribing to them.
 * Identical search criteria to RouteSearchStrategy but in the subscription context,
 * and returns results without a hard 5-item cap (shows all matches).
 * Stop word filtering is NOT applied — route IDs are not natural language.
 *
 * Context : "Add Route" sheet on the Subscriptions page (GET /map/routes/search
 *           can be reused; a dedicated endpoint may be added later).
 * Criteria: Keywords matching route IDs or route names.
 * Results : All matching IRoute objects.
 */
export class SubscriptionSearchStrategy implements ISearchStrategy<IRoute[]> {
  async search(query: string): Promise<IRoute[]> {
    const routes = await TransitModel.getRoutes();
    if (!query) return routes;
    const lower = query.toLowerCase();
    return routes.filter(
      (r) =>
        r.id.toLowerCase().includes(lower) ||
        r.name.toLowerCase().includes(lower)
    );
  }
}

// ── Concrete Strategy 5: Notification Search ─────────────────────────────────

/**
 * Searches recent notifications (last 30 min) by free-text keywords.
 * Applies stop word filtering (R2) to the query before searching.
 * Delegates to NotificationModel which handles DB retrieval and message filtering.
 *
 * Context : Notification search bar on the Notifications page
 *           (GET /notifications/notifications).
 * Criteria: Keywords matching notification message content, route IDs, or vehicle IDs.
 * Results : Matching INotification objects, newest first.
 */
export class NotificationSearchStrategy implements ISearchStrategy<
  INotification[]
> {
  async search(query: string): Promise<INotification[]> {
    const filtered = filterStopWords(query);
    if (filtered === null) return [];

    return NotificationModel.searchNotifications({ q: filtered });
  }
}

export interface INotificationSearchCriteria {
  route?: string;
  bus?: string;
  q?: string;
}

export class RecentNotificationsStrategy implements ISearchStrategy<
  INotification[]
> {
  async search(_query: string): Promise<INotification[]> {
    return NotificationModel.searchNotifications({});
  }
}

export class NotificationRouteSearchStrategy implements ISearchStrategy<
  INotification[]
> {
  constructor(private readonly routeId: string) {}

  async search(_query: string): Promise<INotification[]> {
    return NotificationModel.searchNotifications({ route: this.routeId });
  }
}

export class NotificationBusSearchStrategy implements ISearchStrategy<
  INotification[]
> {
  constructor(private readonly vid: string) {}

  async search(_query: string): Promise<INotification[]> {
    return NotificationModel.searchNotifications({ bus: this.vid });
  }
}

export class NotificationCompositeSearchStrategy implements ISearchStrategy<
  INotification[]
> {
  constructor(
    private readonly criteria: {
      route?: string;
      bus?: string;
    }
  ) {}

  async search(query: string): Promise<INotification[]> {
    if (!query.trim()) {
      return NotificationModel.searchNotifications({
        route: this.criteria.route,
        bus: this.criteria.bus
      });
    }

    const filtered = filterStopWords(query);
    return NotificationModel.searchNotifications({
      route: this.criteria.route,
      bus: this.criteria.bus,
      // Preserve existing behavior: stopword-only query behaves like no q filter.
      q: filtered ?? undefined
    });
  }
}

export class NotificationSearchStrategyFactory {
  static create(
    criteria: INotificationSearchCriteria
  ): ISearchStrategy<INotification[]> {
    const route = criteria.route?.trim();
    const bus = criteria.bus?.trim();
    const q = criteria.q?.trim();

    const hasRoute = Boolean(route);
    const hasBus = Boolean(bus);
    const hasQ = Boolean(q);

    if (!hasRoute && !hasBus && !hasQ) {
      return new RecentNotificationsStrategy();
    }
    if (hasRoute && !hasBus && !hasQ) {
      return new NotificationRouteSearchStrategy(route!);
    }
    if (!hasRoute && hasBus && !hasQ) {
      return new NotificationBusSearchStrategy(bus!);
    }
    if (!hasRoute && !hasBus && hasQ) {
      return new NotificationSearchStrategy();
    }

    return new NotificationCompositeSearchStrategy({ route, bus });
  }
}

// ── Concrete Strategy 6: Notification Autocomplete ───────────────────────────

/**
 * Returns short autocomplete suggestions (route IDs + vehicle IDs) for the
 * notification search bar.
 *
 * Priority order:
 *  1. Route IDs from GTFS data that match the query (always available).
 *  2. Vehicle IDs from recent notifications that match the query.
 *
 * This keeps suggestions useful even when no notifications have been filed yet.
 * Stop word filtering is applied (R2) before querying.
 *
 * Context : Notification search autocomplete (socket 'searchAutocomplete', context='notifications').
 * Results : Up to 8 deduplicated short strings (route IDs / vehicle IDs).
 */
export class NotificationAutocompleteStrategy implements ISearchStrategy<
  ISearchSuggestion[]
> {
  async search(query: string): Promise<ISearchSuggestion[]> {
    const filtered = filterStopWords(query);
    if (filtered === null) return [];
    const lower = filtered.toLowerCase();

    const [routes, notifications, allLiveVehicles] = await Promise.all([
      notificationSourcesService.getAllSubscribableRoutes(),
      NotificationModel.getRecentNotifications(),
      notificationSourcesService.getAllLiveVehiclesForNotifications()
    ]);

    // 1. Route IDs from GTFS that match the query (always available)
    const routeSuggestions: ISearchSuggestion[] = routes
      .filter(
        (r) =>
          r.id.toLowerCase().includes(lower) ||
          r.name.toLowerCase().includes(lower)
      )
      .slice(0, 4)
      .map((r) => ({ label: r.id, type: 'route' as const }));

    // 2. All live vehicle IDs from the GTFS-RT feed that match the query
    const vidSuggestions: ISearchSuggestion[] = allLiveVehicles
      .filter((v) => v.vid.toLowerCase().includes(lower))
      .slice(0, 3)
      .map((v) => ({ label: v.vid, type: 'vehicle' as const, vid: v.vid }));

    // 3. User-submitted notifications that match the query — labelled with
    //    route + bus so clicking them triggers a reliable route/bus search
    //    rather than a fragile free-text search on the message.
    const matchingNotifs = notifications.filter(
      (n) =>
        n.vid.toLowerCase().includes(lower) ||
        n.routeId.toLowerCase().includes(lower) ||
        n.message.toLowerCase().includes(lower)
    );

    const notifSuggestions: ISearchSuggestion[] = matchingNotifs
      .slice(0, 2)
      .map((n) => ({
        label: `Route ${n.routeId} · Bus #${n.vid}`,
        type: 'notification' as const,
        routeId: n.routeId,
        vid: n.vid
      }));

    // 4. Service alert headerTexts that match the query
    const alertSuggestions: ISearchSuggestion[] = alertsService
      .getAlerts()
      .filter(
        (a: IServiceAlert) =>
          a.headerText.toLowerCase().includes(lower) ||
          a.descriptionText.toLowerCase().includes(lower) ||
          a.routeIds.some((id) => id.toLowerCase().includes(lower))
      )
      .slice(0, 3)
      .map((a: IServiceAlert) => ({
        label: a.headerText,
        type: 'alert' as const
      }))
      .filter((s) => s.label);

    const seen = new Set<string>();
    const result: ISearchSuggestion[] = [];
    for (const s of [
      ...routeSuggestions,
      ...vidSuggestions,
      ...notifSuggestions,
      ...alertSuggestions
    ]) {
      const key = s.label.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(s);
      }
      if (result.length >= 8) break;
    }
    return result;
  }
}

function matchesNotificationText(
  notification: INotification,
  lowerQuery: string
): boolean {
  return (
    notification.message.toLowerCase().includes(lowerQuery) ||
    notification.routeId.toLowerCase().includes(lowerQuery) ||
    notification.vid.toLowerCase().includes(lowerQuery)
  );
}
