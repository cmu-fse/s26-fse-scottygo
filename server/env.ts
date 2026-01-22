// Extracts all the secrets and environment variables from the .env file

import dotenv from 'dotenv';

dotenv.config();

export const STAGE: string = process.env.STAGE ?? 'DEV'; // defaults to DEV

export const DB_CONN_STR: string =
  STAGE === 'DEV'
    ? (process.env.DB_URL ?? 'unknown') + (process.env.DEV_DB ?? 'unknown')
    : STAGE === 'PROD'
      ? (process.env.DB_URL ?? 'unknown') + (process.env.PROD_DB ?? 'unknown')
      : 'unknown';

// PORT is effective only for localhost
// ignored by codespaces and Render, which have their default ports
export const PORT: number = process.env.PORT ? Number(process.env.PORT) : 1000; // defaults to 1000

export const JWT_KEY: string = process.env.JWT_KEY ?? 'someDefaultKey';

export const JWT_EXP: string =
  STAGE === 'PROD' ? (process.env.JWT_EXP ?? '365d') : 'never'; // defaults to never

export const ENV = process.env.ENV ?? 'LOCAL'; // defaults to LOCAL

// Set the HOST URL depending on the build environment and where the app is served from
export const HOST: string =
  ENV === 'RENDER'
    ? (process.env.RENDER_HOST ?? 'unknown')
    : ENV === 'CODESPACE'
      ? (process.env.CODESPACE_HOST ?? 'unknown')
      : ENV === 'LOCAL'
        ? (process.env.LOCAL_HOST ?? 'unknown')
        : 'unknown';
