import {
  applyJewelCubeCompoundSpinStep,
  applyJewelCubeSpinStep,
  type CompoundSpinAxisWeights,
} from "./physicsHelpers";
import type { PresentationSpinDirection } from "./showcasePresentationPreferences";
import type { ShowcaseStageContext } from "./types";

/** Max angular acceleration (rad/s²) — bridges stage boundaries without snaps. */
export const SHOWCASE_SPIN_MAX_ACCEL_RAD_S2 = 12;

export function approachSpinOmega(
  current: number,
  target: number,
  dtMs: number,
  maxAccel = SHOWCASE_SPIN_MAX_ACCEL_RAD_S2
): number {
  if (dtMs <= 0) {
    return current;
  }
  const maxDelta = maxAccel * (dtMs * 0.001);
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) {
    return target;
  }
  return current + Math.sign(delta) * maxDelta;
}

export function presentationDirectionAllowsPitch(
  direction: PresentationSpinDirection
): boolean {
  return direction === "up" || direction === "down";
}

export function presentationSpinAllowsTilt(ctx: ShowcaseStageContext): boolean {
  const prefs = ctx.presentationPrefs;
  if (prefs.variableSpinEnabled && prefs.variableSpinMode === "compound") {
    return true;
  }
  return presentationDirectionAllowsPitch(ctx.spinDirection);
}

/** Deterministic axis mix per loop — Y spin sign + pitch wobble sign (no roll). */
export function resolveCompoundSpinAxisWeights(
  presentationCycle: number
): CompoundSpinAxisWeights {
  const seed = presentationCycle * 2.399963 + 0.173;
  const ySign = Math.sin(seed * 1.9) >= 0 ? 1 : -1;
  const xSign = Math.sin(seed * 3.1 + 0.7) >= 0 ? 1 : -1;
  return { x: xSign, y: ySign, z: 0 };
}

/** Apply spin with inertia — preserves ω magnitude across stage enters. */
export function applySmoothedPresentationSpin(
  ctx: ShowcaseStageContext,
  dtMs: number,
  targetSpeed: number,
  pitchWobbleScale = 1
): void {
  if (!ctx.rig) {
    return;
  }
  const targetMag = Math.abs(targetSpeed);
  const next = approachSpinOmega(Math.abs(ctx.spinOmegaY), targetMag, dtMs);
  ctx.spinOmegaY = next;

  if (targetMag < 1e-5) {
    return;
  }

  if (next < 1e-6) {
    return;
  }

  const wobbleScale = ctx.exportRecording ? 0 : (pitchWobbleScale ?? 1);

  const prefs = ctx.presentationPrefs;
  if (prefs.variableSpinEnabled && prefs.variableSpinMode === "compound") {
    const weights = resolveCompoundSpinAxisWeights(ctx.presentationCycle);
    applyJewelCubeCompoundSpinStep(
      ctx.rig,
      next,
      weights,
      ctx.presentationCycle,
      ctx.totalElapsedMs,
      dtMs,
      wobbleScale
    );
    return;
  }

  applyJewelCubeSpinStep(ctx.rig, ctx.spinDirection, next, dtMs, wobbleScale);
}
