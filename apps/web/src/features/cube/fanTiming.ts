// FanPhaseState is defined below

export const FAN_APPROACH_MS = 3_400;
export const FAN_OPENING_HOLD_MS = 2_000;
/** Peak hold — VoluMax parallax + face-forward settle. */
export const FAN_SHOWCASE_HOLD_MS = 2_000;
/** Slightly longer retreat for smoother pull-back (spin/scale stay unhurried). */
export const FAN_RETREAT_MS = 3_000;
export const FAN_GAP_MS = 1_450;
export const FAN_LOOP_BRIDGE_MS = 1_450;
/** Showcase→retreat motion lead (scale + yaw timeline overlap). */
export const FAN_SHOWCASE_RETREAT_CROSSFADE_MS = 420;

export const FAN_SCALE_FAR = 0.42;
export const FAN_SCALE_PEAK = 1.28;
export const FAN_SCALE_RETREAT = 0.42;

import { CUBE_PARALLAX_PEAK_MAX } from "@mbox/shared";

/** Peak parallax drive during showcase hold (framework cap). */
export const FAN_PARALLAX_PEAK = CUBE_PARALLAX_PEAK_MAX;

export type FanTimelineProfile = "wedding_default" | "entrance_processional";

export interface FanTimelineProfileConfig {
  retreatSpinMax: number;
  handoffSpinIntensity: number;
  retreatMs: number;
}

export const FAN_PROFILE_CONFIG: Record<FanTimelineProfile, FanTimelineProfileConfig> = {
  wedding_default: {
    retreatSpinMax: 0.38,
    handoffSpinIntensity: 0.022,
    retreatMs: FAN_RETREAT_MS,
  },
  entrance_processional: {
    retreatSpinMax: 0.28,
    handoffSpinIntensity: 0.018,
    retreatMs: 3_600,
  },
};

export const ENTRANCE_STEP0_APPROACH_MS = 2_500;
export const ENTRANCE_STEP0_SHOWCASE_HOLD_MS = 4_800;
export const ENTRANCE_STEP0_PARALLAX_PEAK = 0.38;

export type FanPhase = "approach" | "showcase_hold" | "retreat" | "handoff";

export interface FanPhaseState {
  phase: FanPhase;
  phaseElapsed: number;
  phaseDuration: number;
  phaseU: number;
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export function easeInOutSine(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return (-(Math.cos(Math.PI * x) - 1)) / 2;
}

export function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

export function easeInQuart(t: number): number {
  return t * t * t * t;
}

/** Fast finish — “whoosh” pull-in (u→1). */
export function easeOutExpo(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

/** Fast start — push away (u→1). */
export function easeInExpo(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x <= 0 ? 0 : Math.pow(2, 10 * (x - 1));
}

export function getFanApproachMs(
  step: number,
  profile: FanTimelineProfile = "wedding_default"
): number {
  if (profile === "entrance_processional" && step === 0) {
    return ENTRANCE_STEP0_APPROACH_MS;
  }
  return FAN_APPROACH_MS;
}

export function getFanShowcaseHoldMs(
  step: number,
  profile: FanTimelineProfile = "wedding_default"
): number {
  if (profile === "entrance_processional" && step === 0) {
    return ENTRANCE_STEP0_SHOWCASE_HOLD_MS;
  }
  return step === 0 ? FAN_OPENING_HOLD_MS : FAN_SHOWCASE_HOLD_MS;
}

export function getFanParallaxPeak(
  step: number,
  profile: FanTimelineProfile = "wedding_default"
): number {
  if (profile === "entrance_processional") {
    if (step === 0) {
      return ENTRANCE_STEP0_PARALLAX_PEAK;
    }
    return ENTRANCE_STEP0_PARALLAX_PEAK * 0.6;
  }
  return FAN_PARALLAX_PEAK;
}

export function getFanOpeningHoldMs(step: number): number {
  return getFanShowcaseHoldMs(step);
}

export function getFanRetreatMs(profile: FanTimelineProfile = "wedding_default"): number {
  return FAN_PROFILE_CONFIG[profile].retreatMs;
}

export function getFanStepSegmentMs(
  step: number,
  profile: FanTimelineProfile = "wedding_default",
  speedMul: number = 1
): number {
  const mul = Math.max(0.35, Math.min(2.5, speedMul));
  return (
    getFanApproachMs(step, profile) +
    getFanShowcaseHoldMs(step, profile) +
    getFanRetreatMs(profile) +
    FAN_GAP_MS
  ) / mul;
}

export function resolveFanPhase(
  step: number,
  stepElapsed: number,
  profile: FanTimelineProfile = "wedding_default",
  speedMul: number = 1
): FanPhaseState {
  const mul = Math.max(0.35, Math.min(2.5, speedMul));
  const approachMs = getFanApproachMs(step, profile) / mul;
  const retreatMs = getFanRetreatMs(profile) / mul;
  const showcaseHold = getFanShowcaseHoldMs(step, profile) / mul;
  const gapMs = FAN_GAP_MS / mul;
  let t = stepElapsed;

  if (t < approachMs) {
    return {
      phase: "approach",
      phaseElapsed: t,
      phaseDuration: approachMs,
      phaseU: t / approachMs,
    };
  }
  t -= approachMs;

  if (t < showcaseHold) {
    return {
      phase: "showcase_hold",
      phaseElapsed: t,
      phaseDuration: showcaseHold,
      phaseU: t / showcaseHold,
    };
  }
  t -= showcaseHold;

  if (t < retreatMs) {
    return {
      phase: "retreat",
      phaseElapsed: t,
      phaseDuration: retreatMs,
      phaseU: t / retreatMs,
    };
  }
  t -= retreatMs;

  return {
    phase: "handoff",
    phaseElapsed: t,
    phaseDuration: gapMs,
    phaseU: Math.min(1, Math.max(0, t / gapMs)),
  };
}
