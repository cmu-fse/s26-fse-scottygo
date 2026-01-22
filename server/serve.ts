import path from 'path';
import App from './app';

import { MongoDB } from './db/mongo.db';
import { PORT, HOST, STAGE, ENV } from './env';
import { DB_CONN_STR as dbURL } from './env';
import HomeController from './controllers/home.controller';

const app = new App([new HomeController('/')], {
  clientDir: path.join(__dirname, '../.dist/client'),
  db: new MongoDB(dbURL),
  port: PORT,
  host: HOST,
  url: `${HOST}${ENV === 'LOCAL' ? ':' + PORT.toString() : ''}`,
  initOnStart: STAGE === 'PROD' ? false : true
});

app.listen();
