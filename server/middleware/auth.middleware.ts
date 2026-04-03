import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_KEY as secretKey } from '../env';
import { ITokenPayload } from '../../common/user.interface';
import * as responses from '../../common/server.responses';

type AuthAttachMode = 'user' | 'bodyUserOnToken';

interface IJwtAuthOptions {
  attachMode: AuthAttachMode;
  missingTokenMessage?: string;
  invalidTokenMessage?: string;
}

/**
 * Shared JWT auth middleware for controllers.
 * Keeps response payloads configurable so existing endpoint behavior stays unchanged.
 */
export function createJwtAuthMiddleware(
  options: IJwtAuthOptions
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const {
    attachMode,
    missingTokenMessage = 'Authentication token is required',
    invalidTokenMessage = 'Invalid or expired token'
  } = options;

  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      const error: responses.IAppError = {
        type: 'ClientError',
        name: 'MissingToken',
        message: missingTokenMessage
      };
      res.status(401).json(error);
      return;
    }

    try {
      const decoded = jwt.verify(token, secretKey) as ITokenPayload;

      if (attachMode === 'bodyUserOnToken') {
        req.body = req.body ?? {};
        req.body.userOnToken = decoded.username;
      } else {
        (req as Request & { user: ITokenPayload }).user = decoded;
      }

      next();
    } catch {
      const error: responses.IAppError = {
        type: 'ClientError',
        name: 'InvalidToken',
        message: invalidTokenMessage
      };
      res.status(401).json(error);
    }
  };
}