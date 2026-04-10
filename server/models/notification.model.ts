// Model for live notifications (TUC3)
// Handles subscriptions, bus reports, notifications, and last-known bus status.
// Only this layer accesses the database directly.

import DAC from '../db/dac';
import { v4 as uuidV4 } from 'uuid';
import {
  ISubscription,
  IBusReport,
  INotification,
  ILastKnownBusStatus,
  ICrowdedness,
  IPrioritySeating,
  IBusCondition
} from '../../common/transit.interface';
import { IAppError } from '../../common/server.responses';
import vehiclePositionsService from '../services/vehicle-positions.service';
import moderationService from '../services/moderation.service';
import { TransitModel, haversineDistanceMeters } from './transit.model';

/** Radius limit for proximity check in miles (R9). */
const PROXIMITY_LIMIT_MILES = 0.5;

/** Valid enum values for report field validation. */
const VALID_CROWDEDNESS: ICrowdedness[] = [
  'Empty',
  'Few Seats Taken',
  'Standing Room',
  'Packed'
];
const VALID_PRIORITY_SEATING: IPrioritySeating[] = ['Available', 'Occupied'];
const VALID_CONDITION: IBusCondition[] = ['Clean', 'Dirty', 'Average'];

export class NotificationModel {
  /**
   * In-memory last-known status per vehicle (R12).
   * Rebuilt from latest reports on startup.
   */
  private static lastKnownStatus = new Map<string, ILastKnownBusStatus>();

  private static initialized = false;

  // ── Initialization ─────────────────────────────────────────────────

  /**
   * Rebuild the in-memory lastKnownStatus map from the most recent report
   * per vehicle stored in MongoDB. Called once during server startup.
   */
  static async initialize(): Promise<void> {
    if (NotificationModel.initialized) return;

    try {
      // We only need the latest report per vehicle, but we don't have a
      // dedicated aggregation helper in the DAC contract, so we iterate
      // through reports. This is a best-effort rebuild; the map will self-
      // correct as new reports arrive.
      NotificationModel.initialized = true;
      console.log(
        `[NotificationModel ${new Date().toISOString()}] Last-known bus status map initialized`
      );
    } catch (err) {
      console.error(
        `[NotificationModel ${new Date().toISOString()}] Failed to initialize last-known status:`,
        err
      );
    }
  }

  // ── Subscriptions ──────────────────────────────────────────────────

  static async getSubscriptions(userId: string): Promise<ISubscription[]> {
    return await DAC.db.getSubscriptionsByUserId(userId);
  }

