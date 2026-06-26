#!/usr/bin/env node
/**
 * Poll queued render jobs and process them (local worker daemon).
 *
 * Usage: node scripts/render-worker.mjs
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import http from "node:http";
import { loadEnvLocal } from "./lib/load-env-local.mjs";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnvLocal(root);

const API_URL = (process.env.VITE_API_BASE_URL ?? "http://localhost:8787").replace(/\/$/, "");
const API_KEY = process.env.API_KEY ?? process.env.VITE_API_KEY ?? "";
const POLL_MS = Number(process.env.RENDER_WORKER_POLL_MS ?? 3_000);
const HEALTH_PORT = Number(process.env.PORT ?? 8080);
const inFlight = new Set();
function headers() {
  const h = { "X-Workspace-Id": "default" };
  if (API_KEY) h["X-API-Key"] = API_KEY;
  return h;
}

async function listQueued() {
  const response = await fetch(`${API_URL}/render/jobs?status=queued`, { headers: headers() });
  if (!response.ok) {
    throw new Error(`List queued failed (${response.status})`);
  }
  const data = await response.json();
  return data.jobs ?? [];
}

function processJob(jobId) {
  if (inFlight.has(jobId)) {
    return;
  }
  inFlight.add(jobId);
  const child = spawn(process.execPath, [join(root, "scripts/render-worker-process-job.mjs"), jobId], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, MBOX_RENDER_JOB_ID: jobId },
  });
  child.on("exit", (code) => {
    inFlight.delete(jobId);
    console.log(`Job ${jobId} worker exited: ${code}`);
  });
}
async function tick() {
  const jobs = await listQueued();
  for (const job of jobs) {
    console.log(`Dequeuing ${job.id} (${job.kind})`);
    processJob(job.id);
  }
}

console.log(`Render worker polling ${API_URL} every ${POLL_MS}ms`);
http
  .createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(`ok inFlight=${inFlight.size}`);
  })
  .listen(HEALTH_PORT, () => {
    console.log(`Render worker health on :${HEALTH_PORT}`);
  });

setInterval(() => {
  tick().catch((error) => console.error("Poll error:", error));
}, POLL_MS);
tick().catch((error) => console.error("Initial poll error:", error));