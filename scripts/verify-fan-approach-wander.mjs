#!/usr/bin/env node
/**
 * Small cube wanders first, then glides into face-forward (스으윽).
 *   npx tsx scripts/verify-fan-approach-wander.mjs
 */
import * as THREE from "three";
import {
  sampleFanCubeMotion,
  getFanApproachMs,
} from "../apps/web/src/features/cube/cubeFanTimeline.ts";
import { getFaceRotation, getPresentationFace } from "../apps/web/src/features/cube/cubeSequence.ts";
import { approachSpinEase } from "../apps/web/src/features/cube/fanTransform.ts";

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
  const qa = new THREE.Quaternion().setFromEuler(a);
  const qb = new THREE.Quaternion().setFromEuler(b);
  return qa.angleTo(qb);
}

const approachMs = getFanApproachMs(1);
const wanderU = 0.2;
ok("low align early approach", approachSpinEase(wanderU) < 0.25);
ok(
  "align mid-glide",
  approachSpinEase(0.55) > 0.35,
  String(approachSpinEase(0.55))
);
ok(
  "align strong near approach end",
  approachSpinEase(0.95) > 0.85,
  String(approachSpinEase(0.95))
);

const face = getPresentationFace(1);
const target = getFaceRotation(face);

const early = sampleFanCubeMotion(
  1,
  approachMs * wanderU,
  face,
  6,
  42,
  "mixed",
  "wedding_default",
  1,
  zoomFx
);
const late = sampleFanCubeMotion(
  1,
  approachMs * 0.97,
  face,
  6,
  42,
  "mixed",
  "wedding_default",
  1,
  zoomFx
);

const earlyAngle = quatAngle(early.rotation, target);
const lateAngle = quatAngle(late.rotation, target);
ok("early approach wanders off-face", earlyAngle > 0.35, `${earlyAngle.toFixed(3)} rad`);
ok("late approach settles on face", lateAngle < 0.22, `${lateAngle.toFixed(3)} rad`);
ok("late closer than early", lateAngle < earlyAngle, `${lateAngle.toFixed(3)} < ${earlyAngle.toFixed(3)}`);
ok("early scale smaller than late", early.presentationScale < late.presentationScale);

if (process.exitCode) {
  process.exit(1);
}
console.log("verify-fan-approach-wander: OK");
