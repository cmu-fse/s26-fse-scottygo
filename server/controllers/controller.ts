// controller superclass for behavior common to all controllers

import { Router, Response } from 'express';
import { Server as SocketServer } from 'socket.io';
import path from 'path';
import * as responses from '../../common/server.responses';

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

  // FIX #7: Extracted common error handling from auth/map/account controllers into base class.
  // Previously duplicated 6+ times across controllers (Sigrid HIGH severity).
  /**
   * Common error handler for controller methods.
   * Maps IAppError types to HTTP status codes and wraps unexpected errors.
   */
  protected handleError(
    res: Response,
    error: unknown,
    fallbackMessage = 'An unexpected error occurred'
  ): void {
    if (
      error &&
      typeof error === 'object' &&
      'type' in error &&
      'name' in error
    ) {
      const appError = error as responses.IAppError;
      const statusCode = appError.type === 'ClientError' ? 400 : 500;
      res.status(statusCode).json(appError);
      return;
    }

    const unexpectedError: responses.IAppError = {
      type: 'ServerError',
      name: 'MongoDBError',
      message: fallbackMessage
    };
    res.status(500).json(unexpectedError);
  }

  // FIX #8: Extracted common password obfuscation into base class.
  // Previously duplicated 4+ times across auth and map controllers (Sigrid HIGH severity).
  /**
   * Obfuscate password in user object before sending to client.
   * Returns a new object with password replaced by 'obfuscated'.
   */
  protected sanitizeUser<T extends { credentials: { username: string; password: string } }>(
    user: T
  ): T {
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
