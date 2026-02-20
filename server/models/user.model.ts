// This is the model for users
// It is used by the controllers to access functionality related users, including database access

import {
  ILogin,
  IUser,
  IUserAccount,
  IAccountStatus,
  IPrivilegeLevel
} from '../../common/user.interface';
import { v4 as uuidV4 } from 'uuid';
import DAC from '../db/dac';
import { IAppError } from '../../common/server.responses';
import bcrypt from 'bcrypt';

export class User implements IUser {
  credentials: ILogin;
  email: string; // this carries the email of the user
  agreed: boolean; // reflects if user agreed to Terms of Services
  _id?: string;

  constructor(credentials: ILogin, email: string, agreed: boolean) {
    this.credentials = credentials;
    this.email = email;
    this.agreed = agreed;
    this._id = uuidV4();
  }

  async join(): Promise<IUser> {
    // Validate email format
    User.validateEmailFormat(this.email);

    // Validate username format
    User.validateUsernameFormat(this.credentials.username);

    // Check if user already exists
    const existingUser = await DAC.db.findUserByUsername(
      this.credentials.username.toLowerCase()
    );
    if (existingUser) {
      // Compare provided password with stored hashed password
      const isValid = await bcrypt.compare(
        this.credentials.password,
        existingUser.credentials.password
      );

      if (!isValid) {
        // Wrong password - either existing user entered wrong password or new user
        // entered username that already exists

        // Handle case where existing user entered wrong password
        if (this.email === existingUser.email) {
          const error: IAppError = {
            type: 'ClientError',
            name: 'IncorrectPassword',
            message: 'Re-enter username and/or password'
          };
          throw error;
        }
        // Handle case where new user entered username that already exists
        const error: IAppError = {
          type: 'ClientError',
          name: 'InvalidUsername',
          message: 'Please provide a different username'
        };
        throw error;
      }

      const error: IAppError = {
        type: 'ClientError',
        name: 'UserExists',
        message:
          'User with this username and password already exists - please log in'
      };
      throw error;
    }

    // Validate password strength
    User.validatePasswordStrength(this.credentials.password);

    // Hash password before saving
    const passwordToStore = await bcrypt.hash(this.credentials.password, 10);

    const userToSave: IUser = {
      credentials: {
        username: this.credentials.username.toLowerCase(),
        password: passwordToStore
      },
      email: this.email,
      agreed: this.agreed,
      _id: this._id
    };

    // Save to database
    const savedUser = await DAC.db.saveUser(userToSave);
    return savedUser;
  }

  static async validateUser(credentials: ILogin): Promise<IUser> {
    // Validate user credentials by checking username and password
    // Returns user if valid
    // Throws IAppError for specific failure cases

    // Get user from database
    const user = await DAC.db.findUserByUsername(
      credentials.username.toLowerCase()
    );
    if (!user) {
      // User not found - throw specific error
      const error: IAppError = {
        type: 'ClientError',
        name: 'UserNotFound',
        message: 'User not found'
      };
      throw error;
    }

    // Compare provided password with stored hashed password
    const isValid = await bcrypt.compare(
      credentials.password,
      user.credentials.password
    );

    if (!isValid) {
      // Wrong password - throw specific error
      const error: IAppError = {
        type: 'ClientError',
        name: 'IncorrectPassword',
        message: 'Incorrect password'
      };
      throw error;
    }

    return user;
  }

  static async getUserForUsername(username: string): Promise<IUser | null> {
    // get user from database
    const user = await DAC.db.findUserByUsername(username.toLowerCase());
    if (!user) {
      // if user not found, throw error
      const error: IAppError = {
        type: 'ClientError',
        name: 'UserNotFound',
        message: 'User not found - user does not exist'
      };
      throw error;
    }
    return user;
  }

  static async setUserAgreedToTrue(user: IUser): Promise<IUser> {
    user.agreed = true;
    const userWhoAgreed: IUser | null = await DAC.db.setUserAgreedToTrue(user);
    if (!userWhoAgreed) {
      // If patch fails, tell User
      // ServerErrorName = 'PatchRequestFailure'
      const error: IAppError = {
        type: 'ServerError',
        name: 'PatchRequestFailure',
        message: 'Update of user agreed status failed'
      };
      throw error;
    }
    return userWhoAgreed;
  }

