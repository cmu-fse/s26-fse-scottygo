// ============================================================================
// CODE REVIEW SCOPE: auth.controller.ts (~308 lines)
// This controller handles user registration, login, and Terms of Service agreement.
// It is paired with map.controller.ts for a combined ~436-line review.
//
// KEY AREAS FOR REVIEWERS:
// 1. Duplicated error-handling catch blocks (Sigrid HIGH severity)
// 2. Duplicated password obfuscation pattern
// 3. Input validation completeness
// 4. Token creation and security
// ============================================================================

// FIX #1: Corrected typo "athentication" → "authentication"
// FIX #2: Corrected typo "direcly" → "directly"
// Controller serving the authentication page and handling user registration and login
// Note that controllers don't access the DB directly, only through the models

import { ILogin, IUser, ITokenPayload } from '../../common/user.interface';
import { User } from '../models/user.model';
import Controller from './controller';
import { Request, Response } from 'express';
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

  // REVIEW: Routes follow RESTful conventions.
  // POST /users → register, POST /tokens/:username → login, PATCH /users/:username → agreed
  public initializeRoutes(): void {
    this.router.get('/', this.authPage.bind(this));
    this.router.post('/users', this.register.bind(this));
    this.router.post('/tokens/:username?', this.login.bind(this));
    this.router.patch('/users/:username', this.agreed.bind(this));
  }

  public authPage(req: Request, res: Response): void {
    this.sendPage(res, 'auth.html');
  }

  // REVIEW: Registration endpoint — validates required fields, creates user, returns sanitized user.
  // ATTENTION: Each validation block creates a new IAppError object with near-identical structure.
  // Consider extracting a helper like `clientError(name, message)` to reduce boilerplate.
  // ISSUE (not fixed): No email format validation — accepts any non-empty string as email.
  //   Recommend adding a regex or library-based email check. (Log as GitHub Issue)
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

      // REVIEW – DUPLICATION: This password obfuscation block (spread + override credentials)
      // is repeated 4 times across auth.controller.ts and map.controller.ts.
      // Sigrid flagged this as HIGH severity duplication.
      // Consider extracting to a shared utility like `sanitizeUser(user: IUser): IUser`.
      // Obfuscate password
      const sanitizedUser: IUser = {
        ...savedUser,
        credentials: {
          username: savedUser.credentials.username,
          password: 'obfuscated'
        }
      };

      const userLocation = `/auth/users/${savedUser.credentials.username}`;
      return res.status(201).location(userLocation).json({
        name: 'UserRegistered',
        payload: sanitizedUser
      });
    } catch (error: unknown) {
      // REVIEW – DUPLICATION: This catch block pattern (check for IAppError shape, map status code)
      // is the most duplicated code in the controllers — repeated 6+ times across auth, map,
      // and account controllers. Sigrid flagged as HIGH severity (12 lines × 5 occurrences).
      // Recommend extracting to Controller base class, e.g.:
      //   protected handleError(res: Response, error: unknown, fallbackMsg: string)
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

  // REVIEW: Login endpoint — validates credentials, checks active/agreed status, issues JWT.
  // ATTENTION: The username/password validation blocks (lines below) are nearly identical
  // to those in agreed() and register(). Sigrid flagged 15-line duplication (HIGH).
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

      // R5: Inactive users cannot log in
      const userAccount = await User.getUserAccount(credentials.username);
      if (userAccount.status === 'Inactive') {
        const error: responses.IAppError = {
          type: 'ClientError',
          name: 'InactiveAccount',
          message:
            'Your account is inactive. Please contact an administrator to reactivate your account.'
        };
        res.status(403).json(error);
        return;
      }

      // Check whether user has agreed Terms of Service, and if not, reject login
      if (user.agreed === false) {
        const error: responses.IAppError = {
          type: 'ClientError',
          name: 'UnauthorizedRequest',
          message:
            'User not authorized to log in and access app until agrees to Terms of Service'
        };
        res.status(401).json(error);
        return; // Stop execution
      }

      // Create token payload with userId (immutable) and username (for convenience)
      const tokenPayload: ITokenPayload = {
        userId: user._id!, // Use userId instead of credentials to avoid token invalidation on username change
        username: user.credentials.username // Include username for convenience
      };
      // In tokenExpiry ever changed in .env, handle BOTH cases of
      // token expiry: actual time period and 'never'
      // FIX #3: Changed loose equality (==) to strict equality (===) to avoid type coercion bugs
      let signedToken: string;
      if (tokenExpiry === 'never') {
        signedToken = jwt.sign(tokenPayload, secretKey);
      } else {
        // Cast to jwt.SignOptions to help TypeScript match the correct jwt.sign() overload
        signedToken = jwt.sign(tokenPayload, secretKey, {
          expiresIn: tokenExpiry
        } as jwt.SignOptions);
      }

      // REVIEW – DUPLICATION: Same password obfuscation pattern as in register() above
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
      // REVIEW – DUPLICATION: Same catch block pattern as register() above.
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

  // REVIEW: agreed() — Updates user's Terms of Service agreement status.
  // ATTENTION: This method has TWO separate try/catch blocks with IDENTICAL error handling.
  // The validation blocks for username/password are also duplicated from login() above.
  // Sigrid flagged 14-line duplication (HIGH) shared with login() and map.controller.ts.
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

    let userToUpdate: IUser;

    try {
      userToUpdate = await User.validateUser(credentials);
    } catch (error: unknown) {
      // REVIEW – DUPLICATION: Third occurrence of the same catch block in this file alone.
      // Handle errors from model and database
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
    // Now try to update user agreed status and return response
    try {
      const agreedUser: IUser = await User.setUserAgreedToTrue(userToUpdate);
      // REVIEW – DUPLICATION: Third occurrence of password obfuscation in this file.
      // Obfuscate password before sending to client
      const sanitizedUser: IUser = {
        ...agreedUser,
        credentials: {
          username: agreedUser.credentials.username,
          password: 'obfuscated'
        }
      };
      // Return success response
      const successRes: responses.ISuccess = {
        name: 'UserAgreed',
        message: 'User agreed status successfully set to true',
        payload: sanitizedUser
      };
      return res.status(200).json(successRes);
    } catch (error: unknown) {
      // REVIEW – DUPLICATION: Fourth occurrence of the same catch block in this file.
      // This is the most critical duplication issue flagged by Sigrid.
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
