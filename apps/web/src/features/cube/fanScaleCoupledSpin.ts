import type { CubeShowcaseFxOptions } from "@mbox/shared";
import { fanApproachEase } from "./fanPerspective";
import {
  FAN_SCALE_FAR,
  FAN_SCALE_PEAK,
  FAN_SCALE_RETREAT,
} from "./fanTiming";

const INTEGRATION_SLICES = 32;

/** Integer revs — whoosh keeps extra spin vs {@link FAN_APPROACH_REVS} without settle correction. */
export const FAN_WHOOSH_APPROACH_REVS = 3;
export const FAN_WHOOSH_RETREAT_REVS = 1.52;
/** Sustained yaw through handoff while cube stays small at the back. */
export const FAN_WHOOSH_HANDOFF_SPIN_REVS = 0.52;

import { retreatScaleEase } from "./fanTransform";

export function sampleApproachPresentationScale(phaseU: number): number {
  const ease = fanApproachEase(phaseU);
  return FAN_SCALE_FAR + (FAN_SCALE_PEAK - FAN_SCALE_FAR) * ease;
}

export function sampleRetreatPresentationScale(phaseU: number): number {
  const ease = retreatScaleEase(phaseU);
  return FAN_SCALE_PEAK + (FAN_SCALE_RETREAT - FAN_SCALE_PEAK) * ease;
}

export function sampleHandoffPresentationScale(): number {
  return FAN_SCALE_RETREAT;
}

function clampPhaseU(phaseU: number): number {
  return Math.min(1, Math.max(0, phaseU));
}

function scaleDerivative(sampleScale: (u: number) => number, phaseU: number): number {
  const u = clampPhaseU(phaseU);
  const eps = 1e-4;
  const u0 = Math.max(0, u - eps);
  const u1 = Math.min(1, u + eps);
  return (sampleScale(u1) - sampleScale(u0)) / Math.max(u1 - u0, 1e-6);
}

/**
 * Instantaneous spin tempo from presentation scale + its derivative (same zoom curves).
 * Small / fast-shrinking → fast; hero peak → slow (ω→0 when dS/du→0).
 */
export function presentationSpinRateMul(
  sampleScale: (u: number) => number,
  phaseU: number,
  phase: "approach" | "retreat" | "handoff"
): number {
  const u = clampPhaseU(phaseU);
  const scale = Math.max(sampleScale(u), 0.08);
  const dSdu = scaleDerivative(sampleScale, u);
  const sizeBias = (FAN_SCALE_FAR / scale) ** 2.6;
  const motionBias = 0.18 + 0.82 * Math.abs(dSdu) / Math.max(FAN_SCALE_PEAK - FAN_SCALE_FAR, 1e-6);
  const retreatAccel = phase === "retreat" ? 0.28 + 0.72 * u * u : 1;
  const approachBias = phase === "approach" ? 0.75 + 0.25 * (1 - u) : 1;
  const handoffBoost = phase === "handoff" ? 1.55 : 1;
  return Math.max(0.08, sizeBias * motionBias * retreatAccel * approachBias * handoffBoost);
}

function integrateWeightedRate(
  sampleScale: (u: number) => number,
  phase: "approach" | "retreat" | "handoff",
  uStart: number,
  uEnd: number
): number {
  if (uEnd <= uStart) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < INTEGRATION_SLICES; i += 1) {
    const t0 = uStart + (i / INTEGRATION_SLICES) * (uEnd - uStart);
    const t1 = uStart + ((i + 1) / INTEGRATION_SLICES) * (uEnd - uStart);
    const midU = (t0 + t1) * 0.5;
    sum += (t1 - t0) * presentationSpinRateMul(sampleScale, midU, phase);
  }
  return sum;
}

/** Normalized yaw progress 0→1 for a phase, weighted by presentation scale velocity. */
export function integratePresentationSpinProgress(
  sampleScale: (u: number) => number,
  phase: "approach" | "retreat" | "handoff",
  phaseU: number
): number {
  const u = clampPhaseU(phaseU);
  if (u <= 0) {
    return 0;
  }
  const denom = integrateWeightedRate(sampleScale, phase, 0, 1);
  if (denom <= 1e-9) {
    return u;
  }
  return integrateWeightedRate(sampleScale, phase, 0, u) / denom;
}

/** Wall-clock ms scaled so tumble tempo tracks presentation zoom (whoosh when small). */
export function scaleCoupledMotionElapsed(
  phaseElapsedMs: number,
  phaseDurationMs: number,
  sampleScale: (u: number) => number,
  phase: "approach" | "retreat" | "handoff"
): number {
  if (phaseDurationMs <= 0 || phaseElapsedMs <= 0) {
    return 0;
  }
  const sliceMs = phaseDurationMs / INTEGRATION_SLICES;
  let weightedMs = 0;
  for (let i = 0; i < INTEGRATION_SLICES; i += 1) {
    const t0 = i * sliceMs;
    const t1 = Math.min(phaseElapsedMs, (i + 1) * sliceMs);
    if (t1 <= t0) {
      break;
    }
    const midU = ((t0 + t1) * 0.5) / phaseDurationMs;
    weightedMs += (t1 - t0) * presentationSpinRateMul(sampleScale, midU, phase);
  }
  return weightedMs;
}

export function shouldScaleCoupleSpin(fx?: Partial<CubeShowcaseFxOptions> | null): boolean {
  return !!(fx?.cubeScaleCoupledSpinEnabled && fx?.cubeShowcaseZoomEnabled);
}

/** @deprecated Use presentationSpinRateMul */
export function scaleCoupledSpinRateMul(scale: number): number {
  const s = Math.max(scale, 0.08);
  const ratio = FAN_SCALE_FAR / s;
  return ratio * ratio;
}

/** @deprecated Use integratePresentationSpinProgress */
export function integrateScaleCoupledSpinProgress(
  sampleScale: (u: number) => number,
  phaseU: number
): number {
  return integratePresentationSpinProgress(sampleScale, "approach", phaseU);
}
