#!/usr/bin/env node
import * as THREE from "three";
import { sampleRetreatPhase, sampleHandoffPhase } from "../apps/web/src/features/cube/fanPhases.ts";
import { resolveFanPhase, getFanRetreatMs, getFanApproachMs, getFanShowcaseHoldMs, getFanParallaxPeak } from "../apps/web/src/features/cube/fanTiming.ts";
import { resolveCubeShowcaseFx } from "../packages/shared/src/cubeShowcaseFx.ts";
import { getPresentationFace, getCubeShowcaseRootRotation } from "../apps/web/src/features/cube/cubeSequence.ts";
import { getCubeExitRotation } from "../apps/web/src/features/cube/cubeTransitionRotation.ts";
import { phaseCrossfadeT, blendFanCubeSamples } from "../apps/web/src/features/cube/fanPhaseCrossfade.ts";
import { getPhaseCrossfadeMs } from "../apps/web/src/features/cube/fanPhaseCrossfade.ts";
import { slerpEuler } from "../apps/web/src/features/cube/cubeSequence.ts";

const fx = resolveCubeShowcaseFx({ cubeShowcaseZoomEnabled: false });
const step = 5;
const face = getPresentationFace(step);
const retreatMs = getFanRetreatMs();
const handoffStart = getFanApproachMs(step) + getFanShowcaseHoldMs(step) + retreatMs;

const r = sampleRetreatPhase(
  { phase: "retreat", phaseElapsed: retreatMs, phaseDuration: retreatMs, phaseU: 1 },
  step,
  handoffStart,
  getCubeShowcaseRootRotation(face),
  getCubeExitRotation(step, 6),
  getFanParallaxPeak(step),
  42,
  "auto",
  1,
  "wedding_default",
  fx
);

for (const el of [8909, 8910]) {
  const h = sampleHandoffPhase(
    resolveFanPhase(step, el),
    step,
    el,
    getCubeExitRotation(step, 6),
    42,
    "auto",
    1,
    "wedding_default",
    getCubeShowcaseRootRotation(face),
    fx
  );
  const t = phaseCrossfadeT(resolveFanPhase(step, el).phaseElapsed, getPhaseCrossfadeMs(1));
  console.log(`el=${el}`, "retreat", r.rotation.x, r.rotation.y, r.rotation.z);
  console.log(`el=${el}`, "handoff", h.rotation.x, h.rotation.y, h.rotation.z);
  console.log(`el=${el}`, "slerp t", t, slerpEuler(r.rotation, h.rotation, t));
  console.log(`el=${el}`, "blend", blendFanCubeSamples(r, h, t).rotation);
  const qr = new THREE.Quaternion().setFromEuler(r.rotation);
  const qh = new THREE.Quaternion().setFromEuler(h.rotation);
  console.log(`el=${el}`, "quat angle", (qr.angleTo(qh) * 180) / Math.PI);
}
