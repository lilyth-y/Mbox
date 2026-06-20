/**
 * Spike breakdown for entrance EHI gate (yaw_cw).
 *   npx tsx scripts/debug-ehi-spikes.mjs
 */
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

function eulerDist(a, b) {
  const dq = new THREE.Quaternion().setFromEuler(a);
  const qq = new THREE.Quaternion().setFromEuler(b);
  const dot = Math.min(1, Math.abs(dq.dot(qq)));
  return (2 * Math.acos(dot) * 180) / Math.PI;
}

const segmentMs = Array.from({ length: 3 }, (_, s) => getFanStepSegmentMs(s, profile));
const loopBridgeMs = getLoopBridgeMs("cube_focus", 3);
const cycleMs = sumSegmentDurations(segmentMs) + loopBridgeMs;

const frames = [];
for (let t = 0; t < cycleMs; t += FRAME_MS) {
  const resolved = resolvePresentationTimeline(Math.round(t), segmentMs, loopBridgeMs);
  if (resolved.kind === "loop_bridge") continue;
  const { step, stepElapsed } = resolved;
  const phase = resolveFanPhase(step, stepElapsed, profile).phase;
  const face = getPresentationFace(step);
  const m = sampleFanCubeMotion(step, stepElapsed, face, 3, 42, rotationMode, profile);
  frames.push({ t: Math.round(t), step, phase, euler: m.rotation.clone() });
}

const byPhase = {};
let spikes = 0;
for (let i = 1; i < frames.length; i += 1) {
  const prev = frames[i - 1];
  const cur = frames[i];
  const dDeg = eulerDist(prev.euler, cur.euler);
  const dt = (cur.t - prev.t) / 1000;
  const dps = dDeg / dt;
  if (dDeg > 12 || dps > 120) {
    spikes += 1;
    const key = `${prev.phase}->${cur.phase}`;
    byPhase[key] = (byPhase[key] ?? 0) + 1;
  }
}

console.log(JSON.stringify({ spikes, byPhase, frames: frames.length }, null, 2));
