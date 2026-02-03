import express, { Express, Request, Response, NextFunction } from 'express';
import { Server as HttpServer, createServer } from 'http';
import DAC, { IDatabase } from './db/dac';
import Controller from './controllers/controller';
import { JWT_KEY as secretKey, JWT_EXP as tokenExpiry } from './env';
import { Server as SocketServer, Socket } from 'socket.io';
import {
  ClientToServerEvents,
  ServerToClientEvents
} from '../common/socket.interface';
import { ExtendedError } from 'socket.io/dist/namespace';
import jwt from 'jsonwebtoken';
// other imports you need

class App {
  public app: Express;

  public port: number;

  public db: IDatabase;

  public host: string;

  public clientDir: string; // pathname for the client folder

  public url: string;

  public server: HttpServer;

  public io: SocketServer;

  constructor(
    controllers: Controller[],
    params: {
      port: number;
      host: string;
      clientDir: string;
      db: IDatabase;
      url: string;
      initOnStart: boolean;
    }
  ) {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketServer<ClientToServerEvents, ServerToClientEvents>(
      this.server
    );
    this.port = params.port;
    this.db = params.db;
    this.host = params.host;
    this.clientDir = params.clientDir;
    this.url = params.url; // construct the URL from the host and port
    this.configureApp(params.initOnStart);
    this.configureMiddlewares();
    this.configureControllers(controllers);
    // more TODO here? Perhaps, perhaps not!
  }

  private configureApp(initOnStart: boolean) {
    DAC.db = this.db;
    DAC.db.connect().then(() => {
      if (initOnStart) {
        this.db.init(); //
        // I set initOnStart to false if STAGE is 'PROD' in serve.ts so no risk of deleting PROD DB
      }
    });
    // TODO: Add more app initialization code here if required
  }

  private configureMiddlewares() {
    // TODO
    this.app.use(express.static(this.clientDir)); // serve the static assets from the client folder
    this.app.use(express.json()); // for parsing request's json body
    this.app.use(express.urlencoded({ extended: true })); // for decoding the encoded url
    this.app.use(this.serverLogger); // add a logging middleware
    this.io.use(this.validateToken);
  }

  private configureControllers(controllers: Controller[]) {
    Controller.io = this.io;
    controllers.forEach((controller) => {
      this.app.use(controller.path, controller.router);
    });
  }

  public serverLogger(req: Request, res: Response, next: NextFunction) {
    // TODO
    next();
  }

  public validateToken = (
    socket: Socket,
    next: (err?: ExtendedError | undefined) => void
  ) => {
    const token = socket.handshake.query.token as string;
    if (!token) {
      const err = new Error('Authentication error: Token not provided');
      return next(err);
    }
    jwt.verify(token, secretKey, (err, decoded) => {
      if (err) {
        const authErr = new Error('Authentication error: Invalid token');
        return next(authErr);
      } else {
        return next();
      }
    });
  };

  // listen for incoming requests
  public async listen(): Promise<HttpServer> {
    return new Promise<HttpServer>((resolve, reject) => {
      this.io.on('connection', (socket: Socket) => {
        console.log(
          '⚡️[Server]: A client connected to the socket server with id' +
            socket.id
        );
      });

      try {
        this.server.listen(this.port, () => {
          // must listen on http server, not express app, for socket.io to work
          console.log(`⚡️[Server]: Running at ${this.url} ...`);
          resolve(this.server);
        });
      } catch (err) {
        reject(err);
      }
    });
  }
}

export default App;
