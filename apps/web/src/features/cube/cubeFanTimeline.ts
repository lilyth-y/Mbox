import * as THREE from "three";
import {
  getCubeShowcaseRootRotation,
  getPresentationFace,
  slerpEuler,
} from "./cubeSequence";
import {
  getCubeEntryRotation,
  getCubeExitRotation,
  CubeRotationMode,
} from "./cubeTransitionRotation";
import {
  FanTimelineProfile,
  FanPhaseState,
  FAN_SCALE_FAR,
  easeInOutSine,
  resolveFanPhase,
  getFanParallaxPeak,
  getFanStepSegmentMs,
  getFanApproachMs,
  getFanShowcaseHoldMs,
  getFanRetreatMs,
  FAN_GAP_MS,
} from "./fanTiming";
import {
  FanCubeSample,
  sampleApproachPhase,
  sampleShowcaseHoldPhase,
  sampleRetreatPhase,
  sampleHandoffPhase
} from "./fanPhases";
import {
  resolveExportRotationMode,
  runWithFanMotionExportRecording,
} from "./fanExportRotation";
import {
  sampleFanPerspective,
  sampleFanLoopBridgePerspective,
} from "./fanPerspective";
import {
  DEFAULT_CUBE_SHOWCASE_FX,
  type CubeShowcaseFxOptions,
} from "@mbox/shared";
import { applyFanZoomScale } from "./fanShowcaseFx";
import {
  blendFanCubeSamples,
  getPhaseCrossfadeMs,
  getShowcaseRetreatCrossfadeMs,
  phaseCrossfadeT,
  stepSeamCrossfadeT,
} from "./fanPhaseCrossfade";

// Narrow public surface: keep only the pieces imported via `./cubeFanTimeline`.
export {
  FAN_LOOP_BRIDGE_MS,
  resolveFanPhase,
  getFanStepSegmentMs,
  type FanTimelineProfile,
} from "./fanTiming";

interface FanMotionBuildContext {
  step: number;
  stepElapsed: number;
  faceRotation: THREE.Euler;
  entry: THREE.Euler;
  exit: THREE.Euler;
  parallaxPeak: number;
  presentationCount: number;
  motionSeed: number;
  rotationMode: CubeRotationMode;
  speedMul: number;
  profile: FanTimelineProfile;
  fx: CubeShowcaseFxOptions;
  /** 0 = no lead (showcase→retreat crossfade samples); default = showcase retreat crossfade ms */
  retreatLeadMs?: number;
}

function mergeFanPerspective(
  sample: FanCubeSample,
  phase: ReturnType<typeof resolveFanPhase>,
  step: number,
  motionSeed: number,
  fx: CubeShowcaseFxOptions
): FanCubeSample {
  const perspective = sampleFanPerspective(phase.phase, phase, step, motionSeed, fx);
  return {
    ...sample,
    ...perspective,
  };
}

function sampleFanCubeMotionAtState(
  state: FanPhaseState,
  ctx: FanMotionBuildContext
): FanCubeSample {
  const prevExit = getCubeExitRotation(Math.max(0, ctx.step - 1), ctx.presentationCount);
  let sample: FanCubeSample;
  switch (state.phase) {
    case "approach":
      sample = sampleApproachPhase(
        state,
        ctx.step,
        ctx.stepElapsed,
        ctx.entry,
        ctx.faceRotation,
        prevExit,
        ctx.parallaxPeak,
        ctx.presentationCount,
        ctx.motionSeed,
        ctx.rotationMode,
        ctx.speedMul,
        ctx.profile,
        ctx.fx
      );
      break;
    case "showcase_hold":
      sample = sampleShowcaseHoldPhase(
        state,
        ctx.step,
        ctx.stepElapsed,
        ctx.faceRotation,
        ctx.parallaxPeak,
        ctx.motionSeed,
        ctx.rotationMode,
        ctx.speedMul,
        ctx.profile,
        ctx.fx
      );
      break;
    case "retreat":
      sample = sampleRetreatPhase(
        state,
        ctx.step,
        ctx.stepElapsed,
        ctx.faceRotation,
        ctx.exit,
        ctx.parallaxPeak,
        ctx.motionSeed,
        ctx.rotationMode,
        ctx.speedMul,
        ctx.profile,
        ctx.fx
      );
      break;
    case "handoff":
    default:
      sample = sampleHandoffPhase(
        state,
        ctx.step,
        ctx.stepElapsed,
        ctx.exit,
        ctx.motionSeed,
        ctx.rotationMode,
        ctx.speedMul,
        ctx.profile,
        ctx.faceRotation,
        ctx.fx
      );
  }
  return mergeFanPerspective(sample, state, ctx.step, ctx.motionSeed, ctx.fx);
}

