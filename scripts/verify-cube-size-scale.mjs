#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const sharedDist = join(root, "packages/shared/dist/cubeEffectFramework.js");
const { clampCubeSizeScale, DEFAULT_CUBE_SIZE_SCALE, CUBE_SIZE_SCALE_MIN, CUBE_SIZE_SCALE_MAX } =
  await import(`file:///${sharedDist.replace(/\\/g, "/")}`);

assert(DEFAULT_CUBE_SIZE_SCALE === 1);
assert(clampCubeSizeScale(0.1) === CUBE_SIZE_SCALE_MIN);
assert(clampCubeSizeScale(9) === CUBE_SIZE_SCALE_MAX);

const cubeView = readFileSync(join(root, "apps/web/src/features/cube/CubeView.tsx"), "utf8");
assert(/setCubeSizeScale/.test(cubeView), "CubeView must apply cubeSizeScale");
assert(/CubeSizeControl/.test(cubeView), "CubeView toolbar must include CubeSizeControl");

console.log("verify-cube-size-scale: OK");
