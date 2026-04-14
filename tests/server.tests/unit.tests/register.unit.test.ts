import { Request, Response } from 'express';
import AuthController from '../../../server/controllers/auth.controller';
import { User } from '../../../server/models/user.model';
import { IAppError } from '../../../common/server.responses';
import { IUser } from '../../../common/user.interface';

type MockResponse = Partial<Response> & {
  status: jest.Mock;
  json: jest.Mock;
  location: jest.Mock;
};

const createMockResponse = (): MockResponse => {
  const res: MockResponse = {
    status: jest.fn(),
    json: jest.fn(),
    location: jest.fn()
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.location.mockReturnValue(res);
  return res;
};

/** Helper: build a mock register Request */
const makeRegisterReq = (
  username: string,
  password: string,
  email: string
): Request =>
  ({
    body: {
      credentials: { username, password },
      email,
      agreed: true
    }
  }) as unknown as Request;

describe('Register Use Case unit tests', () => {
  const authController = AuthController.getInstance('/auth');

  const savedUser: IUser = {
    _id: 'user-id-1',
    credentials: { username: 'ValidUser', password: 'hashed-password' },
    email: 'validuser@cmu.edu',
    agreed: true
  };

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // Basic flow – successful registration
  // =========================================================================

  test('register succeeds with valid username, password, and CMU email', async () => {
    const req = makeRegisterReq('ValidUser', 'Pass1!', 'validuser@cmu.edu');
    const res = createMockResponse();

    jest.spyOn(User.prototype, 'join').mockResolvedValue(savedUser);

    await authController.register(req, res as Response);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'UserRegistered',
        payload: expect.objectContaining({
          credentials: expect.objectContaining({
            username: 'ValidUser',
            password: 'obfuscated'
          }),
          email: 'validuser@cmu.edu'
        })
      })
    );
  });

  // =========================================================================
  // A2 – EmailMissing (controller-level)
  // =========================================================================

  test('A2: register fails when email is missing', async () => {
    const req = makeRegisterReq('ValidUser', 'Pass1!', '');
    const res = createMockResponse();

    await authController.register(req, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'MissingEmail' })
    );
  });

  // =========================================================================
  // A6 – Ineligible (non-CMU email, model-level via join)
  // =========================================================================

  test('A6: register fails with non-CMU email (ineligible)', async () => {
    const req = makeRegisterReq('ValidUser', 'Pass1!', 'user@example.com');
    const res = createMockResponse();

    const error: IAppError = {
      type: 'ClientError',
      name: 'InvalidEmail',
      message: 'Email must be a valid CMU email address'
    };
    jest.spyOn(User.prototype, 'join').mockRejectedValue(error);

    await authController.register(req, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(error);
  });

  // =========================================================================
  // R1 – Username Rule (≥6 tests)
  //   • ≥4 chars
  //   • NOT case sensitive (banned check uses .toLowerCase())
  //   • NOT in banned/reserved list
  // =========================================================================

  describe('R1: Username Rule', () => {
    // --- Positive ---

    test('accepts a valid username with 4 characters', async () => {
      const req = makeRegisterReq('Abcd', 'Pass1!', 'abcd@cmu.edu');
      const res = createMockResponse();

      const user: IUser = {
        ...savedUser,
        credentials: { username: 'Abcd', password: 'hashed' },
        email: 'abcd@cmu.edu'
      };
      jest.spyOn(User.prototype, 'join').mockResolvedValue(user);

      await authController.register(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'UserRegistered' })
      );
    });

    test('accepts a long valid username', async () => {
      const req = makeRegisterReq(
        'LongUsername123',
        'Pass1!',
        'longuser@cmu.edu'
      );
      const res = createMockResponse();

      const user: IUser = {
        ...savedUser,
        credentials: { username: 'LongUsername123', password: 'hashed' },
        email: 'longuser@cmu.edu'
      };
      jest.spyOn(User.prototype, 'join').mockResolvedValue(user);

      await authController.register(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    // --- Negative: too short ---

    test('rejects username shorter than 4 characters', async () => {
      const req = makeRegisterReq('abc', 'Pass1!', 'abc@cmu.edu');
      const res = createMockResponse();

      const error: IAppError = {
        type: 'ClientError',
        name: 'InvalidUsername',
        message: 'Username must be at least 4 characters long'
      };
      jest.spyOn(User.prototype, 'join').mockRejectedValue(error);

      await authController.register(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(error);
    });

    // --- Negative: banned / reserved word ---

    test('rejects a banned/reserved username ("admin")', async () => {
      const req = makeRegisterReq('admin', 'Pass1!', 'adm@cmu.edu');
      const res = createMockResponse();

      const error: IAppError = {
        type: 'ClientError',
        name: 'InvalidUsername',
        message: 'This username is invalid - please choose a valid one'
      };
      jest.spyOn(User.prototype, 'join').mockRejectedValue(error);

      await authController.register(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(error);
    });

    // --- Negative: banned word with different case (case-insensitive) ---

    test('rejects banned username regardless of case ("Admin")', async () => {
      const req = makeRegisterReq('Admin', 'Pass1!', 'adm2@cmu.edu');
      const res = createMockResponse();

      const error: IAppError = {
        type: 'ClientError',
        name: 'InvalidUsername',
        message: 'This username is invalid - please choose a valid one'
      };
      jest.spyOn(User.prototype, 'join').mockRejectedValue(error);

      await authController.register(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(error);
    });

    // --- Negative: controller-level missing username ---

    test('rejects when username field is not provided', async () => {
      const req = makeRegisterReq('', 'Pass1!', 'user@cmu.edu');
      const res = createMockResponse();

      await authController.register(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'MissingUsername' })
      );
    });
  });

  // =========================================================================
  // R2 – Password Rule (≥4 tests)
  //   • ≥4 chars
  //   • Passwords ARE case sensitive
  //   • Implementation also requires: letter, number, special char
  // =========================================================================

  describe('R2: Password Rule', () => {
    // --- Positive ---

    test('accepts a valid password meeting all strength rules', async () => {
      const req = makeRegisterReq('ValidUser', 'Pass1!', 'validuser@cmu.edu');
      const res = createMockResponse();

      jest.spyOn(User.prototype, 'join').mockResolvedValue(savedUser);

      await authController.register(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    // --- Negative: too short ---

    test('rejects password shorter than 4 characters', async () => {
      const req = makeRegisterReq('ValidUser', 'Ab1', 'validuser@cmu.edu');
      const res = createMockResponse();

      const error: IAppError = {
        type: 'ClientError',
        name: 'WeakPassword',
        message: 'Password must be at least 4 characters long'
      };
      jest.spyOn(User.prototype, 'join').mockRejectedValue(error);

      await authController.register(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(error);
    });

    // --- Negative: missing number ---

    test('rejects password without a number', async () => {
      const req = makeRegisterReq('ValidUser', 'Pass!!!!', 'validuser@cmu.edu');
      const res = createMockResponse();

      const error: IAppError = {
        type: 'ClientError',
        name: 'WeakPassword',
        message: 'Password must contain at least one number'
      };
      jest.spyOn(User.prototype, 'join').mockRejectedValue(error);

      await authController.register(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(error);
    });

    // --- Negative: missing special character ---

    test('rejects password without a special character', async () => {
      const req = makeRegisterReq('ValidUser', 'Pass1234', 'validuser@cmu.edu');
      const res = createMockResponse();

      const error: IAppError = {
        type: 'ClientError',
        name: 'WeakPassword',
        message: 'Password must contain at least one special character'
      };
      jest.spyOn(User.prototype, 'join').mockRejectedValue(error);

      await authController.register(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(error);
    });

    // --- Negative: controller-level missing password ---

    test('rejects when password field is not provided', async () => {
      const req = makeRegisterReq('ValidUser', '', 'validuser@cmu.edu');
      const res = createMockResponse();

      await authController.register(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'MissingPassword' })
      );
    });
  });
});
