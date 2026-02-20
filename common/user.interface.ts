// data for the user model

export interface ILogin {
  // represents a user's authentication credentials
  username: string; // stores the username provided in a request
  password: string;
}

export interface IUser {
  // represents a user's data
  credentials: ILogin;
  _id?: string; // a unique user id
  email: string; // stores the user's email provided in a request
  agreed: boolean; // stores whether user agreed to Terms of Services
}

// Account status for ManageAcct use case
export type IAccountStatus = 'Active' | 'Inactive';

// Privilege levels for ManageAcct use case
export type IPrivilegeLevel = 'Administrator' | 'Coordinator' | 'Member';

// Extended user interface with account management fields
export interface IUserAccount extends IUser {
  status: IAccountStatus;
  privilegeLevel: IPrivilegeLevel;
}

// JWT token payload - uses immutable userId to avoid token invalidation on username change
export interface ITokenPayload {
  userId: string;  // User's _id (immutable)
  username: string;  // Included for convenience, but userId is the source of truth
  iat?: number;  // Issued at (set by jwt.sign)
  exp?: number;  // Expiration time (set by jwt.sign)
}
