// Controller serving the subscriptions page

import Controller from './controller';
import { Request, Response } from 'express';
import * as responses from '../../common/server.responses';
import { ITokenPayload } from '../../common/user.interface';
import { createJwtAuthMiddleware } from '../middleware/auth.middleware';
import {
  SearchContext,
  SubscriptionSearchStrategy
} from '../search/search-strategy';
import type { IRoute } from '../../common/transit.interface';

export default class SubscriptionsController extends Controller {
  public constructor(path: string) {
    super(path);
  }

  public initializeRoutes(): void {
    this.router.get('/', this.subscriptionsPage.bind(this));

    // API routes below require auth token
    this.router.use(createJwtAuthMiddleware({ attachMode: 'user' }));
    this.router.get('/routes/search', this.searchRoutes.bind(this));
  }

  /**
   * GET /subscriptions/routes/search?q=<keywords>
   * Search routes in subscriptions context using strategy pattern.
   */
  public async searchRoutes(req: Request, res: Response): Promise<void> {
    const q = (req.query.q as string | undefined)?.trim() ?? '';

    try {
      const context = new SearchContext<IRoute[]>(
        new SubscriptionSearchStrategy()
      );
      const routes = await context.executeSearch(q);
      const success: responses.ISuccess = {
        name: 'SearchTransitCompleted',
        message: routes.length
          ? `Found ${routes.length} route${routes.length === 1 ? '' : 's'}`
          : 'No routes found',
        metadata: {
          totalItems: routes.length,
          context: 'subscriptions'
        },
        payload: routes
      };
      res.status(200).json(success);
    } catch {
      const error: responses.IAppError = {
        type: 'ServerError',
        name: 'GetRequestFailure',
        message: 'Unexpected error during subscriptions route search'
      };
      res.status(500).json(error);
    }
  }

  public subscriptionsPage(_req: Request, res: Response): void {
    this.sendPage(res, 'subscriptions.html');
  }
}
