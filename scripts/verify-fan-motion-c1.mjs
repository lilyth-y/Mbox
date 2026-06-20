#!/usr/bin/env node
/**
 * Scale + rotation velocity should stay continuous at showcase peak (C¹).
 *   npx tsx scripts/verify-fan-motion-c1.mjs
 */
import * as THREE from "three";
import {
  sampleFanCubeMotion,
  getFanApproachMs,
  getFanShowcaseHoldMs,
} from "../apps/web/src/features/cube/cubeFanTimeline.ts";

const zoomFx = {
  cubeHeartbeatEnabled: false,
  cubeShowcaseZoomEnabled: true,
  cubeSubjectPullEnabled: false,
};

const DT = 12;

function ok(name, pass, detail = "") {
  console.log(`[${pass ? "OK" : "FAIL"}] ${name}${detail ? `: ${detail}` : ""}`);
  if (!pass) process.exitCode = 1;
}

function quatAngle(a, b) {
  return new THREE.Quaternion().setFromEuler(a).angleTo(new THREE.Quaternion().setFromEuler(b));
}

function vel(key, tMs) {
  const a = sampleFanCubeMotion(0, tMs - DT, 4, 6, 42, "mixed", "wedding_default", 1, zoomFx);
  const b = sampleFanCubeMotion(0, tMs + DT, 4, 6, 42, "mixed", "wedding_default", 1, zoomFx);
  if (key === "scale") {
    return (b.presentationScale - a.presentationScale) / (2 * DT);
  }
  return quatAngle(a.rotation, b.rotation) / (2 * DT);
}

const approachMs = getFanApproachMs(0);
const showcaseMs = getFanShowcaseHoldMs(0);
const seamT = approachMs;

const vScaleBefore = vel("scale", seamT - DT);
const vScaleAfter = vel("scale", seamT + DT);
const scaleJump = Math.abs(vScaleAfter - vScaleBefore);
ok("scale velocity continuous at showcase entry", scaleJump < 0.00035, String(scaleJump));

const vRotBefore = vel("rot", seamT - DT);
const vRotAfter = vel("rot", seamT + DT);
const rotJump = Math.abs(vRotAfter - vRotBefore);
ok("rotation velocity continuous at showcase entry", rotJump < 0.004, String(rotJump));

const vRotPeak = vel("rot", seamT + showcaseMs * 0.5);
ok("showcase hold rotation nearly still", vRotPeak < 0.00025, String(vRotPeak));

if (process.exitCode) {
  process.exit(1);
}
console.log("verify-fan-motion-c1: OK");