function applyShowcaseSeamCrossfade(
  sample: FanCubeSample,
  state: FanPhaseState,
  ctx: FanMotionBuildContext,
  approachMs: number,
  showcaseMs: number,
  retreatMs: number,
  crossMs: number,
  showcaseRetreatCrossMs: number
): FanCubeSample {
  const timeToPhaseEnd = state.phaseDuration - state.phaseElapsed;
  const srCrossMs = showcaseRetreatCrossMs;

  if (state.phase === "approach" && timeToPhaseEnd < crossMs) {
    const holdState: FanPhaseState = {
      phase: "showcase_hold",
      phaseElapsed: 0,
      phaseDuration: showcaseMs,
      phaseU: 0,
    };
    const holdSample = sampleFanCubeMotionAtState(holdState, {
      ...ctx,
      stepElapsed: approachMs,
    });
    const t = phaseCrossfadeT(crossMs - timeToPhaseEnd, crossMs);
    return blendFanCubeSamples(sample, holdSample, t);
  }

  if (state.phase === "showcase_hold") {
    if (state.phaseElapsed < crossMs) {
      const approachState: FanPhaseState = {
        phase: "approach",
        phaseElapsed: approachMs,
        phaseDuration: approachMs,
        phaseU: 1,
      };
      const approachSample = sampleFanCubeMotionAtState(approachState, {
        ...ctx,
        stepElapsed: approachMs,
      });
      const t = phaseCrossfadeT(state.phaseElapsed, crossMs);
      return blendFanCubeSamples(approachSample, sample, t);
    }
    if (timeToPhaseEnd < srCrossMs) {
      const elapsedInCrossfade = srCrossMs - timeToPhaseEnd;
      const retreatState: FanPhaseState = {
        phase: "retreat",
        // Important: do NOT advance retreat simulation inside showcase_hold.
        // If we sample retreat at elapsed>0 here, the pose at the end of showcase_hold becomes
        // "already-retreating", then the real retreat phase restarts at elapsed=0 → visible rewind/jump.
        // Instead, keep retreat pose at its true start (elapsed=0) and let the crossfade blend
        // scale/camera (and optionally rotation) without time-warping retreat.
        phaseElapsed: 0,
        phaseDuration: retreatMs,
        phaseU: 0,
      };
      const retreatSample = sampleFanCubeMotionAtState(retreatState, {
        ...ctx,
        retreatLeadMs: 0,
        stepElapsed: approachMs + showcaseMs,
      });
      const t = phaseCrossfadeT(elapsedInCrossfade, srCrossMs);
      const blendMode =
        ctx.fx.cubeShowcaseZoomEnabled ||
        ctx.fx.cubeSubjectPullEnabled ||
        ctx.fx.cubeScaleCoupledSpinEnabled ||
        ctx.fx.cubeComplexRotationEnabled
          ? "full"
          : "scale_first";
      return blendFanCubeSamples(sample, retreatSample, t, blendMode);
    }
  }

  const gapMs = FAN_GAP_MS / Math.max(0.35, Math.min(2.5, ctx.speedMul));

  if (state.phase === "retreat" && timeToPhaseEnd < crossMs) {
    const handoffState: FanPhaseState = {
      phase: "handoff",
      phaseElapsed: 0,
      phaseDuration: gapMs,
      phaseU: 0,
    };
    const handoffSample = sampleFanCubeMotionAtState(handoffState, {
      ...ctx,
      stepElapsed: approachMs + showcaseMs + retreatMs,
    });
    const t = phaseCrossfadeT(crossMs - timeToPhaseEnd, crossMs);
    return blendFanCubeSamples(sample, handoffSample, t);
  }

  if (state.phase === "handoff" && state.phaseElapsed < crossMs) {
    const retreatState: FanPhaseState = {
      phase: "retreat",
      phaseElapsed: retreatMs,
      phaseDuration: retreatMs,
      phaseU: 1,
    };
    const retreatSample = sampleFanCubeMotionAtState(retreatState, {
      ...ctx,
      stepElapsed: approachMs + showcaseMs + retreatMs,
    });
    const t = phaseCrossfadeT(state.phaseElapsed, crossMs);
    return blendFanCubeSamples(retreatSample, sample, t);
  }

  return sample;
}

