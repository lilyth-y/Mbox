#!/usr/bin/env node
/**
 * High-frequency sampling while cube shrinks (showcase→retreat→handoff).
 *   npx tsx scripts/verify-fan-shrink-smooth.mjs
 */
import * as THREE from "three";
import {
  getFanApproachMs,
  getFanShowcaseHoldMs,
  getFanRetreatMs,
  FAN_GAP_MS,
  sampleFanCubeMotion,
} from "../apps/web/src/features/cube/cubeFanTimeline.ts";
import { getPresentationFace } from "../apps/web/src/features/cube/cubeSequence.ts";

const DT = 16;
const zoomFx = {
  cubeHeartbeatEnabled: false,
  cubeShowcaseZoomEnabled: true,
  cubeSubjectPullEnabled: false,
};

function quatAngle(a, b) {
  return new THREE.Quaternion()
    .setFromEuler(a.rotation)
    .angleTo(new THREE.Quaternion().setFromEuler(b.rotation));
}

function ok(name, pass, detail = "") {
  console.log(`[${pass ? "OK" : "FAIL"}] ${name}${detail ? `: ${detail}` : ""}`);
  if (!pass) process.exitCode = 1;
}

const approachMs = getFanApproachMs(0);
const showcaseMs = getFanShowcaseHoldMs(0);
const retreatMs = getFanRetreatMs();
const shrinkStart = approachMs + showcaseMs - DT;
const shrinkEnd = approachMs + showcaseMs + retreatMs + FAN_GAP_MS;

let maxRotJump = 0;
let maxRotJumpAt = 0;
let maxScaleJump = 0;
let worstPhase = "";
let prev = null;

for (let t = shrinkStart; t <= shrinkEnd; t += DT) {
  const cur = sampleFanCubeMotion(0, t, getPresentationFace(0), 6, 42, "mixed", "wedding_default", 1, zoomFx);
  if (prev) {
    const rj = quatAngle(prev, cur);
    const sj = Math.abs(prev.presentationScale - cur.presentationScale);
    if (rj > maxRotJump) {
      maxRotJump = rj;
      maxRotJumpAt = t;
      worstPhase = `${prev._phase ?? "?"}→${cur._phase ?? "?"}`;
    }
    maxScaleJump = Math.max(maxScaleJump, sj);
  }
  prev = cur;
}

const retreatEnd = approachMs + showcaseMs + retreatMs;
const handoffStart = retreatEnd;
const seam = quatAngle(
  sampleFanCubeMotion(0, retreatEnd, getPresentationFace(0), 6, 42, "mixed", "wedding_default", 1, zoomFx),
  sampleFanCubeMotion(0, handoffStart, getPresentationFace(0), 6, 42, "mixed", "wedding_default", 1, zoomFx)
);

ok("retreat→handoff exact seam", seam < 0.002, `${seam.toFixed(6)} rad`);
ok("max rotation jump while shrinking (16ms)", maxRotJump < 0.08, `${maxRotJump.toFixed(4)} rad @${maxRotJumpAt}ms`);
ok("max scale jump while shrinking (16ms)", maxScaleJump < 0.025, String(maxScaleJump));

if (process.exitCode) {
  process.exit(1);
}
console.log("verify-fan-shrink-smooth: OK");
