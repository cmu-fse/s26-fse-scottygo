// Controller for account management operations
// Handles HTTP requests for account retrieval, updates, password changes,
// status changes, and privilege changes per REST_ManageAcct.md

import {
  IUserAccount,
  IAccountStatus,
  IPrivilegeLevel,
  ITokenPayload
} from '../../common/user.interface';
import { User } from '../models/user.model';
import Controller from './controller';
import { Request, Response } from 'express';
import * as responses from '../../common/server.responses';
import EmailService from '../services/email.service';
import { createJwtAuthMiddleware } from '../middleware/auth.middleware';
import { respondWithAppOrUnexpectedError } from '../utils/controller-error.utils';
import {
  SearchContext,
  UserSearchStrategy,
  UserSearchField
} from '../search/search-strategy';

export default class AccountController extends Controller {
  public constructor(path: string) {
    super(path);
  }

  public initializeRoutes(): void {
    // Page route (no auth required - client handles auth)
    this.router.get('/', this.accountPage.bind(this));

    // Apply auth middleware to API routes only
    this.router.use(createJwtAuthMiddleware({ attachMode: 'user' }));

    // Account management routes
    this.router.get('/users', this.getAllUsers.bind(this)); // Must be before :username route
    this.router.get('/users/search', this.searchUsers.bind(this)); // Must be before :username route
    this.router.get('/users/:username', this.getUserAccount.bind(this));
    this.router.patch('/users/:username/status', this.updateStatus.bind(this));
    this.router.patch(
      '/users/:username/privilege',
      this.updatePrivilege.bind(this)
    );
    this.router.patch(
      '/users/:username/username',
      this.updateUsername.bind(this)
    );
    this.router.patch('/users/:username/email', this.updateEmail.bind(this));
    this.router.patch(
      '/users/:username/password',
      this.updatePassword.bind(this)
    );
  }

  /**
   * Get the requesting user's account info from token
   */
  private async getRequestingUserAccount(
    req: Request
  ): Promise<IUserAccount | null> {
    const tokenUser = (req as Request & { user: ITokenPayload }).user;
    if (!tokenUser || !tokenUser.userId) return null;

    try {
      // Use userId from token (immutable) instead of username to avoid issues after username change
      return await User.getUserAccountById(tokenUser.userId);
    } catch {
      return null;
    }
  }

  private sendClientError(
    res: Response,
    name: responses.ClientErrorName,
    message: string,
    statusCode = 400
  ): void {
    const error: responses.IAppError = {
      type: 'ClientError',
      name,
      message
    };
    res.status(statusCode).json(error);
  }

  private requireTargetUsername(req: Request, res: Response): string | null {
    const targetUsername = req.params.username;
    if (targetUsername) {
      return targetUsername;
    }

    this.sendClientError(res, 'MissingUsername', 'Username is required');
    return null;
  }

  private async requireRequestingUser(
    req: Request,
    res: Response
  ): Promise<IUserAccount | null> {
    const requestingUser = await this.getRequestingUserAccount(req);
    if (requestingUser) {
      return requestingUser;
    }

    this.sendClientError(
      res,
      'UnauthorizedRequest',
      'Unable to verify requesting user',
      401
    );
    return null;
  }

  private ensureAdmin(
    requestingUser: IUserAccount,
    res: Response,
    message: string
  ): boolean {
    if (requestingUser.privilegeLevel === 'Administrator') {
      return true;
    }

    this.sendClientError(res, 'UnauthorizedRequest', message, 403);
    return false;
  }

  private ensureOwnAccount(
    requestingUser: IUserAccount,
    targetUsername: string,
    res: Response,
    message: string
  ): boolean {
    const isOwnAccount =
      requestingUser.credentials.username.toLowerCase() ===
      targetUsername.toLowerCase();

    if (isOwnAccount) {
      return true;
    }

    this.sendClientError(res, 'UnauthorizedRequest', message, 403);
    return false;
  }

  private ensureAdminOrOwnAccount(
    requestingUser: IUserAccount,
    targetUsername: string,
    res: Response,
    message: string
  ): boolean {
    const isAdmin = requestingUser.privilegeLevel === 'Administrator';
    const isOwnAccount =
      requestingUser.credentials.username.toLowerCase() ===
      targetUsername.toLowerCase();

    if (isAdmin || isOwnAccount) {
      return true;
    }

    this.sendClientError(res, 'UnauthorizedRequest', message, 403);
    return false;
  }

