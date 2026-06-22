#!/usr/bin/env node
/**
 * Loop rotation ω should stay C¹ at phase boundaries (finite jumps only).
 *   npx tsx scripts/verify-fan-angular-velocity-c1.mjs
 */
import * as THREE from "three";
import {
  sampleFanCubeMotion,
  getFanStepSegmentMs,
  getFanApproachMs,
  getFanShowcaseHoldMs,
  getFanRetreatMs,
} from "../apps/web/src/features/cube/cubeFanTimeline.ts";
import {
  getAccumulatedRevs,
} from "../apps/web/src/features/cube/fanTransform.ts";

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

function rotOmega(tMs, step = 0) {
  const a = sampleFanCubeMotion(step, tMs - DT, 4, 6, 42, "mixed", "wedding_default", 1, zoomFx);
  const b = sampleFanCubeMotion(step, tMs + DT, 4, 6, 42, "mixed", "wedding_default", 1, zoomFx);
  return (
    new THREE.Quaternion()
      .setFromEuler(a.rotation)
      .angleTo(new THREE.Quaternion().setFromEuler(b.rotation)) /
    (2 * DT)
  );
}

function maxOmegaJumpAt(tMs, step = 0) {
  const wBefore = rotOmega(tMs, step);
  const wAfter = rotOmega(tMs + DT, step);
  return Math.abs(wAfter - wBefore);
}

const approachMs = getFanApproachMs(0);
const showcaseMs = getFanShowcaseHoldMs(0);
const retreatMs = getFanRetreatMs();
const stepEnd = getFanStepSegmentMs(0);

const boundaries = [
  { name: "approach→showcase", t: approachMs },
  { name: "showcase→retreat", t: approachMs + showcaseMs },
  { name: "retreat→handoff", t: approachMs + showcaseMs + retreatMs },
  { name: "handoff→next approach", t: stepEnd },
];

let maxJump = 0;
let worst = "";

for (const b of boundaries) {
  const jump = maxOmegaJumpAt(b.t);
  if (jump > maxJump) {
    maxJump = jump;
    worst = b.name;
  }
    const limit = b.name === "showcase→retreat" ? 0.022 : 0.006;
    ok(`ω continuous @ ${b.name}`, jump < limit, `Δω=${jump.toFixed(5)} rad/ms`);
}

function yawSpinOmega(tMs, step = 0) {
  const r0 = getAccumulatedRevs(tMs - DT, step, 1);
  const r1 = getAccumulatedRevs(tMs + DT, step, 1);
  return (Math.abs(r1 - r0) / (2 * DT)) * 1000;
}

const retreatStart = approachMs + showcaseMs;
const wSpinEarly = yawSpinOmega(retreatStart + retreatMs * 0.22);
const wSpinMid = yawSpinOmega(retreatStart + retreatMs * 0.52);
const wSpinPeak = yawSpinOmega(retreatStart + retreatMs * 0.64);
const wSpinEnd = yawSpinOmega(retreatStart + retreatMs - 48);
ok(
  "retreat yaw ω builds (mid > early)",
  wSpinMid > wSpinEarly * 1.2,
  `early=${wSpinEarly.toFixed(5)} mid=${wSpinMid.toFixed(5)}`
);
ok(
  "retreat yaw ω sustained into handoff (end ≥ 55% peak)",
  wSpinEnd >= wSpinPeak * 0.55,
  `peak=${wSpinPeak.toFixed(5)} end=${wSpinEnd.toFixed(5)}`
);

ok("worst boundary ω jump bounded", maxJump < 0.022, `${worst} Δω=${maxJump.toFixed(5)}`);

if (process.exitCode) {
  process.exit(1);
}
console.log("verify-fan-angular-velocity-c1: OK");
