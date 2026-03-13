import express, { Express, Request, Response, NextFunction } from 'express';
import { Server as HttpServer, createServer } from 'http';
import DAC, { IDatabase } from './db/dac';
import Controller from './controllers/controller';
import gtfsService from './services/gtfs.service';
import vehiclePositionsService from './services/vehicle-positions.service';
import tripUpdatesService from './services/trip-updates.service';
import { TransitModel } from './models/transit.model';
import { JWT_KEY as secretKey, STAGE } from './env';
import { Server as SocketServer, Socket } from 'socket.io';
import {
  ClientToServerEvents,
  ServerToClientEvents
} from '../common/socket.interface';
import { ExtendedError } from 'socket.io/dist/namespace';
import jwt from 'jsonwebtoken';
import { User } from './models/user.model';
import { ITokenPayload } from '../common/user.interface';

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
  }

  private configureApp(initOnStart: boolean) {
    DAC.db = this.db;

    // Load GTFS static schedule data (needed before cache refresh)
    const gtfsReady = gtfsService.load().catch((err) => {
      console.error(`[GTFS ${new Date().toISOString()}] Failed to load feed:`, err);
    });

    DAC.db.connect().then(async () => {
      if (initOnStart) {
        await this.db.init();
        // I set initOnStart to false if STAGE is 'PROD' in serve.ts so no risk of deleting PROD DB
      }
      // Seed default admin user if it doesn't exist
      // This runs in both PROD and non-PROD to ensure default admin exists
      await this.db.seedDefaultAdmin();

      // Wait for GTFS to finish loading before populating the cache
      await gtfsReady;

      // Populate the transit cache from GTFS data + one TrueTime call for colors.
      // Await completion so GTFS parsing temporaries can be GC'd before
      // GTFS-RT polling adds more allocations — prevents startup peak OOM.
      try {
        await TransitModel.refreshAllCaches();
      } catch (err) {
        console.error(`[TransitModel ${new Date().toISOString()}] Initial cache refresh failed:`, err);
      }

      // Force GC to reclaim GTFS parsing temporaries (~250 MB) before
      // GTFS-RT polling allocates more — keeps peak RSS under 512 MB.
      if (global.gc) {
        global.gc();
        console.log(`[Server ${new Date().toISOString()}] Forced GC after cache refresh`);
      }

      // Start polling GTFS-RT feeds every 30 s (in-memory)
      // Delayed until after cache refresh so V8 can GC startup temporaries first.
      vehiclePositionsService.start();
      tripUpdatesService.start();

      // Schedule a daily cache refresh (every 24 h).
      const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
      setInterval(() => {
        TransitModel.refreshAllCaches().catch((err) =>
          console.error(`[TransitModel ${new Date().toISOString()}] Scheduled cache refresh failed:`, err)
        );
      }, TWENTY_FOUR_HOURS);
    });
  }

  private configureMiddlewares() {
    // SECURITY: Enforce HTTPS in production - throw hard error, never redirect non-SSL to SSL
    // This prevents poorly configured clients from leaking data over unencrypted connections
    this.app.use(this.enforceHttps);
    this.app.use(express.static(this.clientDir)); // serve the static assets from the client folder
    this.app.use('/assets', express.static('assets')); // serve CSV and other assets
    this.app.use(express.json()); // for parsing request's json body
    this.app.use(express.urlencoded({ extended: true })); // for decoding the encoded url
    this.app.use(this.serverLogger); // add a logging middleware
    this.io.use(this.validateToken);
  }

  private configureControllers(controllers: Controller[]) {
    Controller.io = this.io;
    Controller.clientDir = this.clientDir;
    controllers.forEach((controller) => {
      this.app.use(controller.path, controller.router);
    });
  }

  /**
   * Middleware to enforce HTTPS in production environments.
   * Following security best practices: throws a hard error instead of redirecting
   * to ensure misconfigured clients are caught early.
   *
   * In production environments (like Render), TLS termination happens at the
   * load balancer/reverse proxy level. The proxy sets X-Forwarded-Proto header
   * to indicate the original protocol used by the client.
   *
   * Reference: https://www.vinaysahni.com/best-practices-for-a-pragmatic-restful-api
   * "Do not redirect non-SSL to SSL. Throw a hard error instead"
   */
  private enforceHttps(req: Request, res: Response, next: NextFunction) {
    // Only enforce in production
    if (STAGE !== 'PROD') {
      return next();
    }

    // Check the protocol - in production behind a proxy, check X-Forwarded-Proto
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';

    // If the original request was not HTTPS, throw a hard error
    if (protocol !== 'https') {
      console.error(
        `[Security ${new Date().toISOString()}] Blocked non-HTTPS request to ${req.method} ${req.path} from ${req.ip}`
      );

      return res.status(403).json({
        error: 'HTTPS Required',
        message:
          'This API requires all requests to be made over HTTPS. Please update your configuration to use https:// instead of http://'
      });
    }

    next();
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
        // Store decoded user info on socket for later use
        (socket as Socket & { user: ITokenPayload }).user =
          decoded as ITokenPayload;
        return next();
      }
    });
  };

  // listen for incoming requests
  public async listen(): Promise<HttpServer> {
    return new Promise<HttpServer>((resolve, reject) => {
      this.io.on('connection', (socket: Socket) => {
        console.log(
          `⚡️[Server ${new Date().toISOString()}] A client connected to the socket server with id ${socket.id}`
        );

        // Get user from socket (attached during authentication)
        const socketUser = (socket as Socket & { user?: ITokenPayload }).user;

        // Auto-join admins to the admin:usernames broadcast room
        if (socketUser) {
          User.getUserAccount(socketUser.username)
            .then((account) => {
              if (account.privilegeLevel === 'Administrator') {
                socket.join('admin:usernames');
              }
            })
            .catch(() => {
              // Ignore — user may have been deleted
            });
        }

        // Handle subscribeAccount event
        socket.on('subscribeAccount', async (username: string) => {
          if (!socketUser) {
            console.log(
              `[Socket ${new Date().toISOString()}] Unauthorized subscribeAccount attempt for ${username}`
            );
            return;
          }

          try {
            // Authorization check: Members can only subscribe to their own account
            const requestingUserAccount = await User.getUserAccount(
              socketUser.username
            );
            const isAdmin =
              requestingUserAccount.privilegeLevel === 'Administrator';
            const isOwnAccount =
              socketUser.username.toLowerCase() === username.toLowerCase();

            if (!isAdmin && !isOwnAccount) {
              console.log(
                `[Socket ${new Date().toISOString()}] User ${socketUser.username} unauthorized to subscribe to ${username}`
              );
              return;
            }

            const roomName = `account:${username.toLowerCase()}`;
            socket.join(roomName);
            console.log(
              `[Socket ${new Date().toISOString()}] User ${socketUser.username} subscribed to ${roomName}`
            );
          } catch (error) {
            console.error(`[Socket ${new Date().toISOString()}] Error in subscribeAccount: ${error}`);
          }
        });

        // Handle unsubscribeAccount event
        socket.on('unsubscribeAccount', (username: string) => {
          const roomName = `account:${username.toLowerCase()}`;
          socket.leave(roomName);
          console.log(
            `[Socket ${new Date().toISOString()}] Client ${socket.id} unsubscribed from ${roomName}`
          );
        });
      });

      try {
        this.server.listen(this.port, () => {
          // must listen on http server, not express app, for socket.io to work
          console.log(`⚡️[Server ${new Date().toISOString()}] Running at ${this.url} ...`);
          resolve(this.server);
        });
      } catch (err) {
        reject(err);
      }
    });
  }
}

export default App;
