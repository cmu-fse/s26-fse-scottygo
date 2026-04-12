/**
 * SearchInfo UC — unit tests for Search Strategy Pattern
 *
 * Coverage goals:
 * - R2 Stopword Rule: at least 2 focused tests
 * - R1 Search Rules: at least 10 focused tests across contexts
 */

import type {
  INotification,
  IRoute,
  IStop
} from '../../../common/transit.interface';

jest.mock('../../../server/models/transit.model', () => ({
  __esModule: true,
  TransitModel: {
    getRoutes: jest.fn()
  }
}));

jest.mock('../../../server/models/user.model', () => ({
  __esModule: true,
  User: {
    getAllUsernames: jest.fn()
  }
}));

jest.mock('../../../server/models/notification.model', () => ({
  __esModule: true,
  NotificationModel: {
    searchNotifications: jest.fn()
  }
}));

jest.mock('../../../server/services/gtfs.service', () => ({
  __esModule: true,
  default: {
    getAllStops: jest.fn()
  }
}));

jest.mock('../../../server/services/alerts.service', () => ({
  __esModule: true,
  default: {
    getAlerts: jest.fn().mockReturnValue([])
  }
}));

jest.mock('../../../server/services/vehicle-positions.service', () => ({
  __esModule: true,
  default: {
    getAllVehicles: jest.fn().mockReturnValue([])
  }
}));

import {
  filterStopWords,
  UserSearchStrategy,
  RouteSearchStrategy,
  TransitSearchStrategy,
  NotificationSearchStrategy,
  NotificationSearchStrategyFactory,
  NotificationCompositeSearchStrategy,
  RecentNotificationsStrategy,
  NotificationRouteSearchStrategy,
  NotificationBusSearchStrategy
} from '../../../server/search/search-strategy';
import { TransitModel } from '../../../server/models/transit.model';
import { User } from '../../../server/models/user.model';
import { NotificationModel } from '../../../server/models/notification.model';
import gtfsService from '../../../server/services/gtfs.service';

const mockTransitModel = TransitModel as jest.Mocked<typeof TransitModel>;
const mockUser = User as jest.Mocked<typeof User>;
const mockNotificationModel = NotificationModel as jest.Mocked<
  typeof NotificationModel
>;
const mockGtfs = gtfsService as jest.Mocked<typeof gtfsService>;

const sampleRoutes: IRoute[] = [
  {
    id: 'P1',
    name: 'East Busway All-Stops',
    system: 'PRT',
    color: '#00518B',
    directions: ['INBOUND', 'OUTBOUND'],
    activeStatus: true,
    operatingDays: [1, 2, 3, 4, 5]
  },
  {
    id: '61C',
    name: 'McKeesport - Homestead',
    system: 'PRT',
    color: '#FF6600',
    directions: ['INBOUND', 'OUTBOUND'],
    activeStatus: true,
    operatingDays: [0, 1, 2, 3, 4, 5, 6]
  }
];

const sampleStops: IStop[] = [
  {
    stopId: '7079',
    stopName: 'East Busway at Negley',
    lat: 40.45,
    lon: -79.93,
    dtradd: [],
    dtrrem: []
  },
  {
    stopId: '8192',
    stopName: 'Forbes Ave at Craig',
    lat: 40.44,
    lon: -79.95,
    dtradd: [],
    dtrrem: []
  }
];

const sampleUsers: string[] = ['zeta', 'alpha', 'beta', 'adminUser'];

const sampleNotifications: INotification[] = [
  {
    _id: 'n1',
    routeId: '61C',
    vid: '2201',
    message: 'Bus #2201 on Route 61C - Crowdedness changed to Packed',
    changedFields: ['crowdedness'],
    reportId: 'r1',
    createdAt: new Date().toISOString()
  },
  {
    _id: 'n2',
    routeId: 'P1',
    vid: '3302',
    message: 'Bus #3302 on Route P1 - Condition changed to Dirty',
    changedFields: ['condition'],
    reportId: 'r2',
    createdAt: new Date().toISOString()
  }
];

