#!/usr/bin/env node
/**
 * @deprecated Static grep checks — use runtime integrity instead:
 *   npx tsx scripts/verify-cube-face-integrity.ts
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const { resolvePresentationBackgroundPlateUrl } = require(
  join(root, "packages/shared/dist/cube-export.js")
);

const JPG = "data:image/jpeg;base64,face";
const PNG = "data:image/png;base64,matte";
const PLATE = "data:image/jpeg;base64,plate";

assert.equal(
  resolvePresentationBackgroundPlateUrl({ backgroundPlateUrl: PLATE, url: JPG }),
  PLATE
);
assert.equal(resolvePresentationBackgroundPlateUrl({ url: JPG }), JPG);
assert.equal(
  resolvePresentationBackgroundPlateUrl({ url: PNG, originalUrl: JPG }),
  JPG
);

const runtime = spawnSync("npx", ["tsx", join(root, "scripts/verify-cube-face-integrity.ts")], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});

if (runtime.status !== 0) {
  process.exit(runtime.status ?? 1);
}

console.log("verify-cube-face-plate-fallback: ok (runtime delegated)");
