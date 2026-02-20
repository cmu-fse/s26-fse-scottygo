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

  seedDefaultAdmin(): Promise<void>;
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
