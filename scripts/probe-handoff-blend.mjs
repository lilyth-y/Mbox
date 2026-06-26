#!/usr/bin/env node
import * as THREE from "three";
import {
  getFanApproachMs,
  getFanShowcaseHoldMs,
  getFanRetreatMs,
  resolveFanPhase,
} from "../apps/web/src/features/cube/fanTiming.ts";
import { getPhaseCrossfadeMs, phaseCrossfadeT, blendFanCubeSamples } from "../apps/web/src/features/cube/fanPhaseCrossfade.ts";
import { resolveCubeShowcaseFx } from "../packages/shared/src/cubeShowcaseFx.ts";
import { getPresentationFace, getCubeShowcaseRootRotation } from "../apps/web/src/features/cube/cubeSequence.ts";
import { getCubeEntryRotation, getCubeExitRotation } from "../apps/web/src/features/cube/cubeTransitionRotation.ts";
import { getFanParallaxPeak } from "../apps/web/src/features/cube/fanTiming.ts";

// Import internal sampler via replicating sampleFanCubeMotionAtState path
import { sampleHandoffPhase, sampleRetreatPhase } from "../apps/web/src/features/cube/fanPhases.ts";

const fx = resolveCubeShowcaseFx({ cubeShowcaseZoomEnabled: false });
const step = 5;
const face = getPresentationFace(step);
const approachMs = getFanApproachMs(step);
const showcaseMs = getFanShowcaseHoldMs(step);
const retreatMs = getFanRetreatMs();
const handoffStart = approachMs + showcaseMs + retreatMs;
const crossMs = getPhaseCrossfadeMs(1);

function retreatEndSample() {
  const state = { phase: "retreat", phaseElapsed: retreatMs, phaseDuration: retreatMs, phaseU: 1 };
  return sampleRetreatPhase(
    state,
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
}

function handoffSample(el) {
  const state = resolveFanPhase(step, el);
  return sampleHandoffPhase(
    state,
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
}

const r = retreatEndSample();
for (const el of [8908, 8909, 8910, 8911]) {
  const h = handoffSample(el);
  const ph = resolveFanPhase(step, el);
  const t = phaseCrossfadeT(ph.phaseElapsed, crossMs);
  const blended = blendFanCubeSamples(r, h, t);
  console.log(
    `el=${el} phaseEl=${ph.phaseElapsed} t=${t.toFixed(4)} retreatY=${r.rotation.y.toFixed(4)} handoffY=${h.rotation.y.toFixed(4)} blendY=${blended.rotation.y.toFixed(4)}`
  );
}
