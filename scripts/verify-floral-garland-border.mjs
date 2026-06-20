#!/usr/bin/env node
/** Cube face garland uses fan-blade ornament PNG/canvas assets (not procedural GLSL). */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const garlandSrc = readFileSync(
  join(root, "apps/web/src/features/cube/cubeFaceGarlandBorder.ts"),
  "utf8"
);
const sceneSrc = readFileSync(
  join(root, "apps/web/src/features/cube/presentationScene.ts"),
  "utf8"
);
const frameSrc = readFileSync(
  join(root, "apps/web/src/features/cube/photoFrameGlsl.ts"),
  "utf8"
);
const sharedSrc = readFileSync(
  join(root, "packages/shared/src/cubeFrameGarland.ts"),
  "utf8"
);

assert(/createFanBladeOrnamentCanvas/.test(garlandSrc), "ornament canvas assets required");
assert(/createCubeFaceGarlandBorder/.test(garlandSrc), "face garland builder required");
assert(/rig\.garland/.test(sceneSrc), "presentation scene must mount garland on face rigs");
assert(!/applyFloralGarlandBorder/.test(frameSrc), "procedural GLSL garland must be removed");
assert(/cubeFramePresetToFanBladeFrameId/.test(sharedSrc), "preset mapping required");

console.log("verify-floral-garland-border: OK");
