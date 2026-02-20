// This is the real database, using MongoDB and Mongoose
// It can be initialized with a MongoDB URL pointing to a production or development/test database

import { IDatabase } from './dac';
import mongoose from 'mongoose';
import { Schema, model } from 'mongoose';
import {
  IUser,
  IUserAccount,
  IAccountStatus,
  IPrivilegeLevel
} from '../../common/user.interface';
import { IAppError } from '../../common/server.responses';

// Extended schema for user accounts with status and privilege
const UserSchema = new Schema<IUserAccount>({
  credentials: {
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
  },
  email: { type: String, required: true },
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
        console.error('[MongoDB]: Connection error:', err);
      });
      console.log('[MongoDB]: Connected successfully');
    } catch (err) {
      console.error('[MongoDB]: Failed to connect:', err);
      throw err; // Prevent app from starting if DB connection fails
    }
  }

  async init(): Promise<void> {
    // Check if MongoDB is actually connected before trying to drop collections
    // readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
    if (mongoose.connection.readyState !== 1) {
      console.log('[MongoDB]: Not connected, reconnecting before init...');
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
}
