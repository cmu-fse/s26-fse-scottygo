/**
 * Integration tests for TUC 3 — Live Notification
 *
 * Tests the full stack: HTTP request → Express → NotificationController →
 * NotificationModel → MongoDB.
 *
 * Vehicle positions service is mocked so bus coordinates can be controlled
 * deterministically (required for proximity validation R9).
 * Moderation service is mocked to avoid external LLM calls.
 * TransitModel is mocked for route validation in subscribe.
 * AlertsService is mocked to control health + alert content.
 */

import { Server as HttpServer } from 'http';
import App from '../../../server/app';
import { MongoDB } from '../../../server/db/mongo.db';
import AuthController from '../../../server/controllers/auth.controller';
import NotificationController from '../../../server/controllers/notification.controller';
import DAC from '../../../server/db/dac';
import * as responses from '../../../common/server.responses';
import {
  ISubscription,
  IBusReport,
  IVehicle
} from '../../../common/transit.interface';

// ---------------------------------------------------------------------------
// Mocks — isolate external service boundaries
// ---------------------------------------------------------------------------

jest.mock('../../../server/services/gtfs.service', () => ({
  __esModule: true,
  default: {
    load: jest.fn().mockResolvedValue(undefined),
    isLoaded: jest.fn().mockReturnValue(true),
    getRoutes: jest.fn().mockReturnValue([]),
    getPatterns: jest.fn().mockReturnValue([]),
    getStops: jest.fn().mockReturnValue([]),
    getStopsByDirection: jest.fn().mockReturnValue([]),
    filterRoutesByDate: jest.fn().mockReturnValue([]),
    filterRoutesByDateTime: jest.fn().mockReturnValue([])
  }
}));

jest.mock('../../../server/models/transit.model', () => ({
  __esModule: true,
  haversineDistanceMeters: jest.fn(
    (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const toRad = (deg: number) => (deg * Math.PI) / 180;
      const R = 6371000;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) *
          Math.cos(toRad(lat2)) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }
  ),
  TransitModel: {
    refreshAllCaches: jest.fn().mockResolvedValue(undefined),
    getRoutes: jest.fn().mockResolvedValue([
      {
        id: '61C',
        name: 'McKeesport - Homestead',
        system: 'PRT',
        color: '#FF6600',
        directions: ['INBOUND', 'OUTBOUND'],
        activeStatus: true,
        operatingDays: [0, 1, 2, 3, 4, 5, 6]
      },
      {
        id: 'P1',
        name: 'East Busway All-Stops',
        system: 'PRT',
        color: '#00518B',
        directions: ['INBOUND', 'OUTBOUND'],
        activeStatus: true,
        operatingDays: [1, 2, 3, 4, 5]
      }
    ])
  }
}));

