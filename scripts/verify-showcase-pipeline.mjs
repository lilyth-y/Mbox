#!/usr/bin/env node
/**
 * Showcase pipeline bundle — static/math checks; optional live E2E.
 *
 *   npm run verify:showcase-pipeline
 *   npm run verify:showcase-pipeline:e2e
 *
 * Env (granular):
 *   MBOX_RUN_UPLOAD_E2E=1       — upload + companion sync
 *   MBOX_RUN_SHAPE_CYCLE_E2E=1  — shape change GPU leak guard
 *   MBOX_RUN_E2E=1              — both E2E suites (same as --e2e)
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const runAllE2e = process.argv.includes("--e2e") || process.env.MBOX_RUN_E2E === "1";

const steps = [
  "verify:chrome-companion",
  "verify:showcase-rotate-ease",
  "verify:inner-cube-seams",
  "verify:single-inner-photo",
  "verify:gpu-worker-parity",
  "verify:showcase-manifest",
  "verify:showcase-shapes",
];

if (runAllE2e || process.env.MBOX_RUN_UPLOAD_E2E === "1") {
  steps.push("verify:showcase-upload-e2e");
}
if (runAllE2e || process.env.MBOX_RUN_SHAPE_CYCLE_E2E === "1") {
  steps.push("verify:showcase-shape-cycle");
}

let failed = 0;
for (const step of steps) {
  console.log(`\n── ${step} ──`);
  const result = spawnSync("npm", ["run", step], {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    failed += 1;
  }
}

if (failed) {
  console.error(`\nverify-showcase-pipeline: ${failed}/${steps.length} failed`);
  process.exit(1);
}
console.log(`\nverify-showcase-pipeline: all ${steps.length} checks passed`);
