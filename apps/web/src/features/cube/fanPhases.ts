import * as THREE from "three";
import { CubeRotationMode, slerpCubeTransition } from "./cubeTransitionRotation";
import {
  FanPhaseState,
  FanTimelineProfile,
  FAN_PROFILE_CONFIG,
  FAN_SCALE_FAR,
  FAN_SCALE_PEAK,
  FAN_SCALE_RETREAT,
  easeInOutSine,
  easeOutQuart,
  easeInQuart,
  getFanApproachMs,
  getFanShowcaseHoldMs,
  getFanStepSegmentMs
} from "./fanTiming";
import {
  ENTRANCE_APPROACH_SPIN_MAX,
  ENTRANCE_SHOWCASE_SPIN,
  FAN_MIN_TRANSITION_SPIN_INTENSITY,
  fanSpinEuler,
  resolveSpinYawSign
} from "./fanTransform";

export interface FanCubeSample {
  presentationScale: number;
  rotation: THREE.Euler;
  parallaxAmount: number;
  focusPulse: number;
}

export function sampleApproachPhase(
  state: FanPhaseState,
  step: number,
  stepElapsed: number,
  entry: THREE.Euler,
  faceRotation: THREE.Euler,
  prevExit: THREE.Euler,
  parallaxPeak: number,
  presentationCount: number,
  motionSeed: number,
  rotationMode: CubeRotationMode,
  profile: FanTimelineProfile
): FanCubeSample {
  const approachEase = easeInOutSine(state.phaseU);
  const approachRotEase = easeOutQuart(state.phaseU);
  const yawSign = resolveSpinYawSign(rotationMode);
  
  const presentationScale = THREE.MathUtils.lerp(FAN_SCALE_FAR, FAN_SCALE_PEAK, approachEase);
  let rotation = faceRotation.clone();
  
  const approachSpinMax =
    profile === "entrance_processional" && step === 0
      ? ENTRANCE_APPROACH_SPIN_MAX
      : 0.55;

  if (step === 0) {
    const spinIntensity = THREE.MathUtils.lerp(approachSpinMax, 0.05, approachEase);
    rotation = slerpCubeTransition(entry, faceRotation, approachRotEase, step, rotationMode);
    rotation = fanSpinEuler(motionSeed, step + 3, rotation, spinIntensity, stepElapsed, yawSign);
  } else {
    const prevStep = step - 1;
    const prevApproachMs = getFanApproachMs(prevStep, profile);
    const prevShowcaseHoldMs = getFanShowcaseHoldMs(prevStep, profile);
    const prevRetreatStartMs = prevApproachMs + prevShowcaseHoldMs;
    const prevTransitionEndMs = Math.max(0, getFanStepSegmentMs(prevStep, profile) - prevRetreatStartMs);
    const profileConfig = FAN_PROFILE_CONFIG[profile];
    const transitionSpinIntensity = Math.max(FAN_MIN_TRANSITION_SPIN_INTENSITY, profileConfig.handoffSpinIntensity);
    
    const prevHandoffEnd = fanSpinEuler(
      motionSeed,
      prevStep + 31,
      prevExit.clone(),
      transitionSpinIntensity,
      prevTransitionEndMs,
      yawSign
    );

    rotation = slerpCubeTransition(prevHandoffEnd, faceRotation, approachRotEase, step, rotationMode);
  }

  const parallaxAmount = parallaxPeak * approachEase * 0.5;
  
  return { presentationScale, rotation, parallaxAmount, focusPulse: 0 };
}

