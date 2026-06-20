#!/usr/bin/env node
/**
 * Step N handoff end → step N+1 approach start should be continuous.
 *   npx tsx scripts/verify-fan-step-seam.mjs
 */
import * as THREE from "three";
import {
  sampleFanCubeMotion,
  getFanStepSegmentMs,
} from "../apps/web/src/features/cube/cubeFanTimeline.ts";
import { getPresentationFace } from "../apps/web/src/features/cube/cubeSequence.ts";

const zoomFx = {
  cubeHeartbeatEnabled: false,
  cubeShowcaseZoomEnabled: true,
  cubeSubjectPullEnabled: false,
};

function ok(name, pass, detail = "") {
  console.log(`[${pass ? "OK" : "FAIL"}] ${name}${detail ? `: ${detail}` : ""}`);
  if (!pass) process.exitCode = 1;
}

function quatAngle(a, b) {
  return new THREE.Quaternion().setFromEuler(a).angleTo(new THREE.Quaternion().setFromEuler(b));
}

for (const step of [0, 1]) {
  const segMs = getFanStepSegmentMs(step);
  const end = sampleFanCubeMotion(
    step,
    segMs,
    getPresentationFace(step),
    6,
    42,
    "mixed",
    "wedding_default",
    1,
    zoomFx
  );
  const nextStart = sampleFanCubeMotion(
    step + 1,
    0,
    getPresentationFace(step + 1),
    6,
    42,
    "mixed",
    "wedding_default",
    1,
    zoomFx
  );
  const jump = quatAngle(end.rotation, nextStart.rotation);
  const scaleJump = Math.abs(end.presentationScale - nextStart.presentationScale);
  ok(`step ${step}→${step + 1} exact rotation seam`, jump < 0.002, `${jump.toFixed(6)} rad`);
  ok(`step ${step}→${step + 1} scale seam`, scaleJump < 0.12, String(scaleJump));
}

if (process.exitCode) {
  process.exit(1);
}
console.log("verify-fan-step-seam: OK");
