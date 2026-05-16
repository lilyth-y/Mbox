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
const corsOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
    allowedHeaders: ["Content-Type", "X-API-Key", "Authorization", "X-Workspace-Id"],
  })
);
app.use(express.json({ limit: "20mb" }));
app.use(apiKeyAuth);
app.use(rateLimit);
app.use(routesRouter);

app.listen(port, host, () => {
  console.log(`mbox API listening on http://${host}:${port}`);
  if (process.env.API_KEY?.trim()) {
    console.log("API key authentication is enabled.");
  }
});