  // ==================== Account Management Methods ====================

  // Reserved usernames list for validation
  private static reservedUsernames: string[] = [
    'about',
    'access',
    'account',
    'accounts',
    'add',
    'address',
    'adm',
    'administration',
    'adult',
    'advertising',
    'affiliate',
    'affiliates',
    'ajax',
    'analytics',
    'android',
    'anon',
    'anonymous',
    'api',
    'app',
    'apps',
    'archive',
    'atom',
    'auth',
    'authentication',
    'avatar',
    'backup',
    'banner',
    'banners',
    'bin',
    'billing',
    'blog',
    'blogs',
    'board',
    'bot',
    'bots',
    'business',
    'chat',
    'cache',
    'cadastro',
    'calendar',
    'campaign',
    'careers',
    'cgi',
    'client',
    'cliente',
    'code',
    'comercial',
    'compare',
    'config',
    'connect',
    'contact',
    'contest',
    'create',
    'compras',
    'css',
    'dashboard',
    'data',
    'db',
    'design',
    'delete',
    'demo',
    'designer',
    'dev',
    'devel',
    'dir',
    'directory',
    'doc',
    'docs',
    'domain',
    'download',
    'downloads',
    'edit',
    'editor',
    'email',
    'ecommerce',
    'forum',
    'forums',
    'faq',
    'favorite',
    'feed',
    'feedback',
    'flog',
    'follow',
    'file',
    'files',
    'free',
    'ftp',
    'gadget',
    'gadgets',
    'games',
    'guest',
    'group',
    'groups',
    'help',
    'home',
    'homepage',
    'host',
    'hosting',
    'hostname',
    'html',
    'http',
    'httpd',
    'https',
    'hpg',
    'info',
    'information',
    'image',
    'img',
    'images',
    'imap',
    'index',
    'invite',
    'intranet',
    'indice',
    'ipad',
    'iphone',
    'irc',
    'java',
    'javascript',
    'job',
    'jobs',
    'js',
    'knowledgebase',
    'log',
    'login',
    'logs',
    'logout',
    'list',
    'lists',
    'mail',
    'mail1',
    'mail2',
    'mail3',
    'mail4',
    'mail5',
    'mailer',
    'mailing',
    'mx',
    'manager',
    'marketing',
    'master',
    'me',
    'media',
    'message',
    'microblog',
    'microblogs',
    'mine',
    'mp3',
    'msg',
    'msn',
    'mysql',
    'messenger',
    'mob',
    'mobile',
    'movie',
    'movies',
    'music',
    'musicas',
    'my',
    'name',
    'named',
    'net',
    'network',
    'new',
    'news',
    'newsletter',
    'nick',
    'nickname',
    'notes',
    'noticias',
    'ns',
    'ns1',
    'ns2',
    'ns3',
    'ns4',
    'old',
    'online',
    'operator',
    'order',
    'orders',
    'page',
    'pager',
    'pages',
    'panel',
    'password',
    'perl',
    'pic',
    'pics',
    'photo',
    'photos',
    'photoalbum',
    'php',
    'plugin',
    'plugins',
    'pop',
    'pop3',
    'post',
    'postmaster',
    'postfix',
    'posts',
    'profile',
    'project',
    'projects',
    'promo',
    'pub',
    'public',
    'python',
    'random',
    'register',
    'registration',
    'root',
    'ruby',
    'rss',
    'sale',
    'sales',
    'sample',
    'samples',
    'script',
    'scripts',
    'secure',
    'send',
    'service',
    'shop',
    'sql',
    'signup',
    'signin',
    'search',
    'security',
    'settings',
    'setting',
    'setup',
    'site',
    'sites',
    'sitemap',
    'smtp',
    'soporte',
    'ssh',
    'stage',
    'staging',
    'start',
    'subscribe',
    'subdomain',
    'suporte',
    'support',
    'stat',
    'static',
    'stats',
    'status',
    'store',
    'stores',
    'system',
    'tablet',
    'tablets',
    'tech',
    'telnet',
    'test',
    'test1',
    'test2',
    'test3',
    'teste',
    'tests',
    'theme',
    'themes',
    'tmp',
    'todo',
    'task',
    'tasks',
    'tools',
    'tv',
    'talk',
    'update',
    'upload',
    'url',
    'user',
    'username',
    'usuario',
    'usage',
    'vendas',
    'video',
    'videos',
    'visitor',
    'win',
    'ww',
    'www',
    'www1',
    'www2',
    'www3',
    'www4',
    'www5',
    'www6',
    'www7',
    'wwww',
    'wws',
    'wwws',
    'web',
    'webmail',
    'website',
    'websites',
    'webmaster',
    'workshop',
    'xxx',
    'xpg',
    'you',
    'yourname',
    'yourusername',
    'yoursite',
    'yourdomain'
  ];

