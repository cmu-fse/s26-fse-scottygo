// This is the real database, using MongoDB and Mongoose
// It can be initialized with a MongoDB URL pointing to a production or development/test database

import { IDatabase } from './dac';
import mongoose from 'mongoose';
import { Schema, model } from 'mongoose';
import { IUser } from '../../common/user.interface';
import { IAppError } from '../../common/server.responses';

const UserSchema = new Schema<IUser>({
  credentials: {
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
  },
  extra: { type: String, required: false },
  _id: { type: String, required: true } // required in DB
});

const MUser = model<IUser>('User', UserSchema);

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
}
