import { Response } from 'express';
import * as responses from '../../common/server.responses';

export function isAppError(error: unknown): error is responses.IAppError {
  return (
    !!error &&
    typeof error === 'object' &&
    'type' in error &&
    'name' in error &&
    'message' in error
  );
}

export function respondWithAppOrUnexpectedError(
  res: Response,
  error: unknown,
  fallbackName: responses.ServerErrorName,
  statusMap?: Record<string, number>
): void {
  if (isAppError(error)) {
    const statusCode =
      statusMap?.[error.name] ??
      (error.type === 'ClientError' ? 400 : 500);
    res.status(statusCode).json(error);
    return;
  }

  const unexpectedError: responses.IAppError = {
    type: 'ServerError',
    name: fallbackName,
    message: 'An unexpected error occurred'
  };
  res.status(500).json(unexpectedError);
}