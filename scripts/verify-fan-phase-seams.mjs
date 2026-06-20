#!/usr/bin/env node
/**
 * Phase seams should stay continuous at showcase peak (scale / camera / rotation).
 *   npx tsx scripts/verify-fan-phase-seams.mjs
 */
import * as THREE from "three";
import {
  sampleFanCubeMotion,
  getFanApproachMs,
  getFanShowcaseHoldMs,
} from "../apps/web/src/features/cube/cubeFanTimeline.ts";
import { getPhaseCrossfadeMs } from "../apps/web/src/features/cube/fanPhaseCrossfade.ts";

const zoomFx = {
  cubeHeartbeatEnabled: false,
  cubeShowcaseZoomEnabled: true,
  cubeSubjectPullEnabled: false,
};

function ok(name, pass, detail = "") {
  console.log(`[${pass ? "OK" : "FAIL"}] ${name}${detail ? `: ${detail}` : ""}`);
  if (!pass) process.exitCode = 1;
}

function maxJump(a, b, keys) {
  let max = 0;
  for (const key of keys) {
    const av = a[key] ?? 0;
    const bv = b[key] ?? 0;
    max = Math.max(max, Math.abs(bv - av));
  }
  return max;
}

const approachMs = getFanApproachMs(0);
const showcaseMs = getFanShowcaseHoldMs(0);
const crossMs = getPhaseCrossfadeMs(1);
const dt = 16;

const beforeApproachEnd = sampleFanCubeMotion(
  0,
  approachMs - dt,
  4,
  6,
  42,
  "mixed",
  "wedding_default",
  1,
  zoomFx
);
const afterShowcaseStart = sampleFanCubeMotion(
  0,
  approachMs + dt,
  4,
  6,
  42,
  "mixed",
  "wedding_default",
  1,
  zoomFx
);
const approachShowcaseJump = maxJump(beforeApproachEnd, afterShowcaseStart, [
  "presentationScale",
  "cameraZ",
  "fieldOfView",
  "cameraOffsetX",
  "cameraOffsetY",
]);
ok(
  "approach→showcase seam soft",
  approachShowcaseJump < 0.12,
  String(approachShowcaseJump)
);

const showcaseRetreatBoundary = approachMs + showcaseMs;
const beforeShowcaseEnd = sampleFanCubeMotion(
  0,
  showcaseRetreatBoundary - 1,
  4,
  6,
  42,
  "mixed",
  "wedding_default",
  1,
  zoomFx
);
const afterRetreatStart = sampleFanCubeMotion(
  0,
  showcaseRetreatBoundary + 1,
  4,
  6,
  42,
  "mixed",
  "wedding_default",
  1,
  zoomFx
);
const showcaseRetreatJump = maxJump(beforeShowcaseEnd, afterRetreatStart, [
  "presentationScale",
  "cameraZ",
  "fieldOfView",
  "cameraOffsetX",
  "cameraOffsetY",
]);
ok(
  "showcase→retreat seam soft",
  showcaseRetreatJump < 0.14,
  String(showcaseRetreatJump)
);

ok("crossfade window sane", crossMs >= 350 && crossMs <= 720, String(crossMs));

function rotJumpDeg(t1, t2) {
  const a = sampleFanCubeMotion(0, t1, 4, 6, 42, "mixed", "wedding_default", 1, zoomFx);
  const b = sampleFanCubeMotion(0, t2, 4, 6, 42, "mixed", "wedding_default", 1, zoomFx);
  return THREE.MathUtils.radToDeg(
    new THREE.Quaternion()
      .setFromEuler(a.rotation)
      .angleTo(new THREE.Quaternion().setFromEuler(b.rotation))
  );
}

const rotApproachShowcase = rotJumpDeg(approachMs - 1, approachMs + 1);
const rotShowcaseRetreat = rotJumpDeg(
  showcaseRetreatBoundary - 1,
  showcaseRetreatBoundary + 1
);
ok(
  "approach→showcase rotation seam",
  rotApproachShowcase < 2.5,
  `${rotApproachShowcase.toFixed(2)}°`
);
ok(
  "showcase→retreat rotation seam",
  rotShowcaseRetreat < 2.5,
  `${rotShowcaseRetreat.toFixed(2)}°`
);

if (process.exitCode) {
  process.exit(1);
}
console.log("verify-fan-phase-seams: OK");
