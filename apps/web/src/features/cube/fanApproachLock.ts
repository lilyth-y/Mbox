import type { CubeShowcaseFxOptions } from "@mbox/shared";
import { fanApproachEase } from "./fanPerspective";
import {
  presentationSpinRateMul,
  sampleApproachPresentationScale,
  shouldScaleCoupleSpin,
} from "./fanScaleCoupledSpin";

const WANDER_SLOWDOWN_SAMPLES = 14;

/** 1 while far/small; falls as the cube pulls in (가까울수록 천천히). */
export function approachSpinRateMul(phaseU: number): number {
  const pull = fanApproachEase(phaseU);
  return Math.max(0.1, 1 - 0.9 * pull);
}

function wanderRateMul(phaseU: number, fx?: CubeShowcaseFxOptions): number {
  if (shouldScaleCoupleSpin(fx)) {
    return presentationSpinRateMul(sampleApproachPresentationScale, phaseU, "approach");
  }
  return approachSpinRateMul(phaseU);
}

/** Integrates proximity slowdown so wander spin decelerates smoothly, not stepwise. */
export function approachWanderEffectiveMs(
  phaseElapsedMs: number,
  phaseDurationMs: number,
  fx?: CubeShowcaseFxOptions
): number {
  if (phaseDurationMs <= 0 || phaseElapsedMs <= 0) {
    return 0;
  }
  const sliceMs = phaseDurationMs / WANDER_SLOWDOWN_SAMPLES;
  let weightedMs = 0;
  for (let i = 0; i < WANDER_SLOWDOWN_SAMPLES; i += 1) {
    const t0 = i * sliceMs;
    const t1 = Math.min(phaseElapsedMs, (i + 1) * sliceMs);
    if (t1 <= t0) {
      break;
    }
    const midU = ((t0 + t1) * 0.5) / phaseDurationMs;
    weightedMs += (t1 - t0) * wanderRateMul(midU, fx);
  }
  return weightedMs;
}

/** Spin amplitude → 0 at approach end — long tail so tumble eases before hero peak. */
export function approachSpinEnvelope(phaseU: number): number {
  const u = Math.min(1, Math.max(0, phaseU));
  const c = Math.cos((u * Math.PI) / 2);
  const base = c * c;
  const tail = 1 - u * u * u;
  const lateKill = u > 0.68 ? Math.pow(1 - (u - 0.68) / 0.32, 2.2) : 1;
  return base * tail * lateKill;
}
