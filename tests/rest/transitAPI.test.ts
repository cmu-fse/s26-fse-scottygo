/**
 * End-to-end smoke tests for TUC 1 — Visualize Routes
 *
 * These tests hit the REAL TrueTime API and GTFS feed (no mocks) to validate
 * that actual response payloads match the interface contracts defined in the
 * REST specification.
 *
 * Prerequisites:
 *   - TRUETIME_KEY must be set in .env
 *   - Network access to TrueTime API and GTFS feed
 *   - MongoDB running
 *
 * Run:  npx jest tests/rest/transit-e2e.test.ts --verbose
 *
 * These tests are slower (network I/O) and may fail if PRT services are down.
 * They intentionally do NOT mock anything so they catch real-world regressions.
 */

import { Server as HttpServer } from 'http';
import App from '../../server/app';
import { MongoDB } from '../../server/db/mongo.db';
import AuthController from '../../server/controllers/auth.controller';
import HomeController from '../../server/controllers/home.controller';
import MapController from '../../server/controllers/map.controller';
import BusController from '../../server/controllers/transit.controller';
import DAC from '../../server/db/dac';
import * as responses from '../../common/server.responses';
import {
  IRoute,
  IVehicle,
  IStop,
  IPrediction,
  IDetour,
  IPattern
} from '../../common/transit.interface';
import { IConfig } from '../../common/map.interface';

// ---------------------------------------------------------------------------
// Setup — real server, real services, no mocks
// ---------------------------------------------------------------------------

const TEST_PORT = 8383;
const TEST_URL = `http://localhost:${TEST_PORT}`;
const TEST_DB_URL =
  process.env.DB_URL ?? 'mongodb://localhost:27017/scottygo_e2e_test';

let app: App;
let server: HttpServer;
let memberToken: string;
let gtfsAvailable = false;

const testUser = {
  credentials: { username: 'e2euser', password: 'E2ETest123!' },
  email: 'e2euser@cmu.edu',
  agreed: true
};

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

async function setupUser(userData: typeof testUser): Promise<string> {
  await request('POST', '/auth/users', {
    credentials: userData.credentials,
    email: userData.email,
    agreed: userData.agreed
  });
  await request('PATCH', `/auth/users/${userData.credentials.username}`, {
    password: userData.credentials.password
  });
  const res = await request(
    'POST',
    `/auth/tokens/${userData.credentials.username}`,
    { password: userData.credentials.password }
  );
  const success = res.data as responses.ISuccess;
  const payload = success.payload as responses.IAuthenticatedUser;
  return payload.token;
}

// ---------------------------------------------------------------------------
// Lifecycle — wait extra time for GTFS to load from the real PRT feed
// ---------------------------------------------------------------------------

