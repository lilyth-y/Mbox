import * as THREE from "three";
import type { CubeShowcaseFxOptions } from "@mbox/shared";
import { CubeRotationMode } from "./cubeTransitionRotation";
import {
  FAN_GAP_MS,
  type FanTimelineProfile,
  getFanApproachMs,
  getFanRetreatMs,
  getFanShowcaseHoldMs,
} from "./fanTiming";
import { fanSpinEuler, resolveSpinYawSign } from "./fanTransform";
import {
  getScaleGatedRevsWithinStep,
  isFanMotionExportRecording,
  resolveExportRotationMode,
} from "./fanExportRotation";
import { fanAxisTumble } from "./fanAxisWander";
import { fanSpeedMul, fanSmootherstep01 } from "./fanEase";

export { fanSpeedMul, fanSmootherstep, fanSmootherstep01 } from "./fanEase";

export function getStepPhaseBoundaryMs(
  step: number,
  profile: FanTimelineProfile,
  speedMul: number
): {
  approachMs: number;
  showcaseMs: number;
  retreatMs: number;
  gapMs: number;
  showcaseEndMs: number;
  retreatEndMs: number;
  stepEndMs: number;
} {
  const mul = fanSpeedMul(speedMul);
  const approachMs = getFanApproachMs(step, profile) / mul;
  const showcaseMs = getFanShowcaseHoldMs(step, profile) / mul;
  const retreatMs = getFanRetreatMs(profile) / mul;
  const gapMs = FAN_GAP_MS / mul;
  return {
    approachMs,
    showcaseMs,
    retreatMs,
    gapMs,
    showcaseEndMs: approachMs + showcaseMs,
    retreatEndMs: approachMs + showcaseMs + retreatMs,
    stepEndMs: approachMs + showcaseMs + retreatMs + gapMs,
  };
}

export function tumbleUsesWobble(fx: CubeShowcaseFxOptions): boolean {
  return fx.cubeComplexRotationEnabled;
}

export function resolvePreviewTumbleIntensity(fx: CubeShowcaseFxOptions): number {
  return fx.cubeComplexRotationEnabled ? fx.cubeComplexRotationIntensity : 0;
}

export function applyAxisTumble(
  base: THREE.Euler,
  step: number,
  phaseElapsedMs: number,
  motionSeed: number,
  intensity: number,
  fx: CubeShowcaseFxOptions
): THREE.Euler {
  return fanAxisTumble(base, step, phaseElapsedMs, motionSeed, intensity, {
    wobble: tumbleUsesWobble(fx),
  });
}

/** Scale-gated timeline yaw revs (preview + export). */
export function getGatedRevsWithinStep(
  stepElapsedMs: number,
  step: number,
  speedMul: number,
  profile: FanTimelineProfile,
  rotationMode: CubeRotationMode,
  fx: CubeShowcaseFxOptions
): number {
  const mode = isFanMotionExportRecording()
    ? resolveExportRotationMode(rotationMode)
    : rotationMode;
  return getScaleGatedRevsWithinStep(
    stepElapsedMs,
    step,
    speedMul,
    profile,
    mode,
    fx
  );
}

/** Layer 2 — full-step world-Y yaw on a base orientation. */
export function applyTimelineYaw(
  base: THREE.Euler,
  step: number,
  stepElapsedMs: number,
  motionSeed: number,
  rotationMode: CubeRotationMode,
  speedMul: number,
  profile: FanTimelineProfile,
  fx: CubeShowcaseFxOptions,
  revScale = 1
): THREE.Euler {
  const entranceYaw =
    profile === "entrance_processional" &&
    (rotationMode === "yaw_cw" || rotationMode === "yaw_ccw");
  const yawSign = resolveSpinYawSign(rotationMode, step);
  const revs =
    getGatedRevsWithinStep(
      stepElapsedMs,
      step,
      speedMul,
      profile,
      rotationMode,
      fx
    ) * Math.max(0, Math.min(1, revScale));
  const spin = entranceYaw ? revs * yawSign : revs;
  return fanSpinEuler(motionSeed, step, base, spin);
}

/** Layer 2 — yaw delta after showcase freeze (retreat / handoff only). */
export function applyTimelineYawAfterShowcase(
  base: THREE.Euler,
  step: number,
  stepElapsedMs: number,
  showcaseEndMs: number,
  motionSeed: number,
  rotationMode: CubeRotationMode,
  speedMul: number,
  profile: FanTimelineProfile,
  fx: CubeShowcaseFxOptions
): THREE.Euler {
  const entranceYaw =
    profile === "entrance_processional" &&
    (rotationMode === "yaw_cw" || rotationMode === "yaw_ccw");
  const yawSign = resolveSpinYawSign(rotationMode, step);
  const revsAtShowcase = getGatedRevsWithinStep(
    showcaseEndMs,
    step,
    speedMul,
    profile,
    rotationMode,
    fx
  );
  const revsNow = getGatedRevsWithinStep(
    stepElapsedMs,
    step,
    speedMul,
    profile,
    rotationMode,
    fx
  );
  // Retreat/handoff starts immediately after a 2s showcase hold (ω=0). A hard jump from
  // 0→full backspin on the very first retreat frame reads as a discontinuity in preview.
  // Soft-start the yaw delta over a short window (scaled by speedMul) so ω ramps smoothly.
  const elapsedAfterShowcase = Math.max(0, stepElapsedMs - showcaseEndMs);
  const mul = fanSpeedMul(speedMul);
  const softStartMs = 220 / mul; // one-variable knob: higher = gentler retreat start
  const softT = fanSmootherstep01(
    Math.min(1, elapsedAfterShowcase / Math.max(softStartMs, 1))
  );
  const deltaRevs = (revsNow - revsAtShowcase) * softT;
  const spin = entranceYaw ? deltaRevs * yawSign : deltaRevs;
  return fanSpinEuler(motionSeed, step, base, spin);
}
