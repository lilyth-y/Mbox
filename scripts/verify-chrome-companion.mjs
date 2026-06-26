#!/usr/bin/env node
/**
 * Smoke checks for RTX Chrome companion protocol (no browser required).
 *
 *   npm run verify:chrome-companion
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  API_URL,
  MBOX_API_DEV_PORT,
  MBOX_WEB_DEV_PORT,
  WEB_URL,
} from "./lib/dev-ports.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function testDevUrls() {
  assert.equal(typeof WEB_URL, "string");
  assert.ok(WEB_URL.includes(String(MBOX_WEB_DEV_PORT)), "WEB_URL uses dev port");
  assert.ok(API_URL.includes(String(MBOX_API_DEV_PORT)), "API_URL uses api port");
}

function testCompanionUrlBuilder() {
  const src = read("apps/web/src/shared/lib/showcaseChromeCompanion.ts");
  assert.match(src, /companionTarget/, "companion target flag");
  assert.match(src, /fullGpu/, "fullGpu flag");
  assert.match(src, /serializeCompanionState/, "state serializer");
  assert.match(src, /applyInboundCompanionCatalog/, "inbound catalog restore");
  assert.match(src, /COMPANION_BACKDROP_BLOB_MAX_BYTES/, "backdrop blob size guard");
}

function testRenderJobCrystalOnly() {
  const src = read("packages/shared/src/renderJob.ts");
  assert.doesNotMatch(src, /cube_focus_entrance/, "cube_focus removed from renderJob");
  assert.match(src, /crystal_showcase/, "crystal_showcase kind kept");
}

function testSharedSlimExports() {
  const src = read("packages/shared/src/cube-export.ts");
  assert.doesNotMatch(src, /orbitalShowcaseMotion/, "orbital motion removed");
  assert.doesNotMatch(src, /fanBladeFrame/, "fan blade frame removed");
  assert.match(src, /resolveCubeFaceDisplayUrl/, "showcase face URL helper kept");
}

function testOpenShowcaseGpuScript() {
  const src = read("scripts/open-showcase-gpu.mjs");
  assert.match(src, /companionTarget/, "open-showcase-gpu sets companion target");
}

function testViteGpuBrowserEndpoint() {
  const src = read("scripts/mbox-gpu-dev-server.mjs");
  assert.match(src, /open-gpu-browser/, "dev server can spawn RTX Chrome");
}

function testShowcasePipelineE2eBundle() {
  const pkg = read("package.json");
  const pipeline = read("scripts/verify-showcase-pipeline.mjs");
  assert.match(pkg, /verify:showcase-pipeline:fast/, "npm script for static-only fast path");
  assert.match(pipeline, /--fast/, "pipeline supports --fast escape hatch");
  assert.match(pipeline, /MBOX_SKIP_E2E/, "pipeline supports MBOX_SKIP_E2E");
  assert.match(pipeline, /verify:showcase-shape-cycle/, "shape-cycle in default E2E bundle");
  assert.match(pipeline, /verify:showcase-upload-e2e/, "upload E2E in default bundle");
  assert.match(pipeline, /skipE2e/, "E2E on by default unless skipped");
}

function testNoLegacyPipelineStages() {
  const order = read("apps/web/src/features/showcase/pipeline/pipelineOrder.ts");
  assert.doesNotMatch(order, /fall|bounce|swap/, "rotation-only pipeline order");
  for (const legacy of ["fallStage.ts", "bounceStage.ts", "morphStage.ts", "swapStage.ts"]) {
    assert.throws(
      () => read(`apps/web/src/features/showcase/pipeline/stages/${legacy}`),
      (err) => err instanceof Error && "code" in err && err.code === "ENOENT",
      `legacy stage removed: ${legacy}`
    );
  }
}

function testShapesVerifyUsesDevPort() {
  const shapes = read("scripts/verify-showcase-shapes.mjs");
  assert.match(shapes, /dev-ports\.mjs/, "shapes live uses dev-ports WEB_URL");
}

function testSingleInnerPhotoDefaults() {
  const src = read("apps/web/src/features/showcase/showcaseGpuProfile.ts");
  assert.match(src, /singleInnerPhoto: true/, "single inner photo default");
  assert.match(src, /crystalShell: true/, "crystal shell default");
}

const checks = [
  ["dev ports", testDevUrls],
  ["companion protocol", testCompanionUrlBuilder],
  ["single inner photo defaults", testSingleInnerPhotoDefaults],
  ["render job crystal-only", testRenderJobCrystalOnly],
  ["shared slim exports", testSharedSlimExports],
  ["open-showcase-gpu", testOpenShowcaseGpuScript],
  ["vite gpu browser hook", testViteGpuBrowserEndpoint],
  ["pipeline e2e bundle", testShowcasePipelineE2eBundle],
  ["no legacy pipeline stages", testNoLegacyPipelineStages],
  ["shapes verify dev port", testShapesVerifyUsesDevPort],
];

let failed = 0;
for (const [label, fn] of checks) {
  try {
    fn();
    console.log(`✓ ${label}`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ ${label}: ${message}`);
  }
}

if (failed > 0) {
  process.exit(1);
}

console.log("");
console.log("Chrome companion workflow URLs");
console.log("────────────────────────────────────────");
console.log(`Cursor shell   ${WEB_URL}/showcase.html`);
console.log(`RTX Chrome     ${WEB_URL}/showcase.html?localOnly=1&fullGpu=1&companionTarget=1`);
console.log(`API            ${API_URL}`);
console.log("");
console.log("All chrome-companion checks passed.");