  /**
   * Get all usernames (for admin dropdown)
   */
  static async getAllUsernames(): Promise<string[]> {
    return DAC.db.getAllUsernames();
  }

  /**
   * Get a user account by username
   */
  static async getUserAccount(username: string): Promise<IUserAccount> {
    const userAccount = await DAC.db.findUserAccountByUsername(
      username.toLowerCase()
    );
    if (!userAccount) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'UserNotFound',
        message: 'User not found'
      };
      throw error;
    }
    return userAccount;
  }

  /**
   * Update user account status (Active/Inactive)
   */
  static async updateStatus(
    username: string,
    status: IAccountStatus
  ): Promise<IUserAccount> {
    // Check if this would leave no active administrators
    if (status === 'Inactive') {
      const userAccount = await DAC.db.findUserAccountByUsername(
        username.toLowerCase()
      );
      if (userAccount?.privilegeLevel === 'Administrator') {
        const adminCount = await DAC.db.countAdministrators();
        if (adminCount <= 1) {
          const error: IAppError = {
            type: 'ClientError',
            name: 'LastAdministrator',
            message: 'Cannot inactivate the last Administrator'
          };
          throw error;
        }
      }
    }

    const updatedUser = await DAC.db.updateUserStatus(
      username.toLowerCase(),
      status
    );
    if (!updatedUser) {
      const error: IAppError = {
        type: 'ServerError',
        name: 'PatchRequestFailure',
        message: 'Failed to update user status'
      };
      throw error;
    }
    return updatedUser;
  }

  /**
   * Update user privilege level
   * Enforces R1 At-Least-One-Administrator Rule
   */
  static async updatePrivilege(
    username: string,
    privilegeLevel: IPrivilegeLevel
  ): Promise<IUserAccount> {
    // R1 At-Least-One-Administrator Rule: Check before demoting an admin
    if (privilegeLevel !== 'Administrator') {
      // Get current user to check if they're an admin
      const currentUser = await DAC.db.findUserAccountByUsername(username.toLowerCase());
      if (currentUser && currentUser.privilegeLevel === 'Administrator' && currentUser.status === 'Active') {
        // Count active administrators
        const adminCount = await DAC.db.countAdministrators();
        if (adminCount <= 1) {
          const error: IAppError = {
            type: 'ClientError',
            name: 'LastAdministrator',
            message: 'Cannot demote the last active Administrator'
          };
          throw error;
        }
      }
    }

    const updatedUser = await DAC.db.updateUserPrivilege(
      username.toLowerCase(),
      privilegeLevel
    );
    if (!updatedUser) {
      const error: IAppError = {
        type: 'ServerError',
        name: 'PatchRequestFailure',
        message: 'Failed to update user privilege level'
      };
      throw error;
    }
    return updatedUser;
  }

  /**
   * Update username with validation
   */
  static async updateUsername(
    oldUsername: string,
    newUsername: string
  ): Promise<IUserAccount> {
    const normalizedNewUsername = newUsername.toLowerCase();

    // Validate username format (length and reserved list)
    User.validateUsernameFormat(newUsername);

    // Check if new username already exists
    const existingUser = await DAC.db.findUserByUsername(normalizedNewUsername);
    if (existingUser) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'UsernameExists',
        message: 'Username already exists'
      };
      throw error;
    }

    const updatedUser = await DAC.db.updateUsername(
      oldUsername.toLowerCase(),
      normalizedNewUsername
    );
    if (!updatedUser) {
      const error: IAppError = {
        type: 'ServerError',
        name: 'PatchRequestFailure',
        message: 'Failed to update username'
      };
      throw error;
    }
    return updatedUser;
  }

  /**
   * Update user email with validation
   */
  static async updateEmail(
    username: string,
    email: string
  ): Promise<IUserAccount> {
    // Validate email format
    User.validateEmailFormat(email);

    const updatedUser = await DAC.db.updateUserEmail(
      username.toLowerCase(),
      email
    );
    if (!updatedUser) {
      const error: IAppError = {
        type: 'ServerError',
        name: 'PatchRequestFailure',
        message: 'Failed to update email'
      };
      throw error;
    }
    return updatedUser;
  }

  /**
   * Update user password with validation
   * @param username - The username of the user
   * @param newPassword - The new password (plain text, will be hashed)
   */
  static async updatePassword(
    username: string,
    newPassword: string
  ): Promise<IUserAccount> {
    // Validate new password strength
    User.validatePasswordStrength(newPassword);

    // Hash and update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updatedUser = await DAC.db.updateUserPassword(
      username.toLowerCase(),
      hashedPassword
    );
    if (!updatedUser) {
      const error: IAppError = {
        type: 'ServerError',
        name: 'PatchRequestFailure',
        message: 'Failed to update password'
      };
      throw error;
    }
    return updatedUser;
  }

  /**
   * Validate username format (length and reserved list)
   * Throws IAppError if username doesn't meet requirements
   */
  private static validateUsernameFormat(username: string): void {
    // Check minimum length
    if (username.length < 4) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'InvalidUsername',
        message: 'Username must be at least 4 characters long'
      };
      throw error;
    }

    // Check reserved username list
    if (User.reservedUsernames.includes(username.toLowerCase())) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'InvalidUsername',
        message: 'This username is invalid - please choose a valid one'
      };
      throw error;
    }
  }

  /**
   * Validate email format (CMU email)
   * Throws IAppError if email doesn't meet requirements
   */
  private static validateEmailFormat(email: string): void {
    // CMU email regex: allows @cmu.edu and @subdomain.cmu.edu (e.g., @andrew.cmu.edu)
    const emailRegex = /^[^\s@]+@([^\s@]+\.)?cmu\.edu$/;
    if (!emailRegex.test(email)) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'InvalidEmail',
        message: 'Email must be a valid CMU email address'
      };
      throw error;
    }
  }

  /**
   * Validate password strength according to password rules
   * Throws IAppError if password doesn't meet requirements
   */
  private static validatePasswordStrength(password: string): void {
    // Rule 1: At least 4 characters long
    if (password.length < 4) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'WeakPassword',
        message: 'Password must be at least 4 characters long'
      };
      throw error;
    }

    // (Voluntary, not in UC) Rule 2: Must contain at least one letter
    if (!/[a-zA-Z]/.test(password)) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'WeakPassword',
        message: 'Password must contain at least one letter'
      };
      throw error;
    }

    // (Voluntary, not in UC) Rule 3: Must contain at least one number
    if (!/[0-9]/.test(password)) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'WeakPassword',
        message: 'Password must contain at least one number'
      };
      throw error;
    }

    // (Voluntary, not in UC) Rule 4: Must contain at least one special character
    const specialChars = /[$%#@!*&~^\-+]/;
    if (!specialChars.test(password)) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'WeakPassword',
        message: 'Password must contain at least one special character'
      };
      throw error;
    }

    // (Voluntary, not in UC) Rule 5: Cannot contain any characters other than letters, numbers,
    //                                and allowed special chars
    const validChars = /^[a-zA-Z0-9$%#@!*&~^\-+]+$/;
    if (!validChars.test(password)) {
      const error: IAppError = {
        type: 'ClientError',
        name: 'InvalidPassword',
        message: 'Password contains invalid characters'
      };
      throw error;
    }
  }

  /**
   * Validate a password against stored hash
   */
  static async validatePassword(
    username: string,
    password: string
  ): Promise<boolean> {
    const user = await DAC.db.findUserByUsername(username.toLowerCase());
    if (!user) {
      return false;
    }
    return bcrypt.compare(password, user.credentials.password);
  }

  /**
   * Check if a user is the last active administrator
   */
  static async isLastAdministrator(username: string): Promise<boolean> {
    const userAccount = await DAC.db.findUserAccountByUsername(
      username.toLowerCase()
    );
    if (userAccount?.privilegeLevel !== 'Administrator') {
      return false;
    }
    const adminCount = await DAC.db.countAdministrators();
    return adminCount <= 1;
  }
}
