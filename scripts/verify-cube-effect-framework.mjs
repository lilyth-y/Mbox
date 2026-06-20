#!/usr/bin/env node
/**
 * Safety framework smoke: caps, phase gate helpers, defaults stay OFF.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const frameworkSrc = readFileSync(
  join(root, "packages/shared/src/cubeEffectFramework.ts"),
  "utf8"
);
const defaultsSrc = readFileSync(
  join(root, "packages/shared/src/cubePresentationDefaults.ts"),
  "utf8"
);
const fanPhasesSrc = readFileSync(
  join(root, "apps/web/src/features/cube/fanPhases.ts"),
  "utf8"
);

assert(/CUBE_EFFECT_SAFETY_WEIGHT\s*=\s*7/.test(frameworkSrc), "safety weight 7");
assert(/CUBE_EFFECT_QUALITY_WEIGHT\s*=\s*3/.test(frameworkSrc), "quality weight 3");
assert(/showcase_hold/.test(frameworkSrc), "showcase_hold in allowed phases");
assert(/CUBE_PARALLAX_PEAK_MAX\s*=\s*0\.34/.test(frameworkSrc), "parallax peak cap");

assert(/voluMaxDepthEnabled:\s*false/.test(defaultsSrc), "depth default OFF");
assert(/hologramMode:\s*false/.test(defaultsSrc), "hologram default OFF");

assert(/parallaxAmount\s*=\s*0/.test(fanPhasesSrc), "approach/retreat parallax zero");
assert(/clampParallaxAmount/.test(fanPhasesSrc), "parallax clamped");

const sceneSrc = readFileSync(
  join(root, "apps/web/src/features/cube/presentationScene.ts"),
  "utf8"
);
assert(/voluMaxDepthEnabled:\s*boolean\s*=\s*false/.test(sceneSrc), "scene depth default false");
assert(
  /showcaseHoldParallaxEnvelope/.test(sceneSrc),
  "showcase envelope applied in presentationScene"
);

console.log("verify-cube-effect-framework: OK");
