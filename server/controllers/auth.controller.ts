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
  // NOTE: Email format validation (CMU-only) is handled in User.join() -> validateEmailFormat().
  //   The Sigrid finding about missing email validation refers to the controller layer only;
  //   the model layer properly validates @cmu.edu format before saving.
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

      // FIX #8: Use base class sanitizeUser() instead of inline obfuscation (was duplicated 4x)
      const sanitizedUser: IUser = this.sanitizeUser(savedUser);

      const userLocation = `/auth/users/${savedUser.credentials.username}`;
      return res.status(201).location(userLocation).json({
        name: 'UserRegistered',
        payload: sanitizedUser
      });
    } catch (error: unknown) {
      // FIX #7: Use base class handleError() instead of inline catch block (was duplicated 6x)
      return this.handleError(res, error, 'An unexpected error occurred during registration');
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

      // FIX #8: Use base class sanitizeUser() instead of inline obfuscation
      const sanitizedUser: IUser = this.sanitizeUser(user);

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
      // FIX #7: Use base class handleError() instead of inline catch block
      return this.handleError(res, error, 'An unexpected error occurred during login');
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
      // FIX #7: Use base class handleError() instead of inline catch block
      return this.handleError(res, error, 'An unexpected error occurred in the database');
    }
    // Now try to update user agreed status and return response
    try {
      const agreedUser: IUser = await User.setUserAgreedToTrue(userToUpdate);
      // FIX #8: Use base class sanitizeUser() instead of inline obfuscation
      const sanitizedUser: IUser = this.sanitizeUser(agreedUser);
      // Return success response
      const successRes: responses.ISuccess = {
        name: 'UserAgreed',
        message: 'User agreed status successfully set to true',
        payload: sanitizedUser
      };
      return res.status(200).json(successRes);
    } catch (error: unknown) {
      // FIX #7: Use base class handleError() instead of inline catch block
      return this.handleError(res, error, 'An unexpected error occurred in the database');
    }
  }
}
