// these are TS types required by socket.io

import { IUserAccount } from './user.interface';

export interface ServerToClientEvents {
  ping: () => void;
  accountUpdated: (account: IUserAccount) => void;
  forceLogout: (reason: string) => void;
}

export interface ClientToServerEvents {
  ping: () => void;
  subscribeAccount: (username: string) => void;
  unsubscribeAccount: (username: string) => void;
}
