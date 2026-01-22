// data for the user model

export interface ILogin {
  // represents a user's authentication credentials
  username: string; // stores the user's email provided in a request
  password: string;
}

export interface IUser {
  // represents a user's data
  credentials: ILogin;
  _id?: string; // a unique user id
  extra?: string; // stores the user's display name provided in a request
}
