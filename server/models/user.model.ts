// This is the model for users
// It is used by the controllers to access functionality related users, including database access

import { ILogin, IUser } from '../../common/user.interface';
import { v4 as uuidV4 } from 'uuid';
import DAC from '../db/dac';
import { IAppError } from '../../common/server.responses';
import bcrypt from 'bcrypt';
import { json } from 'stream/consumers';

export class User implements IUser {
  credentials: ILogin;
  extra?: string; // this carries the displayName of the user
  _id?: string;

  constructor(credentials: ILogin, extra?: string) {
    this.credentials = credentials;
    this.extra = extra;
    this._id = uuidV4();
  }
}
