// controller superclass for behavior common to all controllers

import { Router } from 'express';
import { Server as SocketServer } from 'socket.io';
import { Request, Response } from 'express';
import path from 'path';

abstract class Controller {
  // note the abstract keyword here
  // path or partial URL managed by this controller
  public path: string;

  public static io: SocketServer;

  public static clientDir: string;

  // each controller has a router
  public router: Router = Router();

  /**
   * Helper to serve an HTML file from the client directory
   */
  protected sendPage(res: Response, htmlFile: string): void {
    res.sendFile(path.join(Controller.clientDir, htmlFile));
  }

  constructor(path: string) {
    this.initializeRoutes();
    this.path = path;
  }

  // each controller must define this method to set up its endpoints
  public abstract initializeRoutes(): void;
}

export default Controller;
