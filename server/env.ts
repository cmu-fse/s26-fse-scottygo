import dotenv from "dotenv";

dotenv.config();

type Stage = "DEV" | "PROD";
type Env = "LOCAL" | "CODESPACE" | "RENDER";

const getEnv = (key: string, fallback?: string): string => {
  const value = process.env[key] ?? fallback;
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

export const env = {
  stage: getEnv("STAGE", "DEV") as Stage,
  runtime: getEnv("ENV", "LOCAL") as Env,
  dbUrl: getEnv("DB_URL", "mongodb://localhost:27017/"),
  devDb: getEnv("DEV_DB", "scottygo-dev"),
  prodDb: getEnv("PROD_DB", "scottygo-prod"),
  port: Number(getEnv("PORT", "1000")),
  localHost: getEnv("LOCAL_HOST", "http://localhost:1000"),
  codespaceHost: getEnv("CODESPACE_HOST", ""),
  renderHost: getEnv("RENDER_HOST", ""),
  jwtKey: getEnv("JWT_KEY", "replace-me"),
  jwtExp: getEnv("JWT_EXP", "365d")
};
