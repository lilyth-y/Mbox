import * as THREE from "three";
import {
  CORNER_REST_ROTATION,
  getFaceRotation,
  getPresentationFace,
  slerpEuler,
} from "./cubeSequence";
import {
  getCubeEntryRotation,
  getCubeExitRotation,
  slerpCubeTransition,
  type CubeRotationMode,
} from "./cubeTransitionRotation";

/**
 * Fan-blade wedding timeline — single source of truth.
 * Flow per photo: approach → showcase hold → gentle retreat → handoff (to next).
 */
export const FAN_APPROACH_MS = 2_400;
/** First photo — longest “hero” beat. */
export const FAN_OPENING_HOLD_MS = 1_200;
/** Every later photo — time to appreciate before transitioning. */
export const FAN_SHOWCASE_HOLD_MS = 900;
export const FAN_RETREAT_MS = 2_000;
/** Inter-photo handoff (rotation bridge, minimal spin). */
export const FAN_GAP_MS = 1_400;
export const FAN_LOOP_BRIDGE_MS = 1_100;

export const FAN_SCALE_FAR = 0.58;
export const FAN_SCALE_PEAK = 1.05;
export const FAN_SCALE_RETREAT = 0.8;

export const FAN_PARALLAX_PEAK = 0.16;

export type FanTimelineProfile = "wedding_default" | "entrance_processional";

export interface FanTimelineProfileConfig {
  retreatSpinMax: number;
  handoffSpinIntensity: number;
  retreatMs: number;
}

export const FAN_PROFILE_CONFIG: Record<FanTimelineProfile, FanTimelineProfileConfig> = {
  wedding_default: {
    retreatSpinMax: 0.55,
    handoffSpinIntensity: 0,
    retreatMs: FAN_RETREAT_MS,
  },
  entrance_processional: {
    retreatSpinMax: 0.18,
    handoffSpinIntensity: 0.02,
    retreatMs: 2_800,
  },
};

/** Always keep some angular motion through photo transitions (prevents "freeze" perception). */
export const FAN_MIN_TRANSITION_SPIN_INTENSITY = 0.012;

/** Entrance hero: faster approach, longer dwell for aisle walk sync. */
export const ENTRANCE_STEP0_APPROACH_MS = 1_800;
export const ENTRANCE_STEP0_SHOWCASE_HOLD_MS = 3_500;
export const ENTRANCE_STEP0_PARALLAX_PEAK = 0.23;
/** Cap approach spin for comfortable tracking on entrance hero. */
export const ENTRANCE_APPROACH_SPIN_MAX = 0.38;
/** Showcase spin — tuned for RSI yaw band [2.0, 4.5]°/s at 30fps. */
export const ENTRANCE_SHOWCASE_SPIN = 0.048;

export function resolveSpinYawSign(mode: CubeRotationMode): number {
  if (mode === "yaw_ccw") {
    return -1;
  }
  return 1;
}

export type FanPhase = "approach" | "showcase_hold" | "retreat" | "handoff";

/** @deprecated Use showcase_hold */
export type FanPhaseLegacy = FanPhase | "opening_hold" | "gap";

export interface FanPhaseState {
  phase: FanPhase;
  phaseElapsed: number;
  phaseDuration: number;
  phaseU: number;
}

