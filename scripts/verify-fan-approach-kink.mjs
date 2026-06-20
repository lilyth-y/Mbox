#!/usr/bin/env node
/**
 * Find rotation kinks during approach (mid-phase dω spikes).
 *   npx tsx scripts/verify-fan-approach-kink.mjs
 */
import * as THREE from "three";
import {
  sampleFanCubeMotion,
  getFanApproachMs,
} from "../apps/web/src/features/cube/cubeFanTimeline.ts";
import { approachSpinEase } from "../apps/web/src/features/cube/fanTransform.ts";

const fx = {
  cubeHeartbeatEnabled: false,
  cubeShowcaseZoomEnabled: true,
  cubeSubjectPullEnabled: false,
};

const DT = 8;

function quatAngle(a, b) {
  return new THREE.Quaternion()
    .setFromEuler(a)
    .angleTo(new THREE.Quaternion().setFromEuler(b));
}

function scanApproach(step) {
  const approachMs = getFanApproachMs(step);
  let maxDw = 0;
  let maxDwT = 0;
  let prevW = null;
  const spikes = [];

  for (let t = DT; t < approachMs - DT; t += DT) {
    const a = sampleFanCubeMotion(step, t - DT, step + 1, 6, 42, "mixed", "wedding_default", 1, fx);
    const b = sampleFanCubeMotion(step, t + DT, step + 1, 6, 42, "mixed", "wedding_default", 1, fx);
    const w = quatAngle(a.rotation, b.rotation) / (2 * DT);
    if (prevW !== null) {
      const dw = Math.abs(w - prevW);
      if (dw > maxDw) {
        maxDw = dw;
        maxDwT = t;
      }
      if (dw > 0.0025) {
        spikes.push({ t, u: t / approachMs, dw, align: approachSpinEase(t / approachMs) });
      }
    }
    prevW = w;
  }

  spikes.sort((a, b) => b.dw - a.dw);
  const u = maxDwT / approachMs;
  console.log(
    `step ${step}: max dω=${maxDw.toFixed(5)} @ ${maxDwT}ms (u=${u.toFixed(3)}) align=${approachSpinEase(u).toFixed(3)}`
  );
  for (const s of spikes.slice(0, 5)) {
    console.log(`  spike u=${s.u.toFixed(3)} dω=${s.dw.toFixed(5)} align=${s.align.toFixed(3)}`);
  }
  return maxDw;
}

const THRESH = 0.003;
let worst = 0;
for (let s = 0; s < 3; s++) {
  worst = Math.max(worst, scanApproach(s));
}
if (worst >= THRESH) {
  process.exitCode = 1;
  console.log(`verify-fan-approach-kink: FAIL (worst dω=${worst.toFixed(5)})`);
} else {
  console.log("verify-fan-approach-kink: OK");
}
