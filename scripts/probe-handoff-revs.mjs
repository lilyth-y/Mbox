#!/usr/bin/env node
import { getRevsWithinStep } from "../apps/web/src/features/cube/fanTransform.ts";
import { resolveCubeShowcaseFx } from "../packages/shared/src/cubeShowcaseFx.ts";
import { resolveFanPhase } from "../apps/web/src/features/cube/fanTiming.ts";

const fx = resolveCubeShowcaseFx({ cubeShowcaseZoomEnabled: false });
const step = 5;
for (let el = 8895; el <= 8915; el += 1) {
  const ph = resolveFanPhase(step, el);
  const revs = getRevsWithinStep(el, step, 1, "wedding_default", "auto", fx);
  console.log(`el=${el} phase=${ph.phase} u=${ph.phaseU.toFixed(5)} revs=${revs.toFixed(5)}`);
}
