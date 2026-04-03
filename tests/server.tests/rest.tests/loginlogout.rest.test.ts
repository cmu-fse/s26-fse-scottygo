/**
 * Integration tests for LoginLogout use case
 * Tests the full stack: HTTP request -> Express -> Controller -> Model -> MongoDB.
 */

import { Server as HttpServer } from 'http';
import App from '../../../server/app';
import { MongoDB } from '../../../server/db/mongo.db';
import AuthController from '../../../server/controllers/auth.controller';
import MapController from '../../../server/controllers/map.controller';
import DAC from '../../../server/db/dac';
import * as responses from '../../../common/server.responses';

// Keep login/logout tests isolated from transit and monitoring startup side effects.
jest.mock('../../../server/services/gtfs.service', () => ({
  __esModule: true,
  default: {
    load: jest.fn().mockResolvedValue(undefined),
    isLoaded: jest.fn().mockReturnValue(true)
  }
}));

jest.mock('../../../server/models/transit.model', () => ({
  __esModule: true,
  TransitModel: {
    refreshAllCaches: jest.fn().mockResolvedValue(undefined)
  }
}));

jest.mock('../../../server/services/vehicle-positions.service', () => ({
  __esModule: true,
  default: {
    start: jest.fn(),
    stop: jest.fn()
  }
}));

jest.mock('../../../server/services/trip-updates.service', () => ({
  __esModule: true,
  default: {
    start: jest.fn(),
    stop: jest.fn()
  }
}));

jest.mock('../../../server/services/memory-monitor.service', () => ({
  __esModule: true,
  default: {
    start: jest.fn(),
    stop: jest.fn(),
    capture: jest.fn(),
    enablePersistence: jest.fn()
  }
}));

const TEST_PORT = 8185;
const TEST_URL = `http://localhost:${TEST_PORT}`;

// Always default DB-writing tests to DEV_DB from .env. TEST_DB_URL can still override in CI.
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

const agreedUser = {
  credentials: {
    username: 'intloginmember',
    password: 'Member123!'
  },
  email: 'intloginmember@cmu.edu',
  agreed: true
};

let app: App;
let server: HttpServer;
let userToken: string;

async function request(
  method: string,
  path: string,
  body?: object,
  token?: string
): Promise<{ status: number; data: responses.IResponse }> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };

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

async function registerAndAgreeUser(
  userData: typeof agreedUser
): Promise<void> {
  await request('POST', '/auth/users', {
    credentials: userData.credentials,
    email: userData.email,
    agreed: userData.agreed
  });

  await request('PATCH', `/auth/users/${userData.credentials.username}`, {
    password: userData.credentials.password
  });
}

beforeAll(async () => {
  const db = new MongoDB(TEST_DB_URL);
  app = new App([new AuthController('/auth'), new MapController('/')], {
    clientDir: './.dist/client',
    db,
    port: TEST_PORT,
    host: 'localhost',
    url: TEST_URL,
    initOnStart: true
  });

  server = await app.listen();
  await new Promise((resolve) => setTimeout(resolve, 1000));

  await registerAndAgreeUser(agreedUser);

  const loginRes = await request(
    'POST',
    `/auth/tokens/${agreedUser.credentials.username}`,
    {
      password: agreedUser.credentials.password
    }
  );

  const success = loginRes.data as responses.ISuccess;
  const authPayload = success.payload as responses.IAuthenticatedUser;
  userToken = authPayload.token;
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

describe('LoginLogout Integration Tests', () => {
  test('login succeeds with valid username and password', async () => {
    const res = await request(
      'POST',
      `/auth/tokens/${agreedUser.credentials.username}`,
      {
        password: agreedUser.credentials.password
      }
    );

    expect(res.status).toBe(200);
    const success = res.data as responses.ISuccess;
    expect(success.name).toBe('UserAuthenticated');

    const payload = success.payload as responses.IAuthenticatedUser;
    expect(payload.token).toBeTruthy();
    expect(payload.user.credentials.username).toBe(
      agreedUser.credentials.username
    );
    expect(payload.user.credentials.password).toBe('obfuscated');
  });

  test('login fails when password is missing', async () => {
    const res = await request(
      'POST',
      `/auth/tokens/${agreedUser.credentials.username}`,
      {}
    );

    expect(res.status).toBe(400);
    expect((res.data as responses.IAppError).name).toBe('MissingPassword');
  });

  test('login fails when password is incorrect', async () => {
    const res = await request(
      'POST',
      `/auth/tokens/${agreedUser.credentials.username}`,
      {
        password: 'WrongPassword123!'
      }
    );

    expect(res.status).toBe(400);
    expect((res.data as responses.IAppError).name).toBe('IncorrectPassword');
  });

  test('login fails when username does not exist', async () => {
    const res = await request('POST', '/auth/tokens/nonexistingmember', {
      password: 'AnyPassword123!'
    });

    expect(res.status).toBe(400);
    expect((res.data as responses.IAppError).name).toBe('UserNotFound');
  });

  test('logout succeeds by removing token on client and blocking protected access', async () => {
    const res = await request('GET', '/config');

    expect(res.status).toBe(401);
    expect((res.data as responses.IAppError).name).toBe('MissingToken');
  });

  test('logout is unsuccessful when token is still present and protected access is still allowed', async () => {
    const res = await request('GET', '/config', undefined, userToken);

    expect(res.status).toBe(200);
    const success = res.data as responses.ISuccess;
    expect(success.name).toBe('ConfigFound');
  });
});
