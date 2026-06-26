#!/usr/bin/env node
/**
 * Scale billable Cloud Run compute toward $0 (pilot / local-preview mode).
 *
 *   npm run gcp:scale-to-zero
 *   npm run gcp:scale-to-zero -- --dry-run
 */
import { spawnSync } from "node:child_process";

const REGION = process.env.MBOX_GCP_REGION ?? "asia-northeast3";
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? "newmedia-496107";
const API_SERVICE = process.env.MBOX_API_SERVICE ?? "mbox-api";
const WORKER_SERVICE = process.env.MBOX_RENDER_WORKER_SERVICE ?? "mbox-render-worker";

const dryRun = process.argv.includes("--dry-run");

function gcloud(args) {
  const full = [...args, "--project", PROJECT, "--region", REGION];
  console.log(`$ gcloud ${full.join(" ")}`);
  if (dryRun) return 0;
  const result = spawnSync("gcloud", full, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status ?? 1;
}

console.log("gcp-scale-to-zero");
console.log(`  project: ${PROJECT}`);
console.log(`  region:  ${REGION}`);
if (dryRun) console.log("  (dry-run — no changes)\n");

// Largest cost: render worker warm instance (4 vCPU, 8Gi).
let code = gcloud([
  "run",
  "services",
  "update",
  WORKER_SERVICE,
  "--min-instances=0",
  "--max-instances=1",
  "--cpu-throttling",
]);
if (code !== 0) {
  console.warn(`WARN: could not update ${WORKER_SERVICE} (missing or no permission).`);
}

// API already scales to zero by default; cap max instances for safety.
code = gcloud([
  "run",
  "services",
  "update",
  API_SERVICE,
  "--min-instances=0",
  "--max-instances=2",
]);
if (code !== 0) {
  console.warn(`WARN: could not update ${API_SERVICE}.`);
}

console.log("\nDone. Static GCS + idle Cloud Run ≈ storage/egress only.");
console.log("Local preview: npm run dev → http://localhost:5173/showcase.html");
console.log("See docs/zero-cost-local.md");