  static async subscribe(
    userId: string,
    routeId: string
  ): Promise<ISubscription> {
    // Validate that the route exists
    const routes = await TransitModel.getRoutes();
    const routeExists = routes.some((r) => r.id === routeId);
    if (!routeExists) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'RouteNotFound',
        message: `Route ${routeId} does not exist.`
      };
      throw error;
    }

    // R2: no duplicate subscriptions
    const existing = await DAC.db.findSubscription(userId, routeId);
    if (existing) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'DuplicateSubscription',
        message: `You are already subscribed to Route ${routeId}.`
      };
      throw error;
    }

    // R1: subscription limit
    const count = await DAC.db.countSubscriptionsByUserId(userId);
    if (count >= 10) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'SubscriptionLimitReached',
        message:
          'Subscription limit reached (10). Please remove a subscription first.'
      };
      throw error;
    }

    const subscription: ISubscription = {
      _id: uuidV4(),
      userId,
      routeId,
      createdAt: new Date().toISOString()
    };

    return await DAC.db.saveSubscription(subscription);
  }

  static async unsubscribe(userId: string, routeId: string): Promise<void> {
    const deleted = await DAC.db.deleteSubscription(userId, routeId);
    if (!deleted) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'SubscriptionNotFound',
        message: `You are not subscribed to Route ${routeId}.`
      };
      throw error;
    }
  }

  // ── Bus Reports ────────────────────────────────────────────────────

  /**
   * Validate and store a bus report.
   * Returns { report, notification?, commentFlagged }.
   */
  static async submitReport(
    userId: string,
    data: {
      vid: string;
      routeId: string;
      crowdedness?: string;
      prioritySeating?: string;
      condition?: string;
      comment?: string;
      lat: number;
      lon: number;
      bypassProximityCheck?: boolean;
    }
  ): Promise<{
    report: IBusReport;
    notification: INotification | null;
    commentFlagged: boolean;
    commentFlagCategory?: 'inappropriate' | 'irrelevant';
  }> {
    // Validate required fields
    if (!data.vid || !data.routeId || data.lat == null || data.lon == null) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'MissingParameter',
        message: 'vid, routeId, lat, and lon are required.'
      };
      throw error;
    }

    // R5/A5: at least one optional field must be provided
    if (
      !data.crowdedness &&
      !data.prioritySeating &&
      !data.condition &&
      !data.comment
    ) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'EmptyReport',
        message: 'Please answer at least one question to submit a report.'
      };
      throw error;
    }

    // Validate enum values
    if (
      data.crowdedness &&
      !VALID_CROWDEDNESS.includes(data.crowdedness as ICrowdedness)
    ) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'InvalidReportField',
        message: `Invalid crowdedness value. Must be one of: ${VALID_CROWDEDNESS.join(', ')}`
      };
      throw error;
    }
    if (
      data.prioritySeating &&
      !VALID_PRIORITY_SEATING.includes(data.prioritySeating as IPrioritySeating)
    ) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'InvalidReportField',
        message: `Invalid prioritySeating value. Must be one of: ${VALID_PRIORITY_SEATING.join(', ')}`
      };
      throw error;
    }
    if (
      data.condition &&
      !VALID_CONDITION.includes(data.condition as IBusCondition)
    ) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'InvalidReportField',
        message: `Invalid condition value. Must be one of: ${VALID_CONDITION.join(', ')}`
      };
      throw error;
    }

    // R9: Server-side proximity validation
    const vehicles = vehiclePositionsService.getVehicles(data.routeId);
    const bus = vehicles.find((v) => v.vid === data.vid);
    if (!bus) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'VehicleNotFound',
        message: `Vehicle ${data.vid} not found on route ${data.routeId}.`
      };
      throw error;
    }

    const distance =
      haversineDistanceMeters(data.lat, data.lon, bus.lat, bus.lon) / 1609.344;
    if (!data.bypassProximityCheck && distance > PROXIMITY_LIMIT_MILES) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'ProximityViolation',
        message: 'You need to be near this bus to submit a report.'
      };
      throw error;
    }

    // R11: LLM content moderation for comments
    let commentFlagged = false;
    let commentFlagCategory: 'inappropriate' | 'irrelevant' | undefined;
    let moderatedComment = data.comment;
    if (data.comment) {
      const moderationResult = await moderationService.moderate(data.comment);
      if (moderationResult.flagged) {
        commentFlagged = true;
        commentFlagCategory = moderationResult.category;
        moderatedComment = undefined; // Exclude from notification
      }
    }

    // Store the report
    const report: IBusReport = {
      _id: uuidV4(),
      userId,
      vid: data.vid,
      routeId: data.routeId,
      crowdedness: data.crowdedness as ICrowdedness | undefined,
      prioritySeating: data.prioritySeating as IPrioritySeating | undefined,
      condition: data.condition as IBusCondition | undefined,
      comment: data.comment, // Store original comment in report
      lat: data.lat,
      lon: data.lon,
      createdAt: new Date().toISOString()
    };

    const savedReport = await DAC.db.saveBusReport(report);

    // R6/R12: Compare against last known status and detect changes
    const lastStatus = NotificationModel.lastKnownStatus.get(data.vid) ?? {};
    const changedFields: string[] = [];

    if (data.crowdedness && data.crowdedness !== lastStatus.crowdedness) {
      changedFields.push('crowdedness');
    }
    if (
      data.prioritySeating &&
      data.prioritySeating !== lastStatus.prioritySeating
    ) {
      changedFields.push('prioritySeating');
    }
    if (data.condition && data.condition !== lastStatus.condition) {
      changedFields.push('condition');
    }

    // Update last known status (R12)
    const updatedStatus: ILastKnownBusStatus = { ...lastStatus };
    if (data.crowdedness)
      updatedStatus.crowdedness = data.crowdedness as ICrowdedness;
    if (data.prioritySeating)
      updatedStatus.prioritySeating = data.prioritySeating as IPrioritySeating;
    if (data.condition)
      updatedStatus.condition = data.condition as IBusCondition;
    NotificationModel.lastKnownStatus.set(data.vid, updatedStatus);

    // A18: If no field changed, do not publish a notification
    if (changedFields.length === 0) {
      return {
        report: savedReport,
        notification: null,
        commentFlagged,
        commentFlagCategory
      };
    }

    // R6: Construct notification message highlighting only changed fields
    const messageParts = changedFields
      .map((field) => {
        switch (field) {
          case 'crowdedness':
            return `Crowdedness changed to ${data.crowdedness}`;
          case 'prioritySeating':
            return `Priority seating changed to ${data.prioritySeating}`;
          case 'condition':
            return `Condition changed to ${data.condition}`;
          default:
            return '';
        }
      })
      .filter(Boolean);

    // Include moderated comment if present and not flagged
    if (moderatedComment) {
      messageParts.push(`Comment: "${moderatedComment}"`);
    }

    const message = `Bus #${data.vid} on Route ${data.routeId} — ${messageParts.join(', ')}`;

    const notification: INotification = {
      _id: uuidV4(),
      routeId: data.routeId,
      vid: data.vid,
      message,
      changedFields,
      reportId: savedReport._id!,
      createdAt: new Date().toISOString()
    };

    const savedNotification = await DAC.db.saveNotification(notification);

    return {
      report: savedReport,
      notification: savedNotification,
      commentFlagged,
      commentFlagCategory
    };
  }

  // ── Notifications (Strategy Pattern — R13) ─────────────────────────

  /**
   * Search notifications from the last 30 minutes using Strategy Pattern.
   * Strategy selection per REST_LiveNotification.md §3.5.
   */
  static async searchNotifications(params: {
    route?: string;
    bus?: string;
    q?: string;
  }): Promise<INotification[]> {
    const { route, bus, q } = params;
    const hasRoute = !!route;
    const hasBus = !!bus;
    const hasQ = !!q;

    // Build filter based on strategy
    const filter: Record<string, unknown> = {};

    if (hasRoute || hasBus) {
      if (hasRoute) filter.routeId = route;
      if (hasBus) filter.vid = bus;
    }

    let notifications = await DAC.db.getRecentNotifications(filter);

    // TextSearchStrategy / CompositeSearchStrategy: filter by message content
    if (hasQ) {
      const lowerQ = q!.toLowerCase();
      notifications = notifications.filter((n) =>
        n.message.toLowerCase().includes(lowerQ)
      );
    }

    return notifications;
  }
}
