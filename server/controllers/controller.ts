// controller superclass for behavior common to all controllers

import { Router, Response } from 'express';
import { Server as SocketServer } from 'socket.io';
import path from 'path';
import type { ILogin } from '../../common/user.interface';

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

  /**
   * Return a copy of the given object with the password replaced by 'obfuscated'.
   * T must contain a `credentials` field typed as ILogin.
   */
  protected sanitizeUser<T extends { credentials: ILogin }>(user: T): T {
    return {
      ...user,
      credentials: {
        username: user.credentials.username,
        password: 'obfuscated'
      }
    };
  }

  constructor(path: string) {
    this.path = path;
    this.initializeRoutes();
  }

  // each controller must define this method to set up its endpoints
  public abstract initializeRoutes(): void;
}

export default Controller;
