// Controller serving the subscriptions page

import Controller from './controller';
import { Request, Response } from 'express';

export default class SubscriptionsController extends Controller {
  private static instance: SubscriptionsController | null = null;

  private constructor(path: string) {
    super(path);
  }

  public static getInstance(path: string): SubscriptionsController {
    if (!SubscriptionsController.instance) {
      SubscriptionsController.instance = new SubscriptionsController(path);
    }
    return SubscriptionsController.instance;
  }

  public initializeRoutes(): void {
    this.router.get('/', this.subscriptionsPage.bind(this));
  }

  public subscriptionsPage(_req: Request, res: Response): void {
    this.sendPage(res, 'subscriptions.html');
  }
}
