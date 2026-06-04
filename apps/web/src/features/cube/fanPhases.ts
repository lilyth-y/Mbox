import * as THREE from "three";
import { CubeRotationMode, slerpCubeTransition } from "./cubeTransitionRotation";
import {
  FanPhaseState,
  FanTimelineProfile,
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
  fanSpinEuler,
  resolveSpinYawSign,
  getAccumulatedRevs
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
  
  const accumulatedRevs = getAccumulatedRevs(stepElapsed, step, profile);

  if (step === 0) {
    rotation = slerpCubeTransition(entry, faceRotation, approachRotEase, step, rotationMode);
    rotation = fanSpinEuler(motionSeed, step + 3, rotation, accumulatedRevs, yawSign);
  } else {
    const prevStep = step - 1;
    const prevApproachMs = getFanApproachMs(prevStep, profile);
    const prevShowcaseHoldMs = getFanShowcaseHoldMs(prevStep, profile);
    const prevRetreatStartMs = prevApproachMs + prevShowcaseHoldMs;
    const prevTransitionEndMs = Math.max(0, getFanStepSegmentMs(prevStep, profile) - prevRetreatStartMs);
    
    // In prev step's handoff, the spin continues at 5.0 RPS from the end of retreat.
    // getAccumulatedRevs(time, prevStep, profile) computes exact accumulated revolutions up to handoff end.
    const prevTimeInStep = prevRetreatStartMs + prevTransitionEndMs;
    const prevRevs = getAccumulatedRevs(prevTimeInStep, prevStep, profile);
    
    const prevHandoffEnd = fanSpinEuler(
      motionSeed,
      prevStep + 31,
      prevExit.clone(),
      prevRevs,
      yawSign
    );

    rotation = slerpCubeTransition(prevHandoffEnd, faceRotation, approachRotEase, step, rotationMode);
    rotation = fanSpinEuler(motionSeed, step + 3, rotation, accumulatedRevs, yawSign);
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
  const yawSign = resolveSpinYawSign(rotationMode);
  
  const accumulatedRevs = getAccumulatedRevs(stepElapsed, step, profile);
  
  let rotation = faceRotation.clone();
  rotation = fanSpinEuler(
    motionSeed,
    step + 3,
    rotation,
    accumulatedRevs,
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
  const yawSign = resolveSpinYawSign(rotationMode);
  
  const presentationScale = THREE.MathUtils.lerp(FAN_SCALE_PEAK, FAN_SCALE_RETREAT, retreatEase);
  
  const accumulatedRevs = getAccumulatedRevs(stepElapsed, step, profile);
  
  let rotation = slerpCubeTransition(faceRotation, exit, retreatRotEase, step, rotationMode);
  rotation = fanSpinEuler(
    motionSeed,
    step + 17,
    rotation,
    accumulatedRevs,
    yawSign
  );
  
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
  const yawSign = resolveSpinYawSign(rotationMode);
  
  const presentationScale = FAN_SCALE_RETREAT;
  const accumulatedRevs = getAccumulatedRevs(stepElapsed, step, profile);
  
  let rotation = exit.clone();
  rotation = fanSpinEuler(
    motionSeed,
    step + 31,
    rotation,
    accumulatedRevs,
    yawSign
  );
  
  const parallaxAmount = 0.04 * (1 - handoffEase);
  
  return { presentationScale, rotation, parallaxAmount, focusPulse: 0 };
}
