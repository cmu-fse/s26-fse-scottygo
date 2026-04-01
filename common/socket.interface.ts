// these are TS types required by socket.io

import { IUserAccount } from './user.interface';
import { INotification, IServiceAlert } from './transit.interface';

export interface ServerToClientEvents {
  ping: () => void;
  accountUpdated: (account: IUserAccount) => void;
  usernameChanged: (oldUsername: string, newUsername: string) => void;
  forceLogout: (reason: string) => void;
  liveNotification: (notification: INotification) => void;
  alertUpdate: (alerts: IServiceAlert[]) => void;
}

export interface ClientToServerEvents {
  ping: () => void;
  subscribeAccount: (username: string) => void;
  unsubscribeAccount: (username: string) => void;
  subscribeRoute: (data: { routeId: string }) => void;
  unsubscribeRoute: (data: { routeId: string }) => void;
}
