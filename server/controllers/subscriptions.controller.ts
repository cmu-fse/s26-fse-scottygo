// Controller serving the subscriptions page

import Controller from './controller';
import { Request, Response } from 'express';

export default class SubscriptionsController extends Controller {
  public constructor(path: string) {
    super(path);
  }

  public initializeRoutes(): void {
    this.router.get('/', this.subscriptionsPage.bind(this));
  }

  public subscriptionsPage(_req: Request, res: Response): void {
    this.sendPage(res, 'subscriptions.html');
  }
}
