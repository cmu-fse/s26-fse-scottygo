// Controller for live notification endpoints (TUC3)
// Base path: /notifications

import { Request, Response } from 'express';
import Controller from './controller';
import { ITokenPayload } from '../../common/user.interface';
import { NotificationModel } from '../models/notification.model';
import { User } from '../models/user.model';
import alertsService from '../services/alerts.service';
import * as responses from '../../common/server.responses';

export default class NotificationController extends Controller {
  private static instance: NotificationController | null = null;

  private constructor(path: string) {
    super(path);
  }

  public static getInstance(path: string): NotificationController {
    if (!NotificationController.instance) {
      NotificationController.instance = new NotificationController(path);
    }
    return NotificationController.instance;
  }

  public initializeRoutes(): void {
    // Serve the notifications HTML page (no auth required — auth handled client-side)
    this.router.get('/', (_req, res) =>
      this.sendPage(res, 'notifications.html')
    );

    // All notification API routes require authentication
    this.router.use(this.authenticateToken.bind(this));

    // Subscription routes
    this.router.get('/subscriptions', this.getSubscriptions.bind(this));
    this.router.post('/subscriptions', this.subscribe.bind(this));
    this.router.delete('/subscriptions/:routeId', this.unsubscribe.bind(this));

    // Report routes
    this.router.post('/reports', this.submitReport.bind(this));

    // Notification/alert routes
    this.router.get('/notifications', this.searchNotifications.bind(this));
    this.router.get('/alerts', this.getAlerts.bind(this));
  }

  // ── Subscriptions ──────────────────────────────────────────────────

  private async getSubscriptions(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as Request & { user: ITokenPayload }).user;
      const subscriptions = await NotificationModel.getSubscriptions(
        user.userId
      );

      const success: responses.ISuccess = {
        name: 'SubscriptionsRetrieved',
        message: `Found ${subscriptions.length} subscriptions`,
        payload: subscriptions
      };
      res.status(200).json(success);
    } catch (error) {
      this.handleError(res, error, 'GetRequestFailure');
    }
  }

  private async subscribe(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as Request & { user: ITokenPayload }).user;
      const { routeId } = req.body;

      if (!routeId) {
        const error: responses.IAppError = {
          type: 'ClientError',
          name: 'MissingParameter',
          message: 'routeId is required'
        };
        res.status(400).json(error);
        return;
      }

      const subscription = await NotificationModel.subscribe(
        user.userId,
        routeId
      );

      const success: responses.ISuccess = {
        name: 'RouteSubscribed',
        message: `Subscribed to route ${routeId}`,
        payload: subscription
      };
      res.status(201).json(success);
    } catch (error) {
      this.handleError(res, error, 'PostRequestFailure');
    }
  }

  private async unsubscribe(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as Request & { user: ITokenPayload }).user;
      const { routeId } = req.params;

      await NotificationModel.unsubscribe(user.userId, routeId);

      const success: responses.ISuccess = {
        name: 'RouteUnsubscribed',
        message: `Unsubscribed from route ${routeId}`,
        payload: null
      };
      res.status(200).json(success);
    } catch (error) {
      this.handleError(res, error, 'PostRequestFailure');
    }
  }

  // ── Bus Reports ────────────────────────────────────────────────────

  private async submitReport(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as Request & { user: ITokenPayload }).user;
      const {
        vid,
        routeId,
        crowdedness,
        prioritySeating,
        condition,
        comment,
        lat,
        lon
      } = req.body;
      const requestingUser = await User.getUserAccountById(user.userId);
      const isAdmin = requestingUser.privilegeLevel === 'Administrator';

      const reportData = {
        vid,
        routeId,
        crowdedness,
        prioritySeating,
        condition,
        comment,
        lat,
        lon,
        bypassProximityCheck: isAdmin
      };
      const result = await NotificationModel.submitReport(
        user.userId,
        reportData
      );

      // R4: If a notification was created, publish via Socket.io to the route's room
      if (result.notification) {
        Controller.io
          .to(`route:${routeId}`)
          .emit('liveNotification', result.notification);
      }

      const message = result.commentFlagged
        ? result.commentFlagCategory === 'irrelevant'
          ? 'Your comment was not included because it appears unrelated to bus service.'
          : 'Your comment was flagged and will not be included in the notification.'
        : 'Report submitted. Thank you!';

      const success: responses.ISuccess = {
        name: 'ReportSubmitted',
        message,
        payload: result.report
      };
      res.status(201).json(success);
    } catch (error) {
      this.handleError(res, error, 'ReportSubmissionFailure');
    }
  }

  // ── Notifications ──────────────────────────────────────────────────

  private async searchNotifications(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const normalizeQueryParam = (value: unknown): string | undefined => {
        if (typeof value !== 'string') {
          return undefined;
        }

        const trimmedValue = value.trim();
        return trimmedValue === '' ? undefined : trimmedValue;
      };

      const route = normalizeQueryParam(req.query.route);
      const bus = normalizeQueryParam(req.query.bus);
      const q = normalizeQueryParam(req.query.q);
      const notifications = await NotificationModel.searchNotifications({
        route,
        bus,
        q
      });

      const success: responses.ISuccess = {
        name: 'NotificationsRetrieved',
        message: `Found ${notifications.length} notifications`,
        payload: notifications
      };
      res.status(200).json(success);
    } catch (error) {
      this.handleError(res, error, 'GetRequestFailure');
    }
  }

  // ── Service Alerts ─────────────────────────────────────────────────

  private async getAlerts(_req: Request, res: Response): Promise<void> {
    try {
      if (!alertsService.isHealthy()) {
        const error: responses.IAppError = {
          type: 'ServerError',
          name: 'AlertFeedUnavailable',
          message: 'Service alerts are temporarily unavailable.'
        };
        res.status(503).json(error);
        return;
      }

      const alerts = alertsService.getAlerts();

      const success: responses.ISuccess = {
        name: 'AlertsRetrieved',
        message: `Found ${alerts.length} service alerts`,
        payload: alerts
      };
      res.status(200).json(success);
    } catch (error) {
      this.handleError(res, error, 'GetRequestFailure');
    }
  }

  // ── Error Handling ─────────────────────────────────────────────────

  private handleError(
    res: Response,
    error: unknown,
    fallbackName: responses.ServerErrorName
  ): void {
    const appError = this.asAppError(error);
    if (appError) {
      const statusMap: Record<string, number> = {
        MissingParameter: 400,
        EmptyReport: 400,
        InvalidReportField: 400,
        MissingToken: 401,
        InvalidToken: 401,
        ProximityViolation: 403,
        RouteNotFound: 404,
        VehicleNotFound: 404,
        SubscriptionNotFound: 404,
        DuplicateSubscription: 409,
        SubscriptionLimitReached: 409
      };
      const statusCode =
        statusMap[appError.name] ??
        (appError.type === 'ClientError' ? 400 : 500);
      res.status(statusCode).json(appError);
      return;
    }

    const unexpectedError: responses.IAppError = {
      type: 'ServerError',
      name: fallbackName,
      message: 'An unexpected error occurred'
    };
    res.status(500).json(unexpectedError);
  }
}
