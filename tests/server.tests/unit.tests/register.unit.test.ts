import bcrypt from 'bcrypt';
import { User } from '../../../server/models/user.model';
import DAC, { IDatabase } from '../../../server/db/dac';
import { IAppError } from '../../../common/server.responses';
import { IUser } from '../../../common/user.interface';

function createMockDb(overrides: Partial<IDatabase> = {}): IDatabase {
  return {
    connect: jest.fn(),
    init: jest.fn(),
    close: jest.fn(),
    saveUser: jest.fn(),
    findUserByUsername: jest.fn(),
    findUserById: jest.fn(),
    setUserAgreedToTrue: jest.fn(),
    findUserAccountByUsername: jest.fn(),
    findUserAccountById: jest.fn(),
    updateUserStatus: jest.fn(),
    updateUserPrivilege: jest.fn(),
    updateUsername: jest.fn(),
    updateUserEmail: jest.fn(),
    updateUserPassword: jest.fn(),
    countAdministrators: jest.fn(),
    getAllUsernames: jest.fn(),
    seedDefaultAdmin: jest.fn(),
    getTransitCache: jest.fn(),
    upsertTransitCache: jest.fn(),
    clearTransitCache: jest.fn(),
    saveMemorySample: jest.fn(),
    getRecentMemorySamples: jest.fn(),
    ...overrides
  };
}

describe('Register Use Case - Username Rule (R1)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('accepts a valid username with minimum length 4', async () => {
    const mockDb = createMockDb({
      findUserByUsername: jest.fn().mockResolvedValue(null),
      saveUser: jest.fn().mockImplementation(async (u: IUser) => u)
    });
    DAC.db = mockDb;

    const user = new User(
      { username: 'abCD', password: 'Ab1!' },
      'member@cmu.edu',
      true
    );

    const result = await user.join();

    expect(result.credentials.username).toBe('abcd');
    expect(mockDb.saveUser).toHaveBeenCalled();
  });

  test('rejects username shorter than 4 characters', async () => {
    const mockDb = createMockDb({
      findUserByUsername: jest.fn().mockResolvedValue(null)
    });
    DAC.db = mockDb;

    const user = new User(
      { username: 'abc', password: 'Ab1!' },
      'member@cmu.edu',
      true
    );

    await expect(user.join()).rejects.toMatchObject({
      type: 'ClientError',
      name: 'InvalidUsername',
      message: 'Username must be at least 4 characters long'
    } as Partial<IAppError>);
  });

  test('rejects banned username in lowercase', async () => {
    const mockDb = createMockDb({
      findUserByUsername: jest.fn().mockResolvedValue(null)
    });
    DAC.db = mockDb;

    const user = new User(
      { username: 'login', password: 'Ab1!' },
      'member@cmu.edu',
      true
    );

    await expect(user.join()).rejects.toMatchObject({
      type: 'ClientError',
      name: 'InvalidUsername',
      message: 'This username is invalid - please choose a valid one'
    } as Partial<IAppError>);
  });

  test('rejects banned username regardless of case', async () => {
    const mockDb = createMockDb({
      findUserByUsername: jest.fn().mockResolvedValue(null)
    });
    DAC.db = mockDb;

    const user = new User(
      { username: 'LoGiN', password: 'Ab1!' },
      'member@cmu.edu',
      true
    );

    await expect(user.join()).rejects.toMatchObject({
      type: 'ClientError',
      name: 'InvalidUsername',
      message: 'This username is invalid - please choose a valid one'
    } as Partial<IAppError>);
  });

  test('normalizes username lookup and storage to lowercase', async () => {
    const mockDb = createMockDb({
      findUserByUsername: jest.fn().mockResolvedValue(null),
      saveUser: jest.fn().mockImplementation(async (u: IUser) => u)
    });
    DAC.db = mockDb;

    const user = new User(
      { username: 'NewUser', password: 'Ab1!' },
      'member@cmu.edu',
      true
    );

    await user.join();

    expect(mockDb.findUserByUsername).toHaveBeenCalledWith('newuser');
    expect(mockDb.saveUser).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: expect.objectContaining({ username: 'newuser' })
      })
    );
  });

  test('rejects existing username regardless of case', async () => {
    const existingUser: IUser = {
      _id: 'existing-user-id',
      credentials: {
        username: 'member1',
        password: '$2b$10$existinghashnotuseddirectly'
      },
      email: 'member@cmu.edu',
      agreed: true
    };

    const mockDb = createMockDb({
      findUserByUsername: jest.fn().mockResolvedValue(existingUser)
    });
    DAC.db = mockDb;

    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

    const user = new User(
      { username: 'Member1', password: 'Ab1!' },
      'different@cmu.edu',
      true
    );

    await expect(user.join()).rejects.toMatchObject({
      type: 'ClientError',
      name: 'InvalidUsername',
      message: 'Please provide a different username'
    } as Partial<IAppError>);

    expect(mockDb.findUserByUsername).toHaveBeenCalledWith('member1');
  });
});

describe('Register Use Case - Password Rule (R2)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('accepts a valid password at minimum length 4', async () => {
    const updatedUser: IUser = {
      _id: 'user-id-1',
      credentials: { username: 'member1', password: 'hashed' },
      email: 'member@cmu.edu',
      agreed: true
    };

    const mockDb = createMockDb({
      updateUserPassword: jest.fn().mockResolvedValue(updatedUser)
    });
    DAC.db = mockDb;

    await expect(User.updatePassword('member1', 'Aa1!')).resolves.toMatchObject(
      {
        credentials: { username: 'member1' }
      }
    );
  });

  test('rejects password shorter than 4 characters', async () => {
    const mockDb = createMockDb();
    DAC.db = mockDb;

    await expect(User.updatePassword('member1', 'Aa1')).rejects.toMatchObject({
      type: 'ClientError',
      name: 'WeakPassword',
      message: 'Password must be at least 4 characters long'
    } as Partial<IAppError>);
  });

  test('password validation succeeds only for exact case', async () => {
    const hashed = await bcrypt.hash('Ab1!', 4);
    const mockDb = createMockDb({
      findUserByUsername: jest.fn().mockResolvedValue({
        _id: 'u-1',
        credentials: { username: 'member1', password: hashed },
        email: 'member@cmu.edu',
        agreed: true
      })
    });
    DAC.db = mockDb;

    await expect(User.validatePassword('member1', 'Ab1!')).resolves.toBe(true);
  });

  test('password validation fails when case differs', async () => {
    const hashed = await bcrypt.hash('Ab1!', 4);
    const mockDb = createMockDb({
      findUserByUsername: jest.fn().mockResolvedValue({
        _id: 'u-1',
        credentials: { username: 'member1', password: hashed },
        email: 'member@cmu.edu',
        agreed: true
      })
    });
    DAC.db = mockDb;

    await expect(User.validatePassword('member1', 'ab1!')).resolves.toBe(false);
  });
});