function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function easeInOutSine(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return (-(Math.cos(Math.PI * x) - 1)) / 2;
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

/** Showcase dwell — every photo gets a wedding beat, not only the opener. */
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

/** @deprecated Alias for getFanShowcaseHoldMs */
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

function fanSpinEuler(
  seed: number,
  step: number,
  base: THREE.Euler,
  intensity: number,
  elapsedMs: number,
  yawSign: number = 1
): THREE.Euler {
  if (intensity <= 0.001) {
    return base.clone();
  }
  const rnd = mulberry32(seed ^ step * 9973);
  const yawDir = yawSign >= 0 ? 1 : -1;
  const yawRate = (0.55 + rnd() * 0.75) * intensity * yawDir;
  const pitchRate = (0.14 + rnd() * 0.28) * intensity * (rnd() > 0.5 ? 1 : -1);
  const rollRate = (0.08 + rnd() * 0.18) * intensity * (rnd() > 0.5 ? 1 : -1);
  const seconds = elapsedMs / 1000;
  const euler = base.clone();
  euler.y += yawRate * seconds;
  euler.x += pitchRate * seconds * 0.55;
  euler.z += rollRate * seconds * 0.4;
  return euler;
}

export interface FanCubeSample {
  presentationScale: number;
  rotation: THREE.Euler;
  parallaxAmount: number;
  focusPulse: number;
}

export function sampleFanCubeMotion(
  step: number,
  stepElapsed: number,
  currentFace: number,
  presentationCount: number,
  motionSeed: number,
  rotationMode: CubeRotationMode = "mixed",
  profile: FanTimelineProfile = "wedding_default"
): FanCubeSample {
  const profileConfig = FAN_PROFILE_CONFIG[profile];
  const parallaxPeak = getFanParallaxPeak(step, profile);
  const { phase, phaseU, phaseElapsed } = resolveFanPhase(step, stepElapsed, profile);
  const faceRotation = getFaceRotation(currentFace);
  const entry = getCubeEntryRotation(step);
  const exit = getCubeExitRotation(step, presentationCount);

  const approachEase = easeInOutSine(phaseU);
  const retreatEase = easeInOutSine(phaseU);
  const handoffEase = easeInOutSine(phaseU);

  const showcaseHoldMs = getFanShowcaseHoldMs(step, profile);
  const approachMs = getFanApproachMs(step, profile);
  const retreatStartMs = approachMs + showcaseHoldMs;
  /** Continuous spin clock across retreat + handoff (avoids phase-boundary rotation pops). */
  const transitionSpinMs = Math.max(0, stepElapsed - retreatStartMs);
  const yawSign = resolveSpinYawSign(rotationMode);
  const transitionSpinIntensity = Math.max(
    FAN_MIN_TRANSITION_SPIN_INTENSITY,
    profileConfig.handoffSpinIntensity
  );
  const showcaseSpinIntensity =
    profile === "entrance_processional" ? ENTRANCE_SHOWCASE_SPIN : 0.04;

  let presentationScale = FAN_SCALE_RETREAT;
  let rotation = faceRotation.clone();
  let parallaxAmount = 0;
  let focusPulse = 0;

  switch (phase) {
    case "approach": {
      const approachFrom = step === 0 ? FAN_SCALE_FAR : FAN_SCALE_RETREAT;
      presentationScale = THREE.MathUtils.lerp(approachFrom, FAN_SCALE_PEAK, approachEase);
      const approachSpinMax =
        profile === "entrance_processional" && step === 0
          ? ENTRANCE_APPROACH_SPIN_MAX
          : 0.85;
      if (step === 0) {
        const spinIntensity = THREE.MathUtils.lerp(approachSpinMax, 0.05, approachEase);
        rotation = slerpCubeTransition(entry, faceRotation, approachEase, step, rotationMode);
        rotation = fanSpinEuler(motionSeed, step + 3, rotation, spinIntensity, stepElapsed, yawSign);
      } else {
        // Ensure rotation continuity across photo boundary:
        // start at the previous step's *end-of-handoff* rotation (not raw exit),
        // so the viewer never perceives a freeze between photos.
        const prevStep = step - 1;
        const prevApproachMs = getFanApproachMs(prevStep, profile);
        const prevShowcaseHoldMs = getFanShowcaseHoldMs(prevStep, profile);
        const prevRetreatStartMs = prevApproachMs + prevShowcaseHoldMs;
        const prevTransitionEndMs = Math.max(0, getFanStepSegmentMs(prevStep, profile) - prevRetreatStartMs);
        const prevExit = getCubeExitRotation(prevStep, presentationCount);
        const prevHandoffEnd = fanSpinEuler(
          motionSeed,
          prevStep + 31,
          prevExit.clone(),
          transitionSpinIntensity,
          prevTransitionEndMs,
          yawSign
        );

        rotation = slerpEuler(prevHandoffEnd, faceRotation, approachEase);
      }
      parallaxAmount = parallaxPeak * approachEase * 0.5;
      break;
    }
    case "showcase_hold": {
      const breathe = Math.sin(phaseU * Math.PI);
      presentationScale = FAN_SCALE_PEAK * (1 + 0.015 * breathe);
      rotation = faceRotation.clone();
      const spinRamp =
        profile === "entrance_processional" && step === 0
          ? 1
          : Math.min(1, phaseElapsed / 250);
      rotation = fanSpinEuler(
        motionSeed,
        step + 3,
        rotation,
        showcaseSpinIntensity * spinRamp,
        stepElapsed,
        yawSign
      );
      parallaxAmount = parallaxPeak * (0.28 + 0.1 * breathe);
      focusPulse = step === 0 ? 0.2 + 0.08 * breathe : 0.14 + 0.06 * breathe;
      break;
    }
    case "retreat": {
      presentationScale = THREE.MathUtils.lerp(FAN_SCALE_PEAK, FAN_SCALE_RETREAT, retreatEase);
      let spinIntensity = THREE.MathUtils.lerp(0.05, profileConfig.retreatSpinMax, retreatEase);
      if (phaseU > 0.82) {
        spinIntensity *= (1 - (phaseU - 0.82) / 0.18);
      }
      const slerpTarget = slerpCubeTransition(faceRotation, exit, retreatEase, step, rotationMode);
      const showcaseEnd = fanSpinEuler(
        motionSeed,
        step + 3,
        faceRotation.clone(),
        0.04,
        Math.max(0, retreatStartMs - 33)
      );
      if (phaseU < 0.15) {
        rotation = slerpEuler(showcaseEnd, slerpTarget, easeInOutSine(phaseU / 0.15));
      } else {
        rotation = slerpTarget;
      }
      if (profile !== "entrance_processional") {
        const retreatSpinGate = 1;
        rotation = fanSpinEuler(
          motionSeed,
          step + 17,
          rotation,
          spinIntensity * retreatSpinGate,
          transitionSpinMs
        );
      }
      parallaxAmount = parallaxPeak * (1 - retreatEase) * 0.32;
      focusPulse = 0.06 * (1 - retreatEase);
      break;
    }
    case "handoff": {
      presentationScale = THREE.MathUtils.lerp(
        FAN_SCALE_RETREAT,
        FAN_SCALE_RETREAT * 0.97,
        Math.sin(phaseU * Math.PI) * 0.5 + 0.5
      );
      rotation = exit.clone();
      rotation = fanSpinEuler(
        motionSeed,
        step + 31,
        rotation,
        transitionSpinIntensity,
        // Keep a continuous spin clock through handoff so angular velocity doesn't "reset" at phase boundaries.
        transitionSpinMs,
        yawSign
      );
      parallaxAmount = 0.04 * (1 - handoffEase);
      break;
    }
  }

  return { presentationScale, rotation, parallaxAmount, focusPulse };
}

export function computeFanLoopBridgeFrame(
  bridgeElapsed: number,
  bridgeMs: number,
  lastStep: number
): {
  cameraZ: number;
  fieldOfView: number;
  parallaxAmount: number;
  applyRootTransform: (root: THREE.Object3D) => void;
} {
  const alpha = easeInOutSine(Math.min(1, Math.max(0, bridgeElapsed / Math.max(bridgeMs, 1))));
  const fromRotation = getFaceRotation(getPresentationFace(lastStep));
  const rotation = slerpEuler(fromRotation, CORNER_REST_ROTATION, alpha);
  const scale = THREE.MathUtils.lerp(FAN_SCALE_RETREAT, FAN_SCALE_FAR, alpha);

  return {
    cameraZ: 5,
    fieldOfView: 75,
    parallaxAmount: 0,
    applyRootTransform: (root) => {
      root.rotation.set(rotation.x, rotation.y, rotation.z);
      root.position.set(0, 0, 0);
      root.scale.set(scale, scale, scale);
    },
  };
}
