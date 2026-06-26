import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RenderJobRecord } from "@mbox/shared";
import { updateRenderJobStatus } from "./renderJobStore.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const workerScript = path.join(repoRoot, "scripts", "render-worker-process-job.mjs");

export function isInlineRenderWorkerEnabled(): boolean {
  const flag = process.env.RENDER_WORKER_ENABLED?.trim().toLowerCase();
  return flag === "1" || flag === "true";
}

export function enqueueInlineRenderWorker(job: RenderJobRecord): void {
  if (!isInlineRenderWorkerEnabled()) {
    return;
  }

  void updateRenderJobStatus(job.id, "queued", { progress: 0 });

  const child = spawn(process.execPath, [workerScript, job.id], {
    cwd: repoRoot,
    stdio: "ignore",
    detached: true,
    env: {
      ...process.env,
      MBOX_RENDER_JOB_ID: job.id,
      MBOX_WEB_BASE_URL: process.env.MBOX_WEB_BASE_URL ?? "http://localhost:5173",
      MBOX_RECORD_TIMEOUT_MS: process.env.MBOX_RECORD_TIMEOUT_MS ?? "300000",
    },
  });
  child.unref();
}
