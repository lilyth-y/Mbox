import * as THREE from "three";
import type { CubeShowcaseFxOptions } from "@mbox/shared";
import type { CubeRotationMode } from "./cubeTransitionRotation";
import {
  sampleApproachPresentationScale,
  sampleRetreatPresentationScale,
} from "./fanScaleCoupledSpin";
import { resolveFanMotionScale } from "./fanShowcaseFx";
import { getRevsWithinStep, rotationMotionGate } from "./fanTransform";
import type { FanTimelineProfile, FanPhase } from "./fanTiming";
import { resolveFanPhase, FAN_SCALE_RETREAT } from "./fanTiming";

/** Fixed integration step — adaptive slice count caused rev backsteps (visible stutter). */
const GATED_REV_INTEGRATION_MS = 25;

/** Match `createCubeRecordingVideoStream` default — export motion uses a fixed clock. */
export const CUBE_EXPORT_RECORD_FPS = 30;

/**
 * MP4 transit tumble (pitch/roll). Showcase hold locks to face-forward — no world-Y spin pattern.
 */
export const EXPORT_MOTION_TUMBLE_INTENSITY = 0.44;

/** Set during `sampleFanCubeMotion(..., exportRecording)` — tumble + settle, not yo-yo yaw. */
let fanMotionExportRecording = false;

export function isFanMotionExportRecording(): boolean {
  return fanMotionExportRecording;
}

/** @deprecated Use isFanMotionExportRecording */
export function isFanMotionExportMonotonic(): boolean {
  return fanMotionExportRecording;
}

export function runWithFanMotionExportRecording<T>(active: boolean, fn: () => T): T {
  const prev = fanMotionExportRecording;
  fanMotionExportRecording = active;
  try {
    return fn();
  } finally {
    fanMotionExportRecording = prev;
  }
}

/** @deprecated Use runWithFanMotionExportRecording */
export function runWithFanMotionExportMonotonic<T>(active: boolean, fn: () => T): T {
  return runWithFanMotionExportRecording(active, fn);
}

/** Presentation scale for export yaw/tumble gating at `stepElapsedMs`. */
export function exportPresentationScaleAtStepElapsed(
  step: number,
  stepElapsedMs: number,
  profile: FanTimelineProfile = "wedding_default",
  speedMul: number = 1
): number {
  const state = resolveFanPhase(step, stepElapsedMs, profile, speedMul);
  return resolveFanMotionScale(state.phase, state.phaseU);
}

/**
 * Integrate timeline yaw with rotationMotionGate — ω→0 only inside hero peak band.
 */
export function getScaleGatedRevsWithinStep(
  stepElapsedMs: number,
  step: number,
  speedMul: number,
  profile: FanTimelineProfile,
  rotationMode: CubeRotationMode,
  fx: CubeShowcaseFxOptions
): number {
  const tMax = Math.max(0, stepElapsedMs);
  if (tMax <= 0) {
    return 0;
  }

  let acc = 0;
  let prevT = 0;
  let prevR = 0;

  const integrateTo = (t1: number) => {
    const r1 = getRevsWithinStep(t1, step, speedMul, profile, rotationMode, fx);
    const midT = (prevT + t1) * 0.5;
    const phaseState = resolveFanPhase(step, midT, profile, speedMul);
    const scale = resolveFanMotionScale(phaseState.phase, phaseState.phaseU);
    const gate = rotationMotionGate(scale, phaseState.phase, phaseState.phaseU);
    acc += (r1 - prevR) * gate;
    prevR = r1;
    prevT = t1;
  };

  let t = GATED_REV_INTEGRATION_MS;
  while (t < tMax) {
    integrateTo(t);
    t += GATED_REV_INTEGRATION_MS;
  }
  integrateTo(tMax);
  return acc;
}

/** @deprecated Use {@link getScaleGatedRevsWithinStep} */
export function getExportGatedRevsWithinStep(
  stepElapsedMs: number,
  step: number,
  speedMul: number,
  profile: FanTimelineProfile,
  rotationMode: CubeRotationMode,
  fx: CubeShowcaseFxOptions
): number {
  return getScaleGatedRevsWithinStep(
    stepElapsedMs,
    step,
    speedMul,
    profile,
    resolveExportRotationMode(rotationMode),
    fx
  );
}

/**
 * Tumble strength during approach / retreat / handoff.
 * Fades only at hero peak scale — not on phase-U or align plateaus.
 */
export function exportTransitTumbleIntensity(
  phase: FanPhase,
  phaseU: number,
  presentationScale?: number
): number {
  const u = Math.min(1, Math.max(0, phaseU));
  const scale =
    presentationScale ??
    (phase === "approach"
      ? sampleApproachPresentationScale(u)
      : phase === "retreat"
        ? sampleRetreatPresentationScale(u)
        : FAN_SCALE_RETREAT);
  const gate = rotationMotionGate(scale, phase, u);
  if (phase === "showcase_hold") {
    return 0;
  }
  if (phase === "approach") {
    return EXPORT_MOTION_TUMBLE_INTENSITY * gate * (0.4 + 0.6 * (1 - u));
  }
  if (phase === "retreat") {
    return EXPORT_MOTION_TUMBLE_INTENSITY * gate * (0.55 + 0.45 * u);
  }
  if (phase === "handoff") {
    return EXPORT_MOTION_TUMBLE_INTENSITY * gate * (1 - u) * 0.65;
  }
  return 0;
}

/** Retreat→handoff export tumble crossfade (single source for zoom + in-place). */
export function resolveExportHandoffTumbleIntensity(
  phaseU: number,
  motionScale: number
): number {
  const retreatEndScale = sampleRetreatPresentationScale(1);
  const tumbleScale = phaseU < 0.06 ? retreatEndScale : motionScale;
  const handoffTi = exportTransitTumbleIntensity("handoff", phaseU, tumbleScale);
  const retreatEndTi = exportTransitTumbleIntensity("retreat", 1, retreatEndScale);
  if (phaseU < 0.12) {
    return THREE.MathUtils.lerp(retreatEndTi, handoffTi, phaseU / 0.12);
  }
  return handoffTi;
}

/** Fixed-frame timeline — decouples export motion from rAF stalls (`finish()` etc.). */
export function resolveExportMotionElapsedMs(
  frameIndex: number,
  contentDurationMs: number,
  fps: number = CUBE_EXPORT_RECORD_FPS
): number {
  const elapsed = (frameIndex * 1000) / Math.max(fps, 1);
  return Math.min(Math.max(0, elapsed), contentDurationMs);
}

/** Export: auto/mixed → monotonic yaw_cw; yaw gated by peak scale (see getScaleGatedRevsWithinStep). */
export function resolveExportRotationMode(mode: CubeRotationMode): CubeRotationMode {
  if (mode === "yaw_ccw" || mode === "yaw_cw") {
    return mode;
  }
  return "yaw_cw";
}
