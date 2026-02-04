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
  email: string; // this carries the email of the user
  agreed: boolean; // reflects if user agreed to Terms of Services
  _id?: string;

  constructor(credentials: ILogin, email: string, agreed: boolean) {
    this.credentials = credentials;
    this.email = email;
    this.agreed = agreed;
    this._id = uuidV4();
  }

  async join(): Promise<IUser> {
    // Join YACA as a user, serving the register request

    // Validate username is a valid email format with regex and its test method:
    // first ^ is start anchor,
    // [^\s@]+ means one or more characters that are not whitespace or @,
    // then @ symbol,
    // then [^\s@]+ means one or more characters that are not whitespace or @,
    // then a dot .,
    // then [^\s@]+ means one or more characters that are not whitespace or @,
    // and $ is end anchor
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.credentials.username)) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'InvalidUsername',
        message: 'Username must be valid'
      };
      throw error;
    }

    // Check if user already exists
    const existingUser = await DAC.db.findUserByUsername(
      this.credentials.username
    );
    if (existingUser) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'UserExists',
        message: 'A user with this username already exists'
      };
      throw error;
    }

    // Validate password strength
    // Rule 1: At least 4 characters long
    if (this.credentials.password.length < 4) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'WeakPassword',
        message: 'Password must be at least 4 characters long'
      };
      throw error;
    }

    // Rule 2: Must contain at least one letter
    if (!/[a-zA-Z]/.test(this.credentials.password)) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'WeakPassword',
        message: 'Password must contain at least one letter'
      };
      throw error;
    }

    // Rule 3: Must contain at least one number
    if (!/[0-9]/.test(this.credentials.password)) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'WeakPassword',
        message: 'Password must contain at least one number'
      };
      throw error;
    }

    // Rule 4: Must contain at least one special character
    const specialChars = /[$%#@!*&~^\-+]/;
    if (!specialChars.test(this.credentials.password)) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'WeakPassword',
        message: 'Password must contain at least one special character'
      };
      throw error;
    }

    // Rule 5: Cannot contain any characters other than letters, numbers, and allowed special chars
    const validChars = /^[a-zA-Z0-9$%#@!*&~^\-+]+$/;
    if (!validChars.test(this.credentials.password)) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'InvalidPassword',
        message: 'Password contains invalid characters'
      };
      throw error;
    }

    // Hash password before saving
    const passwordToStore = await bcrypt.hash(this.credentials.password, 10);

    const userToSave: IUser = {
      credentials: {
        username: this.credentials.username,
        password: passwordToStore
      },
      email: this.email,
      agreed: this.agreed,
      _id: this._id
    };

    // Save to database
    const savedUser = await DAC.db.saveUser(userToSave);
    return savedUser;
  }

  static async validateUser(credentials: ILogin): Promise<IUser> {
    // Validate user credentials by checking username and password
    // Returns user if valid
    // Throws IAppError for specific failure cases

    // Get user from database
    const user = await DAC.db.findUserByUsername(credentials.username);
    if (!user) {
      // User not found - throw specific error
      const error: IAppError = {
        type: 'ClientError',
        name: 'UserNotFound',
        message: 'User not found'
      };
      throw error;
    }

    // Compare provided password with stored hashed password
    const isValid = await bcrypt.compare(
      credentials.password,
      user.credentials.password
    );

    if (!isValid) {
      // Wrong password - throw specific error
      const error: IAppError = {
        type: 'ClientError',
        name: 'IncorrectPassword',
        message: 'Incorrect password'
      };
      throw error;
    }

    return user;
  }

  static async getUserForUsername(username: string): Promise<IUser | null> {
    // get user from database
    const user = await DAC.db.findUserByUsername(username);
    if (!user) {
      // if user not found, throw error
      const error: IAppError = {
        type: 'ClientError',
        name: 'UserNotFound',
        message: 'User not found - user does not exist'
      };
      throw error;
    }
    return user;
  }

  static async setUserAgreedToTrue(user: IUser): Promise<IUser> {
    user.agreed = true;
    const userWhoAgreed: IUser | null = await DAC.db.setUserAgreedToTrue(user);
    if (!userWhoAgreed) {
      // If patch fails, tell User
      // ServerErrorName = 'PatchRequestFailure'
      const error: IAppError = {
        type: 'ServerError',
        name: 'PatchRequestFailure',
        message: 'Update of user agreed status failed'
      };
      throw error;
    }
    return userWhoAgreed;
  }
}
