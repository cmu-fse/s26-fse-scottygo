// these are TS types required by socket.io

export interface ServerToClientEvents {
  ping: () => void;
}

export interface ClientToServerEvents {
  ping: () => void;
}
