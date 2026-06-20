import * as THREE from "three";
import {
  clampParallaxAmount,
  CUBE_SUBJECT_PULL_PEAK,
  showcaseHeartbeatStrength,
  showcaseSubjectPullStrength,
  usesBaseInPlaceFanMotion,
  type CubeShowcaseFxOptions,
  DEFAULT_CUBE_SHOWCASE_FX,
} from "@mbox/shared";
import { CubeRotationMode, getCubeExitRotation } from "./cubeTransitionRotation";
import {
  FanPhaseState,
  FanTimelineProfile,
  FAN_SCALE_FAR,
  FAN_SCALE_PEAK,
  FAN_SCALE_RETREAT,
  easeInOutSine,
  easeOutQuart,
} from "./fanTiming";
import {
  retreatOrientEase,
  retreatScaleEase,
} from "./fanTransform";
import {
  composeInPlaceApproachRotation,
  composeInPlaceHandoffRotation,
  composeInPlaceRetreatRotation,
  composeZoomApproachRotation,
  composeZoomRetreatRotation,
  composeZoomHandoffRotation,
  resolveApproachAlignProgress,
  resolveInPlaceHandoffEndRotation,
  getStepPhaseBoundaryMs,
} from "./fanRotationComposer";
import { isFanMotionExportRecording } from "./fanExportRotation";
import { getCubeShowcaseRootRotation, getPresentationFace } from "./cubeSequence";
import { fanApproachEase, fanRetreatEase } from "./fanPerspective";
import { heartbeatPhaseBlend, sampleHeartbeat } from "./fanHeartbeat";
import {
  applyFanZoomScale,
  resolveFanMotionScale,
  showcaseSubjectPullEnvelope,
} from "./fanShowcaseFx";
import type { FanMotionRuntimeContext } from "./fanMotionTypes";

function motionScaleFromState(state: FanPhaseState): number {
  return resolveFanMotionScale(state.phase, state.phaseU);
}

export interface FanCubeSample {
  presentationScale: number;
  rotation: THREE.Euler;
  parallaxAmount: number;
  focusPulse: number;
  cameraZ: number;
  fieldOfView: number;
  cameraOffsetX: number;
  cameraOffsetY: number;
}

export function sampleApproachPhase(
  state: FanPhaseState,
  step: number,
  stepElapsed: number,
  entry: THREE.Euler,
  faceRotation: THREE.Euler,
  _prevExit: THREE.Euler,
  _parallaxPeak: number,
  _presentationCount: number,
  motionSeed: number,
  rotationMode: CubeRotationMode,
  speedMul: number = 1,
  profile: FanTimelineProfile = "wedding_default",
  fx: CubeShowcaseFxOptions = DEFAULT_CUBE_SHOWCASE_FX
): FanCubeSample {
  const approachEase = fanApproachEase(state.phaseU);
  const entranceYaw =
    profile === "entrance_processional" &&
    (rotationMode === "yaw_cw" || rotationMode === "yaw_ccw");
  const inPlaceBase = usesBaseInPlaceFanMotion(fx) && !entranceYaw;
  const alignU = resolveApproachAlignProgress(state.phaseU, step, fx);

  const presentationScale = applyFanZoomScale(
    THREE.MathUtils.lerp(FAN_SCALE_FAR, FAN_SCALE_PEAK, approachEase),
    fx
  );
  const motionScale = motionScaleFromState(state);
  const pathAlignU = alignU;

  if (inPlaceBase) {
    const yawBase =
      step === 0
        ? entry
        : (() => {
            const prevStep = step - 1;
            const prevExit = getCubeExitRotation(prevStep, _presentationCount);
            const prevFace = getCubeShowcaseRootRotation(getPresentationFace(prevStep));
            return resolveInPlaceHandoffEndRotation(
              prevStep,
              prevFace,
              prevExit,
              motionSeed,
              rotationMode,
              speedMul,
              profile,
              fx
            );
          })();

    const motionCtx: FanMotionRuntimeContext = {
      state,
      step,
      stepElapsed,
      motionSeed,
      rotationMode,
      speedMul,
      profile,
      fx,
    };
    const rotation = composeInPlaceApproachRotation({
      ctx: motionCtx,
      entry,
      faceRotation,
      yawBase,
      motionScale,
      alignProgress: alignU,
    });
    return {
      presentationScale,
      rotation,
      parallaxAmount: 0,
      focusPulse: 0,
      cameraZ: 0,
      fieldOfView: 0,
      cameraOffsetX: 0,
      cameraOffsetY: 0,
    };
  }

  const yawBase =
    step === 0
      ? entry
      : resolveInPlaceHandoffEndRotation(
          step - 1,
          getCubeShowcaseRootRotation(getPresentationFace(step - 1)),
          _prevExit,
          motionSeed,
          rotationMode,
          speedMul,
          profile,
          fx
        );

  const motionCtx: FanMotionRuntimeContext = {
    state,
    step,
    stepElapsed,
    motionSeed,
    rotationMode,
    speedMul,
    profile,
    fx,
  };
  const rotation = composeZoomApproachRotation({
    ctx: motionCtx,
    entry,
    faceRotation,
    yawBase,
    motionScale,
    pathAlignU,
    alignU,
    entranceYaw,
  });

  const parallaxAmount = 0;

  return { presentationScale, rotation, parallaxAmount, focusPulse: 0, cameraZ: 0, fieldOfView: 0, cameraOffsetX: 0, cameraOffsetY: 0 };
}

