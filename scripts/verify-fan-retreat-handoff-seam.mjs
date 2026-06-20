#!/usr/bin/env node
/**
 * Retreat end → handoff start must be continuous while cube shrinks.
 *   npx tsx scripts/verify-fan-retreat-handoff-seam.mjs
 */
import * as THREE from "three";
import {
  sampleFanCubeMotion,
  getFanApproachMs,
  getFanShowcaseHoldMs,
  getFanRetreatMs,
  FAN_GAP_MS,
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
  return new THREE.Quaternion()
    .setFromEuler(a.rotation)
    .angleTo(new THREE.Quaternion().setFromEuler(b.rotation));
}

const approachMs = getFanApproachMs(0);
const showcaseMs = getFanShowcaseHoldMs(0);
const retreatMs = getFanRetreatMs();
const retreatEndMs = approachMs + showcaseMs + retreatMs;
const handoffStartMs = retreatEndMs;

const retreatEnd = sampleFanCubeMotion(
  0,
  retreatEndMs,
  getPresentationFace(0),
  6,
  42,
  "mixed",
  "wedding_default",
  1,
  zoomFx
);
const handoffStart = sampleFanCubeMotion(
  0,
  handoffStartMs,
  getPresentationFace(0),
  6,
  42,
  "mixed",
  "wedding_default",
  1,
  zoomFx
);

const jump = quatAngle(retreatEnd, handoffStart);
const scaleJump = Math.abs(retreatEnd.presentationScale - handoffStart.presentationScale);
ok("retreat→handoff rotation seam", jump < 0.002, `${jump.toFixed(6)} rad`);
ok("retreat→handoff scale seam", scaleJump < 0.02, String(scaleJump));
ok("retreat end is smaller than showcase", retreatEnd.presentationScale < 1.1);

const midRetreat = sampleFanCubeMotion(
  0,
  retreatEndMs - retreatMs * 0.5,
  getPresentationFace(0),
  6,
  42,
  "mixed",
  "wedding_default",
  1,
  zoomFx
);
const dt = 16;
const retreatVel = quatAngle(
  sampleFanCubeMotion(0, retreatEndMs - dt, getPresentationFace(0), 6, 42, "mixed", "wedding_default", 1, zoomFx),
  sampleFanCubeMotion(0, retreatEndMs + dt, getPresentationFace(0), 6, 42, "mixed", "wedding_default", 1, zoomFx)
) / (2 * dt);
ok("retreat end rotation velocity bounded", retreatVel < 0.004, String(retreatVel));

if (process.exitCode) {
  process.exit(1);
}
console.log("verify-fan-retreat-handoff-seam: OK");
