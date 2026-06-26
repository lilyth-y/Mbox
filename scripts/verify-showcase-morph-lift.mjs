#!/usr/bin/env node
/** Morph ground→aerial lift must not snap Y at phase start. */
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { resolveMorphHoldPosition } from "../apps/web/src/features/showcase/pipeline/showcasePresentation.ts";
import { DEFAULT_SHOWCASE_PIPELINE_CONFIG } from "../apps/web/src/features/showcase/pipeline/types.ts";

function ok(name, pass, detail = "") {
  console.log(`[${pass ? "OK" : "FAIL"}] ${name}${detail ? `: ${detail}` : ""}`);
  if (!pass) process.exitCode = 1;
}

const config = {
  ...DEFAULT_SHOWCASE_PIPELINE_CONFIG,
  showcaseCenter: DEFAULT_SHOWCASE_PIPELINE_CONFIG.showcaseCenter.clone(),
};
const floorY = config.jewelRestCenterY;
const ctx = {
  config,
  totalElapsedMs: 0,
  phaseElapsedMs: 0,
  stageState: { morphLiftStartY: floorY },
};

const p0 = resolveMorphHoldPosition(ctx);
ok("lift starts at floor Y", Math.abs(p0.y - floorY) < 0.001, `y=${p0.y.toFixed(3)}`);

ctx.phaseElapsedMs = config.morphDurationMs;
const p1 = resolveMorphHoldPosition({ ...ctx, phaseElapsedMs: config.morphDurationMs });
ok(
  "lift ends at aerial Y",
  Math.abs(p1.y - config.showcaseCenter.y) < 0.02,
  `y=${p1.y.toFixed(3)} target=${config.showcaseCenter.y}`
);

let maxJump = 0;
let prevY = floorY;
for (let ms = 0; ms <= config.morphDurationMs; ms += 16) {
  const pos = resolveMorphHoldPosition({
    ...ctx,
    phaseElapsedMs: ms,
    stageState: { morphLiftStartY: floorY },
  });
  maxJump = Math.max(maxJump, Math.abs(pos.y - prevY));
  prevY = pos.y;
}
ok("max frame Y jump during lift < 0.08", maxJump < 0.08, `max=${maxJump.toFixed(4)}`);

if (process.exitCode) process.exit(1);
console.log("verify-showcase-morph-lift: OK");
