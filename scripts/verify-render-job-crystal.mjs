#!/usr/bin/env node
/**
 * E2E: create crystal_showcase render job, run worker, assert done.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "./lib/load-env-local.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnvLocal(root);

const API_URL = (process.env.VITE_API_BASE_URL ?? "http://localhost:8787").replace(/\/$/, "");
const WEB_BASE = (process.env.MBOX_WEB_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
const API_KEY = process.env.API_KEY ?? process.env.VITE_API_KEY ?? "";

function headers() {
  const h = { "Content-Type": "application/json", "X-Workspace-Id": "default" };
  if (API_KEY) h["X-API-Key"] = API_KEY;
  return h;
}

async function waitForHealth() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API_URL}/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("API /health not ready");
}

async function main() {
  await waitForHealth();

  const createRes = await fetch(`${API_URL}/render/jobs`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      kind: "crystal_showcase",
      processedImageRefs: [{ id: "verify-crystal" }],
      settings: {
        kind: "crystal_showcase",
        catalogOptions: { shapeId: "cube", backgroundPreset: "booth" },
        imageCount: 3,
        fallPhysicsEnabled: false,
        backdropMediaPath: "배경동영상/mf001.mp4",
      },
      outputProfile: {
        width: 1080,
        height: 1080,
        fps: 30,
        codec: "h264",
        videoBitrate: 8_000_000,
      },
    }),
  });
  const created = await createRes.json();
  if (!createRes.ok) {
    throw new Error(created.error ?? `Create failed (${createRes.status})`);
  }

  const jobId = created.job.id;
  console.log("Created job:", jobId);

  const t0 = Date.now();
  const worker = spawn(
    process.execPath,
    [join(root, "scripts/render-worker-process-job.mjs"), jobId],
    {
      cwd: root,
      env: {
        ...process.env,
        MBOX_WEB_BASE_URL: WEB_BASE,
        MBOX_RECORD_TIMEOUT_MS: process.env.MBOX_RECORD_TIMEOUT_MS ?? "300000",
        VITE_RENDER_BACKEND: "local",
      },
    }
  );
  worker.stdout.on("data", (data) => process.stdout.write(data));
  worker.stderr.on("data", (data) => process.stderr.write(data));

  const code = await new Promise((resolve) => worker.on("close", resolve));
  if (code !== 0) {
    throw new Error(`Worker exited with code ${code}`);
  }

  const jobJsonPath = join(root, "apps", "api", "data", "render-jobs", `${jobId}.json`);
  const job = existsSync(jobJsonPath)
    ? JSON.parse(readFileSync(jobJsonPath, "utf8"))
    : await (
        await fetch(`${API_URL}/render/jobs/${encodeURIComponent(jobId)}`, { headers: headers() })
      )
        .json()
        .then((b) => b.job);

  if (job.status !== "done" || !job.outputUrl) {
    throw new Error(job.error ?? `Expected done, got ${job.status}`);
  }

  const localOutput = join(
    root,
    "apps",
    "api",
    "data",
    "render-jobs",
    "outputs",
    `${jobId}.mp4`
  );
  if (existsSync(localOutput)) {
    const size = statSync(localOutput).size;
    const elapsedSec = Math.round((Date.now() - t0) / 100) / 10;
    console.log("verify-render-job-crystal: OK", job.outputUrl, `${size} bytes`, `${elapsedSec}s`);
    return;
  }

  if (job.outputPath && existsSync(job.outputPath)) {
    const size = statSync(job.outputPath).size;
    const elapsedSec = Math.round((Date.now() - t0) / 100) / 10;
    console.log("verify-render-job-crystal: OK", job.outputUrl, `${size} bytes`, `${elapsedSec}s`);
    return;
  }

  throw new Error(`Output file missing: ${localOutput}`);
}

main().catch((error) => {
  console.error("verify-render-job-crystal: FAIL", error);
  process.exit(1);
});
