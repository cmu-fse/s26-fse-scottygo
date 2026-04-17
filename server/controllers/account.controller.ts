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
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_KEY as secretKey } from '../env';
import * as responses from '../../common/server.responses';
import EmailService from '../services/email.service';
import { SearchContext, UserSearchStrategy } from '../search/search-strategy';

export default class AccountController extends Controller {
  private static instance: AccountController | null = null;

  private constructor(path: string) {
    super(path);
  }

  public static getInstance(path: string): AccountController {
    if (!AccountController.instance) {
      AccountController.instance = new AccountController(path);
    }
    return AccountController.instance;
  }

  public initializeRoutes(): void {
    // Page route (no auth required - client handles auth)
    this.router.get('/', this.accountPage.bind(this));

    // Apply auth middleware to API routes only
    this.router.use(this.authenticateToken.bind(this));

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
    this.router.patch('/onboarding', this.completeOnboarding.bind(this));
  }

  /**
   * Middleware to authenticate JWT token
   */
  private async authenticateToken(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      const error: responses.IAppError = {
        type: 'ClientError',
        name: 'MissingToken',
        message: 'Authentication token is required'
      };
      res.status(401).json(error);
      return;
    }

    try {
      const decoded = jwt.verify(token, secretKey) as ITokenPayload;
      // Attach user info to request for downstream handlers
      (req as Request & { user: ITokenPayload }).user = decoded;
      next();
    } catch {
      const error: responses.IAppError = {
        type: 'ClientError',
        name: 'InvalidToken',
        message: 'Invalid or expired token'
      };
      res.status(401).json(error);
    }
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

  private sendClientError(
    res: Response,
    status: number,
    name: responses.ClientErrorName,
    message: string
  ): void {
    const error: responses.IAppError = {
      type: 'ClientError',
      name,
      message
    };
    res.status(status).json(error);
  }

  private async requireRequestingUser(
    req: Request,
    res: Response
  ): Promise<IUserAccount | null> {
    const requestingUser = await this.getRequestingUserAccount(req);
    if (!requestingUser) {
      this.sendClientError(
        res,
        401,
        'UnauthorizedRequest',
        'Unable to verify requesting user'
      );
      return null;
    }
    return requestingUser;
  }

  private isOwnAccount(
    requestingUser: IUserAccount,
    targetUsername: string
  ): boolean {
    return (
      requestingUser.credentials.username.toLowerCase() ===
      targetUsername.toLowerCase()
    );
  }

  /**
   * Guard: respond 400 and return false when targetUsername is missing.
   */
  private requireTargetUsername(
    targetUsername: string,
    res: Response
  ): boolean {
    if (!targetUsername) {
      this.sendClientError(res, 400, 'MissingUsername', 'Username is required');
      return false;
    }
    return true;
  }

  /**
   * Guard: respond 403 and return false when requestingUser is not an Administrator.
   */
  private requireAdmin(
    requestingUser: IUserAccount,
    res: Response,
    message: string
  ): boolean {
    if (requestingUser.privilegeLevel !== 'Administrator') {
      this.sendClientError(res, 403, 'UnauthorizedRequest', message);
      return false;
    }
    return true;
  }

  /**
   * Guard: respond 403 and return false unless requestingUser is an admin or owns the target account.
   */
  private requireAdminOrOwn(
    requestingUser: IUserAccount,
    targetUsername: string,
    res: Response,
    message: string
  ): boolean {
    const isAdmin = requestingUser.privilegeLevel === 'Administrator';
    const isOwnAccount = this.isOwnAccount(requestingUser, targetUsername);
    if (!isAdmin && !isOwnAccount) {
      this.sendClientError(res, 403, 'UnauthorizedRequest', message);
      return false;
    }
    return true;
  }

  private async applyStatusTransitionSideEffects(
    updatedUser: IUserAccount,
    previousStatus: IAccountStatus,
    nextStatus: IAccountStatus
  ): Promise<void> {
    if (nextStatus === 'Inactive' && previousStatus === 'Active') {
      this.forceLogoutUser(updatedUser.credentials.username.toLowerCase());
      await EmailService.sendAccountInactivatedEmail(
        updatedUser.email,
        updatedUser.credentials.username
      );
      return;
    }

    if (nextStatus === 'Active' && previousStatus === 'Inactive') {
      await EmailService.sendAccountReactivatedEmail(
        updatedUser.email,
        updatedUser.credentials.username
      );
    }
  }

  private emitUsernameChanged(
    oldUsername: string,
    updatedUser: IUserAccount,
    targetUsername: string
  ): void {
    const oldRoomName = `account:${oldUsername}`;
    const newRoomName = `account:${updatedUser.credentials.username.toLowerCase()}`;

    Controller.io
      .to(oldRoomName)
      .emit('accountUpdated', this.obfuscatePassword(updatedUser));

    Controller.io
      .to('admin:usernames')
      .emit(
        'usernameChanged',
        targetUsername,
        updatedUser.credentials.username
      );

    this.moveSocketsToRoom(oldRoomName, newRoomName);
  }

