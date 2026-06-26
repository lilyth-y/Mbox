#!/usr/bin/env node
import * as THREE from "three";
import { resolveFanPhase } from "../apps/web/src/features/cube/fanTiming.ts";
import { resolveCubeShowcaseFx } from "../packages/shared/src/cubeShowcaseFx.ts";
import { getPresentationFace } from "../apps/web/src/features/cube/cubeSequence.ts";
import { getCubeEntryRotation, getCubeExitRotation } from "../apps/web/src/features/cube/cubeTransitionRotation.ts";
import { getCubeShowcaseRootRotation } from "../apps/web/src/features/cube/cubeSequence.ts";
import { sampleHandoffPhase } from "../apps/web/src/features/cube/fanPhases.ts";
import { sampleFanCubeMotion } from "../apps/web/src/features/cube/cubeFanTimeline.ts";

const fx = resolveCubeShowcaseFx({ cubeShowcaseZoomEnabled: false });
const step = 5;
const face = getPresentationFace(step);

function handoffOnly(el) {
  const state = resolveFanPhase(step, el);
  return sampleHandoffPhase(
    state,
    step,
    el,
    getCubeExitRotation(step, 6),
    42,
    "auto",
    1,
    "wedding_default",
    getCubeShowcaseRootRotation(face),
    fx
  ).rotation;
}

for (const el of [8908, 8909, 8910, 8911]) {
  const a = handoffOnly(el);
  const b = sampleFanCubeMotion(step, el, face, 6, 42, "auto", "wedding_default", 1, fx, false).rotation;
  console.log(`el=${el} handoff y=${a.y.toFixed(4)} full y=${b.y.toFixed(4)}`);
}
const q1 = new THREE.Quaternion().setFromEuler(handoffOnly(8909));
const q2 = new THREE.Quaternion().setFromEuler(handoffOnly(8910));
console.log("handoff-only quat jump deg", (q1.angleTo(q2) * 180) / Math.PI);
