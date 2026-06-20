/**
 * Detect rotation stutter: direction reversals & phase-boundary snaps.
 */
import * as THREE from "three";
import { DEFAULT_CUBE_SHOWCASE_FX } from "../packages/shared/src/cubeShowcaseFx.ts";
import { sampleFanCubeMotion } from "../apps/web/src/features/cube/cubeFanTimeline.ts";
import {
  getScaleGatedRevsWithinStep,
  runWithFanMotionExportRecording,
} from "../apps/web/src/features/cube/fanExportRotation.ts";
import { getPresentationFace } from "../apps/web/src/features/cube/cubeSequence.ts";
import { resolvePresentationTimeline } from "../apps/web/src/features/cube/cubeMotionVariety.ts";
import { getFanStepSegmentMs, resolveFanPhase } from "../apps/web/src/features/cube/fanTiming.ts";

const FRAME_MS = 1000 / 30;
const N = 6;
const SEED = 42;
const FX = { ...DEFAULT_CUBE_SHOWCASE_FX };
const segmentMs = Array.from({ length: N }, (_, s) =>
  getFanStepSegmentMs(s, "wedding_default", 1)
);

function sampleAt(ms, exportRecording) {
  const resolved = resolvePresentationTimeline(ms, segmentMs, 0);
  if (resolved.kind !== "step") return null;
  const { step, stepElapsed } = resolved;
  const phase = resolveFanPhase(step, stepElapsed, "wedding_default", 1);
  const face = getPresentationFace(step);
  const motion = runWithFanMotionExportRecording(exportRecording, () =>
    sampleFanCubeMotion(step, stepElapsed, face, N, SEED, "auto", "wedding_default", 1, FX, exportRecording)
  );
  const q = new THREE.Quaternion().setFromEuler(motion.rotation);
  return { ms, step, phase: phase.phase, phaseU: phase.phaseU, q, scale: motion.presentationScale };
}

function analyze(exportRecording) {
  const frames = [];
  for (let ms = 0; ms <= 59100; ms += FRAME_MS) {
    const s = sampleAt(ms, exportRecording);
    if (s) frames.push(s);
  }

  const reversals = [];
  const boundarySnaps = [];
  let prevDq = null;

  for (let i = 1; i < frames.length; i += 1) {
    const a = frames[i - 1];
    const b = frames[i];
    const dq = new THREE.Quaternion().copy(a.q).invert().multiply(b.q);
    const angle = 2 * Math.acos(Math.min(1, Math.abs(dq.w))) * (180 / Math.PI);
    const dot = prevDq ? dq.x * prevDq.x + dq.y * prevDq.y + dq.z * prevDq.z + dq.w * prevDq.w : 1;
    if (prevDq && dot < 0 && angle > 0.4) {
      reversals.push({
        ms: Math.round(b.ms),
        step: b.step,
        phase: b.phase,
        angle: +angle.toFixed(3),
      });
    }
    prevDq = dq;

    if (a.phase !== b.phase && angle > 2) {
      boundarySnaps.push({
        ms: Math.round(b.ms),
        from: a.phase,
        to: b.phase,
        angle: +angle.toFixed(2),
        scale: +b.scale.toFixed(3),
      });
    }
  }

  // Gated rev monotonicity check
  let revBacksteps = 0;
  let prevRevs = -1;
  for (const f of frames) {
    const resolved = resolvePresentationTimeline(f.ms, segmentMs, 0);
    if (resolved.kind !== "step") continue;
    const r = getScaleGatedRevsWithinStep(
      resolved.stepElapsed,
      resolved.step,
      1,
      "wedding_default",
      "yaw_cw",
      FX
    );
    if (r < prevRevs - 1e-6) revBacksteps += 1;
    prevRevs = r;
  }

  return {
    label: exportRecording ? "export" : "preview",
    reversals: reversals.length,
    revBacksteps,
    topReversals: reversals.slice(0, 10),
    boundarySnaps,
  };
}

for (const exp of [false, true]) {
  const r = analyze(exp);
  console.log(`\n=== ${r.label} ===`);
  console.log(`quat direction reversals: ${r.reversals}`);
  console.log(`gated-rev backsteps: ${r.revBacksteps}`);
  if (r.topReversals.length) console.log("reversals:", r.topReversals);
  console.log("phase boundary snaps:");
  for (const s of r.boundarySnaps) {
    console.log(`  ${s.ms}ms ${s.from}→${s.to} ${s.angle}° scale=${s.scale}`);
  }
}
