// Controller serving the map page where the user lands after login
// Note that controllers don't access the DB direcly, only through the models

import { IUser, ILogin } from '../../common/user.interface';
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

// Default map center (CMU campus) and zoom level
const DEFAULT_MAP_CENTER = { lat: 40.4433, lon: -79.9436 };
const DEFAULT_MAP_ZOOM = 14;

export default class MapController extends Controller {
  private static instance: MapController | null = null;

  private constructor(path: string) {
    super(path);
  }

  public static getInstance(path: string): MapController {
    if (!MapController.instance) {
      MapController.instance = new MapController(path);
    }
    return MapController.instance;
  }

  public initializeRoutes(): void {
    this.router.get('/', this.mapPage.bind(this));
    this.router.get('/users/:username', this.authorize, this.getUser.bind(this).bind(this));
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

  // Check if the user is logged in by validating token
  private async authorize(
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
      return;
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

  // Get a User by username
  public async getUser(req: Request, res: Response) {
    const username = req.params.username;
    if (!username) {
      const errorRes: responses.IAppError = {
        type: 'ClientError',
        name: 'MissingUsername',
        message: 'Username is required'
      };
      return res.status(400).json(errorRes);
    }

    try {
      const user: IUser | null = await User.getUserForUsername(username);

      if (!user) {
        const errorRes: responses.IAppError = {
          type: 'ClientError',
          name: 'UserNotFound',
          message: `User '${username}' not found`
        };
        return res.status(404).json(errorRes);
      }

      const sanitizedUser = this.sanitizeUser(user);
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
        const appError = error as responses.IAppError;
        const statusCode = appError.type === 'ClientError' ? 400 : 500;
        return res.status(statusCode).json(appError);
      }
      const unexpectedError: responses.IAppError = {
        type: 'ServerError',
        name: 'MongoDBError',
        message: 'An unexpected error occurred in the database'
      };
      return res.status(500).json(unexpectedError);
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
        apiKey: GOOGLE_MAPS_KEY || '',
        lat: DEFAULT_MAP_CENTER.lat,
        lon: DEFAULT_MAP_CENTER.lon,
        defaultZoom: DEFAULT_MAP_ZOOM
      }
    };
    res.status(200).json(successRes);
  }
}
