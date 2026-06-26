#!/usr/bin/env node
/** Find largest frame-to-frame jumps in presentationScale, cameraZ, parallax, focusPulse. */
import * as THREE from "three";
import { getFanStepSegmentMs, FAN_LOOP_BRIDGE_MS } from "../apps/web/src/features/cube/fanTiming.ts";
import { resolvePresentationTimeline } from "../apps/web/src/features/cube/cubeMotionVariety.ts";
import {
  computePresentationFrame,
  computePresentationLoopBridgeFrame,
} from "../apps/web/src/features/cube/presentationFrame.ts";
import { getPresentationFace } from "../apps/web/src/features/cube/cubeSequence.ts";
import { resolveCubeShowcaseFx } from "../packages/shared/src/cubeShowcaseFx.ts";

const pc = 6;
const segs = Array.from({ length: pc }, (_, i) => getFanStepSegmentMs(i));
const loopMs = FAN_LOOP_BRIDGE_MS;
const contentMs = segs.reduce((a, b) => a + b, 0);
const cycleMs = contentMs + loopMs;
const fx = resolveCubeShowcaseFx({
  cubeShowcaseZoomEnabled: false,
  cubeHeartbeatEnabled: false,
  cubeComplexRotationEnabled: false,
  cubeSubjectPullEnabled: false,
});

function frameAt(t) {
  const resolved = resolvePresentationTimeline(t, segs, loopMs);
  if (resolved.kind === "loop_bridge") {
    return {
      ...computePresentationLoopBridgeFrame("cube_focus", resolved.bridgeElapsed, loopMs, resolved.lastStep, {
        motionSeed: 42,
        fanSpeed: 1,
        cubeShowcaseFx: fx,
      }),
      kind: "loop_bridge",
      step: resolved.lastStep,
    };
  }
  const { step, stepElapsed } = resolved;
  return {
    ...computePresentationFrame("cube_focus", step, stepElapsed, pc, getPresentationFace(step), {
      motionSeed: 42,
      fanSpeed: 1,
      cubeShowcaseFx: fx,
    }),
    kind: "step",
    step,
  };
}

let worst = { t: 0, dScale: 0, dCamZ: 0, dCamY: 0, dPar: 0, dPulse: 0, dRot: 0 };
let prev = null;
for (let t = 0; t < cycleMs; t += 16) {
  const cur = frameAt(t);
  if (prev) {
    const dScale = Math.abs((cur.fanRootMotion?.presentationScale ?? 1) - (prev.fanRootMotion?.presentationScale ?? 1));
    const dCamZ = Math.abs((cur.cameraZ ?? 0) - (prev.cameraZ ?? 0));
    const dCamY = Math.abs((cur.cameraOffsetY ?? 0) - (prev.cameraOffsetY ?? 0));
    const dPar = Math.abs((cur.parallaxAmount ?? 0) - (prev.parallaxAmount ?? 0));
    const dPulse = Math.abs((cur.focusPulse ?? 0) - (prev.focusPulse ?? 0));
    const dRot =
      prev.fanRootMotion && cur.fanRootMotion
        ? new THREE.Quaternion()
            .setFromEuler(prev.fanRootMotion.rotation)
            .angleTo(new THREE.Quaternion().setFromEuler(cur.fanRootMotion.rotation))
        : 0;
    if (dScale > worst.dScale) worst = { t, dScale, dCamZ, dCamY, dPar, dPulse, dRot };
    if (dRot > 0.05) {
      console.log(`spike t=${t} kind ${prev.kind}→${cur.kind} dRot=${dRot.toFixed(4)} dScale=${dScale.toFixed(4)} dPar=${dPar.toFixed(4)} dPulse=${dPulse.toFixed(4)}`);
    }
  }
  prev = cur;
}
console.log("worst scale jump", worst);
