import * as THREE from "three";
import {
  CORNER_REST_ROTATION,
  getFaceRotation,
  slerpEuler,
} from "./cubeSequence";
import {
  getCubeEntryRotation,
  getCubeExitRotation,
  CubeRotationMode,
} from "./cubeTransitionRotation";
import {
  FanTimelineProfile,
  FAN_GAP_MS,
  FAN_SCALE_FAR,
  FAN_SCALE_RETREAT,
  easeInOutSine,
  getFanApproachMs,
  getFanShowcaseHoldMs,
  getFanRetreatMs,
  resolveFanPhase,
  getFanParallaxPeak,
  FAN_PROFILE_CONFIG
} from "./fanTiming";
import {
  FAN_MIN_TRANSITION_SPIN_INTENSITY,
  fanSpinEuler,
  resolveSpinYawSign
} from "./fanTransform";
import {
  FanCubeSample,
  sampleApproachPhase,
  sampleShowcaseHoldPhase,
  sampleRetreatPhase,
  sampleHandoffPhase
} from "./fanPhases";

// Re-export everything for backward compatibility
export * from "./fanTiming";
export * from "./fanTransform";
export * from "./fanPhases";

export function sampleFanCubeMotion(
  step: number,
  stepElapsed: number,
  currentFace: number,
  presentationCount: number,
  motionSeed: number,
  rotationMode: CubeRotationMode = "mixed",
  profile: FanTimelineProfile = "wedding_default"
): FanCubeSample {
  const state = resolveFanPhase(step, stepElapsed, profile);
  const faceRotation = getFaceRotation(currentFace);
  const entry = getCubeEntryRotation(step);
  const exit = getCubeExitRotation(step, presentationCount);
  const parallaxPeak = getFanParallaxPeak(step, profile);

  switch (state.phase) {
    case "approach":
      return sampleApproachPhase(state, step, stepElapsed, entry, faceRotation, getCubeExitRotation(Math.max(0, step - 1), presentationCount), parallaxPeak, presentationCount, motionSeed, rotationMode, profile);
    case "showcase_hold":
      return sampleShowcaseHoldPhase(state, step, stepElapsed, faceRotation, parallaxPeak, motionSeed, rotationMode, profile);
    case "retreat":
      return sampleRetreatPhase(state, step, stepElapsed, faceRotation, exit, parallaxPeak, motionSeed, rotationMode, profile);
    case "handoff":
      return sampleHandoffPhase(state, step, stepElapsed, exit, motionSeed, rotationMode, profile);
  }
}

export function computeFanLoopBridgeFrame(
  bridgeElapsed: number,
  bridgeMs: number,
  lastStep: number,
  motionSeed: number = 0,
  rotationMode: CubeRotationMode = "auto",
  profile: FanTimelineProfile = "wedding_default"
): {
  cameraZ: number;
  fieldOfView: number;
  parallaxAmount: number;
  applyRootTransform: (root: THREE.Object3D) => void;
} {
  const profileConfig = FAN_PROFILE_CONFIG[profile];
  const approachMs = getFanApproachMs(lastStep, profile);
  const showcaseHoldMs = getFanShowcaseHoldMs(lastStep, profile);
  const retreatMs = getFanRetreatMs(profile);
  const transitionSpinMs = approachMs + showcaseHoldMs + retreatMs + FAN_GAP_MS - (approachMs + showcaseHoldMs);
  const yawSign = resolveSpinYawSign(rotationMode);
  const transitionSpinIntensity = Math.max(
    FAN_MIN_TRANSITION_SPIN_INTENSITY,
    profileConfig.handoffSpinIntensity
  );

  const lastStepExit = CORNER_REST_ROTATION.clone();
  const fromRotation = fanSpinEuler(
    motionSeed,
    lastStep + 31,
    lastStepExit,
    transitionSpinIntensity,
    transitionSpinMs,
    yawSign
  );

  const alpha = easeInOutSine(Math.min(1, Math.max(0, bridgeElapsed / Math.max(bridgeMs, 1))));
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
