import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { apiKeyAuth } from "./middleware/apiKeyAuth.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { routesRouter } from "./routes/index.js";

dotenv.config();

const app = express();
const port = Number(process.env.API_PORT ?? 8787);
const host = process.env.API_HOST ?? "0.0.0.0";
const defaultDevOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
].join(",");
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

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || corsOrigins.includes(origin) || isLocalDevOrigin(origin)) {
        callback(null, origin ?? true);
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
