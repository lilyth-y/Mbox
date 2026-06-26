#!/usr/bin/env node
/**
 * Showcase pipeline bundle — static/math + live E2E by default (stability-first).
 *
 *   npm run verify:showcase-pipeline       # full (9 steps, dev server required)
 *   npm run verify:showcase-pipeline:fast  # static only (--fast)
 *
 * Env:
 *   MBOX_SKIP_E2E=1              — skip live E2E (same as --fast)
 *   MBOX_RUN_UPLOAD_E2E=1        — upload E2E only (with --fast)
 *   MBOX_RUN_SHAPE_CYCLE_E2E=1   — shape-cycle E2E only (with --fast)
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skipE2e = process.argv.includes("--fast") || process.env.MBOX_SKIP_E2E === "1";

const steps = [
  "verify:chrome-companion",
  "verify:showcase-rotate-ease",
  "verify:inner-cube-seams",
  "verify:single-inner-photo",
  "verify:gpu-worker-parity",
  "verify:showcase-manifest",
  "verify:showcase-shapes",
];

if (!skipE2e) {
  steps.push("verify:showcase-upload-e2e", "verify:showcase-shape-cycle");
} else {
  if (process.env.MBOX_RUN_UPLOAD_E2E === "1") {
    steps.push("verify:showcase-upload-e2e");
  }
  if (process.env.MBOX_RUN_SHAPE_CYCLE_E2E === "1") {
    steps.push("verify:showcase-shape-cycle");
  }
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
