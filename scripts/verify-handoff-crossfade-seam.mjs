#!/usr/bin/env node
/**
 * Handoff crossfade must not flip ~180° (retreat vs handoff euler branches).
 */
import * as THREE from "three";
import { sampleFanCubeMotion, getFanStepSegmentMs } from "../apps/web/src/features/cube/cubeFanTimeline.ts";
import { getPresentationFace } from "../apps/web/src/features/cube/cubeSequence.ts";
import { resolveCubeShowcaseFx } from "../packages/shared/src/cubeShowcaseFx.ts";
import { getFanApproachMs, getFanShowcaseHoldMs, getFanRetreatMs } from "../apps/web/src/features/cube/fanTiming.ts";

function ok(name, pass, detail = "") {
  console.log(`[${pass ? "OK" : "FAIL"}] ${name}${detail ? `: ${detail}` : ""}`);
  if (!pass) process.exitCode = 1;
}

const fx = resolveCubeShowcaseFx({ cubeShowcaseZoomEnabled: false });
const step = 5;
const face = getPresentationFace(step);
const handoffStart =
  getFanApproachMs(step) + getFanShowcaseHoldMs(step) + getFanRetreatMs();

let prev = null;
let maxJump = 0;
let maxAt = 0;
for (let el = handoffStart; el < handoffStart + 700; el += 1) {
  const m = sampleFanCubeMotion(step, el, face, 6, 42, "auto", "wedding_default", 1, fx, false);
  if (prev) {
    const jump = new THREE.Quaternion()
      .setFromEuler(prev.rotation)
      .angleTo(new THREE.Quaternion().setFromEuler(m.rotation));
    if (jump > maxJump) {
      maxJump = jump;
      maxAt = el;
    }
  }
  prev = m;
}

ok(
  "handoff crossfade max frame jump < 5°",
  maxJump < (5 * Math.PI) / 180,
  `max=${((maxJump * 180) / Math.PI).toFixed(2)}° @ el=${maxAt}`
);

if (process.exitCode) process.exit(1);
console.log("verify-handoff-crossfade-seam: OK");