export function sampleShowcaseHoldPhase(
  state: FanPhaseState,
  step: number,
  stepElapsed: number,
  faceRotation: THREE.Euler,
  parallaxPeak: number,
  motionSeed: number,
  rotationMode: CubeRotationMode,
  profile: FanTimelineProfile
): FanCubeSample {
  const breathe = Math.sin(state.phaseU * Math.PI);
  const presentationScale = FAN_SCALE_PEAK;
  let rotation = faceRotation.clone();
  
  const showcaseSpinIntensity = profile === "entrance_processional" ? ENTRANCE_SHOWCASE_SPIN : 0.05;
  const spinRamp = profile === "entrance_processional" && step === 0 ? 1 : Math.min(1, state.phaseElapsed / 520);
  const yawSign = resolveSpinYawSign(rotationMode);
  
  rotation = fanSpinEuler(
    motionSeed,
    step + 3,
    rotation,
    showcaseSpinIntensity * spinRamp,
    stepElapsed,
    yawSign
  );
  
  const parallaxAmount = parallaxPeak * (0.28 + 0.1 * breathe);
  const focusPulse = step === 0 ? 0.2 + 0.08 * breathe : 0.14 + 0.06 * breathe;
  
  return { presentationScale, rotation, parallaxAmount, focusPulse };
}

export function sampleRetreatPhase(
  state: FanPhaseState,
  step: number,
  stepElapsed: number,
  faceRotation: THREE.Euler,
  exit: THREE.Euler,
  parallaxPeak: number,
  motionSeed: number,
  rotationMode: CubeRotationMode,
  profile: FanTimelineProfile
): FanCubeSample {
  const retreatEase = easeInOutSine(state.phaseU);
  const retreatRotEase = easeInQuart(state.phaseU);
  
  const approachMs = getFanApproachMs(step, profile);
  const showcaseHoldMs = getFanShowcaseHoldMs(step, profile);
  const retreatStartMs = approachMs + showcaseHoldMs;
  const transitionSpinMs = Math.max(0, stepElapsed - retreatStartMs);
  const profileConfig = FAN_PROFILE_CONFIG[profile];
  
  const presentationScale = THREE.MathUtils.lerp(FAN_SCALE_PEAK, FAN_SCALE_RETREAT, retreatEase);
  
  let spinIntensity = THREE.MathUtils.lerp(0.05, profileConfig.retreatSpinMax, retreatEase);
  if (state.phaseU > 0.82) {
    spinIntensity *= (1 - (state.phaseU - 0.82) / 0.18);
  }
  
  const showcaseEnd = fanSpinEuler(
    motionSeed,
    step + 3,
    faceRotation.clone(),
    0.04,
    Math.max(0, retreatStartMs - 33)
  );
  
  let rotation = slerpCubeTransition(showcaseEnd, exit, retreatRotEase, step, rotationMode);
  
  if (profile !== "entrance_processional") {
    rotation = fanSpinEuler(
      motionSeed,
      step + 17,
      rotation,
      spinIntensity,
      transitionSpinMs
    );
  }
  
  const parallaxAmount = parallaxPeak * (1 - retreatEase) * 0.32;
  const focusPulse = 0.06 * (1 - retreatEase);
  
  return { presentationScale, rotation, parallaxAmount, focusPulse };
}

export function sampleHandoffPhase(
  state: FanPhaseState,
  step: number,
  stepElapsed: number,
  exit: THREE.Euler,
  motionSeed: number,
  rotationMode: CubeRotationMode,
  profile: FanTimelineProfile
): FanCubeSample {
  const handoffEase = easeInOutSine(state.phaseU);
  const presentationScale = FAN_SCALE_RETREAT;
  
  const approachMs = getFanApproachMs(step, profile);
  const showcaseHoldMs = getFanShowcaseHoldMs(step, profile);
  const retreatStartMs = approachMs + showcaseHoldMs;
  const transitionSpinMs = Math.max(0, stepElapsed - retreatStartMs);
  const yawSign = resolveSpinYawSign(rotationMode);
  
  const profileConfig = FAN_PROFILE_CONFIG[profile];
  const transitionSpinIntensity = Math.max(FAN_MIN_TRANSITION_SPIN_INTENSITY, profileConfig.handoffSpinIntensity);
  
  let rotation = exit.clone();
  rotation = fanSpinEuler(
    motionSeed,
    step + 31,
    rotation,
    transitionSpinIntensity,
    transitionSpinMs,
    yawSign
  );
  
  const parallaxAmount = 0.04 * (1 - handoffEase);
  
  return { presentationScale, rotation, parallaxAmount, focusPulse: 0 };
}
