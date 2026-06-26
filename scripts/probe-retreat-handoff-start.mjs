#!/usr/bin/env node
import * as THREE from "three";
import { sampleRetreatPhase, sampleHandoffPhase } from "../apps/web/src/features/cube/fanPhases.ts";
import { getFanRetreatMs, getFanApproachMs, getFanShowcaseHoldMs, getFanParallaxPeak } from "../apps/web/src/features/cube/fanTiming.ts";
import { resolveCubeShowcaseFx } from "../packages/shared/src/cubeShowcaseFx.ts";
import { getPresentationFace, getCubeShowcaseRootRotation } from "../apps/web/src/features/cube/cubeSequence.ts";
import { getCubeExitRotation } from "../apps/web/src/features/cube/cubeTransitionRotation.ts";

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
const h0 = sampleHandoffPhase(
  { phase: "handoff", phaseElapsed: 0, phaseDuration: 1450, phaseU: 0 },
  step,
  handoffStart,
  getCubeExitRotation(step, 6),
  42,
  "auto",
  1,
  "wedding_default",
  getCubeShowcaseRootRotation(face),
  fx
);
const qr = new THREE.Quaternion().setFromEuler(r.rotation);
const qh = new THREE.Quaternion().setFromEuler(h0.rotation);
console.log("retreat end", r.rotation);
console.log("handoff start", h0.rotation);
console.log("quat angle deg", (qr.angleTo(qh) * 180) / Math.PI);
