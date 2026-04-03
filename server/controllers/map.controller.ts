// Controller serving the map page where the user lands after login
// Note that controllers don't access the DB direcly, only through the models

import { IUser, ILogin } from '../../common/user.interface';
import { User } from '../models/user.model';
import Controller from './controller';
import { NextFunction, Request, Response } from 'express';
import { GOOGLE_MAPS_KEY } from '../env';
import * as responses from '../../common/server.responses';
import { createJwtAuthMiddleware } from '../middleware/auth.middleware';
import { respondWithAppOrUnexpectedError } from '../utils/controller-error.utils';
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
  private readonly authorizeMiddleware = createJwtAuthMiddleware({
    attachMode: 'bodyUserOnToken',
    missingTokenMessage: 'Token is required',
    invalidTokenMessage: 'Invalid token'
  });

  public constructor(path: string) {
    super(path);
  }

  public initializeRoutes(): void {
    this.router.get('/', this.mapPage.bind(this));
    this.router.get('/users/:username?', this.authorize.bind(this), this.getUser);
    this.router.get(
      '/config',
      this.authorize.bind(this),
      this.getMapConfig.bind(this)
    );

    // Search endpoints (SearchInfo UC — R1 contextual search)
    // Auth middleware is applied inline so the page route above stays open.
    this.router.get(
      '/routes/search',
      this.authorize.bind(this),
      this.searchRoutes.bind(this)
    );
    this.router.get(
      '/search',
      this.authorize.bind(this),
      this.searchTransit.bind(this)
    );
  }

  public mapPage(req: Request, res: Response): void {
    this.sendPage(res, 'map.html');
  }

  // Keep public method for existing tests and route middleware usage.
  public async authorize(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    await this.authorizeMiddleware(req, res, next);
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
      respondWithAppOrUnexpectedError(res, error, 'MongoDBError');
      return;
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
    const q = this.getRequiredSearchQuery(req, res);
    if (!q) {
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
      this.sendSearchFailure(res, 'Unexpected error during route search');
    }
  }

  /**
   * GET /map/search?q=<keywords>
   * Stop and Route Search context — returns up to 5 matching routes and 5 stops.
   * Uses TransitSearchStrategy (Strategy Pattern, R1).
   * Applies stop word filtering (R2).
   */
  public async searchTransit(req: Request, res: Response): Promise<void> {
    const q = this.getRequiredSearchQuery(req, res);
    if (!q) {
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
      this.sendSearchFailure(res, 'Unexpected error during transit search');
    }
  }

  private getRequiredSearchQuery(req: Request, res: Response): string | null {
    const q = (req.query.q as string | undefined)?.trim();
    if (q) {
      return q;
    }

    const error: responses.IAppError = {
      type: 'ClientError',
      name: 'MissingSearchQuery',
      message: 'Query parameter "q" is required'
    };
    res.status(400).json(error);
    return null;
  }

  private sendSearchFailure(res: Response, message: string): void {
    const err: responses.IAppError = {
      type: 'ServerError',
      name: 'GetRequestFailure',
      message
    };
    res.status(500).json(err);
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
