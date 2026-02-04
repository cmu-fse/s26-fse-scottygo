// Controller serving the athentication page and handling user registration and login
// Note that controllers don't access the DB direcly, only through the models

import { ILogin, IUser } from '../../common/user.interface';
import { User } from '../models/user.model';
import Controller from './controller';
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import {
  JWT_KEY as secretKey,
  JWT_EXP as tokenExpiry,
  STAGE as appStage
} from '../env';
import * as responses from '../../common/server.responses';

export default class AuthController extends Controller {
  public constructor(path: string) {
    super(path);
  }

  public initializeRoutes(): void {
    this.router.get('/', this.authPage);
    this.router.post('/users', this.register);
    this.router.post('/tokens/:username?', this.login);
    this.router.patch(
      '/users/:username?agreed=true',
      this.authorize,
      this.agreed
    );
  }

  public async authPage(req: Request, res: Response): Promise<void> {
    return res.redirect('/auth.html');
  }

  public async register(req: Request, res: Response) {
    // Extract user data from request body (IUser format)
    const reqUsername = req.body.credentials?.username;
    const reqPassword = req.body.credentials?.password;
    const reqEmail = req.body.email;
    const reqAgreed = req.body.agreed;

    if (!reqUsername) {
      const errorRes: responses.IAppError = {
        type: 'ClientError',
        name: 'MissingUsername',
        message: 'Username is required'
      };
      return res.status(400).json(errorRes);
    } else if (!reqPassword) {
      const errorRes: responses.IAppError = {
        type: 'ClientError',
        name: 'MissingPassword',
        message: 'Password is required'
      };
      return res.status(400).json(errorRes);
    } else if (!reqEmail) {
      const errorRes: responses.IAppError = {
        type: 'ClientError',
        name: 'MissingEmail',
        message: 'Email address is required'
      };
      return res.status(400).json(errorRes);
    }
    try {
      const newUser = new User(
        { username: reqUsername, password: reqPassword },
        reqEmail,
        reqAgreed
      );

      const savedUser = await newUser.join();

      // Obfuscate password
      const sanitizedUser: IUser = {
        ...savedUser,
        credentials: {
          username: savedUser.credentials.username,
          password: 'obfuscated'
        }
      };

      return res.status(201).json({
        name: 'UserRegistered',
        payload: sanitizedUser
      });
    } catch (error: unknown) {
      // Handle errors from model/database
      // Check if it's an IAppError by checking properties
      if (
        error &&
        typeof error === 'object' &&
        'type' in error &&
        'name' in error
      ) {
        const appError = error as responses.IAppError;
        const statusCode = appError.type === 'ClientError' ? 400 : 500;
        return res.status(statusCode).json(appError);
      }

      // Handle error not raised as IAppError - create one to wrap unexpected error
      const unexpectedError: responses.IAppError = {
        type: 'ServerError',
        name: 'MongoDBError',
        message: 'An unexpected error occurred during registration'
      };
      return res.status(500).json(unexpectedError);
    }
  }

  public async login(req: Request, res: Response) {
    // Username comes from URL params (:username?)
    if (!req.params.username) {
      const errorRes: responses.IAppError = {
        type: 'ClientError',
        name: 'MissingUsername',
        message: 'Username is required'
      };
      return res.status(400).json(errorRes);
    }
    // Password comes from request body
    if (!req.body.password) {
      const errorRes: responses.IAppError = {
        type: 'ClientError',
        name: 'MissingPassword',
        message: 'Password is required'
      };
      return res.status(400).json(errorRes);
    }

    const credentials: ILogin = {
      username: req.params.username, // Extract username from URL params
      password: req.body.password // Extract password from body
    };

    try {
      const user: IUser = await User.validateUser(credentials);

      const tokenPayload: ILogin = user.credentials;
      // In tokenExpiry ever changed in .env, handle BOTH cases of
      // token expiry: actual time period and 'never'
      let signedToken: string;
      if (tokenExpiry == 'never') {
        signedToken = jwt.sign(tokenPayload, secretKey);
      } else {
        // Cast to jwt.SignOptions to help TypeScript match the correct jwt.sign() overload
        signedToken = jwt.sign(tokenPayload, secretKey, {
          expiresIn: tokenExpiry
        } as jwt.SignOptions);
      }

      // Obfuscate password before returning to client
      const sanitizedUser: IUser = {
        ...user,
        credentials: {
          username: user.credentials.username,
          password: 'obfuscated'
        }
      };

      const payload: responses.IAuthenticatedUser = {
        token: signedToken,
        user: sanitizedUser
      };
      const successRes: responses.ISuccess = {
        name: 'UserAuthenticated',
        message: `User ${user.credentials.username} is authenticated`,
        payload: payload
      };
      return res.status(200).json(successRes);
    } catch (error: unknown) {
      // Handle errors from model (UserNotFound, IncorrectPassword)
      if (
        error &&
        typeof error === 'object' &&
        'type' in error &&
        'name' in error
      ) {
        const appError = error as responses.IAppError;
        const statusCode = appError.type === 'ClientError' ? 400 : 500;
        return res.status(statusCode).json(appError);
      }

      // Unexpected error
      const unexpectedError: responses.IAppError = {
        type: 'ServerError',
        name: 'MongoDBError',
        message: 'An unexpected error occurred during login'
      };
      return res.status(500).json(unexpectedError);
    }
  }

