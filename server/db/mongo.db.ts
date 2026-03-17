// This is the real database, using MongoDB and Mongoose
// It can be initialized with a MongoDB URL pointing to a production or development/test database

import { IDatabase, IMemorySampleRecord } from './dac';
import mongoose from 'mongoose';
import { Schema, model } from 'mongoose';
import {
  IUser,
  IUserAccount,
  IAccountStatus,
  IPrivilegeLevel
} from '../../common/user.interface';
import {
  ITransitCache,
  ITransitCacheType
} from '../../common/transit.interface';
import bcrypt from 'bcrypt';
import { v4 as uuidV4 } from 'uuid';

// Extended schema for user accounts with status and privilege
const UserSchema = new Schema<IUserAccount>({
  credentials: {
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
  },
  email: { type: String, required: false }, // Optional to support default admin with undefined email
  agreed: { type: Boolean, required: true },
  _id: { type: String, required: true },
  status: { type: String, default: 'Active', enum: ['Active', 'Inactive'] },
  privilegeLevel: {
    type: String,
    default: 'Member',
    enum: ['Administrator', 'Coordinator', 'Member']
  }
});

const MUser = model<IUserAccount>('User', UserSchema);

// ── Transit Cache Schema ───────────────────────────────────────────────
const TransitCacheSchema = new Schema<ITransitCache>({
  cacheKey: { type: String, required: true, unique: true },
  dataType: {
    type: String,
    required: true,
    enum: ['routes', 'stops', 'patterns', 'detours']
  },
  data: { type: Schema.Types.Mixed, required: true },
  lastUpdated: { type: Date, required: true },
  expiresAt: { type: Date, required: true }
});

// TTL index: MongoDB automatically removes expired documents
TransitCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const MTransitCache = model<ITransitCache>('TransitCache', TransitCacheSchema);

// ── Memory Monitor Schema ──────────────────────────────────────────────
const MemorySampleSchema = new Schema<IMemorySampleRecord>({
  timestamp: { type: Date, required: true, index: true },
  reason: { type: String, required: true },
  rssMb: { type: Number, required: true },
  heapUsedMb: { type: Number, required: true },
  heapTotalMb: { type: Number, required: true },
  externalMb: { type: Number, required: true },
  arrayBuffersMb: { type: Number, required: true },
  uptimeSec: { type: Number, required: true },
  peakRssMb: { type: Number, required: true },
  peakHeapUsedMb: { type: Number, required: true },
  warning: { type: Boolean, required: true },
  critical: { type: Boolean, required: true }
});

// Retain memory samples for 7 days to bound database growth.
MemorySampleSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 7 * 24 * 60 * 60 }
);

const MMemorySample = model<IMemorySampleRecord>(
  'MemorySample',
  MemorySampleSchema
);

export class MongoDB implements IDatabase {
  public dbURL: string;

  private db: mongoose.Connection | undefined;

  constructor(dbURL: string) {
    this.dbURL = dbURL;
  }

  async connect(): Promise<void> {
    try {
      await mongoose.connect(this.dbURL);
      this.db = mongoose.connection;
      // Add error event listener for ongoing issues
      this.db.on('error', (err) => {
        console.error(
          `[MongoDB ${new Date().toISOString()}] Connection error:`,
          err
        );
      });
      console.log(
        `[MongoDB ${new Date().toISOString()}] Connected successfully`
      );
    } catch (err) {
      console.error(
        `[MongoDB ${new Date().toISOString()}] Failed to connect:`,
        err
      );
      throw err; // Prevent app from starting if DB connection fails
    }
  }

  async init(): Promise<void> {
    // Check if MongoDB is actually connected before trying to drop collections
    // readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
    if (mongoose.connection.readyState !== 1) {
      console.log(
        `[MongoDB ${new Date().toISOString()}] Not connected, reconnecting before init...`
      );
      await this.connect();
    }

    if (this.db == undefined) throw new Error('MongoDB is undefined');

    const collections = this.db.collections;
    // Drop collections entirely (with indexes) instead of just deleting documents like deleteMany
    for (const index in collections) {
      await collections[index].drop();
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      // Remove all event listeners to prevent memory leaks
      // This is important if close() is called and the connection is reused later
      this.db.removeAllListeners();
    }
    await mongoose.disconnect();
  }

  async saveUser(user: IUser): Promise<IUser> {
    const newUser = new MUser(user);
    const savedUser = await newUser.save(); // mongoose document with .toObject() method
    // convert to plain object from mongoose document (which has extra methods/properties) and return
    return savedUser.toObject();
  }

  async findUserByUsername(username: string): Promise<IUser | null> {
    const user: IUser | null = await MUser.findOne({
      'credentials.username': username
    }).lean(); // returns plain object from mongoose document (which has extra methods/properties)
    return user;
  }

  async findUserById(userId: string): Promise<IUser | null> {
    const user: IUser | null = await MUser.findById(userId).lean();
    return user;
  }