  /**
   * Common wrapper for account-update endpoints.
   * Handles: requireTargetUsername → requireRequestingUser → authorize →
   *          update → emitAccountUpdated → success response → error handling.
   */
  private async performUpdate(
    req: Request,
    res: Response,
    options: {
      authorize: (user: IUserAccount, target: string) => boolean;
      update: (target: string) => Promise<IUserAccount>;
      successName: string;
      afterUpdate?: (
        updatedUser: IUserAccount,
        requestingUser: IUserAccount,
        targetUsername: string
      ) => Promise<void>;
      getAuthorizedUsername?: (
        updatedUser: IUserAccount,
        requestingUser: IUserAccount
      ) => string;
    }
  ): Promise<void> {
    try {
      const requestingUser = await this.requireRequestingUser(req, res);
      if (!requestingUser) return;

      const targetUsername = req.params.username;
      if (!options.authorize(requestingUser, targetUsername)) return;

      const updatedUser = await options.update(targetUsername);
      this.emitAccountUpdated(updatedUser);

      if (options.afterUpdate) {
        await options.afterUpdate(updatedUser, requestingUser, targetUsername);
      }

      const authorizedUser = options.getAuthorizedUsername
        ? options.getAuthorizedUsername(updatedUser, requestingUser)
        : requestingUser.credentials.username;

      const successRes: responses.ISuccess = {
        name: options.successName as responses.SuccessName,
        authorizedUser,
        payload: this.obfuscatePassword(updatedUser)
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleError(res, error);
    }
  }

  /**
   * Obfuscate password in user account for response
   */
  private obfuscatePassword(account: IUserAccount): IUserAccount {
    return {
      ...account,
      credentials: {
        ...account.credentials,
        password: '*******'
      }
    };
  }

  /**
   * Emit account updated event to subscribed clients
   */
  private emitAccountUpdated(account: IUserAccount): void {
    const roomName = `account:${account.credentials.username.toLowerCase()}`;
    Controller.io
      .to(roomName)
      .emit('accountUpdated', this.obfuscatePassword(account));
  }

  /**
   * GET /account/users
   * Get all usernames (Admin only)
   */
  public async getAllUsers(req: Request, res: Response): Promise<void> {
    try {
      const requestingUser = await this.requireRequestingUser(req, res);
      if (!requestingUser) {
        return;
      }

      // Only administrators can get all users
      if (
        !this.ensureAdmin(
          requestingUser,
          res,
          'Only administrators can view all users'
        )
      ) {
        return;
      }

      const usernames = await User.getAllUsernames();
      const successRes: responses.ISuccess = {
        name: 'UsersRetrieved',
        authorizedUser: requestingUser.credentials.username,
        payload: usernames
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleError(res, error);
    }
  }

  /**
   * GET /account/users/search?field=username|email&q=<keywords>
   * Search users with contextual strategy and deterministic ordering.
   * Only available to administrators.
   */
  public async searchUsers(req: Request, res: Response): Promise<void> {
    try {
      const requestingUser = await this.requireRequestingUser(req, res);
      if (!requestingUser) {
        return;
      }

      if (
        !this.ensureAdmin(
          requestingUser,
          res,
          'Only administrators can search users'
        )
      ) {
        return;
      }

      const rawField = ((req.query.field as string | undefined)
        ?.trim()
        .toLowerCase() ?? 'username') as UserSearchField;

      if (rawField !== 'username' && rawField !== 'email') {
        const error: responses.IAppError = {
          type: 'ClientError',
          name: 'InvalidSearchField',
          message: 'field must be either "username" or "email"'
        };
        res.status(400).json(error);
        return;
      }

      const q = (req.query.q as string | undefined)?.trim() ?? '';
      const context = new SearchContext<string[]>(
        new UserSearchStrategy(rawField)
      );
      const usernames = await context.executeSearch(q);

      const successRes: responses.ISuccess = {
        name: 'UsersSearchCompleted',
        authorizedUser: requestingUser.credentials.username,
        message: usernames.length
          ? `Found ${usernames.length} matching user${usernames.length === 1 ? '' : 's'}`
          : 'No matching users found',
        metadata: { totalItems: usernames.length, field: rawField },
        payload: usernames
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleError(res, error);
    }
  }

  /**
   * GET /account/users/:username
   * Get user account details
   */
  public async getUserAccount(req: Request, res: Response): Promise<void> {
    const targetUsername = this.requireTargetUsername(req, res);
    if (!targetUsername) {
      return;
    }

    try {
      const requestingUser = await this.requireRequestingUser(req, res);
      if (!requestingUser) {
        return;
      }

      // Authorization: Admins can view any user; Members can only view their own
      if (
        !this.ensureAdminOrOwnAccount(
          requestingUser,
          targetUsername,
          res,
          'You can only view your own account'
        )
      ) {
        return;
      }

      const userAccount = await User.getUserAccount(targetUsername);
      const successRes: responses.ISuccess = {
        name: 'AccountRetrieved',
        authorizedUser: requestingUser.credentials.username,
        payload: this.obfuscatePassword(userAccount)
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleError(res, error);
    }
  }

  /**
   * PATCH /account/users/:username/status
   * Update account status (Active/Inactive)
   */
  public async updateStatus(req: Request, res: Response): Promise<void> {
    const targetUsername = this.requireTargetUsername(req, res);
    const { status } = req.body as { status: IAccountStatus };

    if (!targetUsername) {
      return;
    }

    if (!status || !['Active', 'Inactive'].includes(status)) {
      this.sendClientError(
        res,
        'UnauthorizedRequest',
        'Valid status (Active/Inactive) is required'
      );
      return;
    }

    // Capture previous status before the update for email notification logic
    const previousStatusPromise = User.getUserAccount(targetUsername).then(
      (u) => u.status
    );

    await this.performUpdate(req, res, {
      authorize: (user, target) =>
        this.ensureAdminOrOwnAccount(
          user,
          target,
          res,
          'You can only change your own account status'
        ),
      update: async (target) => {
        await previousStatusPromise; // ensure we captured previous status
        return User.updateStatus(target, status);
      },
      successName: 'StatusUpdated',
      afterUpdate: async (updatedUser, _requestingUser, target) => {
        const previousStatus = await previousStatusPromise;

        // Handle force logout and email if status changed to Inactive
        if (status === 'Inactive' && previousStatus === 'Active') {
          this.forceLogoutUser(target.toLowerCase());
          await EmailService.sendAccountInactivatedEmail(
            updatedUser.email,
            updatedUser.credentials.username
          );
        }

        // Send reactivation email if status changed to Active
        if (status === 'Active' && previousStatus === 'Inactive') {
          await EmailService.sendAccountReactivatedEmail(
            updatedUser.email,
            updatedUser.credentials.username
          );
        }
      }
    });
  }

  /**
   * Force logout a user by emitting forceLogout event to their sockets
   */
  private forceLogoutUser(username: string): void {
    // Find all sockets for this user and emit forceLogout
    const io = Controller.io;
    const sockets = io.sockets.sockets;

    sockets.forEach((socket) => {
      // Get user from socket (stored during connection)
      const socketUser = (socket as unknown as { user?: { username: string } })
        .user;
      if (socketUser && socketUser.username.toLowerCase() === username) {
        socket.emit(
          'forceLogout',
          'Your account has been deactivated by an administrator'
        );
        // Disconnect after a short delay to allow client to process
        setTimeout(() => {
          socket.disconnect(true);
        }, 500);
      }
    });
  }

  /**
   * PATCH /account/users/:username/privilege
   * Update privilege level (Administrator only)
   */
  public async updatePrivilege(req: Request, res: Response): Promise<void> {
    const targetUsername = this.requireTargetUsername(req, res);
    const { privilegeLevel } = req.body as { privilegeLevel: IPrivilegeLevel };

    if (!targetUsername) {
      return;
    }

    if (
      !privilegeLevel ||
      !['Administrator', 'Coordinator', 'Member'].includes(privilegeLevel)
    ) {
      this.sendClientError(
        res,
        'UnauthorizedRequest',
        'Valid privilege level (Administrator/Coordinator/Member) is required'
      );
      return;
    }

    await this.performUpdate(req, res, {
      authorize: (user) =>
        this.ensureAdmin(
          user,
          res,
          'Only administrators can change privilege levels'
        ),
      update: (target) => User.updatePrivilege(target, privilegeLevel),
      successName: 'PrivilegeUpdated'
    });
  }

  /**
   * PATCH /account/users/:username/username
   * Update username (Members only, own account)
   */
  public async updateUsername(req: Request, res: Response): Promise<void> {
    const targetUsername = this.requireTargetUsername(req, res);
    const { newUsername } = req.body as { newUsername: string };

    if (!targetUsername) {
      return;
    }

    if (!newUsername) {
      this.sendClientError(res, 'MissingUsername', 'New username is required');
      return;
    }

    try {
      const requestingUser = await this.requireRequestingUser(req, res);
      if (!requestingUser) {
        return;
      }

      // Authorization: Members only (own account). Administrators cannot change usernames.
      if (
        !this.ensureOwnAccount(
          requestingUser,
          targetUsername,
          res,
          'You can only change your own username'
        )
      ) {
        return;
      }

      const oldUsername = targetUsername.toLowerCase();
      const updatedUser = await User.updateUsername(
        targetUsername,
        newUsername
      );

      // Emit account updated to old room, then handle room rename
      const oldRoomName = `account:${oldUsername}`;
      const newRoomName = `account:${updatedUser.credentials.username.toLowerCase()}`;

      Controller.io
        .to(oldRoomName)
        .emit('accountUpdated', this.obfuscatePassword(updatedUser));

      // Notify all admins about the username change
      Controller.io
        .to('admin:usernames')
        .emit(
          'usernameChanged',
          targetUsername,
          updatedUser.credentials.username
        );

      // Move sockets from old room to new room
      const socketsInRoom =
        Controller.io.sockets.adapter.rooms.get(oldRoomName);
      if (socketsInRoom) {
        socketsInRoom.forEach((socketId) => {
          const socket = Controller.io.sockets.sockets.get(socketId);
          if (socket) {
            socket.leave(oldRoomName);
            socket.join(newRoomName);
          }
        });
      }

      const successRes: responses.ISuccess = {
        name: 'UsernameUpdated',
        authorizedUser: updatedUser.credentials.username,
        payload: this.obfuscatePassword(updatedUser)
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleError(res, error);
    }
  }

  /**
   * PATCH /account/users/:username/email
   * Update email (Members only, own account)
   */
  public async updateEmail(req: Request, res: Response): Promise<void> {
    const targetUsername = this.requireTargetUsername(req, res);
    const { email } = req.body as { email: string };

    if (!targetUsername) {
      return;
    }

    if (!email) {
      this.sendClientError(res, 'MissingEmail', 'Email is required');
      return;
    }

    await this.performUpdate(req, res, {
      authorize: (user, target) =>
        this.ensureOwnAccount(
          user,
          target,
          res,
          'You can only change your own email'
        ),
      update: (target) => User.updateEmail(target, email),
      successName: 'EmailUpdated'
    });
  }

  /**
   * PATCH /account/users/:username/password
   * Update password
   */
  public async updatePassword(req: Request, res: Response): Promise<void> {
    const targetUsername = this.requireTargetUsername(req, res);
    const { newPassword } = req.body as { newPassword: string };

    if (!targetUsername) {
      return;
    }

    if (!newPassword) {
      this.sendClientError(res, 'MissingPassword', 'New password is required');
      return;
    }

    await this.performUpdate(req, res, {
      authorize: (user, target) =>
        this.ensureAdminOrOwnAccount(
          user,
          target,
          res,
          'You can only change your own password'
        ),
      update: (target) => User.updatePassword(target, newPassword),
      successName: 'PasswordUpdated'
    });
  }

  /**
   * GET /account
   * Serve the account page
   */
  public accountPage(req: Request, res: Response): void {
    this.sendPage(res, 'account.html');
  }

  /**
   * Common error handler for controller methods
   */
  private handleError(res: Response, error: unknown): void {
    respondWithAppOrUnexpectedError(res, error, 'MongoDBError');
  }
}
