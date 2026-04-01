import path from 'path';
import App from './app';

import { MongoDB } from './db/mongo.db';
import { PORT, HOST, STAGE, ENV } from './env';
import { DB_CONN_STR as dbURL } from './env';
import HomeController from './controllers/home.controller';
import AuthController from './controllers/auth.controller';
import AccountController from './controllers/account.controller';
import MapController from './controllers/map.controller';
import BusController from './controllers/transit.controller';
import NotificationController from './controllers/notification.controller';

const app = new App(
  [
    new HomeController('/'),
    new AuthController('/auth'),
    new AccountController('/account'),
    new MapController('/map'),
    new BusController('/transit'),
    new NotificationController('/notifications')
  ],
  {
    clientDir: path.join(__dirname, '../.dist/client'),
    db: new MongoDB(dbURL),
    port: PORT,
    host: HOST,
    url: `${HOST}${ENV === 'LOCAL' ? ':' + PORT.toString() : ''}`,
    initOnStart: STAGE === 'PROD' ? false : true
  }
);

app.listen();
