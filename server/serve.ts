import path from 'path';
import App from './app';

import { MongoDB } from './db/mongo.db';
import { PORT, HOST, STAGE, ENV } from './env';
import { DB_CONN_STR as dbURL } from './env';
import HomeController from './controllers/home.controller';
import AuthController from './controllers/auth.controller';
import AppDirController from './controllers/appdir.controller';
import AccountController from './controllers/account.controller';

const app = new App(
  [
    new HomeController('/'),
    new AuthController('/auth'),
    new AppDirController('/appdir'),
    new AccountController('/account')
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
