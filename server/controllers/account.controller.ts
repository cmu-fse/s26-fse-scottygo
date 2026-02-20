// Controller for account management operations
// Handles HTTP requests for account retrieval, updates, password changes,
// status changes, and privilege changes per REST_ManageAcct.md

import { IUserAccount, IAccountStatus, IPrivilegeLevel, ITokenPayload } from '../../common/user.interface';
import { User } from '../models/user.model';
import DAC from '../db/dac';
import Controller from './controller';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_KEY as secretKey } from '../env';
import * as responses from '../../common/server.responses';
import EmailService from '../services/email.service';

export default class AccountController extends Controller {
  public constructor(path: string) {
    super(path);
  }

  public initializeRoutes(): void {
    // Page route (no auth required - client handles auth)
    this.router.get('/', this.accountPage.bind(this));

    // Apply auth middleware to API routes only
    this.router.use(this.authenticateToken.bind(this));

    // Account management routes
    this.router.get('/users', this.getAllUsers.bind(this)); // Must be before :username route
    this.router.get('/users/:username', this.getUserAccount.bind(this));
    this.router.patch(
      '/users/:username/status',
      this.updateStatus.bind(this)
    );
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
      return await DAC.db.findUserAccountById(tokenUser.userId);
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
    const roomName = `account:${account.credentials.username}`;
    Controller.io.to(roomName).emit('accountUpdated', this.obfuscatePassword(account));
  }

