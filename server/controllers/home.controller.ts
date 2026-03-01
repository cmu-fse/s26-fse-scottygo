// Controller serving the home page

import Controller from './controller';
import { Request, Response } from 'express';

export default class HomeController extends Controller {
  public constructor(path: string) {
    super(path);
  }

  // Just redirection going on here, nothing fancy
  // Plus a an about page generated on the fly

  public initializeRoutes(): void {
    this.router.get('/', this.homePage.bind(this));
    this.router.get('/home', this.homePage.bind(this));
  }

  public homePage(_req: Request, res: Response): void {
    this.sendPage(res, 'home.html');
  }
}
