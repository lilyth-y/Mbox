#!/usr/bin/env node
/**
 * Architecture smoke: RTX Chrome companion replaced MJPEG gpu-worker relay for interactive preview.
 * Static source checks only (no browser).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function testChromeCompanionIsPrimaryPreview() {
  const companion = read("apps/web/src/shared/lib/showcaseChromeCompanion.ts");
  assert.match(companion, /companionTarget/, "companion target URL");
  assert.match(companion, /delete\("forceGpuRelay"\)/, "relay flag stripped from GPU URL");

  const presentation = read("apps/web/src/shared/lib/gpuPresentation/resolvePresentationMode.ts");
  assert.match(presentation, /usesChromeCompanionShell/, "shell mode helper");

  const dashboard = read("apps/web/src/features/showcase/ShowcaseDashboard.tsx");
  assert.match(dashboard, /useShowcaseChromeCompanionShell/, "shell hook wired");
  assert.match(dashboard, /useShowcaseChromeCompanionTarget/, "target hook wired");
}

function testNoInteractiveMjpegRelayInDashboard() {
  const dashboard = read("apps/web/src/features/showcase/ShowcaseDashboard.tsx");
  assert.doesNotMatch(dashboard, /EmbeddedGpuPreviewRelay/, "MJPEG relay removed from dashboard");
  assert.doesNotMatch(dashboard, /forceGpuRelay/, "no forceGpuRelay in dashboard");
}

function testRotationOnlyPipeline() {
  const order = read("apps/web/src/features/showcase/pipeline/pipelineOrder.ts");
  assert.match(order, /reveal[\s\S]*rotate[\s\S]*pull[\s\S]*ascend/, "rotation pipeline stages");
  assert.doesNotMatch(order, /fall/, "no fall stage in rotation pipeline");
}

const checks = [
  ["chrome companion primary", testChromeCompanionIsPrimaryPreview],
  ["no MJPEG relay in dashboard", testNoInteractiveMjpegRelayInDashboard],
  ["rotation-only pipeline", testRotationOnlyPipeline],
];

let failed = 0;
for (const [label, fn] of checks) {
  try {
    fn();
    console.log(`✓ ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${label}:`, error instanceof Error ? error.message : error);
  }
}

if (failed) {
  process.exit(1);
}
console.log("\nverify-gpu-worker-parity (static): OK — use verify:chrome-companion + RTX Chrome for live preview");
