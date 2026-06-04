import { FanPhaseState } from "./cubeSequence"; // wait, let's keep FanPhaseState here.

export const FAN_APPROACH_MS = 2_400;
export const FAN_OPENING_HOLD_MS = 1_200;
export const FAN_SHOWCASE_HOLD_MS = 900;
export const FAN_RETREAT_MS = 2_000;
export const FAN_GAP_MS = 1_600;
export const FAN_LOOP_BRIDGE_MS = 1_100;

export const FAN_SCALE_FAR = 0.5;
export const FAN_SCALE_PEAK = 1.05;
export const FAN_SCALE_RETREAT = 0.5;

export const FAN_PARALLAX_PEAK = 0.16;

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
    retreatMs: 2_800,
  },
};

export const ENTRANCE_STEP0_APPROACH_MS = 1_800;
export const ENTRANCE_STEP0_SHOWCASE_HOLD_MS = 3_500;
export const ENTRANCE_STEP0_PARALLAX_PEAK = 0.23;

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
  if (profile === "entrance_processional" && step === 0) {
    return ENTRANCE_STEP0_PARALLAX_PEAK;
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
  profile: FanTimelineProfile = "wedding_default"
): number {
  return (
    getFanApproachMs(step, profile) +
    getFanShowcaseHoldMs(step, profile) +
    getFanRetreatMs(profile) +
    FAN_GAP_MS
  );
}

export function resolveFanPhase(
  step: number,
  stepElapsed: number,
  profile: FanTimelineProfile = "wedding_default"
): FanPhaseState {
  const approachMs = getFanApproachMs(step, profile);
  const retreatMs = getFanRetreatMs(profile);
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

  const showcaseHold = getFanShowcaseHoldMs(step, profile);
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
    phaseDuration: FAN_GAP_MS,
    phaseU: Math.min(1, Math.max(0, t / FAN_GAP_MS)),
  };
}
