/**
 * SearchInfo integration tests
 *
 * Scope: REST API search endpoints with authenticated requests.
 * External service boundaries are mocked for determinism.
 */

import { Server as HttpServer } from 'http';
import App from '../../../server/app';
import { MongoDB } from '../../../server/db/mongo.db';
import AuthController from '../../../server/controllers/auth.controller';
import MapController from '../../../server/controllers/map.controller';
import NotificationController from '../../../server/controllers/notification.controller';
import DAC from '../../../server/db/dac';
import type * as responses from '../../../common/server.responses';
import type {
  INotification,
  IRoute,
  IStop
} from '../../../common/transit.interface';

function buildSampleRoutes(): IRoute[] {
  return [
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
}

function buildSampleStops(): IStop[] {
  return [
    {
      stopId: '7079',
      stopName: 'East Busway at Negley',
      lat: 40.4521,
      lon: -79.9321,
      dtradd: [],
      dtrrem: []
    },
    {
      stopId: '8192',
      stopName: 'Forbes Ave at Craig',
      lat: 40.444,
      lon: -79.949,
      dtradd: [],
      dtrrem: []
    }
  ];
}

jest.mock('../../../server/models/transit.model', () => ({
  __esModule: true,
  TransitModel: {
    refreshAllCaches: jest.fn().mockResolvedValue(undefined),
    getRoutes: jest.fn().mockResolvedValue(buildSampleRoutes()),
    colorsAvailable: true
  }
}));

jest.mock('../../../server/services/gtfs.service', () => ({
  __esModule: true,
  default: {
    load: jest.fn().mockResolvedValue(undefined),
    isLoaded: jest.fn().mockReturnValue(true),
    getAllStops: jest.fn().mockReturnValue(buildSampleStops()),
    getRoutes: jest.fn().mockReturnValue(buildSampleRoutes()),
    getPatterns: jest.fn().mockReturnValue([]),
    getStops: jest.fn().mockReturnValue([]),
    getStopsByDirection: jest.fn().mockReturnValue([]),
    filterRoutesByDate: jest.fn().mockReturnValue(buildSampleRoutes()),
    filterRoutesByDateTime: jest.fn().mockReturnValue(buildSampleRoutes())
  }
}));

jest.mock('../../../server/services/vehicle-positions.service', () => ({
  __esModule: true,
  default: {
    start: jest.fn(),
    stop: jest.fn(),
    getAllVehicles: jest.fn().mockReturnValue([]),
    getVehicles: jest.fn().mockReturnValue([]),
    isHealthy: jest.fn().mockReturnValue(true),
    getLastFetched: jest.fn().mockReturnValue(new Date()),
    getConsecutiveFailures: jest.fn().mockReturnValue(0),
    getLastError: jest.fn().mockReturnValue(null)
  }
}));

jest.mock('../../../server/services/trip-updates.service', () => ({
  __esModule: true,
  default: {
    start: jest.fn(),
    stop: jest.fn(),
    getPredictions: jest.fn().mockReturnValue([]),
    isHealthy: jest.fn().mockReturnValue(true),
    getLastFetched: jest.fn().mockReturnValue(new Date()),
    getConsecutiveFailures: jest.fn().mockReturnValue(0),
    getLastError: jest.fn().mockReturnValue(null)
  }
}));

jest.mock('../../../server/services/tripshot.service', () => ({
  __esModule: true,
  default: {
    isConfigured: jest.fn().mockReturnValue(false),
    getRoutes: jest.fn().mockResolvedValue([]),
    getPatterns: jest.fn().mockResolvedValue([]),
    getStops: jest.fn().mockResolvedValue([]),
    getVehicles: jest.fn().mockResolvedValue([])
  }
}));

jest.mock('../../../server/services/alerts.service', () => ({
  __esModule: true,
  default: {
    start: jest.fn(),
    stop: jest.fn(),
    getAlerts: jest.fn().mockReturnValue([]),
    isHealthy: jest.fn().mockReturnValue(true),
    getLastError: jest.fn().mockReturnValue(null),
    onAlertsChanged: null
  }
}));

jest.mock('../../../server/services/memory-monitor.service', () => ({
  __esModule: true,
  default: {
    start: jest.fn(),
    stop: jest.fn(),
    capture: jest.fn(),
    enablePersistence: jest.fn(),
    getSummary: jest.fn().mockReturnValue({
      latest: {
        timestamp: new Date().toISOString(),
        rssMb: 128,
        heapUsedMb: 64,
        heapTotalMb: 96,
        externalMb: 10,
        arrayBuffersMb: 4,
        uptimeSec: 1
      },
      peakRssMb: 128,
      peakHeapUsedMb: 64,
      recentSamples: [],
      rssDelta5mMb: 0,
      heapUsedDelta5mMb: 0,
      rssSlopeMbPerMin: 0,
      heapUsedSlopeMbPerMin: 0,
      warning: false,
      critical: false
    })
  }
}));

const TEST_PORT = 8617;
const TEST_URL = `http://localhost:${TEST_PORT}`;
const TEST_DB_URL =
  process.env.TEST_DB_URL ??
  (process.env.DB_URL && process.env.DEV_DB
    ? `${process.env.DB_URL}${process.env.DEV_DB}`
    : '');

if (!TEST_DB_URL) {
  throw new Error(
    'Missing DB_URL/DEV_DB (or TEST_DB_URL override). Refusing to run DB-writing tests without explicit DEV database configuration.'
  );
}

const testUser = {
  credentials: { username: 'searchmember', password: 'Search123!' },
  email: 'searchmember@cmu.edu',
  agreed: true
};

let app: App;
let server: HttpServer;
let memberToken: string;

async function request(
  method: string,
  path: string,
  body?: object,
  token?: string
): Promise<{ status: number; data: responses.IResponse }> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${TEST_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json();
  return { status: response.status, data };
}

async function seedNotification(notification: INotification): Promise<void> {
  await DAC.db.saveNotification(notification);
}

beforeAll(async () => {
  const db = new MongoDB(TEST_DB_URL);

  app = new App(
    [
      AuthController.getInstance('/auth'),
      MapController.getInstance('/'),
      NotificationController.getInstance('/notifications')
    ],
    {
      clientDir: './.dist/client',
      db,
      port: TEST_PORT,
      host: 'localhost',
      url: TEST_URL,
      initOnStart: true
    }
  );

  server = await app.listen();
  await new Promise((resolve) => setTimeout(resolve, 800));

  await request('POST', '/auth/users', {
    credentials: testUser.credentials,
    email: testUser.email,
    agreed: testUser.agreed
  });

  await request('PATCH', `/auth/users/${testUser.credentials.username}`, {
    password: testUser.credentials.password
  });

  const loginRes = await request(
    'POST',
    `/auth/tokens/${testUser.credentials.username}`,
    {
      password: testUser.credentials.password
    }
  );

  const success = loginRes.data as responses.ISuccess;
  memberToken = (success.payload as responses.IAuthenticatedUser).token;
}, 30000);

afterAll(async () => {
  if (app && app.io) {
    await new Promise<void>((resolve) => app.io.close(() => resolve()));
  }
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  if (DAC.db) {
    await DAC.db.close();
  }
}, 10000);

describe('SearchInfo REST integration tests', () => {
  test('GET /routes/search returns matching routes by route id', async () => {
    const res = await request(
      'GET',
      '/routes/search?q=61C',
      undefined,
      memberToken
    );

    expect(res.status).toBe(200);
    const success = res.data as responses.ISuccess;
    expect(success.name).toBe('SearchTransitCompleted');
    const payload = success.payload as IRoute[];
    expect(payload).toHaveLength(1);
    expect(payload[0].id).toBe('61C');
  });

  test('GET /routes/search applies stopword rule and returns empty payload for stopwords-only query', async () => {
    const res = await request(
      'GET',
      '/routes/search?q=the+and+to',
      undefined,
      memberToken
    );

    expect(res.status).toBe(200);
    const success = res.data as responses.ISuccess;
    expect(success.name).toBe('SearchTransitCompleted');
    expect(success.message).toContain('No routes found');
    expect(success.payload).toEqual([]);
  });

  test('GET /search returns matching routes and stops with totalItems metadata', async () => {
    const res = await request('GET', '/search?q=east', undefined, memberToken);

    expect(res.status).toBe(200);
    const success = res.data as responses.ISuccess;
    expect(success.name).toBe('SearchTransitCompleted');
    expect(success.metadata).toEqual({ totalItems: 2 });

    const payload = success.payload as { routes: IRoute[]; stops: IStop[] };
    expect(payload.routes.map((r) => r.id)).toEqual(['P1']);
    expect(payload.stops.map((s) => s.stopId)).toEqual(['7079']);
  });

  test('GET /search returns MissingSearchQuery when q is omitted', async () => {
    const res = await request('GET', '/search', undefined, memberToken);

    expect(res.status).toBe(400);
    const error = res.data as responses.IAppError;
    expect(error.type).toBe('ClientError');
    expect(error.name).toBe('MissingSearchQuery');
  });

  test('GET /notifications/notifications returns filtered notifications for route + query', async () => {
    const unique = `searchinfo-${Date.now()}`;

    await seedNotification({
      _id: `n-${unique}-1`,
      routeId: '61C',
      vid: '2201',
      message: `bus is packed ${unique}`,
      changedFields: ['crowdedness'],
      reportId: `r-${unique}-1`,
      createdAt: new Date().toISOString()
    });

    await seedNotification({
      _id: `n-${unique}-2`,
      routeId: 'P1',
      vid: '9900',
      message: `different route ${unique}`,
      changedFields: ['condition'],
      reportId: `r-${unique}-2`,
      createdAt: new Date().toISOString()
    });

    const res = await request(
      'GET',
      `/notifications/notifications?route=61C&q=${encodeURIComponent(unique)}`,
      undefined,
      memberToken
    );

    expect(res.status).toBe(200);
    const success = res.data as responses.ISuccess;
    expect(success.name).toBe('NotificationsRetrieved');

    const payload = success.payload as INotification[];
    expect(payload).toHaveLength(1);
    expect(payload[0].routeId).toBe('61C');
    expect(payload[0].message).toContain(unique);
  });

  test('GET /notifications/notifications returns empty payload when there are no matches', async () => {
    const res = await request(
      'GET',
      '/notifications/notifications?q=definitely-no-match-token',
      undefined,
      memberToken
    );

    expect(res.status).toBe(200);
    const success = res.data as responses.ISuccess;
    expect(success.name).toBe('NotificationsRetrieved');
    expect(success.payload).toEqual([]);
  });

  test('GET search endpoints require JWT bearer token', async () => {
    const routeRes = await request('GET', '/routes/search?q=61C');
    const notifRes = await request(
      'GET',
      '/notifications/notifications?q=test'
    );

    expect(routeRes.status).toBe(401);
    expect((routeRes.data as responses.IAppError).name).toBe('MissingToken');

    expect(notifRes.status).toBe(401);
    expect((notifRes.data as responses.IAppError).name).toBe('MissingToken');
  });
});