  public async authorize(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    // Extracts token from header's authorization field ("Bearer <token>")
    const token = req.headers.authorization?.split(' ')[1];

    // Handle missing token
    if (!token) {
      const errorRes: responses.IAppError = {
        type: 'ClientError',
        name: 'MissingToken',
        message: 'Token is required'
      };
      res.status(401).json(errorRes);
      return; // Stop execution
    }

    // Verify and decode token with secretKey
    try {
      const decodedToken: ILogin = jwt.verify(token, secretKey) as ILogin;
      const userOnToken = decodedToken.username; // Extract username from decoded token
      req.body.userOnToken = userOnToken; // Attach username to request object
      next(); // Continue to next middleware
    } catch (error) {
      // Handle JWT verification error (invalid token)
      const errorRes: responses.IAppError = {
        type: 'ClientError',
        name: 'InvalidToken',
        message: 'Invalid token'
      };
      res.status(401).json(errorRes);
      return;
    }
  }

  public async agreed(req: Request, res: Response) {
    // Username comes from URL params (:username?)
    if (!req.params.username) {
      const errorRes: responses.IAppError = {
        type: 'ClientError',
        name: 'MissingUsername',
        message: 'Username is required'
      };
      return res.status(400).json(errorRes);
    }

    const userOnToken = req.body.userOnToken;
    const userWhoAgreed = req.params.username;
    let userToUpdate: IUser;

    // First check for and handle IAppErrors, such as user not existing, user on token
    // not matching username on patch request, and other IAppErrors before updating DB
    try {
      const userFromDB: IUser | null =
        await User.getUserForUsername(userWhoAgreed);
      if (!userFromDB || userFromDB === null) {
        const errorRes: responses.IAppError = {
          type: 'ClientError',
          name: 'UserNotFound',
          message: 'The user could not be found'
        };
        return res.status(400).json(errorRes);
      } else if (userFromDB.credentials.username !== userOnToken) {
        // If the username (user who agreed) doesn't match identity of existing authenticated User,
        // refuse agreed request as unauthorized and tell User that agreeing Terms of Service
        // on behalf of another User isn't permitted
        const errorRes: responses.IAppError = {
          type: 'ClientError',
          name: 'UnauthorizedRequest',
          message:
            'Agreeing Terms of Service on behalf of another user is not permitted'
        };
        return res.status(401).json(errorRes);
      }
      userToUpdate = userFromDB;
      userToUpdate.agreed = true;
    } catch (error: unknown) {
      // Handle errors from model/database
      if (
        error &&
        typeof error === 'object' &&
        'type' in error &&
        'name' in error
      ) {
        const appError = error as responses.IAppError;
        const statusCode = appError.type === 'ClientError' ? 400 : 500;
        return res.status(statusCode).json(appError);
      }
      // Handle error not raised as IAppError
      const unexpectedError: responses.IAppError = {
        type: 'ServerError',
        name: 'MongoDBError',
        message: 'An unexpected error occurred in the database'
      };
      return res.status(500).json(unexpectedError);
    }
    // Now try to edit chat message and return response
    try {
      const agreedUser: IUser = await User.setUserAgreedToTrue(userToUpdate);
      // Return success response
      const successRes: responses.ISuccess = {
        name: 'UserAgreed',
        message: 'User agreed status successfully set to true',
        payload: agreedUser
      };
      return res.status(200).json(successRes);
    } catch (error: unknown) {
      // Handle errors from model/database
      if (
        error &&
        typeof error === 'object' &&
        'type' in error &&
        'name' in error
      ) {
        const appError = error as responses.IAppError;
        const statusCode = appError.type === 'ClientError' ? 400 : 500;
        return res.status(statusCode).json(appError);
      }
      // Handle error not raised as IAppError
      const unexpectedError: responses.IAppError = {
        type: 'ServerError',
        name: 'MongoDBError',
        message: 'An unexpected error occurred in the database'
      };
      return res.status(500).json(unexpectedError);
    }
  }
}