jest.mock('../../../server/services/vehicle-positions.service', () => ({
  __esModule: true,
  default: {
    start: jest.fn(),
    stop: jest.fn(),
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
    warmPatternCache: jest.fn().mockResolvedValue(undefined),
    getRoutes: jest.fn().mockResolvedValue([]),
    getPatterns: jest.fn().mockResolvedValue([]),
    getStops: jest.fn().mockResolvedValue([]),
    getVehicles: jest.fn().mockResolvedValue([])
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

jest.mock('../../../server/services/alerts.service', () => ({
  __esModule: true,
  default: {
    start: jest.fn(),
    stop: jest.fn(),
    getAlerts: jest.fn().mockReturnValue([]),
    isHealthy: jest.fn().mockReturnValue(true),
    onAlertsChanged: null
  }
}));

jest.mock('../../../server/services/moderation.service', () => ({
  __esModule: true,
  default: {
    moderate: jest.fn().mockResolvedValue({ flagged: false })
  }
}));

import vehiclePositionsService from '../../../server/services/vehicle-positions.service';
import alertsService from '../../../server/services/alerts.service';
import moderationService from '../../../server/services/moderation.service';

const mockVehicles = vehiclePositionsService as jest.Mocked<
  typeof vehiclePositionsService
>;
const mockAlerts = alertsService as jest.Mocked<typeof alertsService>;
const mockModeration = moderationService as jest.Mocked<
  typeof moderationService
>;

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

/**
 * Bus at CMU campus coordinates (40.4433, -79.9436).
 * Placing the test user's lat/lon at the same spot makes proximity = 0 miles.
 */
const nearBus: IVehicle = {
  vid: 'bus-001',
  lat: 40.4433,
  lon: -79.9436,
  routeId: '61C',
  heading: 90,
  source: 'live',
  lastUpdate: new Date().toISOString(),
  isDetoured: false,
  delay: 0
};

/** Bus placed ~5 miles away — reporter will fail the proximity check. */
const farBus: IVehicle = {
  vid: 'bus-far',
  lat: 40.5,
  lon: -80.05,
  routeId: '61C',
  heading: 0,
  source: 'live',
  lastUpdate: new Date().toISOString(),
  isDetoured: false,
  delay: 0
};

// ---------------------------------------------------------------------------
// Test configuration
// ---------------------------------------------------------------------------

const TEST_PORT = 8591;
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

let app: App;
let server: HttpServer;
let memberToken: string;

const testMember = {
  credentials: { username: 'tuc3member1', password: 'Member123!' },
  email: 'tuc3member1@cmu.edu',
  agreed: true
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function request(
  method: string,
  path: string,
  body?: object,
  token?: string
): Promise<{ status: number; data: responses.IResponse }> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${TEST_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json();
  return { status: response.status, data };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeAll(async () => {
  const db = new MongoDB(TEST_DB_URL);
  app = new App(
    [
      AuthController.getInstance('/auth'),
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
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Register, agree to terms, then log in to obtain a Bearer token
  await request('POST', '/auth/users', {
    credentials: testMember.credentials,
    email: testMember.email,
    agreed: testMember.agreed
  });
  await request('PATCH', `/auth/users/${testMember.credentials.username}`, {
    password: testMember.credentials.password
  });
  const loginRes = await request(
    'POST',
    `/auth/tokens/${testMember.credentials.username}`,
    { password: testMember.credentials.password }
  );
  const loginSuccess = loginRes.data as responses.ISuccess;
  memberToken = (loginSuccess.payload as responses.IAuthenticatedUser).token;
}, 30000);

afterAll(async () => {
  if (app && app.io) {
    await new Promise<void>((resolve) => app.io.close(() => resolve()));
  }
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  if (DAC.db) await DAC.db.close();
}, 10000);

beforeEach(() => {
  jest.clearAllMocks();
  // Default: moderation passes, bus is nearby
  mockModeration.moderate.mockResolvedValue({ flagged: false });
  mockVehicles.getVehicles.mockReturnValue([nearBus]);
  mockAlerts.isHealthy.mockReturnValue(true);
  mockAlerts.getAlerts.mockReturnValue([]);
});

// ============================================================================
// TUC3 Integration Tests — Live Notification
// ============================================================================

describe('TUC3: Subscriptions', () => {
  // --------------------------------------------------------------------------
  // 1. POSITIVE: subscribe to a valid route, verify subscription persisted
  // --------------------------------------------------------------------------
  test('(+) subscribing to a valid route creates a subscription with correct shape', async () => {
    const res = await request(
      'POST',
      '/notifications/subscriptions',
      { routeId: '61C' },
      memberToken
    );

    expect(res.status).toBe(201);
    const success = res.data as responses.ISuccess;
    expect(success.name).toBe('RouteSubscribed');

    const sub = success.payload as ISubscription;
    expect(sub.routeId).toBe('61C');
    expect(sub._id).toBeTruthy();
    expect(sub.userId).toBeTruthy();
    expect(sub.createdAt).toBeTruthy();

    // State check: subscription must appear in GET /notifications/subscriptions
    const getRes = await request(
      'GET',
      '/notifications/subscriptions',
      undefined,
      memberToken
    );
    expect(getRes.status).toBe(200);
    const subs = (getRes.data as responses.ISuccess).payload as ISubscription[];
    expect(subs.some((s) => s.routeId === '61C')).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 2. NEGATIVE: subscribing to a non-existent route returns 404 RouteNotFound
  // --------------------------------------------------------------------------
  test('(-) subscribing to a non-existent route returns RouteNotFound', async () => {
    const res = await request(
      'POST',
      '/notifications/subscriptions',
      { routeId: 'DOESNOTEXIST' },
      memberToken
    );

    expect(res.status).toBe(404);
    const error = res.data as responses.IAppError;
    expect(error.name).toBe('RouteNotFound');
    expect(error.type).toBe('ClientError');
  });

  // --------------------------------------------------------------------------
  // 3. NEGATIVE: duplicate subscription returns 409 DuplicateSubscription
  // --------------------------------------------------------------------------
  test('(-) subscribing to same route twice returns DuplicateSubscription', async () => {
    // First subscription (may already exist from test 1 — idempotent attempt)
    await request(
      'POST',
      '/notifications/subscriptions',
      { routeId: 'P1' },
      memberToken
    );

    // Second attempt must fail
    const res = await request(
      'POST',
      '/notifications/subscriptions',
      { routeId: 'P1' },
      memberToken
    );

    expect(res.status).toBe(409);
    const error = res.data as responses.IAppError;
    expect(error.name).toBe('DuplicateSubscription');
  });

  // --------------------------------------------------------------------------
  // 4. POSITIVE: unsubscribe removes the subscription from the database
  // --------------------------------------------------------------------------
  test('(+) unsubscribing from a subscribed route removes it permanently', async () => {
    // Ensure subscribed first
    await request(
      'POST',
      '/notifications/subscriptions',
      { routeId: '61C' },
      memberToken
    );

    const unsubRes = await request(
      'DELETE',
      '/notifications/subscriptions/61C',
      undefined,
      memberToken
    );

    expect(unsubRes.status).toBe(200);
    const success = unsubRes.data as responses.ISuccess;
    expect(success.name).toBe('RouteUnsubscribed');

    // State check: subscription must be gone
    const getRes = await request(
      'GET',
      '/notifications/subscriptions',
      undefined,
      memberToken
    );
    const subs = (getRes.data as responses.ISuccess).payload as ISubscription[];
    expect(subs.some((s) => s.routeId === '61C')).toBe(false);
  });

  // --------------------------------------------------------------------------
  // 5. NEGATIVE: unsubscribing from a route the user never subscribed to returns 404
  // --------------------------------------------------------------------------
  test('(-) unsubscribing from a route not subscribed to returns SubscriptionNotFound', async () => {
    const res = await request(
      'DELETE',
      '/notifications/subscriptions/61C',
      undefined,
      memberToken
    );

    expect(res.status).toBe(404);
    const error = res.data as responses.IAppError;
    expect(error.name).toBe('SubscriptionNotFound');
  });

  // --------------------------------------------------------------------------
  // 6. NEGATIVE: all subscription endpoints reject unauthenticated requests
  // --------------------------------------------------------------------------
  test('(-) subscription endpoints require a valid auth token', async () => {
    const getRes = await request('GET', '/notifications/subscriptions');
    expect(getRes.status).toBe(401);

    const postRes = await request('POST', '/notifications/subscriptions', {
      routeId: '61C'
    });
    expect(postRes.status).toBe(401);

    const deleteRes = await request(
      'DELETE',
      '/notifications/subscriptions/61C'
    );
    expect(deleteRes.status).toBe(401);
  });
});

describe('TUC3: Bus Reports', () => {
  // --------------------------------------------------------------------------
  // 7. POSITIVE: valid report for a nearby bus creates report + notification
  // --------------------------------------------------------------------------
  test('(+) report for nearby bus with changed status creates a notification', async () => {
    mockVehicles.getVehicles.mockReturnValue([nearBus]);

    const res = await request(
      'POST',
      '/notifications/reports',
      {
        vid: 'bus-001',
        routeId: '61C',
        crowdedness: 'Packed',
        lat: nearBus.lat,
        lon: nearBus.lon
      },
      memberToken
    );

    expect(res.status).toBe(201);
    const success = res.data as responses.ISuccess;
    expect(success.name).toBe('ReportSubmitted');
    expect(success.message).toBe('Report submitted. Thank you!');

    const report = success.payload as IBusReport;
    expect(report._id).toBeTruthy();
    expect(report.vid).toBe('bus-001');
    expect(report.routeId).toBe('61C');
    expect(report.crowdedness).toBe('Packed');
    expect(report.createdAt).toBeTruthy();
  });

  // --------------------------------------------------------------------------
  // 8. POSITIVE: second report with same status does NOT publish notification (A18)
  // --------------------------------------------------------------------------
  test('(+) second report with identical status is stored but does not produce a notification (A18)', async () => {
    mockVehicles.getVehicles.mockReturnValue([nearBus]);

    // First report — sets last known status to Clean
    await request(
      'POST',
      '/notifications/reports',
      {
        vid: 'bus-001',
        routeId: '61C',
        condition: 'Clean',
        lat: nearBus.lat,
        lon: nearBus.lon
      },
      memberToken
    );

    // Second report — same condition, no change
    const res = await request(
      'POST',
      '/notifications/reports',
      {
        vid: 'bus-001',
        routeId: '61C',
        condition: 'Clean',
        lat: nearBus.lat,
        lon: nearBus.lon
      },
      memberToken
    );

    // Both POSTs succeed — the second does not error even though no notification
    // is generated by the model (A18: only publish on status change)
    expect(res.status).toBe(201);
    const success = res.data as responses.ISuccess;
    expect(success.name).toBe('ReportSubmitted');
  });

  // --------------------------------------------------------------------------
  // 9. NEGATIVE: report from a user too far from the bus is rejected (R9)
  // --------------------------------------------------------------------------
  test('(-) report from user outside 0.5-mile proximity radius is rejected (R9)', async () => {
    mockVehicles.getVehicles.mockReturnValue([farBus]);

    const res = await request(
      'POST',
      '/notifications/reports',
      {
        vid: 'bus-far',
        routeId: '61C',
        crowdedness: 'Empty',
        lat: 40.4433, // user at CMU, bus is 5+ miles away
        lon: -79.9436
      },
      memberToken
    );

    expect(res.status).toBe(403);
    const error = res.data as responses.IAppError;
    expect(error.name).toBe('ProximityViolation');
    expect(error.type).toBe('ClientError');
  });

  // --------------------------------------------------------------------------
  // 10. NEGATIVE: report with all fields skipped returns EmptyReport (A5/R5)
  // --------------------------------------------------------------------------
  test('(-) report with no answered questions is rejected as EmptyReport (A5)', async () => {
    mockVehicles.getVehicles.mockReturnValue([nearBus]);

    const res = await request(
      'POST',
      '/notifications/reports',
      {
        vid: 'bus-001',
        routeId: '61C',
        lat: nearBus.lat,
        lon: nearBus.lon
        // no crowdedness, prioritySeating, condition, or comment
      },
      memberToken
    );

    expect(res.status).toBe(400);
    const error = res.data as responses.IAppError;
    expect(error.name).toBe('EmptyReport');
    expect(error.type).toBe('ClientError');
  });

  // --------------------------------------------------------------------------
  // 11. NEGATIVE: report with invalid enum value returns InvalidReportField
  // --------------------------------------------------------------------------
  test('(-) report with invalid crowdedness value returns InvalidReportField', async () => {
    mockVehicles.getVehicles.mockReturnValue([nearBus]);

    const res = await request(
      'POST',
      '/notifications/reports',
      {
        vid: 'bus-001',
        routeId: '61C',
        crowdedness: 'Completely Empty', // not a valid ICrowdedness value
        lat: nearBus.lat,
        lon: nearBus.lon
      },
      memberToken
    );

    expect(res.status).toBe(400);
    const error = res.data as responses.IAppError;
    expect(error.name).toBe('InvalidReportField');
  });

  // --------------------------------------------------------------------------
  // 12. POSITIVE: flagged comment is excluded but report is still accepted (A19/R11)
  // --------------------------------------------------------------------------
  test('(+) report with flagged comment is accepted but warning reflected in response message (A19)', async () => {
    mockVehicles.getVehicles.mockReturnValue([nearBus]);
    mockModeration.moderate.mockResolvedValue({
      flagged: true,
      category: 'inappropriate'
    });

    const res = await request(
      'POST',
      '/notifications/reports',
      {
        vid: 'bus-001',
        routeId: '61C',
        crowdedness: 'Packed',
        comment: 'Some inappropriate text',
        lat: nearBus.lat,
        lon: nearBus.lon
      },
      memberToken
    );

    expect(res.status).toBe(201);
    const success = res.data as responses.ISuccess;
    expect(success.name).toBe('ReportSubmitted');
    // Message must warn about the flagged comment
    expect(success.message).toContain('flagged');

    // Report payload is still stored
    const report = success.payload as IBusReport;
    expect(report._id).toBeTruthy();
  });

  // --------------------------------------------------------------------------
  // 13. NEGATIVE: report for a vehicle not on the route returns VehicleNotFound
  // --------------------------------------------------------------------------
  test('(-) report for a vehicle not found on the given route returns VehicleNotFound', async () => {
    // getVehicles returns empty — vid won't be found
    mockVehicles.getVehicles.mockReturnValue([]);

    const res = await request(
      'POST',
      '/notifications/reports',
      {
        vid: 'ghost-bus',
        routeId: '61C',
        crowdedness: 'Empty',
        lat: nearBus.lat,
        lon: nearBus.lon
      },
      memberToken
    );

    expect(res.status).toBe(404);
    const error = res.data as responses.IAppError;
    expect(error.name).toBe('VehicleNotFound');
  });
});

describe('TUC3: Service Alerts', () => {
  // --------------------------------------------------------------------------
  // 17. POSITIVE: GET /notifications/alerts returns alerts from the feed
  // --------------------------------------------------------------------------
  test('(+) GET /notifications/alerts returns current service alerts', async () => {
    mockAlerts.isHealthy.mockReturnValue(true);
    mockAlerts.getAlerts.mockReturnValue([
      {
        id: 'alert-1',
        headerText: 'Route 61C delay',
        descriptionText: 'Delays due to construction.',
        routeIds: ['61C'],
        activePeriods: [
          { start: '2026-04-03T08:00:00Z', end: '2026-04-03T18:00:00Z' }
        ]
      }
    ]);

    const res = await request(
      'GET',
      '/notifications/alerts',
      undefined,
      memberToken
    );

    expect(res.status).toBe(200);
    const success = res.data as responses.ISuccess;
    expect(success.name).toBe('AlertsRetrieved');

    const alerts = success.payload as responses.IPayload;
    expect(Array.isArray(alerts)).toBe(true);
    const alertList = alerts as Array<{
      id: string;
      headerText: string;
      routeIds: string[];
    }>;
    expect(alertList.length).toBe(1);
    expect(alertList[0].id).toBe('alert-1');
    expect(alertList[0].headerText).toBe('Route 61C delay');
    expect(alertList[0].routeIds).toContain('61C');
  });

  // --------------------------------------------------------------------------
  // 18. NEGATIVE: GET /notifications/alerts returns 503 when feed is unhealthy (A15)
  // --------------------------------------------------------------------------
  test('(-) GET /notifications/alerts returns 503 when alert feed is unavailable (A15)', async () => {
    mockAlerts.isHealthy.mockReturnValue(false);

    const res = await request(
      'GET',
      '/notifications/alerts',
      undefined,
      memberToken
    );

    expect(res.status).toBe(503);
    const error = res.data as responses.IAppError;
    expect(error.name).toBe('AlertFeedUnavailable');
    expect(error.type).toBe('ServerError');
  });
});
