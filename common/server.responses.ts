import { IUser, ILogin, IUserAccount } from './user.interface';
import {
  IRoute,
  IVehicle,
  IStop,
  IPrediction,
  IDetour,
  IPattern,
  IBulkTransitData,
  INearbyStopsPayload,
  ISubscription,
  IBusReport,
  INotification,
  IServiceAlert,
  ITransitSearchResult
} from './transit.interface';
import { IConfig } from './map.interface';

// in a response, the password property of an ILogin object should always be obfuscated, e.g., replaced by '*******';

export interface IAuthenticatedUser {
  // when the user is authenticated through a login request, this is the response's payload
  user: IUser;
  token: string; // the JWT token generated in response to successfull authentication
}

// ClientError is for errors that are caused by the client (4xx status code)
// ServerError is for errors that are caused by the server (5xx status code)
export type ErrorType = 'ClientError' | 'ServerError' | 'UnknownError';

export type SuccessName =
  | 'UserAuthenticated'
  | 'UserRegistered'
  | 'UserFound'
  | 'UsersFound'
  | 'UsersRetrieved'
  | 'UserAgreed'
  | 'LoginSuccess'
  | 'AccountRetrieved'
  | 'StatusUpdated'
  | 'PrivilegeUpdated'
  | 'UsernameUpdated'
  | 'EmailUpdated'
  | 'PasswordUpdated'
  | 'RoutesRetrieved'
  | 'PathGenerated'
  | 'VehiclesLocated'
  | 'StopsRetrieved'
  | 'PredictionsRetrieved'
  | 'DetoursRetrieved'
  | 'BulkDataRetrieved'
  | 'NearbyStopsRetrieved'
  | 'ConfigFound'
  | 'SubscriptionsRetrieved'
  | 'RouteSubscribed'
  | 'RouteUnsubscribed'
  | 'ReportSubmitted'
  | 'NotificationsRetrieved'
  | 'AlertsRetrieved'
  | 'SearchTransitCompleted'
  | 'SearchNotificationsCompleted'
  | 'UsersSearchCompleted';

export type ClientErrorName =
  | 'MissingEmail'
  | 'MissingUsername'
  | 'MissingPassword'
  | 'MissingToken'
  | 'UnauthorizedRequest'
  | 'InactiveAccount'
  | 'UserNotFound'
  | 'UserExists'
  | 'UnregisteredUser'
  | 'IncorrectPassword'
  | 'InvalidPassword'
  | 'InvalidEmail'
  | 'InvalidToken'
  | 'WeakPassword'
  | 'InvalidUsername'
  | 'LastAdministrator'
  | 'UsernameExists'
  | 'OutOfBounds'
  | 'PermissionDenied'
  | 'ServiceUnavailable'
  | 'RouteNotFound'
  | 'StopNotFound'
  | 'MissingParameter'
  | 'EmptyReport'
  | 'InvalidReportField'
  | 'ProximityViolation'
  | 'VehicleNotFound'
  | 'SubscriptionNotFound'
  | 'DuplicateSubscription'
  | 'SubscriptionLimitReached'
  | 'MissingSearchQuery'
  | 'InvalidSearchField';

export type ServerErrorName =
  | 'FailedAuthentication'
  | 'TokenError'
  | 'PostRequestFailure'
  | 'GetRequestFailure'
  | 'PatchRequestFailure'
  | 'MongoDBError'
  | 'UpstreamError'
  | 'ReportSubmissionFailure'
  | 'AlertFeedUnavailable';

export type IPayload =
  | IUser
  | ILogin
  | IUser[]
  | IUserAccount
  | IUserAccount[]
  | string[]
  | IAuthenticatedUser
  | IRoute[]
  | IVehicle[]
  | IStop[]
  | IPrediction[]
  | IDetour[]
  | IPattern[]
  | IBulkTransitData
  | INearbyStopsPayload
  | IConfig
  | ISubscription
  | ISubscription[]
  | IBusReport
  | INotification
  | INotification[]
  | IServiceAlert[]
  | ITransitSearchResult
  | null;

export interface ISuccess {
  // a successful response (corresponding to 2xx status code)
  // name, message, authorizedUser are meta-data
  // the actual data returned is in payload property
  name: SuccessName; // name describing the action that succeeded
  message?: string; // an optional, informative message about the success condition
  authorizedUser?: string; // the username of the authorized user, for information purposes
  metadata?: Record<string, unknown>; // optional metadata for additional context
  /* 
     payload is the actual data returned in the response;
     if there is no such data, payload should be set to null
  */
  payload: IPayload;
}

type AppErrorName = ClientErrorName | ServerErrorName;

export interface IAppError extends Error {
  type: ErrorType;
  name: AppErrorName;
  message: string;
}

// IResponse is the data type carried in a server response's body
// Note that it's a union type
// To be type-safe, let's specify a valid response body in terms of what it can be
export type IResponse = ISuccess | IAppError;

// Type guards to reduce a value of union type IResponse to a specific subtype.
// Use type guards or type assertions as needed and appropriate in your code when handling errors.

export function isAppError(res: IResponse): res is IAppError {
  return 'type' in res && 'name' in res && 'message' in res;
}

export function isSuccess(res: IResponse): res is ISuccess {
  if (!isAppError(res)) {
    return 'name' in res && 'payload' in res;
  }
  return false;
}

export function isServerError(res: IResponse) {
  if (isAppError(res)) return res.type == 'ServerError';
  return false;
}

export function isClientError(res: IResponse) {
  if (isAppError(res)) return res.type == 'ClientError';
  return false;
}

// See usage examples in trials/ts-eg/serverResponseTypes.ts
