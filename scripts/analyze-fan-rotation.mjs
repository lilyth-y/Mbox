/**
 * Rotation continuity analysis for fan wedding timeline (30fps).
 *   npx tsx scripts/analyze-fan-rotation.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import {
  FAN_GAP_MS,
  FAN_LOOP_BRIDGE_MS,
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

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "experiments", "outputs", "fan_frame_analysis");
const FPS = 30;
const FRAME_MS = 1000 / FPS;
const N = 3;
const SEED = 42;

mkdirSync(outDir, { recursive: true });

const segmentMs = Array.from({ length: N }, (_, s) => getFanStepSegmentMs(s));
const loopBridgeMs = getLoopBridgeMs("cube_focus", N);
const cycleMs = sumSegmentDurations(segmentMs) + loopBridgeMs;

function sample(globalMs) {
  const resolved = resolvePresentationTimeline(globalMs, segmentMs, loopBridgeMs);
  if (resolved.kind === "loop_bridge") {
    return { globalMs, kind: "loop_bridge", step: resolved.lastStep, euler: null, phase: "loop_bridge" };
  }
  const { step, stepElapsed } = resolved;
  const face = getPresentationFace(step);
  const phase = resolveFanPhase(step, stepElapsed).phase;
  const m = sampleFanCubeMotion(step, stepElapsed, face, N, SEED, "mixed");
  return { globalMs, kind: "step", step, stepElapsed, phase, euler: m.rotation.clone() };
}

function eulerDist(a, b) {
  const dq = new THREE.Quaternion().setFromEuler(a);
  const qq = new THREE.Quaternion().setFromEuler(b);
  const dot = Math.min(1, Math.abs(dq.dot(qq)));
  const angleRad = 2 * Math.acos(dot);
  return (angleRad * 180) / Math.PI;
}

const frames = [];
for (let t = 0; t < cycleMs; t += FRAME_MS) {
  frames.push(sample(Math.round(t)));
}

const stepFrames = frames.filter((f) => f.euler);
const spikes = [];
for (let i = 1; i < stepFrames.length; i += 1) {
  const prev = stepFrames[i - 1];
  const cur = stepFrames[i];
  const dDeg = eulerDist(prev.euler, cur.euler);
  const dt = (cur.globalMs - prev.globalMs) / 1000;
  const degPerSec = dDeg / dt;
  if (dDeg > 12 || degPerSec > 120) {
    spikes.push({
      ms: cur.globalMs,
      step: cur.step,
      phase: cur.phase,
      prevPhase: prev.phase,
      dDeg: Number(dDeg.toFixed(2)),
      degPerSec: Number(degPerSec.toFixed(1)),
    });
  }
}

const stepBoundaries = [];
for (let step = 0; step < N - 1; step += 1) {
  let offset = 0;
  for (let s = 0; s < step; s += 1) offset += segmentMs[s];
  const endF = sample(offset + segmentMs[step] - 1);
  const startF = sample(offset + segmentMs[step]);
  stepBoundaries.push({
    boundary: `${step}→${step + 1}`,
    endPhase: endF.phase,
    startPhase: startF.phase,
    rotJumpDeg: Number(eulerDist(endF.euler, startF.euler).toFixed(2)),
  });
}

const handoffInternal = [];
for (let step = 0; step < N; step += 1) {
  let offset = 0;
  for (let s = 0; s < step; s += 1) offset += segmentMs[s];
  const seg = segmentMs[step];
  const handoffStartMs = offset + seg - FAN_GAP_MS;
  const us = [0, 0.25, 0.5, 0.75, 0.99];
  const samples = us.map((u) => sample(handoffStartMs + Math.floor(FAN_GAP_MS * u)));
  for (let i = 1; i < samples.length; i += 1) {
    handoffInternal.push({
      step,
      segment: `${us[i - 1]}→${us[i]}`,
      dDeg: Number(eulerDist(samples[i - 1].euler, samples[i].euler).toFixed(2)),
    });
  }
}

const withinPhaseJerks = spikes.filter((s) => s.prevPhase === s.phase && s.dDeg > 18);
const phaseChangeSpikes = spikes.filter((s) => s.prevPhase !== s.phase);

const report = {
  meta: { cycleMs, cycleSec: cycleMs / 1000, fps: FPS, totalSpikes: spikes.length },
  stepBoundaries,
  handoffInternal,
  withinPhaseJerks,
  phaseChangeSpikes: phaseChangeSpikes.sort((a, b) => b.dDeg - a.dDeg).slice(0, 12),
  topSpikes: spikes.sort((a, b) => b.dDeg - a.dDeg).slice(0, 12),
};

writeFileSync(join(outDir, "rotation_analysis.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
