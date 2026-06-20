import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import {
  MBOX_API_DEV_PORT,
  MBOX_WEB_DEV_PORT as DEFAULT_WEB_DEV_PORT,
  localWebOrigin,
} from "@mbox/shared";
import { apiKeyAuth } from "./middleware/apiKeyAuth.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { routesRouter } from "./routes/index.js";

dotenv.config();

const app = express();
const port = Number(process.env.API_PORT ?? MBOX_API_DEV_PORT);
const host = process.env.API_HOST ?? "0.0.0.0";
const webDevPort = Number(process.env.MBOX_WEB_DEV_PORT ?? DEFAULT_WEB_DEV_PORT);
const localWeb = localWebOrigin(webDevPort);
const defaultDevOrigins = [localWeb, localWeb.replace("localhost", "127.0.0.1")].join(",");
const corsOrigins = Array.from(
  new Set(
    `${process.env.CORS_ORIGIN ?? ""},${defaultDevOrigins}`
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  )
);

function isLocalDevOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      (url.protocol === "http:" || url.protocol === "https:")
    );
  } catch {
    return false;
  }
}

const isProduction = process.env.NODE_ENV === "production";
const allowNullOrigin =
  !isProduction || process.env.CORS_ALLOW_NULL_ORIGIN?.trim().toLowerCase() === "true";

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, allowNullOrigin);
        return;
      }
      if (origin === "null") {
        if (allowNullOrigin) {
          callback(null, true);
        } else {
          callback(new Error("CORS blocked origin: null"));
        }
        return;
      }
      if (corsOrigins.includes(origin) || (!isProduction && isLocalDevOrigin(origin))) {
        callback(null, origin);
        return;
      }
      callback(new Error(`CORS blocked origin: ${origin}`));
    },
    allowedHeaders: ["Content-Type", "X-API-Key", "Authorization", "X-Workspace-Id"],
  })
);
app.use(express.json({ limit: process.env.API_JSON_LIMIT ?? "64mb" }));
app.use(apiKeyAuth);
app.use(rateLimit);
app.use(routesRouter);

app.listen(port, host, () => {
  console.log(`mbox API listening on http://${host}:${port}`);
  if (process.env.API_KEY?.trim()) {
    console.log("API key authentication is enabled.");
  }
});
