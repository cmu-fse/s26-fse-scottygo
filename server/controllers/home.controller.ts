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
    this.router.get('/', this.indexPage);
    this.router.get('/home', this.homePage);
  }

  public indexPage(req: Request, res: Response): void {
    return res.redirect('/pages/index.html');
  }

  public homePage(req: Request, res: Response): void {
    return res.redirect('/');
  }
}
