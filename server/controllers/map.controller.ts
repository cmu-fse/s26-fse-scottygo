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
import {
  RouteSearchStrategy,
  TransitSearchStrategy,
  SearchContext
} from '../search/search-strategy';
import type {
  IRoute,
  ITransitSearchResult
} from '../../common/transit.interface';

export default class MapController extends Controller {
  public constructor(path: string) {
    super(path);
  }

  // REVIEW: Route definitions. Note :username? is optional — getUser must handle missing param.
  public initializeRoutes(): void {
    this.router.get('/', this.mapPage.bind(this));
    this.router.get('/users/:username?', this.authorize, this.getUser);
    this.router.get('/config', this.authorize, this.getMapConfig.bind(this));

    // Search endpoints (SearchInfo UC — R1 contextual search)
    // Auth middleware is applied inline so the page route above stays open.
    this.router.get(
      '/routes/search',
      this.authorize,
      this.searchRoutes.bind(this)
    );
    this.router.get('/search', this.authorize, this.searchTransit.bind(this));
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
      // FIX #8: Use base class sanitizeUser() instead of inline obfuscation
      const sanitizedUser = user ? this.sanitizeUser(user) : null;
      const successRes: responses.ISuccess = {
        name: 'UserFound',
        message: 'User retrieved successfully',
        payload: sanitizedUser
      };
      return res.status(200).json(successRes);
    } catch (error: unknown) {
      // FIX #7: Use base class handleError() instead of inline catch block
      return this.handleError(res, error, 'An unexpected error occurred in the database');
    }
  }

  // ── Search endpoints (SearchInfo UC) ──────────────────────────────────

  /**
   * GET /map/routes/search?q=<keywords>
   * Route Search context — returns up to 5 matching routes.
   * Uses RouteSearchStrategy (Strategy Pattern, R1).
   * Applies stop word filtering (R2).
   */
  public async searchRoutes(req: Request, res: Response): Promise<void> {
    const q = (req.query.q as string | undefined)?.trim();
    if (!q) {
      const error: responses.IAppError = {
        type: 'ClientError',
        name: 'MissingSearchQuery',
        message: 'Query parameter "q" is required'
      };
      res.status(400).json(error);
      return;
    }

    try {
      const context = new SearchContext<IRoute[]>(new RouteSearchStrategy());
      const results = await context.executeSearch(q);
      const success: responses.ISuccess = {
        name: 'SearchTransitCompleted',
        message: results.length
          ? `Found ${results.length} route${results.length === 1 ? '' : 's'} matching '${q}'`
          : `No routes found matching '${q}'`,
        payload: results
      };
      res.status(200).json(success);
    } catch (error: unknown) {
      const err: responses.IAppError = {
        type: 'ServerError',
        name: 'GetRequestFailure',
        message: 'Unexpected error during route search'
      };
      res.status(500).json(err);
    }
  }

  /**
   * GET /map/search?q=<keywords>
   * Stop and Route Search context — returns up to 5 matching routes and 5 stops.
   * Uses TransitSearchStrategy (Strategy Pattern, R1).
   * Applies stop word filtering (R2).
   */
  public async searchTransit(req: Request, res: Response): Promise<void> {
    const q = (req.query.q as string | undefined)?.trim();
    if (!q) {
      const error: responses.IAppError = {
        type: 'ClientError',
        name: 'MissingSearchQuery',
        message: 'Query parameter "q" is required'
      };
      res.status(400).json(error);
      return;
    }

    try {
      const context = new SearchContext<ITransitSearchResult>(
        new TransitSearchStrategy()
      );
      const results = await context.executeSearch(q);
      const total = results.routes.length + results.stops.length;
      const success: responses.ISuccess = {
        name: 'SearchTransitCompleted',
        message: total
          ? `Found ${total} result${total === 1 ? '' : 's'} matching '${q}'`
          : `No results found matching '${q}'`,
        metadata: { totalItems: total },
        payload: results
      };
      res.status(200).json(success);
    } catch (error: unknown) {
      const err: responses.IAppError = {
        type: 'ServerError',
        name: 'GetRequestFailure',
        message: 'Unexpected error during transit search'
      };
      res.status(500).json(err);
    }
  }

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
