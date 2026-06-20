/**
 * Probe "scene transition" perception signals:
 * - rotation (Δθ, ω)
 * - presentationScale
 * - cameraZ / fov
 * - textureStep (deferred texture during approach when zoomEnabled)
 *
 *   npx tsx scripts/probe-transition-perception.mjs
 */
import * as THREE from "three";
import { resolveCubeShowcaseFx, DEFAULT_CUBE_SHOWCASE_FX } from "../packages/shared/src/cubeShowcaseFx.ts";
import { resolvePresentationTimeline } from "../apps/web/src/features/cube/cubeMotionVariety.ts";
import { computePresentationFrame, computePresentationLoopBridgeFrame } from "../apps/web/src/features/cube/presentationFrame.ts";
import { resolveFanPhase, getFanStepSegmentMs } from "../apps/web/src/features/cube/fanTiming.ts";
import { getPresentationFace, ZOOM_MS, PARALLAX_MS } from "../apps/web/src/features/cube/cubeSequence.ts";
import { resolveCubeFocusTextureStep } from "../apps/web/src/features/cube/cubeFocusMotionApply.ts";
import { sumSegmentDurations, getStepPhaseTiming } from "../apps/web/src/features/cube/cubeMotionVariety.ts";

function angleDegEuler(a, b) {
  const qa = new THREE.Quaternion().setFromEuler(a).normalize();
  const qb = new THREE.Quaternion().setFromEuler(b).normalize();
  const dot = Math.abs(qa.dot(qb));
  return (2 * Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI;
}

function omegaDegPerSec(a, b, dtMs) {
  return (angleDegEuler(a, b) / Math.max(dtMs, 1e-6)) * 1000;
}

const EFFECT = "cube_focus";
const PROFILE = "wedding_default";
const SPEED = 1;
const MOTION_SEED = 42;
const ROTATION_MODE = "auto";

// Simulate the FX mix you were using when issues were noticed.
const fx = resolveCubeShowcaseFx({
  ...DEFAULT_CUBE_SHOWCASE_FX,
  cubeShowcaseZoomEnabled: true,
  cubeComplexRotationEnabled: true,
  cubeScaleCoupledSpinEnabled: true,
  cubeSubjectPullEnabled: true,
});

const presentationCount = 6;
const segmentMsByStep = Array.from({ length: presentationCount }, (_, step) =>
  getFanStepSegmentMs(step, PROFILE, SPEED)
);
const contentMs = sumSegmentDurations(segmentMsByStep);
const loopBridgeMs = 1200;

function frameAt(resolved) {
  if (resolved.kind === "loop_bridge") {
    return computePresentationLoopBridgeFrame(
      EFFECT,
      resolved.bridgeElapsed,
      loopBridgeMs,
      resolved.lastStep,
      {
        cubeRotationMode: ROTATION_MODE,
        motionSeed: MOTION_SEED,
        fanTimelineProfile: PROFILE,
        fanSpeed: SPEED,
        cubeShowcaseFx: fx,
      }
    );
  }

  const { step, stepElapsed } = resolved;
  const currentFace = getPresentationFace(step);
  const timing = getStepPhaseTiming(
    MOTION_SEED,
    step,
    ZOOM_MS,
    PARALLAX_MS,
    EFFECT,
    presentationCount,
    PROFILE,
    SPEED
  );
  return computePresentationFrame(EFFECT, step, stepElapsed, presentationCount, currentFace, {
    timing,
    cubeRotationMode: ROTATION_MODE,
    exportRecording: false,
    motionSeed: MOTION_SEED,
    fanTimelineProfile: PROFILE,
    fanSpeed: SPEED,
    cubeShowcaseFx: fx,
  });
}

function textureStepAt(resolved) {
  if (resolved.kind === "loop_bridge") {
    // mirror CubeView loop_bridge texture logic
    return loopBridgeMs > 0 && resolved.bridgeElapsed >= loopBridgeMs * 0.82 ? 0 : resolved.lastStep;
  }
  const { step, stepElapsed } = resolved;
  const fanPhase = resolveFanPhase(step, stepElapsed, PROFILE, SPEED);
  return resolveCubeFocusTextureStep(EFFECT, false, fanPhase, step, fx.cubeShowcaseZoomEnabled);
}

function probeWindow(label, centerMs) {
  const dt = 16;
  const offsets = [-64, -48, -32, -16, 0, 16, 32, 48, 64];
  console.log(`\n=== ${label} @ t=${centerMs.toFixed(0)}ms ===`);
  let prev = null;
  let prevMs = null;
  for (const off of offsets) {
    const t = centerMs + off;
    const resolved = resolvePresentationTimeline(t, segmentMsByStep, loopBridgeMs);
    const frame = frameAt(resolved);
    const texStep = textureStepAt(resolved);
    const rot = frame.fanRootMotion?.rotation ?? new THREE.Euler();
    const scale = frame.fanRootMotion?.presentationScale ?? 1;
    const camZ = frame.cameraZ ?? 0;
    const fov = frame.fieldOfView ?? 0;
    let w = 0;
    if (prev) {
      w = omegaDegPerSec(prev.rot, rot, t - prevMs);
    }
    console.log(
      `t=${t.toFixed(0).padStart(6)} kind=${resolved.kind.padEnd(10)} ` +
        (resolved.kind === "step"
          ? `step=${String(resolved.step).padStart(2)} el=${resolved.stepElapsed.toFixed(0).padStart(5)} `
          : `last=${String(resolved.lastStep).padStart(2)} bel=${resolved.bridgeElapsed.toFixed(0).padStart(5)} `) +
        `tex=${String(texStep).padStart(2)} scale=${scale.toFixed(3)} camZ=${camZ.toFixed(3)} fov=${fov.toFixed(1)} ω≈${w.toFixed(1)}°/s`
    );
    prev = { rot };
    prevMs = t;
  }
}

function probeApproachTexture(step) {
  const samples = [0, 50, 100, 200, 300, 400, 500, 650];
  console.log(`\n=== texture deferral during step ${step} approach ===`);
  for (const el of samples) {
    const resolved = { kind: "step", step, stepElapsed: el };
    const tex = textureStepAt(resolved);
    const phase = resolveFanPhase(step, el, PROFILE, SPEED);
    console.log(
      `el=${String(el).padStart(4)}ms  phase=${phase.phase} u=${phase.phaseU.toFixed(3)}  tex=${tex}`
    );
  }
}

// probe: step seams and loop wrap
let acc = 0;
for (let step = 0; step < presentationCount; step += 1) {
  const end = acc + segmentMsByStep[step] - 1;
  if (step + 1 < presentationCount) {
    probeWindow(`step ${step}→${step + 1} seam`, end);
  } else {
    probeWindow(`last step→loop_bridge entry`, end);
    probeWindow(`loop_bridge→step0 wrap`, contentMs + loopBridgeMs - 1);
  }
  acc += segmentMsByStep[step];
}

// specifically check whether texture switches during approach (prevents "teleport" pop at showcase)
for (let step = 1; step < presentationCount; step += 1) {
  probeApproachTexture(step);
}

