// Controller serving the map page where the user lands after login
// Note that controllers don't access the DB direcly, only through the models

import { ILogin, IUser } from '../../common/user.interface';
import { User } from '../models/user.model';
import Controller from './controller';
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import {
  JWT_KEY as secretKey,
  JWT_EXP as tokenExpiry,
  STAGE as appStage
} from '../env';
import * as responses from '../../common/server.responses';

export default class MapController extends Controller {
  public constructor(path: string) {
    super(path);
  }

  public initializeRoutes(): void {
    this.router.get('/', this.mapPage.bind(this));
    this.router.get('/users/:username?', this.authorize, this.getUser);
  }

  public mapPage(req: Request, res: Response): void {
    this.sendPage(res, 'map.html');
  }

  // Check if the user is logged in by validating token
  public async authorize(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    // Extracts token from header's authorization field ("Bearer <token>")
    const token = req.headers.authorization?.split(' ')[1];

    // Handle missing token
    if (!token) {
      const errorRes: responses.IAppError = {
        type: 'ClientError',
        name: 'MissingToken',
        message: 'Token is required'
      };
      res.status(401).json(errorRes);
      return; // Stop execution
    }

    // Verify and decode token with secretKey
    try {
      const decodedToken: ILogin = jwt.verify(token, secretKey) as ILogin;
      const userOnToken = decodedToken.username; // Extract username from decoded token
      req.body.userOnToken = userOnToken; // Attach username to request object
      next(); // Continue to next middleware
    } catch (error) {
      // Handle JWT verification error (invalid token)
      const errorRes: responses.IAppError = {
        type: 'ClientError',
        name: 'InvalidToken',
        message: 'Invalid token'
      };
      res.status(401).json(errorRes);
      return;
    }
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
      const successRes: responses.ISuccess = {
        name: 'UserFound',
        message: 'User retrieved successfully',
        payload: user
      };
      return res.status(200).json(successRes);
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'type' in error &&
        'name' in error
      ) {
        // Handle errors raised as IAppError by model/database
        const appError = error as responses.IAppError;
        const statusCode = appError.type === 'ClientError' ? 400 : 500;
        return res.status(statusCode).json(appError);
      }
      // Handle error not raised as IAppError - create one to wrap unexpected error
      const unexpectedError: responses.IAppError = {
        type: 'ServerError',
        name: 'MongoDBError',
        message: 'An unexpected error occurred in the database'
      };
      return res.status(500).json(unexpectedError);
    }
  }
}
