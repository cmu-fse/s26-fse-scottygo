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

/**
 * Return a client-error response for a missing required field.
 */
function clientError(
  name: responses.ClientErrorName,
  message: string
): responses.IAppError {
  return { type: 'ClientError', name, message };
}

/**
 * Handle unknown caught errors uniformly.
 * Returns the appropriate HTTP status and IAppError body.
 */
function handleCatchError(
  res: Response,
  error: unknown,
  fallbackMessage: string
) {
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
  const unexpectedError: responses.IAppError = {
    type: 'ServerError',
    name: 'MongoDBError',
    message: fallbackMessage
  };
  return res.status(500).json(unexpectedError);
}

/**
 * Validate that username and password are present in the given values.
 * Returns an IAppError if validation fails, or null if valid.
 */
function validateCredentials(
  username: string | undefined,
  password: string | undefined
): responses.IAppError | null {
  if (!username) {
    return clientError('MissingUsername', 'Username is required');
  }
  if (!password) {
    return clientError('MissingPassword', 'Password is required');
  }
  return null;
}

export default class AuthController extends Controller {
  private static instance: AuthController | null = null;

  private constructor(path: string) {
    super(path);
  }

  public static getInstance(path: string): AuthController {
    if (!AuthController.instance) {
      AuthController.instance = new AuthController(path);
    }
    return AuthController.instance;
  }

  public initializeRoutes(): void {
    this.router.get('/', this.authPage.bind(this));
    this.router.post('/users', this.register.bind(this));
    this.router.post('/tokens/:username?', this.login.bind(this));
    this.router.patch('/users/:username', this.agreed.bind(this));
  }

  public authPage(req: Request, res: Response): void {
    this.sendPage(res, 'auth.html');
  }

  public async register(req: Request, res: Response) {
    const reqUsername = req.body.credentials?.username;
    const reqPassword = req.body.credentials?.password;
    const reqEmail = req.body.email;
    const reqAgreed = req.body.agreed;

    const credentialError = validateCredentials(reqUsername, reqPassword);
    if (credentialError) {
      return res.status(400).json(credentialError);
    } else if (!reqEmail) {
      return res
        .status(400)
        .json(clientError('MissingEmail', 'Email address is required'));
    } else if (reqAgreed === undefined || reqAgreed === null) {
      return res
        .status(400)
        .json(
          clientError(
            'UnauthorizedRequest',
            'Agreement to Terms of Service is required'
          )
        );
    }

    try {
      const newUser = new User(
        { username: reqUsername, password: reqPassword },
        reqEmail,
        reqAgreed
      );

      const savedUser = await newUser.join();
      const sanitizedUser = this.sanitizeUser(savedUser);

      const userResourcePath = `/auth/users/${savedUser.credentials.username}`;
      return res.status(201).location(userResourcePath).json({
        name: 'UserRegistered',
        payload: sanitizedUser
      });
    } catch (error: unknown) {
      return handleCatchError(
        res,
        error,
        'An unexpected error occurred during registration'
      );
    }
  }

  public async login(req: Request, res: Response) {
    const credentialError = validateCredentials(
      req.params.username,
      req.body.password
    );
    if (credentialError) {
      return res.status(400).json(credentialError);
    }

    const credentials: ILogin = {
      username: req.params.username,
      password: req.body.password
    };

    try {
      // R5: Check account status before validating password
      const userAccount = await User.getUserAccount(credentials.username);
      if (userAccount.status === 'Inactive') {
        return res
          .status(403)
          .json(
            clientError(
              'InactiveAccount',
              'Your account is inactive. Please contact an administrator to reactivate your account.'
            )
          );
      }

      const user: IUser = await User.validateUser(credentials);

      // Check whether user has agreed to Terms of Service
      if (user.agreed === false) {
        return res
          .status(401)
          .json(
            clientError(
              'UnauthorizedRequest',
              'User not authorized to log in and access app until agrees to Terms of Service'
            )
          );
      }

      // Create token payload with userId (immutable) and username (for convenience)
      const tokenPayload: ITokenPayload = {
        userId: user._id!,
        username: user.credentials.username
      };

      // Handle both token expiry modes: actual time period and 'never'
      let signedToken: string;
      if (tokenExpiry == 'never') {
        signedToken = jwt.sign(tokenPayload, secretKey);
      } else {
        signedToken = jwt.sign(tokenPayload, secretKey, {
          expiresIn: tokenExpiry
        } as jwt.SignOptions);
      }

      const sanitizedUser = this.sanitizeUser(user);

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
      return handleCatchError(
        res,
        error,
        'An unexpected error occurred during login'
      );
    }
  }

  public async agreed(req: Request, res: Response) {
    const credentialError = validateCredentials(
      req.params.username,
      req.body.password
    );
    if (credentialError) {
      return res.status(400).json(credentialError);
    }

    const credentials: ILogin = {
      username: req.params.username,
      password: req.body.password
    };

    try {
      const userToUpdate: IUser = await User.validateUser(credentials);
      const agreedUser: IUser = await User.setUserAgreedToTrue(userToUpdate);
      const sanitizedUser = this.sanitizeUser(agreedUser);

      const successRes: responses.ISuccess = {
        name: 'UserAgreed',
        message: 'User agreed status successfully set to true',
        payload: sanitizedUser
      };
      return res.status(200).json(successRes);
    } catch (error: unknown) {
      return handleCatchError(
        res,
        error,
        'An unexpected error occurred in the database'
      );
    }
  }
}