  /**
   * GET /account/users
   * Get all usernames (Admin only)
   */
  public async getAllUsers(req: Request, res: Response): Promise<void> {
    try {
      const requestingUser = await this.getRequestingUserAccount(req);
      if (!requestingUser) {
        const error: responses.IAppError = {
          type: 'ClientError',
          name: 'UnauthorizedRequest',
          message: 'Unable to verify requesting user'
        };
        res.status(401).json(error);
        return;
      }

      // Only administrators can get all users
      if (requestingUser.privilegeLevel !== 'Administrator') {
        const error: responses.IAppError = {
          type: 'ClientError',
          name: 'UnauthorizedRequest',
          message: 'Only administrators can view all users'
        };
        res.status(403).json(error);
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
   * GET /account/users/:username
   * Get user account details
   */
  public async getUserAccount(req: Request, res: Response): Promise<void> {
    const targetUsername = req.params.username;

    if (!targetUsername) {
      const error: responses.IAppError = {
        type: 'ClientError',
        name: 'MissingUsername',
        message: 'Username is required'
      };
      res.status(400).json(error);
      return;
    }

    try {
      const requestingUser = await this.getRequestingUserAccount(req);
      if (!requestingUser) {
        const error: responses.IAppError = {
          type: 'ClientError',
          name: 'UnauthorizedRequest',
          message: 'Unable to verify requesting user'
        };
        res.status(401).json(error);
        return;
      }

      // Authorization: Admins can view any user; Members can only view their own
      const isAdmin = requestingUser.privilegeLevel === 'Administrator';
      const isOwnAccount =
        requestingUser.credentials.username.toLowerCase() ===
        targetUsername.toLowerCase();

      if (!isAdmin && !isOwnAccount) {
        const error: responses.IAppError = {
          type: 'ClientError',
          name: 'UnauthorizedRequest',
          message: 'You can only view your own account'
        };
        res.status(403).json(error);
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
    const targetUsername = req.params.username;
    const { status } = req.body as { status: IAccountStatus };

    if (!targetUsername) {
      const error: responses.IAppError = {
        type: 'ClientError',
        name: 'MissingUsername',
        message: 'Username is required'
      };
      res.status(400).json(error);
      return;
    }

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
      const requestingUser = await this.getRequestingUserAccount(req);
      if (!requestingUser) {
        const error: responses.IAppError = {
          type: 'ClientError',
          name: 'UnauthorizedRequest',
          message: 'Unable to verify requesting user'
        };
        res.status(401).json(error);
        return;
      }

      const isAdmin = requestingUser.privilegeLevel === 'Administrator';
      const isOwnAccount =
        requestingUser.credentials.username.toLowerCase() ===
        targetUsername.toLowerCase();

      // Authorization: Admins can change any; Members can only change their own
      if (!isAdmin && !isOwnAccount) {
        const error: responses.IAppError = {
          type: 'ClientError',
          name: 'UnauthorizedRequest',
          message: 'You can only change your own account status'
        };
        res.status(403).json(error);
        return;
      }

      // Get target user for email notification
      const targetUser = await User.getUserAccount(targetUsername);
      const previousStatus = targetUser.status;

      const updatedUser = await User.updateStatus(targetUsername, status);

      // Emit account updated event
      this.emitAccountUpdated(updatedUser);

      // Handle force logout and email if status changed to Inactive
      if (status === 'Inactive' && previousStatus === 'Active') {
        // Send force logout to the user's sockets
        this.forceLogoutUser(targetUsername.toLowerCase());

        // Send email notification
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

      const successRes: responses.ISuccess = {
        name: 'StatusUpdated',
        authorizedUser: requestingUser.credentials.username,
        payload: this.obfuscatePassword(updatedUser)
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleError(res, error);
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
      const socketUser = (socket as unknown as { user?: { username: string } }).user;
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

    if (!targetUsername) {
      const error: responses.IAppError = {
        type: 'ClientError',
        name: 'MissingUsername',
        message: 'Username is required'
      };
      res.status(400).json(error);
      return;
    }

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
      const requestingUser = await this.getRequestingUserAccount(req);
      if (!requestingUser) {
        const error: responses.IAppError = {
          type: 'ClientError',
          name: 'UnauthorizedRequest',
          message: 'Unable to verify requesting user'
        };
        res.status(401).json(error);
        return;
      }

      // Authorization: Only Administrators can change privilege levels
      if (requestingUser.privilegeLevel !== 'Administrator') {
        const error: responses.IAppError = {
          type: 'ClientError',
          name: 'UnauthorizedRequest',
          message: 'Only administrators can change privilege levels'
        };
        res.status(403).json(error);
        return;
      }

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
      this.handleError(res, error);
    }
  }

  /**
   * PATCH /account/users/:username/username
   * Update username (Members only, own account)
   */
  public async updateUsername(req: Request, res: Response): Promise<void> {
    const targetUsername = req.params.username;
    const { newUsername } = req.body as { newUsername: string };

    if (!targetUsername) {
      const error: responses.IAppError = {
        type: 'ClientError',
        name: 'MissingUsername',
        message: 'Username is required'
      };
      res.status(400).json(error);
      return;
    }

    if (!newUsername) {
      const error: responses.IAppError = {
        type: 'ClientError',
        name: 'MissingUsername',
        message: 'New username is required'
      };
      res.status(400).json(error);
      return;
    }

    try {
      const requestingUser = await this.getRequestingUserAccount(req);
      if (!requestingUser) {
        const error: responses.IAppError = {
          type: 'ClientError',
          name: 'UnauthorizedRequest',
          message: 'Unable to verify requesting user'
        };
        res.status(401).json(error);
        return;
      }

      // Authorization: Members only (own account). Administrators cannot change usernames.
      const isOwnAccount =
        requestingUser.credentials.username.toLowerCase() ===
        targetUsername.toLowerCase();

      if (!isOwnAccount) {
        const error: responses.IAppError = {
          type: 'ClientError',
          name: 'UnauthorizedRequest',
          message: 'You can only change your own username'
        };
        res.status(403).json(error);
        return;
      }

      const oldUsername = targetUsername.toLowerCase();
      const updatedUser = await User.updateUsername(targetUsername, newUsername);

      // Emit account updated to old room, then handle room rename
      const oldRoomName = `account:${oldUsername}`;
      const newRoomName = `account:${updatedUser.credentials.username}`;

      Controller.io
        .to(oldRoomName)
        .emit('accountUpdated', this.obfuscatePassword(updatedUser));

      // Move sockets from old room to new room
      const socketsInRoom = Controller.io.sockets.adapter.rooms.get(oldRoomName);
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
    const targetUsername = req.params.username;
    const { email } = req.body as { email: string };

    if (!targetUsername) {
      const error: responses.IAppError = {
        type: 'ClientError',
        name: 'MissingUsername',
        message: 'Username is required'
      };
      res.status(400).json(error);
      return;
    }

    if (!email) {
      const error: responses.IAppError = {
        type: 'ClientError',
        name: 'MissingEmail',
        message: 'Email is required'
      };
      res.status(400).json(error);
      return;
    }

    try {
      const requestingUser = await this.getRequestingUserAccount(req);
      if (!requestingUser) {
        const error: responses.IAppError = {
          type: 'ClientError',
          name: 'UnauthorizedRequest',
          message: 'Unable to verify requesting user'
        };
        res.status(401).json(error);
        return;
      }

      // Authorization: Members only (own account)
      const isOwnAccount =
        requestingUser.credentials.username.toLowerCase() ===
        targetUsername.toLowerCase();

      if (!isOwnAccount) {
        const error: responses.IAppError = {
          type: 'ClientError',
          name: 'UnauthorizedRequest',
          message: 'You can only change your own email'
        };
        res.status(403).json(error);
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
      this.handleError(res, error);
    }
  }

  /**
   * PATCH /account/users/:username/password
   * Update password
   */
  public async updatePassword(req: Request, res: Response): Promise<void> {
    const targetUsername = req.params.username;
    const { newPassword } = req.body as { newPassword: string };

    if (!targetUsername) {
      const error: responses.IAppError = {
        type: 'ClientError',
        name: 'MissingUsername',
        message: 'Username is required'
      };
      res.status(400).json(error);
      return;
    }

    if (!newPassword) {
      const error: responses.IAppError = {
        type: 'ClientError',
        name: 'MissingPassword',
        message: 'New password is required'
      };
      res.status(400).json(error);
      return;
    }

    try {
      const requestingUser = await this.getRequestingUserAccount(req);
      if (!requestingUser) {
        const error: responses.IAppError = {
          type: 'ClientError',
          name: 'UnauthorizedRequest',
          message: 'Unable to verify requesting user'
        };
        res.status(401).json(error);
        return;
      }

      const isAdmin = requestingUser.privilegeLevel === 'Administrator';
      const isOwnAccount =
        requestingUser.credentials.username.toLowerCase() ===
        targetUsername.toLowerCase();

      // Authorization: Admins can change any; Members can only change their own
      if (!isAdmin && !isOwnAccount) {
        const error: responses.IAppError = {
          type: 'ClientError',
          name: 'UnauthorizedRequest',
          message: 'You can only change your own password'
        };
        res.status(403).json(error);
        return;
      }

      const updatedUser = await User.updatePassword(targetUsername, newPassword);

      // Emit account updated event
      this.emitAccountUpdated(updatedUser);

      const successRes: responses.ISuccess = {
        name: 'PasswordUpdated',
        authorizedUser: requestingUser.credentials.username,
        payload: this.obfuscatePassword(updatedUser)
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleError(res, error);
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
   * Common error handler for controller methods
   */
  private handleError(res: Response, error: unknown): void {
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
      message: 'An unexpected error occurred'
    };
    res.status(500).json(unexpectedError);
  }
}
