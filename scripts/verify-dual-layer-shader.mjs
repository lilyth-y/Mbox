#!/usr/bin/env node
/**
 * VoluMax shaders must stay GLSL1-safe (no const in fragment, glslVersion set).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const photoFrame = readFileSync(
  join(root, "apps/web/src/features/cube/photoFrameGlsl.ts"),
  "utf8"
);
const dual = readFileSync(
  join(root, "apps/web/src/features/cube/cubeDualLayerParallaxMaterial.ts"),
  "utf8"
);

assert(
  !/const float frameScale/.test(photoFrame),
  "photoFrameGlsl must not use const float (GLSL ES 1.0)"
);

const glslMatch = photoFrame.match(/export const PHOTO_FRAME_GLSL = `([\s\S]*?)`;/);
assert(glslMatch, "PHOTO_FRAME_GLSL block missing");
const glsl = glslMatch[1];
for (const [baseFn, wrapFn] of [
  ["vec3 frameAccentColor(", "vec3 frameAccentColorWithFinish("],
  ["vec3 frameMatColor(", "vec3 frameMatColorWithFinish("],
  ["vec3 frameLineColor(", "vec3 frameLineColorWithFinish("],
]) {
  const baseIdx = glsl.indexOf(baseFn);
  const wrapIdx = glsl.indexOf(wrapFn);
  assert(baseIdx >= 0 && wrapIdx >= 0, `${baseFn} and ${wrapFn} must exist in PHOTO_FRAME_GLSL`);
  assert(
    baseIdx < wrapIdx,
    `${baseFn} must be defined before ${wrapFn} (GLSL ES requires declaration order)`
  );
}
assert(/glslVersion: THREE\.GLSL1/.test(dual), "dual-layer material must pin GLSL1");
const warpFg = dual.match(/vec2 warpForeground\([\s\S]*?\n\}/);
assert(
  warpFg && (warpFg[0].match(/vec2 delta =/g) ?? []).length === 1,
  "warpForeground must declare delta once"
);

console.log("verify-dual-layer-shader: OK");
