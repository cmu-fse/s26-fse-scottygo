import express from "express";
import { env } from "./env.js";

const app = express();

app.get("/health", (_req, res) => {
  res.json({ ok: true, stage: env.stage });
});

const port = env.port || 1000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on ${port}`);
});
