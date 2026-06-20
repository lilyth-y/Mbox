#!/usr/bin/env node
import * as THREE from "three";
import {
  getFanStepSegmentMs,
  resolveFanPhase,
  sampleFanCubeMotion,
} from "../apps/web/src/features/cube/cubeFanTimeline.ts";
import {
  getLoopBridgeMs,
  resolvePresentationTimeline,
  sumSegmentDurations,
} from "../apps/web/src/features/cube/cubeMotionVariety.ts";
import { getPresentationFace } from "../apps/web/src/features/cube/cubeSequence.ts";

const FPS = 30;
const FRAME_MS = 1000 / FPS;
const profile = "entrance_processional";
const rotationMode = "yaw_cw";
const N = 3;
const seed = 42;
const segmentMs = Array.from({ length: N }, (_, s) => getFanStepSegmentMs(s, profile));
const loopBridge = getLoopBridgeMs("cube_focus", N);
const cycle = sumSegmentDurations(segmentMs) + loopBridge;

const frames = [];
for (let t = 0; t < cycle; t += FRAME_MS) {
  const resolved = resolvePresentationTimeline(Math.round(t), segmentMs, loopBridge);
  if (resolved.kind === "loop_bridge") continue;
  const { step, stepElapsed } = resolved;
  const phaseState = resolveFanPhase(step, stepElapsed, profile);
  const motion = sampleFanCubeMotion(
    step,
    stepElapsed,
    getPresentationFace(step),
    N,
    seed,
    rotationMode,
    profile
  );
  frames.push({
    step,
    phase: phaseState.phase,
    rotYDeg: (motion.rotation.y * 180) / Math.PI,
  });
}

const showcase = frames.filter((f) => f.phase === "showcase_hold" && f.step === 0);
const rates = [];
for (let i = 1; i < showcase.length; i += 1) {
  rates.push(Math.abs(showcase[i].rotYDeg - showcase[i - 1].rotYDeg) / (FRAME_MS / 1000));
}
const mean = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
console.log({ showcaseFrames: showcase.length, step0MeanYaw: mean.toFixed(3), first: showcase[0]?.rotYDeg, last: showcase.at(-1)?.rotYDeg });
