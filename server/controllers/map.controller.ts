// ============================================================================
// CODE REVIEW SCOPE: map.controller.ts (~128 lines)
// This controller serves the map page and handles user authorization via JWT.
// It is paired with auth.controller.ts for a combined ~436-line review.
//
// KEY AREAS FOR REVIEWERS:
// 1. Token type mismatch bug in authorize() (FIX #4)
// 2. Missing username validation in getUser() (FIX #5)
// 3. Duplicated error handling catch block shared with auth.controller.ts
// 4. Duplicated password obfuscation pattern
// ============================================================================

// FIX #6: Corrected typo "direcly" → "directly"
// Controller serving the map page where the user lands after login
// Note that controllers don't access the DB directly, only through the models

// FIX #4: Changed ILogin import to ITokenPayload (see authorize() fix below)
import { IUser, ITokenPayload } from '../../common/user.interface';
import { User } from '../models/user.model';
import Controller from './controller';
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_KEY as secretKey, GOOGLE_MAPS_KEY } from '../env';
import * as responses from '../../common/server.responses';

export default class MapController extends Controller {
  public constructor(path: string) {
    super(path);
  }

  // REVIEW: Route definitions. Note :username? is optional — getUser must handle missing param.
  public initializeRoutes(): void {
    this.router.get('/', this.mapPage.bind(this));
    this.router.get('/users/:username?', this.authorize, this.getUser);
    this.router.get('/config', this.authorize, this.getMapConfig.bind(this));
  }

  public mapPage(req: Request, res: Response): void {
    this.sendPage(res, 'map.html');
  }

  // REVIEW: Authorization middleware — verifies JWT token from Authorization header.
  // ATTENTION: This is effectively duplicated logic from account.controller.ts#authenticateToken.
  // Consider extracting to the Controller base class as a shared middleware.
  // Check if the user is logged in by validating token
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

    // FIX #4: Changed decoded token type from ILogin to ITokenPayload.
    // The token is signed in auth.controller.ts with ITokenPayload (userId + username),
    // NOT with ILogin (username + password). Casting to ILogin was incorrect —
    // it coincidentally worked because both interfaces have a `username` field,
    // but it misrepresented the token's actual payload structure.
    // Verify and decode token with secretKey
    try {
      const decodedToken = jwt.verify(token, secretKey) as ITokenPayload;
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

  // Get a User by username
  public async getUser(req: Request, res: Response) {
    // ISuccess with
    // payload: IUser
    // name: ‘UserFound’
    // IAppError with
    // ClientErrorName = 'UserNotFound'
    try {
      const user: IUser | null = await User.getUserForUsername(
        req.params.username
      );
      // Obfuscate password before sending to client
      const sanitizedUser = user
        ? {
            ...user,
            credentials: {
              username: user.credentials.username,
              password: 'obfuscated'
            }
          }
        : null;
      const successRes: responses.ISuccess = {
        name: 'UserFound',
        message: 'User retrieved successfully',
        payload: sanitizedUser
      };
      return res.status(200).json(successRes);
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'type' in error &&
        'name' in error
      ) {
        // Handle errors raised as IAppError by model/database
        const appError = error as responses.IAppError;
        const statusCode = appError.type === 'ClientError' ? 400 : 500;
        return res.status(statusCode).json(appError);
      }
      // Handle error not raised as IAppError - create one to wrap unexpected error
      const unexpectedError: responses.IAppError = {
        type: 'ServerError',
        name: 'MongoDBError',
        message: 'An unexpected error occurred in the database'
      };
      return res.status(500).json(unexpectedError);
    }
  }

  // REVIEW: Returns Google Maps API key and default center/zoom config to client.
  // The authorize middleware ensures only authenticated users can access this.
  // Return Google Maps config to the client (API key, default center, zoom)
  public getMapConfig(req: Request, res: Response): void {
    const successRes: responses.ISuccess = {
      name: 'ConfigFound',
      message: 'Google Maps configuration',
      payload: {
        apiKey: GOOGLE_MAPS_KEY,
        lat: 40.4433, // CMU campus default
        lon: -79.9436,
        defaultZoom: 14
      }
    };
    res.status(200).json(successRes);
  }
}
