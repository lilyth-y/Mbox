/**
 * Probe rotation continuity at step seams (handoff end → approach start).
 *   npx tsx scripts/probe-step-seam-rotation.mjs
 */
import * as THREE from "three";
import { DEFAULT_CUBE_SHOWCASE_FX } from "../packages/shared/src/cubeShowcaseFx.ts";
import { sampleFanCubeMotion } from "../apps/web/src/features/cube/cubeFanTimeline.ts";
import { getFanStepSegmentMs, FAN_GAP_MS, resolveFanPhase } from "../apps/web/src/features/cube/fanTiming.ts";
import { getPresentationFace } from "../apps/web/src/features/cube/cubeSequence.ts";
import { resolvePresentationTimeline } from "../apps/web/src/features/cube/cubeMotionVariety.ts";

const FX = { ...DEFAULT_CUBE_SHOWCASE_FX };
const PROFILE = "wedding_default";
const SPEED = 1;
const N = 6;
const segmentMs = Array.from({ length: N }, (_, s) =>
  getFanStepSegmentMs(s, PROFILE, SPEED)
);

function angleDeg(a, b) {
  // Use quaternion dot to get the shortest-arc rotation difference.
  // (Using only dq.w is sensitive to numeric drift and can over-report ω spikes.)
  const qa = new THREE.Quaternion().setFromEuler(a.rotation).normalize();
  const qb = new THREE.Quaternion().setFromEuler(b.rotation).normalize();
  const dot = Math.abs(qa.dot(qb));
  return 2 * Math.acos(Math.min(1, Math.max(-1, dot))) * (180 / Math.PI);
}

function omegaAt(step, elapsed, dt = 1) {
  const face = getPresentationFace(step);
  const a = sampleFanCubeMotion(step, elapsed, face, N, 42, "auto", PROFILE, SPEED, FX, false);
  const b = sampleFanCubeMotion(step, elapsed + dt, face, N, 42, "auto", PROFILE, SPEED, FX, false);
  return angleDeg(a, b) / (dt / 1000);
}

let maxAngle = 0;
let maxOmegaJump = 0;

for (let step = 1; step < N; step++) {
  const prevSeg = segmentMs[step - 1];
  const prevFace = getPresentationFace(step - 1);
  const face = getPresentationFace(step);
  const handoffEnd = sampleFanCubeMotion(
    step - 1,
    prevSeg - 1,
    prevFace,
    N,
    42,
    "auto",
    PROFILE,
    SPEED,
    FX,
    false
  );
  const approachStart = sampleFanCubeMotion(
    step,
    0,
    face,
    N,
    42,
    "auto",
    PROFILE,
    SPEED,
    FX,
    false
  );
  const dTheta = angleDeg(handoffEnd, approachStart);
  const wHandoff = omegaAt(step - 1, prevSeg - 2);
  const wApproach = omegaAt(step, 0);
  maxAngle = Math.max(maxAngle, dTheta);
  maxOmegaJump = Math.max(maxOmegaJump, Math.abs(wApproach - wHandoff));
  console.log(
    `step ${step - 1}→${step}: Δθ=${dTheta.toFixed(3)}°  ω ${wHandoff.toFixed(1)}→${wApproach.toFixed(1)} (Δω=${(wApproach - wHandoff).toFixed(1)})`
  );
}

console.log(`\nmax Δθ=${maxAngle.toFixed(3)}°  max |Δω|=${maxOmegaJump.toFixed(1)}°/s`);

const stepStartMs = segmentMs[0];
console.log(`Handoff tail ω (step 0, u≥0.75):`);
let maxHandoffTailOmega = 0;
for (let el = 0; el < segmentMs[0]; el += 5) {
  const phase = resolveFanPhase(0, el, PROFILE, SPEED);
  if (phase.phase !== "handoff" || phase.phaseU < 0.75) {
    continue;
  }
  const w = omegaAt(0, el, 5);
  maxHandoffTailOmega = Math.max(maxHandoffTailOmega, w);
}
console.log(`  max |ω| (u≥0.75 region)=${maxHandoffTailOmega.toFixed(1)}°/s`);

console.log(`\nHandoff tail ω (step 0):`);
const prevSeg = segmentMs[0];
for (const el of [prevSeg - 200, prevSeg - 100, prevSeg - 50, prevSeg - 17, prevSeg - 1]) {
  console.log(`  elapsed=${el} ω=${omegaAt(0, el).toFixed(1)}°/s`);
}
console.log(`Approach head ω (step 1):`);
for (const el of [0, 17, 33, 50, 100]) {
  console.log(`  elapsed=${el} ω=${omegaAt(1, el).toFixed(1)}°/s`);
}

for (const ms of [stepStartMs - 100, stepStartMs - 33, stepStartMs, stepStartMs + 33]) {
  const resolved = resolvePresentationTimeline(ms, segmentMs, 0);
  if (resolved.kind !== "step") continue;
  const { step, stepElapsed } = resolved;
  const phase = resolveFanPhase(step, stepElapsed, PROFILE, SPEED);
  const face = getPresentationFace(step);
  const sample = sampleFanCubeMotion(
    step,
    stepElapsed,
    face,
    N,
    42,
    "auto",
    PROFILE,
    SPEED,
    FX,
    false
  );
  console.log(
    `  ms=${ms} step=${step} elapsed=${stepElapsed.toFixed(1)} phase=${phase.phase} u=${phase.phaseU.toFixed(3)}`
  );
}