describe('SearchInfo unit tests (R1 + R2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTransitModel.getRoutes.mockResolvedValue(sampleRoutes);
    mockGtfs.getAllStops.mockReturnValue(sampleStops);
    mockUser.getAllUsernames.mockResolvedValue(sampleUsers);
    mockNotificationModel.searchNotifications.mockImplementation(
      async (params: { route?: string; bus?: string; q?: string } = {}) => {
        let notifications = [...sampleNotifications];

        if (params.route) {
          notifications = notifications.filter(
            (n) => n.routeId === params.route
          );
        }

        if (params.bus) {
          notifications = notifications.filter((n) => n.vid === params.bus);
        }

        if (params.q) {
          const lower = params.q.toLowerCase();
          notifications = notifications.filter(
            (n) =>
              n.message.toLowerCase().includes(lower) ||
              n.routeId.toLowerCase().includes(lower) ||
              n.vid.toLowerCase().includes(lower)
          );
        }

        return notifications;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // R2 Stopword Rule — at least 2 tests
  // ---------------------------------------------------------------------------

  describe('R2 Stopword Rule', () => {
    test('removes stop words and keeps meaningful terms (case-insensitive)', () => {
      expect(filterStopWords('The East busway and route')).toBe(
        'east busway route'
      );
    });

    test('returns null when all query tokens are stop words', () => {
      expect(filterStopWords('the and to')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // R1 Search Rules — at least 10 tests
  // ---------------------------------------------------------------------------

  describe('R1 contextual search rules', () => {
    test('UserSearchStrategy supports partial case-insensitive matching', async () => {
      const strategy = new UserSearchStrategy();
      const result = await strategy.search('ADMIN');

      expect(result).toEqual(['adminUser']);
    });

    test('UserSearchStrategy returns all usernames sorted alphabetically when query is empty', async () => {
      const strategy = new UserSearchStrategy();
      const result = await strategy.search('');

      expect(result).toEqual(['adminUser', 'alpha', 'beta', 'zeta']);
    });

    test('RouteSearchStrategy matches by route id', async () => {
      const strategy = new RouteSearchStrategy();
      const result = await strategy.search('61C');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('61C');
    });

    test('RouteSearchStrategy matches by route name', async () => {
      const strategy = new RouteSearchStrategy();
      const result = await strategy.search('east busway');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('P1');
    });

    test('RouteSearchStrategy caps results at 5 items', async () => {
      const manyRoutes: IRoute[] = Array.from({ length: 8 }, (_, i) => ({
        id: `R${i}`,
        name: `Route Alpha ${i}`,
        system: 'PRT',
        color: '#000000',
        directions: ['INBOUND'],
        activeStatus: true,
        operatingDays: [1]
      }));
      mockTransitModel.getRoutes.mockResolvedValue(manyRoutes);

      const strategy = new RouteSearchStrategy();
      const result = await strategy.search('alpha');

      expect(result).toHaveLength(5);
    });

    test('TransitSearchStrategy returns matching routes and stops for mixed context search', async () => {
      const strategy = new TransitSearchStrategy();
      const result = await strategy.search('east');

      expect(result.routes.map((r) => r.id)).toEqual(['P1']);
      expect(result.stops.map((s) => s.stopId)).toEqual(['7079']);
    });

    test('TransitSearchStrategy caps routes and stops to 5 each', async () => {
      const manyRoutes: IRoute[] = Array.from({ length: 7 }, (_, i) => ({
        id: `R${i}`,
        name: `East Line ${i}`,
        system: 'PRT',
        color: '#000000',
        directions: ['INBOUND'],
        activeStatus: true,
        operatingDays: [1]
      }));
      const manyStops: IStop[] = Array.from({ length: 8 }, (_, i) => ({
        stopId: `S${i}`,
        stopName: `East Stop ${i}`,
        lat: 40.4 + i * 0.001,
        lon: -79.9,
        dtradd: [],
        dtrrem: []
      }));
      mockTransitModel.getRoutes.mockResolvedValue(manyRoutes);
      mockGtfs.getAllStops.mockReturnValue(manyStops);

      const strategy = new TransitSearchStrategy();
      const result = await strategy.search('east');

      expect(result.routes).toHaveLength(5);
      expect(result.stops).toHaveLength(5);
    });

    test('NotificationSearchStrategy filters by message/route/vehicle text', async () => {
      const strategy = new NotificationSearchStrategy();
      const result = await strategy.search('packed');

      expect(result).toHaveLength(1);
      expect(result[0].routeId).toBe('61C');
      expect(result[0].vid).toBe('2201');
    });

    test('NotificationSearchStrategyFactory selects expected strategy by context criteria', () => {
      expect(NotificationSearchStrategyFactory.create({})).toBeInstanceOf(
        RecentNotificationsStrategy
      );
      expect(
        NotificationSearchStrategyFactory.create({ route: '61C' })
      ).toBeInstanceOf(NotificationRouteSearchStrategy);
      expect(
        NotificationSearchStrategyFactory.create({ bus: '2201' })
      ).toBeInstanceOf(NotificationBusSearchStrategy);
      expect(
        NotificationSearchStrategyFactory.create({ route: '61C', q: 'packed' })
      ).toBeInstanceOf(NotificationCompositeSearchStrategy);
    });
  });
});