beforeAll(async () => {
  const db = new MongoDB(TEST_DB_URL);
  app = new App(
    [
      new HomeController('/'),
      new AuthController('/auth'),
      new MapController('/map'),
      new BusController('/transit')
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
  await new Promise((resolve) => setTimeout(resolve, 2000));

  memberToken = await setupUser(testUser);

  // Wait for GTFS to finish loading (it downloads a real zip file)
  console.log('[E2E] Waiting for GTFS feed to load (up to 120s)...');
  const deadline = Date.now() + 120_000;
  const gtfs = (await import('../../server/services/gtfs.service')).default;
  while (!gtfs.isLoaded() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  gtfsAvailable = gtfs.isLoaded();
  if (!gtfsAvailable) {
    console.warn(
      '[E2E] GTFS did not finish loading; GTFS-dependent tests will be skipped'
    );
  } else {
    console.log('[E2E] GTFS loaded successfully');
  }
}, 150_000);

afterAll(async () => {
  if (app && app.io) {
    await new Promise<void>((resolve) => app.io.close(() => resolve()));
  }
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  if (DAC.db) await DAC.db.close();
}, 10000);

// ============================================================================
// Helper: validate IRoute shape
// ============================================================================

function expectValidRoute(route: IRoute): void {
  expect(typeof route.id).toBe('string');
  expect(route.id.length).toBeGreaterThan(0);
  expect(typeof route.name).toBe('string');
  expect(['PRT', 'CMU']).toContain(route.system);
  expect(typeof route.color).toBe('string');
  expect(Array.isArray(route.directions)).toBe(true);
  expect(typeof route.activeStatus).toBe('boolean');
  expect(Array.isArray(route.operatingDays)).toBe(true);
}

// ============================================================================
// GET /transit/routes — real TrueTime data
// ============================================================================

describe('E2E: GET /transit/routes', () => {
  test('returns real PRT routes with valid IRoute shape', async () => {
    const res = await request('GET', '/transit/routes');

    expect(res.status).toBe(200);
    const success = res.data as responses.ISuccess;
    expect(success.name).toBe('RoutesRetrieved');

    const routes = success.payload as IRoute[];
    expect(routes.length).toBeGreaterThan(0);

    // Validate shape of every returned route
    routes.forEach(expectValidRoute);
  }, 15000);

  test('filtering by system=PRT returns only PRT routes', async () => {
    const res = await request('GET', '/transit/routes?system=PRT');

    expect(res.status).toBe(200);
    const routes = (res.data as responses.ISuccess).payload as IRoute[];
    expect(routes.length).toBeGreaterThan(0);
    routes.forEach((r) => expect(r.system).toBe('PRT'));
  }, 15000);

  test('well-known routes exist (P1, 61C)', async () => {
    const res = await request('GET', '/transit/routes');
    const routes = (res.data as responses.ISuccess).payload as IRoute[];
    const ids = routes.map((r) => r.id);

    // P1 and 61C are longstanding PRT routes that should always exist
    expect(ids).toContain('P1');
    expect(ids).toContain('61C');
  }, 15000);
});

// ============================================================================
// GET /transit/routes/:id — real route geometry
// ============================================================================

describe('E2E: GET /transit/routes/:id', () => {
  test('returns real geometry for P1 with valid IPattern shape', async () => {
    const res = await request('GET', '/transit/routes/P1');

    expect(res.status).toBe(200);
    const success = res.data as responses.ISuccess;
    expect(success.name).toBe('PathGenerated');

    const patterns = success.payload as IPattern[];
    expect(patterns.length).toBeGreaterThan(0);

    patterns.forEach((p) => {
      expect(typeof p.direction).toBe('string');
      expect(p.direction.length).toBeGreaterThan(0);
      expect(Array.isArray(p.path)).toBe(true);
      expect(p.path.length).toBeGreaterThan(0);

      // Validate each coordinate
      p.path.forEach((coord) => {
        expect(typeof coord.lat).toBe('number');
        expect(typeof coord.lng).toBe('number');
        // Pittsburgh area bounds (Rule R1 boundary)
        expect(coord.lat).toBeGreaterThan(39.5);
        expect(coord.lat).toBeLessThan(41.5);
        expect(coord.lng).toBeGreaterThan(-81.0);
        expect(coord.lng).toBeLessThan(-79.0);
      });
    });
  }, 15000);

  test('returns at least one direction with non-empty labels', async () => {
    const res = await request('GET', '/transit/routes/P1');
    const patterns = (res.data as responses.ISuccess).payload as IPattern[];

    // P1 should have at least 1 pattern
    // Note: TrueTime may not return both directions for every route —
    // e.g., P1 currently returns only OUTBOUND from the live API
    expect(patterns.length).toBeGreaterThanOrEqual(1);

    // Each direction label should be a non-empty string
    const dirs = patterns.map((p) => p.direction);
    dirs.forEach((d) => {
      expect(typeof d).toBe('string');
      expect(d.length).toBeGreaterThan(0);
    });
  }, 15000);

  test('returns 404 for a non-existent route', async () => {
    const res = await request('GET', '/transit/routes/ZZZZFAKE');

    expect(res.status).toBe(404);
    const error = res.data as responses.IAppError;
    expect(error.name).toBe('RouteNotFound');
  }, 15000);
});

// ============================================================================
// GET /transit/vehicles/:routeId — real-time vehicle positions
// ============================================================================

describe('E2E: GET /transit/vehicles/:routeId', () => {
  test('returns vehicle data (may be empty if no buses running)', async () => {
    const res = await request('GET', '/transit/vehicles/P1');

    expect(res.status).toBe(200);
    const success = res.data as responses.ISuccess;
    expect(success.name).toBe('VehiclesLocated');

    const vehicles = success.payload as IVehicle[];
    expect(Array.isArray(vehicles)).toBe(true);

    // If buses are running, validate shape
    if (vehicles.length > 0) {
      vehicles.forEach((v) => {
        expect(typeof v.vid).toBe('string');
        expect(typeof v.lat).toBe('number');
        expect(typeof v.lon).toBe('number');
        expect(typeof v.routeId).toBe('string');
        expect(typeof v.heading).toBe('number');
        expect(v.source).toBe('live');
        expect(typeof v.lastUpdate).toBe('string');
        expect(typeof v.isDetoured).toBe('boolean');

        // Coordinates should be in Pittsburgh area
        expect(v.lat).toBeGreaterThan(39.5);
        expect(v.lat).toBeLessThan(41.5);
        expect(v.lon).toBeGreaterThan(-81.0);
        expect(v.lon).toBeLessThan(-79.0);

        // All vehicles should be for the requested route (Rule R1)
        expect(v.routeId).toBe('P1');
      });
    }
  }, 15000);
});

// ============================================================================
// GET /transit/stops/:routeId — real stops for a route
// ============================================================================

describe('E2E: GET /transit/stops/:routeId', () => {
  test('returns real stops for P1 INBOUND with valid IStop shape', async () => {
    const res = await request('GET', '/transit/stops/P1?dir=INBOUND');

    expect(res.status).toBe(200);
    const success = res.data as responses.ISuccess;
    expect(success.name).toBe('StopsRetrieved');

    const stops = success.payload as IStop[];
    expect(stops.length).toBeGreaterThan(0);

    stops.forEach((s) => {
      expect(typeof s.stopId).toBe('string');
      expect(typeof s.stopName).toBe('string');
      expect(s.stopName.length).toBeGreaterThan(0);
      expect(typeof s.lat).toBe('number');
      expect(typeof s.lon).toBe('number');

      // Pittsburgh area
      expect(s.lat).toBeGreaterThan(39.5);
      expect(s.lat).toBeLessThan(41.5);
      expect(s.lon).toBeGreaterThan(-81.0);
      expect(s.lon).toBeLessThan(-79.0);
    });
  }, 15000);

  test('returns 400 when dir parameter is missing', async () => {
    const res = await request('GET', '/transit/stops/P1');

    expect(res.status).toBe(400);
    const error = res.data as responses.IAppError;
    expect(error.name).toBe('MissingParameter');
  }, 15000);

  test('OUTBOUND direction also returns stops', async () => {
    const res = await request('GET', '/transit/stops/P1?dir=OUTBOUND');

    expect(res.status).toBe(200);
    const stops = (res.data as responses.ISuccess).payload as IStop[];
    expect(stops.length).toBeGreaterThan(0);
  }, 15000);
});

// ============================================================================
// GET /transit/stops/:stopId/predictions — real arrival predictions
// ============================================================================

describe('E2E: GET /transit/stops/:stopId/predictions', () => {
  test('returns predictions (may be empty if no service)', async () => {
    // Get a real stop ID first
    const stopsRes = await request('GET', '/transit/stops/P1?dir=INBOUND');
    const stops = (stopsRes.data as responses.ISuccess).payload as IStop[];
    expect(stops.length).toBeGreaterThan(0);

    const stopId = stops[0].stopId;
    const res = await request('GET', `/transit/stops/${stopId}/predictions`);

    // Predictions may return 200 with empty array or data depending on time of day
    expect(res.status).toBe(200);
    const success = res.data as responses.ISuccess;
    expect(success.name).toBe('PredictionsRetrieved');

    const predictions = success.payload as IPrediction[];
    expect(Array.isArray(predictions)).toBe(true);

    if (predictions.length > 0) {
      predictions.forEach((p) => {
        expect(typeof p.stopId).toBe('string');
        expect(typeof p.routeId).toBe('string');
        expect(typeof p.predictedArrivalTime).toBe('number');
        expect(typeof p.isDelayed).toBe('boolean');
        expect(typeof p.minutes).toBe('number');
        expect(p.minutes).toBeGreaterThanOrEqual(0);
      });
    }
  }, 20000);
});

// ============================================================================
// GET /transit/detours/:routeId — real detour data
// ============================================================================

describe('E2E: GET /transit/detours/:routeId', () => {
  test('returns detour data (may be empty if none active)', async () => {
    const res = await request('GET', '/transit/detours/P1');

    expect(res.status).toBe(200);
    const success = res.data as responses.ISuccess;
    expect(success.name).toBe('DetoursRetrieved');

    const detours = success.payload as IDetour[];
    expect(Array.isArray(detours)).toBe(true);

    if (detours.length > 0) {
      detours.forEach((d) => {
        expect(typeof d.id).toBe('string');
        expect(typeof d.description).toBe('string');
        expect(d.description.length).toBeGreaterThan(0);
        expect(typeof d.startdt).toBe('string');
        // enddt may be empty string but should be present
        expect(d).toHaveProperty('enddt');
      });
    }
  }, 15000);
});

// ============================================================================
// POST /transit/routes/available — GTFS-based date/time filtering
// ============================================================================

describe('E2E: POST /transit/routes/available', () => {
  test("filters routes by today's date and returns valid routes", async () => {
    if (!gtfsAvailable) return; // skip when GTFS feed is unavailable

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const res = await request('POST', '/transit/routes/available', {
      date: today
    });

    expect(res.status).toBe(200);
    const success = res.data as responses.ISuccess;
    expect(success.name).toBe('RoutesRetrieved');

    const routes = success.payload as IRoute[];
    expect(routes.length).toBeGreaterThan(0);
    routes.forEach(expectValidRoute);
  }, 15000);

  test('filters by date and time (mid-day should have many routes)', async () => {
    if (!gtfsAvailable) return; // skip when GTFS feed is unavailable

    const today = new Date().toISOString().split('T')[0];

    const res = await request('POST', '/transit/routes/available', {
      date: today,
      time: '12:00'
    });

    expect(res.status).toBe(200);
    const routes = (res.data as responses.ISuccess).payload as IRoute[];
    // Mid-day on any given day should have at least some routes
    expect(routes.length).toBeGreaterThan(0);
  }, 15000);

  test('very late night may return fewer routes (A7 scenario)', async () => {
    if (!gtfsAvailable) return; // skip when GTFS feed is unavailable

    const today = new Date().toISOString().split('T')[0];

    const midday = await request('POST', '/transit/routes/available', {
      date: today,
      time: '12:00'
    });
    const lateNight = await request('POST', '/transit/routes/available', {
      date: today,
      time: '03:00'
    });

    // Guard: only compare if both requests succeeded
    if (midday.status !== 200 || lateNight.status !== 200) return;

    const middayRoutes = (midday.data as responses.ISuccess)
      .payload as IRoute[];
    const lateRoutes = (lateNight.data as responses.ISuccess)
      .payload as IRoute[];

    // Late night should have fewer or equal routes compared to mid-day
    expect(lateRoutes.length).toBeLessThanOrEqual(middayRoutes.length);
  }, 20000);

  test('returns 400 when date is missing', async () => {
    const res = await request('POST', '/transit/routes/available', {});

    expect(res.status).toBe(400);
    const error = res.data as responses.IAppError;
    expect(error.name).toBe('MissingParameter');
  }, 15000);

  test('returns 500 when GTFS data is not loaded', async () => {
    if (gtfsAvailable) return; // only meaningful when GTFS is down

    const today = new Date().toISOString().split('T')[0];
    const res = await request('POST', '/transit/routes/available', {
      date: today
    });

    // When GTFS feed is unavailable, the server should return 500
    expect(res.status).toBe(500);
    const error = res.data as responses.IAppError;
    expect(error.name).toBe('GetRequestFailure');
  }, 15000);
});

// ============================================================================
// GET /map/config — real map configuration
// ============================================================================

describe('E2E: GET /map/config', () => {
  test('returns valid map config with auth token', async () => {
    const res = await request('GET', '/map/config', undefined, memberToken);

    expect(res.status).toBe(200);
    const success = res.data as responses.ISuccess;
    expect(success.name).toBe('ConfigFound');

    const config = success.payload as IConfig;
    expect(typeof config.apiKey).toBe('string');
    expect(typeof config.lat).toBe('number');
    expect(typeof config.lon).toBe('number');
    expect(typeof config.defaultZoom).toBe('number');

    // Default center should be CMU campus area
    expect(config.lat).toBeCloseTo(40.4433, 1);
    expect(config.lon).toBeCloseTo(-79.9436, 1);
    expect(config.defaultZoom).toBeGreaterThan(0);
  }, 15000);

  test('rejects request without token', async () => {
    const res = await request('GET', '/map/config');
    expect(res.status).toBe(401);
  }, 15000);
});

// ============================================================================
// Cross-endpoint consistency: route from /routes should work in other endpoints
// ============================================================================

describe('E2E: Cross-endpoint consistency', () => {
  test('a route from /routes has geometry, stops, and accepts vehicles request', async () => {
    // 1. Get a real route ID
    const routesRes = await request('GET', '/transit/routes');
    const routes = (routesRes.data as responses.ISuccess).payload as IRoute[];
    expect(routes.length).toBeGreaterThan(0);

    const routeId = routes[0].id;

    // 2. That route should have geometry
    const geoRes = await request('GET', `/transit/routes/${routeId}`);
    expect(geoRes.status).toBe(200);
    const patterns = (geoRes.data as responses.ISuccess).payload as IPattern[];
    expect(patterns.length).toBeGreaterThan(0);

    // 3. That route should have stops
    const stopsRes = await request(
      'GET',
      `/transit/stops/${routeId}?dir=INBOUND`
    );
    expect(stopsRes.status).toBe(200);
    const stops = (stopsRes.data as responses.ISuccess).payload as IStop[];
    expect(stops.length).toBeGreaterThan(0);

    // 4. Vehicles endpoint should respond (even if empty at night)
    const vehRes = await request('GET', `/transit/vehicles/${routeId}`);
    expect(vehRes.status).toBe(200);
    expect(Array.isArray((vehRes.data as responses.ISuccess).payload)).toBe(
      true
    );
  }, 30000);
});
