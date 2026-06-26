#!/usr/bin/env node
import * as THREE from "three";
import { sampleFanCubeMotion, getFanStepSegmentMs } from "../apps/web/src/features/cube/cubeFanTimeline.ts";
import { resolveCubeShowcaseFx } from "../packages/shared/src/cubeShowcaseFx.ts";
import { getPresentationFace } from "../apps/web/src/features/cube/cubeSequence.ts";

const fx = resolveCubeShowcaseFx({
  cubeShowcaseZoomEnabled: false,
  cubeHeartbeatEnabled: false,
  cubeComplexRotationEnabled: false,
});
const pc = 6;
const segs = Array.from({ length: pc }, (_, i) => getFanStepSegmentMs(i));

function rot(step, el) {
  return sampleFanCubeMotion(
    step,
    el,
    getPresentationFace(step),
    pc,
    42,
    "auto",
    "wedding_default",
    1,
    fx,
    false
  ).rotation;
}

function report(label, a, b) {
  const dp = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const dz = Math.abs(a.z - b.z);
  const dq = new THREE.Quaternion().setFromEuler(a).angleTo(new THREE.Quaternion().setFromEuler(b));
  console.log(`${label}: dPitch=${dp.toFixed(5)} dYaw=${dy.toFixed(5)} dRoll=${dz.toFixed(5)} dQuat=${dq.toFixed(5)}`);
}

for (let step = 0; step < pc - 1; step++) {
  report(`step ${step}→${step + 1}`, rot(step, segs[step] - 1), rot(step + 1, 0));
}

// Sample within step 0 retreat→handoff boundary
const approachMs = 2400; // approximate - get from timing
import { getFanApproachMs, getFanShowcaseHoldMs, getFanRetreatMs } from "../apps/web/src/features/cube/fanTiming.ts";
const aMs = getFanApproachMs(0);
const sMs = getFanShowcaseHoldMs(0);
const rMs = getFanRetreatMs();
const handoffStart = aMs + sMs + rMs;
report("retreat→handoff", rot(0, handoffStart - 1), rot(0, handoffStart));
report("handoff mid", rot(0, handoffStart), rot(0, handoffStart + 50));

// Heartbeat scale pulse within showcase
const fxHb = resolveCubeShowcaseFx({ cubeShowcaseZoomEnabled: false, cubeHeartbeatEnabled: true });
const mid = sampleFanCubeMotion(0, aMs + sMs * 0.5, getPresentationFace(0), pc, 42, "auto", "wedding_default", 1, fxHb, false);
const mid2 = sampleFanCubeMotion(0, aMs + sMs * 0.5 + 420, getPresentationFace(0), pc, 42, "auto", "wedding_default", 1, fxHb, false);
console.log(`heartbeat scale delta: ${Math.abs(mid.presentationScale - mid2.presentationScale).toFixed(5)} (zoom off pins scale?)`);