function applyStepSeamCrossfade(
  sample: FanCubeSample,
  state: FanPhaseState,
  ctx: FanMotionBuildContext,
  crossMs: number
): FanCubeSample {
  if (state.phase !== "approach" || ctx.step === 0 || state.phaseElapsed >= crossMs) {
    return sample;
  }
  const mul = Math.max(0.35, Math.min(2.5, ctx.speedMul));
  const gapMs = FAN_GAP_MS / mul;
  const prevStep = ctx.step - 1;
  const handoffState: FanPhaseState = {
    phase: "handoff",
    phaseElapsed: gapMs,
    phaseDuration: gapMs,
    phaseU: 1,
  };
  const prevCtx: FanMotionBuildContext = {
    ...ctx,
    step: prevStep,
    faceRotation: getCubeShowcaseRootRotation(getPresentationFace(prevStep)),
    entry: getCubeEntryRotation(prevStep),
    exit: getCubeExitRotation(prevStep, ctx.presentationCount),
    stepElapsed:
      getFanStepSegmentMs(prevStep, ctx.profile, ctx.speedMul) / mul - 1,
  };
  const prevEnd = sampleFanCubeMotionAtState(handoffState, prevCtx);
  const t = stepSeamCrossfadeT(state.phaseElapsed, crossMs);
  return blendFanCubeSamples(prevEnd, sample, t);
}

export function sampleFanCubeMotion(
  step: number,
  stepElapsed: number,
  currentFace: number,
  presentationCount: number,
  motionSeed: number,
  rotationMode: CubeRotationMode = "mixed",
  profile: FanTimelineProfile = "wedding_default",
  speedMul: number = 1,
  fx: CubeShowcaseFxOptions = DEFAULT_CUBE_SHOWCASE_FX,
  exportRecording = false
): FanCubeSample {
  const exportMode = exportRecording ? resolveExportRotationMode(rotationMode) : rotationMode;
  return runWithFanMotionExportRecording(exportRecording, () => {
  const state = resolveFanPhase(step, stepElapsed, profile, speedMul);
  const mul = Math.max(0.35, Math.min(2.5, speedMul));
  const approachMs = getFanApproachMs(step, profile) / mul;
  const showcaseMs = getFanShowcaseHoldMs(step, profile) / mul;
  const retreatMs = getFanRetreatMs(profile) / mul;
  const crossMs = getPhaseCrossfadeMs(speedMul);
  const showcaseRetreatCrossMs = getShowcaseRetreatCrossfadeMs(speedMul);

  const ctx: FanMotionBuildContext = {
    step,
    stepElapsed,
    faceRotation: getCubeShowcaseRootRotation(currentFace),
    entry: getCubeEntryRotation(step),
    exit: getCubeExitRotation(step, presentationCount),
    parallaxPeak: getFanParallaxPeak(step, profile),
    presentationCount,
    motionSeed,
    rotationMode: exportMode,
    speedMul,
    profile,
    fx,
  };

  let sample = sampleFanCubeMotionAtState(state, ctx);
  sample = applyStepSeamCrossfade(sample, state, ctx, crossMs);
  const phaseCrossfade =
    state.phase === "retreat" ||
    state.phase === "handoff" ||
    (!exportRecording &&
      (state.phase === "approach" || state.phase === "showcase_hold"));
  if (phaseCrossfade) {
    sample = applyShowcaseSeamCrossfade(
      sample,
      state,
      ctx,
      approachMs,
      showcaseMs,
      retreatMs,
      crossMs,
      showcaseRetreatCrossMs
    );
  }
  return sample;
  });
}