  private moveSocketsToRoom(oldRoomName: string, newRoomName: string): void {
    const socketsInRoom = Controller.io.sockets.adapter.rooms.get(oldRoomName);
    if (!socketsInRoom) return;

    socketsInRoom.forEach((socketId) => {
      const socket = Controller.io.sockets.sockets.get(socketId);
      if (!socket) return;
      socket.leave(oldRoomName);
      socket.join(newRoomName);
    });
  }

  /**
   * GET /account/users
   * Get all usernames (Admin only)
   */
  public async getAllUsers(req: Request, res: Response): Promise<void> {
    try {
      const requestingUser = await this.requireRequestingUser(req, res);
      if (!requestingUser) return;

      if (
        !this.requireAdmin(
          requestingUser,
          res,
          'Only administrators can view all users'
        )
      )
        return;

      const usernames = await User.getAllUsernames();
      const successRes: responses.ISuccess = {
        name: 'UsersRetrieved',
        authorizedUser: requestingUser.credentials.username,
        payload: usernames
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleAppError(res, error);
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
      if (!requestingUser) return;

      if (
        !this.requireAdmin(
          requestingUser,
          res,
          'Only administrators can search users'
        )
      )
        return;

      const q = (req.query.q as string | undefined)?.trim() ?? '';
      const context = new SearchContext<string[]>(new UserSearchStrategy());
      const usernames = await context.executeSearch(q);

      const successRes: responses.ISuccess = {
        name: 'UsersSearchCompleted',
        authorizedUser: requestingUser.credentials.username,
        message: usernames.length
          ? `Found ${usernames.length} matching user${usernames.length === 1 ? '' : 's'}`
          : 'No matching users found',
        metadata: { totalItems: usernames.length },
        payload: usernames
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleAppError(res, error);
    }
  }

  /**
   * GET /account/users/:username
   * Get user account details
   */
  public async getUserAccount(req: Request, res: Response): Promise<void> {
    const targetUsername = req.params.username;
    if (!this.requireTargetUsername(targetUsername, res)) return;

    try {
      const requestingUser = await this.requireRequestingUser(req, res);
      if (!requestingUser) return;

      if (
        !this.requireAdminOrOwn(
          requestingUser,
          targetUsername,
          res,
          'You can only view your own account'
        )
      )
        return;

      const userAccount = await User.getUserAccount(targetUsername);
      const successRes: responses.ISuccess = {
        name: 'AccountRetrieved',
        authorizedUser: requestingUser.credentials.username,
        payload: this.obfuscatePassword(userAccount)
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleAppError(res, error);
    }
  }

  /**
   * PATCH /account/users/:username/status
   * Update account status (Active/Inactive)
   */
  public async updateStatus(req: Request, res: Response): Promise<void> {
    const targetUsername = req.params.username;
    const { status } = req.body as { status: IAccountStatus };

    if (!this.requireTargetUsername(targetUsername, res)) return;

    if (!status || !['Active', 'Inactive'].includes(status)) {
      const error: responses.IAppError = {
        type: 'ClientError',
        name: 'UnauthorizedRequest',
        message: 'Valid status (Active/Inactive) is required'
      };
      res.status(400).json(error);
      return;
    }

    try {
      const requestingUser = await this.requireRequestingUser(req, res);
      if (!requestingUser) return;

      if (
        !this.requireAdminOrOwn(
          requestingUser,
          targetUsername,
          res,
          'You can only change your own account status'
        )
      )
        return;

      // Get target user for email notification
      const targetUser = await User.getUserAccount(targetUsername);
      const previousStatus = targetUser.status;

      const updatedUser = await User.updateStatus(targetUsername, status);

      // Emit account updated event
      this.emitAccountUpdated(updatedUser);

      await this.applyStatusTransitionSideEffects(
        updatedUser,
        previousStatus,
        status
      );

      const successRes: responses.ISuccess = {
        name: 'StatusUpdated',
        authorizedUser: requestingUser.credentials.username,
        payload: this.obfuscatePassword(updatedUser)
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleAppError(res, error);
    }
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
    const targetUsername = req.params.username;
    const { privilegeLevel } = req.body as { privilegeLevel: IPrivilegeLevel };

    if (!this.requireTargetUsername(targetUsername, res)) return;

    if (
      !privilegeLevel ||
      !['Administrator', 'Coordinator', 'Member'].includes(privilegeLevel)
    ) {
      const error: responses.IAppError = {
        type: 'ClientError',
        name: 'UnauthorizedRequest',
        message:
          'Valid privilege level (Administrator/Coordinator/Member) is required'
      };
      res.status(400).json(error);
      return;
    }

    try {
      const requestingUser = await this.requireRequestingUser(req, res);
      if (!requestingUser) return;

      if (
        !this.requireAdmin(
          requestingUser,
          res,
          'Only administrators can change privilege levels'
        )
      )
        return;

      // R1 check is now in User.updatePrivilege (model layer)
      const updatedUser = await User.updatePrivilege(
        targetUsername,
        privilegeLevel
      );

      // Emit account updated event
      this.emitAccountUpdated(updatedUser);

      const successRes: responses.ISuccess = {
        name: 'PrivilegeUpdated',
        authorizedUser: requestingUser.credentials.username,
        payload: this.obfuscatePassword(updatedUser)
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleAppError(res, error);
    }
  }

  /**
   * PATCH /account/users/:username/username
   * Update username (Members only, own account)
   */
  public async updateUsername(req: Request, res: Response): Promise<void> {
    const targetUsername = req.params.username;
    const { newUsername } = req.body as { newUsername: string };

    if (!this.requireTargetUsername(targetUsername, res)) return;

    if (!newUsername) {
      this.sendClientError(
        res,
        400,
        'MissingUsername',
        'New username is required'
      );
      return;
    }

    try {
      const requestingUser = await this.requireRequestingUser(req, res);
      if (!requestingUser) return;

      // Authorization: Members only (own account). Administrators cannot change usernames.
      if (!this.isOwnAccount(requestingUser, targetUsername)) {
        this.sendClientError(
          res,
          403,
          'UnauthorizedRequest',
          'You can only change your own username'
        );
        return;
      }

      const oldUsername = targetUsername.toLowerCase();
      const updatedUser = await User.updateUsername(
        targetUsername,
        newUsername
      );

      this.emitUsernameChanged(oldUsername, updatedUser, targetUsername);

      const successRes: responses.ISuccess = {
        name: 'UsernameUpdated',
        authorizedUser: updatedUser.credentials.username,
        payload: this.obfuscatePassword(updatedUser)
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleAppError(res, error);
    }
  }

  /**
   * PATCH /account/users/:username/email
   * Update email (Members only, own account)
   */
  public async updateEmail(req: Request, res: Response): Promise<void> {
    const targetUsername = req.params.username;
    const { email } = req.body as { email: string };

    if (!this.requireTargetUsername(targetUsername, res)) return;

    if (!email) {
      this.sendClientError(res, 400, 'MissingEmail', 'Email is required');
      return;
    }

    try {
      const requestingUser = await this.requireRequestingUser(req, res);
      if (!requestingUser) return;

      // Authorization: Members only (own account)
      if (!this.isOwnAccount(requestingUser, targetUsername)) {
        this.sendClientError(
          res,
          403,
          'UnauthorizedRequest',
          'You can only change your own email'
        );
        return;
      }

      const updatedUser = await User.updateEmail(targetUsername, email);

      // Emit account updated event
      this.emitAccountUpdated(updatedUser);

      const successRes: responses.ISuccess = {
        name: 'EmailUpdated',
        authorizedUser: requestingUser.credentials.username,
        payload: this.obfuscatePassword(updatedUser)
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleAppError(res, error);
    }
  }

  /**
   * PATCH /account/users/:username/password
   * Update password
   */
  public async updatePassword(req: Request, res: Response): Promise<void> {
    const targetUsername = req.params.username;
    const { newPassword } = req.body as { newPassword: string };

    if (!this.requireTargetUsername(targetUsername, res)) return;

    if (!newPassword) {
      this.sendClientError(
        res,
        400,
        'MissingPassword',
        'New password is required'
      );
      return;
    }

    try {
      const requestingUser = await this.requireRequestingUser(req, res);
      if (!requestingUser) return;

      if (
        !this.requireAdminOrOwn(
          requestingUser,
          targetUsername,
          res,
          'You can only change your own password'
        )
      )
        return;

      const updatedUser = await User.updatePassword(
        targetUsername,
        newPassword
      );

      // Emit account updated event
      this.emitAccountUpdated(updatedUser);

      const successRes: responses.ISuccess = {
        name: 'PasswordUpdated',
        authorizedUser: requestingUser.credentials.username,
        payload: this.obfuscatePassword(updatedUser)
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleAppError(res, error);
    }
  }

  /**
   * GET /account
   * Serve the account page
   */
  public accountPage(req: Request, res: Response): void {
    this.sendPage(res, 'account.html');
  }

  /**
   * PATCH /account/onboarding
   * Mark onboarding tutorial as complete for the authenticated user
   */
  public async completeOnboarding(req: Request, res: Response): Promise<void> {
    try {
      const tokenUser = (req as Request & { user: ITokenPayload }).user;
      if (!tokenUser || !tokenUser.userId) {
        const error: responses.IAppError = {
          type: 'ClientError',
          name: 'UnauthorizedRequest',
          message: 'Unable to verify requesting user'
        };
        res.status(401).json(error);
        return;
      }

      await User.markOnboardingComplete(tokenUser.userId);

      const successRes: responses.ISuccess = {
        name: 'OnboardingCompleted',
        authorizedUser: tokenUser.username,
        payload: null
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleAppError(res, error);
    }
  }
}