export function sampleShowcaseHoldPhase(
  state: FanPhaseState,
  step: number,
  _stepElapsed: number,
  faceRotation: THREE.Euler,
  parallaxPeak: number,
  _motionSeed: number,
  rotationMode: CubeRotationMode,
  _speedMul: number = 1,
  profile: FanTimelineProfile = "wedding_default",
  fx: CubeShowcaseFxOptions = DEFAULT_CUBE_SHOWCASE_FX
): FanCubeSample {
  const hbStrength = isFanMotionExportRecording()
    ? 0
    : showcaseHeartbeatStrength(fx);
  const hbBlend = hbStrength > 0 ? heartbeatPhaseBlend(state.phaseU) : 0;
  const heartbeat =
    hbStrength > 0
      ? sampleHeartbeat(state.phaseElapsed)
      : { scale: 0, pulse: 0, envelope: 0 };
  const hb = heartbeat.scale * hbBlend * hbStrength;
  const presentationScale = applyFanZoomScale(
    FAN_SCALE_PEAK * (1 + hb * 0.016),
    fx
  );
  const rotation = faceRotation.clone();

  const effectEnvelope =
    state.phaseU < 0.32
      ? easeOutQuart(state.phaseU / 0.32) * 0.42
      : state.phaseU > 0.68
        ? easeOutQuart((1 - state.phaseU) / 0.32) * 0.42
        : 0.42 + 0.58 * Math.sin(((state.phaseU - 0.32) / 0.36) * Math.PI);
  const entranceHero =
    profile === "entrance_processional" &&
    (rotationMode === "yaw_cw" || rotationMode === "yaw_ccw");
  const supportMul = entranceHero && step > 0 ? 0.6 : 1;
  const pullStrength = showcaseSubjectPullStrength(fx);
  const parallaxAmount =
    pullStrength > 0
      ? 0
      : clampParallaxAmount(
          parallaxPeak *
            0.72 *
            supportMul *
            (0.94 + 0.06 * hb) *
            effectEnvelope
        );

  let focusPulse = 0;
  if (pullStrength > 0) {
    focusPulse = showcaseSubjectPullEnvelope(state.phaseU) * CUBE_SUBJECT_PULL_PEAK * pullStrength;
    if (hbStrength > 0) {
      focusPulse *= 0.86 + 0.14 * heartbeat.pulse * hbStrength;
    }
  } else if (hbStrength > 0) {
    focusPulse =
      effectEnvelope *
      supportMul *
      (step === 0 ? 0.28 + 0.08 * heartbeat.pulse : 0.24 + 0.06 * heartbeat.pulse) *
      hbBlend *
      0.4 *
      hbStrength;
  }

  return {
    presentationScale,
    rotation,
    parallaxAmount,
    focusPulse,
    cameraZ: 0,
    fieldOfView: 0,
    cameraOffsetX: 0,
    cameraOffsetY: 0,
  };
}