  async setUserAgreedToTrue(user: IUser): Promise<IUser | null> {
    const agreedUser: IUser | null = await MUser.findByIdAndUpdate(
      user._id,
      {
        agreed: user.agreed
      },
      {
        new: true // true here returns UPDATED user rather than original
      }
    ).lean();
    return agreedUser;
  }

  // Account management methods

  async findUserAccountByUsername(
    username: string
  ): Promise<IUserAccount | null> {
    const user: IUserAccount | null = await MUser.findOne({
      'credentials.username': username
    }).lean();
    return user;
  }

  async findUserAccountById(userId: string): Promise<IUserAccount | null> {
    const user: IUserAccount | null = await MUser.findById(userId).lean();
    return user;
  }

  async updateUserStatus(
    username: string,
    status: IAccountStatus
  ): Promise<IUserAccount | null> {
    const updatedUser: IUserAccount | null = await MUser.findOneAndUpdate(
      { 'credentials.username': username },
      { status },
      { new: true }
    ).lean();
    return updatedUser;
  }

  async updateUserPrivilege(
    username: string,
    privilegeLevel: IPrivilegeLevel
  ): Promise<IUserAccount | null> {
    const updatedUser: IUserAccount | null = await MUser.findOneAndUpdate(
      { 'credentials.username': username },
      { privilegeLevel },
      { new: true }
    ).lean();
    return updatedUser;
  }

  async updateUsername(
    oldUsername: string,
    newUsername: string
  ): Promise<IUserAccount | null> {
    const updatedUser: IUserAccount | null = await MUser.findOneAndUpdate(
      { 'credentials.username': oldUsername },
      { 'credentials.username': newUsername },
      { new: true }
    ).lean();
    return updatedUser;
  }

  async updateUserEmail(
    username: string,
    email: string
  ): Promise<IUserAccount | null> {
    const updatedUser: IUserAccount | null = await MUser.findOneAndUpdate(
      { 'credentials.username': username },
      { email },
      { new: true }
    ).lean();
    return updatedUser;
  }

  async updateUserPassword(
    username: string,
    hashedPassword: string
  ): Promise<IUserAccount | null> {
    const updatedUser: IUserAccount | null = await MUser.findOneAndUpdate(
      { 'credentials.username': username },
      { 'credentials.password': hashedPassword },
      { new: true }
    ).lean();
    return updatedUser;
  }

  async countAdministrators(): Promise<number> {
    const count = await MUser.countDocuments({
      privilegeLevel: 'Administrator',
      status: 'Active'
    });
    return count;
  }

  async seedDefaultAdmin(): Promise<void> {
    // Check if default admin already exists
    const existingAdmin = await MUser.findOne({
      'credentials.username': 'admin'
    });

    if (existingAdmin) {
      console.log(
        `[MongoDB ${new Date().toISOString()}] Default Administrator already exists`
      );
      return;
    }

    // Create default admin user as specified in UC_ManageAcct R2 Initial-Administrator Rule
    const hashedPassword = await bcrypt.hash('admin', 10);
    const defaultAdmin: IUserAccount = {
      credentials: {
        username: 'admin',
        password: hashedPassword
      },
      email: '', // undefined represented as empty string
      agreed: true, // Default admin is pre-agreed to terms
      _id: uuidV4(),
      status: 'Active',
      privilegeLevel: 'Administrator'
    };

    const newAdmin = new MUser(defaultAdmin);
    await newAdmin.save();
    console.log(
      `[MongoDB ${new Date().toISOString()}] Default Administrator user created (username: Admin, password: admin)`
    );
  }

  async getAllUsernames(): Promise<string[]> {
    const users = await MUser.find({}, { 'credentials.username': 1 }).lean();
    return users.map((u) => u.credentials.username);
  }

  // ── Transit Cache Methods ──────────────────────────────────────────────

  async getTransitCache(cacheKey: string): Promise<ITransitCache | null> {
    const entry = await MTransitCache.findOne({ cacheKey }).lean();
    if (!entry) return null;
    // Check if the cache has expired (belt-and-suspenders alongside TTL index)
    if (new Date() > new Date(entry.expiresAt)) return null;
    return entry as ITransitCache;
  }

  async upsertTransitCache(entry: ITransitCache): Promise<void> {
    await MTransitCache.findOneAndUpdate(
      { cacheKey: entry.cacheKey },
      {
        cacheKey: entry.cacheKey,
        dataType: entry.dataType,
        data: entry.data,
        lastUpdated: entry.lastUpdated,
        expiresAt: entry.expiresAt
      },
      { upsert: true, new: true }
    );
  }

  async clearTransitCache(dataType?: ITransitCacheType): Promise<void> {
    if (dataType) {
      await MTransitCache.deleteMany({ dataType });
    } else {
      await MTransitCache.deleteMany({});
    }
  }

  async saveMemorySample(sample: IMemorySampleRecord): Promise<void> {
    await MMemorySample.create(sample);
  }

  async getRecentMemorySamples(limit: number): Promise<IMemorySampleRecord[]> {
    const docs = await MMemorySample.find({})
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
    return docs as IMemorySampleRecord[];
  }
}
