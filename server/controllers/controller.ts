// controller superclass for behavior common to all controllers

import { Router } from 'express';
import { Server as SocketServer } from 'socket.io';
import { Request, Response } from 'express';

abstract class Controller {
  // note the abstract keyword here
  // path or partial URL managed by this controller
  public path: string;

  public static io: SocketServer;

  // each controller has a router
  public router: Router = Router();

  constructor(path: string) {
    this.initializeRoutes();
    this.path = path;
  }

  // each controller must define this method to set up its endpoints
  public abstract initializeRoutes(): void;
}

export default Controller;