export function sampleRetreatPhase(
  state: FanPhaseState,
  step: number,
  _stepElapsed: number,
  faceRotation: THREE.Euler,
  exit: THREE.Euler,
  _parallaxPeak: number,
  motionSeed: number,
  rotationMode: CubeRotationMode,
  speedMul: number = 1,
  profile: FanTimelineProfile = "wedding_default",
  fx: CubeShowcaseFxOptions = DEFAULT_CUBE_SHOWCASE_FX
): FanCubeSample {
  const retreatScale = retreatScaleEase(state.phaseU);
  const entranceYaw =
    profile === "entrance_processional" &&
    (rotationMode === "yaw_cw" || rotationMode === "yaw_ccw");
  const inPlaceBase = usesBaseInPlaceFanMotion(fx) && !entranceYaw;
  const orientEase = entranceYaw ? fanRetreatEase(state.phaseU) : retreatOrientEase(state.phaseU);

  const presentationScale = applyFanZoomScale(
    THREE.MathUtils.lerp(FAN_SCALE_PEAK, FAN_SCALE_RETREAT, retreatScale),
    fx
  );
  const motionScale = motionScaleFromState(state);

  const bounds = getStepPhaseBoundaryMs(step, profile, speedMul);
  const motionStepElapsed = Math.min(
    bounds.retreatEndMs,
    bounds.showcaseEndMs + state.phaseElapsed
  );

  if (inPlaceBase) {
    const motionCtx: FanMotionRuntimeContext = {
      state,
      step,
      stepElapsed: _stepElapsed,
      motionSeed,
      rotationMode,
      speedMul,
      profile,
      fx,
    };
    const rotation = composeInPlaceRetreatRotation({
      ctx: motionCtx,
      faceRotation,
      exit,
      motionScale,
      motionStepElapsed,
      showcaseEndMs: bounds.showcaseEndMs,
    });
    return {
      presentationScale,
      rotation,
      parallaxAmount: 0,
      focusPulse: 0,
      cameraZ: 0,
      fieldOfView: 0,
      cameraOffsetX: 0,
      cameraOffsetY: 0,
    };
  }

  const motionCtx: FanMotionRuntimeContext = {
    state,
    step,
    stepElapsed: _stepElapsed,
    motionSeed,
    rotationMode,
    speedMul,
    profile,
    fx,
  };
  const rotation = composeZoomRetreatRotation({
    ctx: motionCtx,
    faceRotation,
    exit,
    motionScale,
    motionStepElapsed,
    showcaseEndMs: bounds.showcaseEndMs,
    entranceYaw,
    orientEase,
  });

  return {
    presentationScale,
    rotation,
    parallaxAmount: 0,
    focusPulse: 0,
    cameraZ: 0,
    fieldOfView: 0,
    cameraOffsetX: 0,
    cameraOffsetY: 0,
  };
}

export function sampleHandoffPhase(
  state: FanPhaseState,
  step: number,
  _stepElapsed: number,
  exit: THREE.Euler,
  motionSeed: number,
  rotationMode: CubeRotationMode,
  speedMul: number = 1,
  profile: FanTimelineProfile = "wedding_default",
  faceRotation?: THREE.Euler,
  fx: CubeShowcaseFxOptions = DEFAULT_CUBE_SHOWCASE_FX
): FanCubeSample {
  void easeInOutSine(state.phaseU);
  const entranceYaw =
    profile === "entrance_processional" &&
    (rotationMode === "yaw_cw" || rotationMode === "yaw_ccw");
  const hbStrength = showcaseHeartbeatStrength(fx);
  const hbBlend = hbStrength > 0 ? heartbeatPhaseBlend(state.phaseU, 0.2) : 0;
  const heartbeat =
    hbStrength > 0
      ? sampleHeartbeat(state.phaseElapsed)
      : { scale: 0, pulse: 0, envelope: 0 };
  const presentationScale = applyFanZoomScale(
    FAN_SCALE_RETREAT * (1 + heartbeat.scale * hbBlend * 0.01 * hbStrength),
    fx
  );
  const motionScale = motionScaleFromState(state);
  const bounds = getStepPhaseBoundaryMs(step, profile, speedMul);
  const face = faceRotation ?? exit;
  const motionElapsed =
    bounds.showcaseEndMs + bounds.retreatMs + state.phaseElapsed;
  const inPlaceBase = usesBaseInPlaceFanMotion(fx) && !entranceYaw;
  const focusPulse =
    hbStrength > 0 ? heartbeat.pulse * hbBlend * 0.06 * hbStrength : 0;

  if (inPlaceBase) {
    const motionCtx: FanMotionRuntimeContext = {
      state,
      step,
      stepElapsed: _stepElapsed,
      motionSeed,
      rotationMode,
      speedMul,
      profile,
      fx,
    };
    const rotation = composeInPlaceHandoffRotation({
      ctx: motionCtx,
      faceRotation: face,
      exit,
      motionScale,
      motionElapsed,
      showcaseEndMs: bounds.showcaseEndMs,
      retreatMs: bounds.retreatMs,
    });
    return {
      presentationScale,
      rotation,
      parallaxAmount: 0,
      focusPulse,
      cameraZ: 0,
      fieldOfView: 0,
      cameraOffsetX: 0,
      cameraOffsetY: 0,
    };
  }

  const inPlace = !fx.cubeShowcaseZoomEnabled;
  const rotation = composeZoomHandoffRotation({
    ctx: {
      state,
      step,
      stepElapsed: _stepElapsed,
      motionSeed,
      rotationMode,
      speedMul,
      profile,
      fx,
    },
    faceRotation: face,
    exit,
    motionScale,
    motionElapsed,
    showcaseEndMs: bounds.showcaseEndMs,
    entranceYaw,
    inPlace,
  });

  return {
    presentationScale,
    rotation,
    parallaxAmount: 0,
    focusPulse,
    cameraZ: 0,
    fieldOfView: 0,
    cameraOffsetX: 0,
    cameraOffsetY: 0,
  };
}