export function computeFanLoopBridgeFrame(
  bridgeElapsed: number,
  bridgeMs: number,
  lastStep: number,
  motionSeed: number = 0,
  rotationMode: CubeRotationMode = "auto",
  profile: FanTimelineProfile = "wedding_default",
  speedMul: number = 1,
  fx: CubeShowcaseFxOptions = DEFAULT_CUBE_SHOWCASE_FX
): {
  cameraZ: number;
  fieldOfView: number;
  cameraOffsetX: number;
  cameraOffsetY: number;
  parallaxAmount: number;
  fanRootMotion: { rotation: THREE.Euler; presentationScale: number };
  applyRootTransform: (root: THREE.Object3D) => void;
} {
  const alpha = easeInOutSine(Math.min(1, Math.max(0, bridgeElapsed / Math.max(bridgeMs, 1))));
  const targetPerspective = sampleFanLoopBridgePerspective(bridgeElapsed, bridgeMs, fx);

  // Bridge must start exactly from the *actual* end-of-last-step pose.
  // Using an accumulated yaw rev reconstruction can diverge once FX / path-only rules change,
  // which shows up as a visible jump on the very first loop (step N → loop_bridge).
  const presentationCount = Math.max(1, lastStep + 1);
  const totalStepMs = getFanStepSegmentMs(lastStep, profile, speedMul);
  const endElapsed = Math.max(0, totalStepMs - 1);
  const endFace = getPresentationFace(lastStep);
  const endSample = sampleFanCubeMotion(
    lastStep,
    endElapsed,
    endFace,
    presentationCount,
    motionSeed,
    rotationMode,
    profile,
    speedMul,
    fx,
    false
  );
  // Camera/FOV must also start from the actual end-of-step values. Otherwise loop_bridge
  // can "pop" the camera back to close/FOV=66 while the cube is already at FAR.
  const endPhase = resolveFanPhase(lastStep, endElapsed, profile, speedMul);
  const endPerspective = sampleFanPerspective(
    endPhase.phase,
    endPhase,
    lastStep,
    motionSeed,
    fx
  );
  const targetRotation = getCubeEntryRotation(0); // CORNER_REST_ROTATION

  const rotation = slerpEuler(endSample.rotation, targetRotation, alpha);
  const scale = applyFanZoomScale(
    THREE.MathUtils.lerp(endSample.presentationScale, FAN_SCALE_FAR, alpha),
    fx
  );
  const cameraZ = THREE.MathUtils.lerp(endPerspective.cameraZ, targetPerspective.cameraZ, alpha);
  const fieldOfView = THREE.MathUtils.lerp(endPerspective.fieldOfView, targetPerspective.fieldOfView, alpha);
  const cameraOffsetX = THREE.MathUtils.lerp(endPerspective.cameraOffsetX ?? 0, targetPerspective.cameraOffsetX ?? 0, alpha);
  const cameraOffsetY = THREE.MathUtils.lerp(endPerspective.cameraOffsetY ?? 0, targetPerspective.cameraOffsetY ?? 0, alpha);

  return {
    cameraZ,
    fieldOfView,
    cameraOffsetX,
    cameraOffsetY,
    parallaxAmount: 0,
    fanRootMotion: {
      rotation: rotation.clone(),
      presentationScale: scale,
    },
    applyRootTransform: (root) => {
      root.rotation.set(rotation.x, rotation.y, rotation.z);
      root.position.set(0, 0, 0);
      root.scale.set(scale, scale, scale);
    },
  };
}
