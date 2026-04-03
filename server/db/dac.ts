// dao = Data Access Object
// This is the access point to the database
// It is used to decouple the database from the rest of the application
// It is accessed by the models, which are used by the controllers

import {
  IUser,
  IUserAccount,
  IAccountStatus,
  IPrivilegeLevel
} from '../../common/user.interface';
import {
  ITransitCache,
  ITransitCacheType,
  ISubscription,
  IBusReport,
  INotification
} from '../../common/transit.interface';

export interface IMemorySampleRecord {
  timestamp: Date;
  reason: string;
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
  arrayBuffersMb: number;
  uptimeSec: number;
  peakRssMb: number;
  peakHeapUsedMb: number;
  warning: boolean;
  critical: boolean;
}

export interface IDatabase {
  connect(): Promise<void>;

  init(): Promise<void>;

  close(): Promise<void>;

  saveUser(userData: IUser): Promise<IUser>;

  findUserByUsername(username: string): Promise<IUser | null>;

  findUserById(userId: string): Promise<IUser | null>;

  setUserAgreedToTrue(user: IUser): Promise<IUser | null>;

  // Account management methods
  findUserAccountByUsername(username: string): Promise<IUserAccount | null>;

  findUserAccountById(userId: string): Promise<IUserAccount | null>;

  updateUserStatus(
    username: string,
    status: IAccountStatus
  ): Promise<IUserAccount | null>;

  updateUserPrivilege(
    username: string,
    privilegeLevel: IPrivilegeLevel
  ): Promise<IUserAccount | null>;

  updateUsername(
    oldUsername: string,
    newUsername: string
  ): Promise<IUserAccount | null>;

  updateUserEmail(
    username: string,
    email: string
  ): Promise<IUserAccount | null>;

  updateUserPassword(
    username: string,
    hashedPassword: string
  ): Promise<IUserAccount | null>;

  countAdministrators(): Promise<number>;

  getAllUsernames(): Promise<string[]>;

  getAllUserAccounts(): Promise<IUserAccount[]>;

  seedDefaultAdmin(): Promise<void>;

  // Transit cache methods
  getTransitCache(cacheKey: string): Promise<ITransitCache | null>;

  getAllTransitCaches(): Promise<ITransitCache[]>;

  upsertTransitCache(entry: ITransitCache): Promise<void>;

  clearTransitCache(dataType?: ITransitCacheType): Promise<void>;

  saveMemorySample(sample: IMemorySampleRecord): Promise<void>;

  getRecentMemorySamples(limit: number): Promise<IMemorySampleRecord[]>;

  // Notification (TUC3) methods
  getSubscriptionsByUserId(userId: string): Promise<ISubscription[]>;

  findSubscription(
    userId: string,
    routeId: string
  ): Promise<ISubscription | null>;

  countSubscriptionsByUserId(userId: string): Promise<number>;

  saveSubscription(sub: ISubscription): Promise<ISubscription>;

  deleteSubscription(userId: string, routeId: string): Promise<boolean>;

  saveBusReport(report: IBusReport): Promise<IBusReport>;

  getLatestReportByVehicle(vid: string): Promise<IBusReport | null>;

  saveNotification(notification: INotification): Promise<INotification>;

  getRecentNotifications(
    filter: Record<string, unknown>
  ): Promise<INotification[]>;
}

/* Data Access Class */
class DAC {
  static _db: IDatabase;

  static get db(): IDatabase {
    return DAC._db;
  }

  static set db(db: IDatabase) {
    DAC._db = db;
  }
}

export default DAC;
