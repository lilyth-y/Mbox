import * as THREE from "three";
import type { CubeShowcaseFxOptions } from "@mbox/shared";
import { CubeRotationMode, slerpCubeTransition } from "./cubeTransitionRotation";
import { slerpEuler, getCubeShowcaseRootRotation, getPresentationFace } from "./cubeSequence";
import { FAN_GAP_MS, FAN_SCALE_RETREAT, type FanTimelineProfile } from "./fanTiming";
import {
  approachSpinEase,
  approachSpinToPathHandoffBlend,
  blendRotationTowardFaceAtPeak,
  fanSpinEuler,
  getApproachYawRevsOnly,
  resolveSpinYawSign,
  retreatOrientEase,
  rotationMotionGate,
} from "./fanTransform";
import {
  exportTransitTumbleIntensity,
  getScaleGatedRevsWithinStep,
  isFanMotionExportRecording,
  resolveExportHandoffTumbleIntensity,
  resolveExportRotationMode,
} from "./fanExportRotation";
import { fanSmootherstep, fanSpeedMul } from "./fanEase";
import { fanAxisTumble } from "./fanAxisWander";
import { approachSpinEnvelope, approachWanderEffectiveMs } from "./fanApproachLock";
import {
  integratePresentationSpinProgress,
  sampleApproachPresentationScale,
  sampleHandoffPresentationScale,
  sampleRetreatPresentationScale,
  scaleCoupledMotionElapsed,
  shouldScaleCoupleSpin,
} from "./fanScaleCoupledSpin";
import type { FanMotionRuntimeContext } from "./fanMotionTypes";
import {
  applyAxisTumble,
  applyTimelineYaw,
  applyTimelineYawAfterShowcase,
  getStepPhaseBoundaryMs,
  resolvePreviewTumbleIntensity,
  tumbleUsesWobble,
} from "./fanMotionCommon";

export {
  applyTimelineYaw,
  applyTimelineYawAfterShowcase,
  fanSmootherstep,
  fanSpeedMul,
  getStepPhaseBoundaryMs,
} from "./fanMotionCommon";

/** Handoff tail settle — rotation locked to step+1 approach entry (C⁰ step seam). */
export const IN_PLACE_HANDOFF_SETTLE_START_U = 0.82;
/** Retreat tail blend into handoff-start pose (retreat↔handoff C¹). */
export const IN_PLACE_RETREAT_HANDOFF_BLEND_START_U = 0.86;
/** Preview handoff tumble fades out before settle begins. */
// Earlier decay reduces mid-handoff ω spikes (u≈0.38–0.40) without changing step seams.
export const IN_PLACE_HANDOFF_TUMBLE_DECAY_START_U = 0.34;
export const IN_PLACE_HANDOFF_TUMBLE_DECAY_END_U = 0.68;

function resolvePreviewHandoffTumbleIntensity(
  phaseU: number,
  fx: CubeShowcaseFxOptions,
  whooshScale: number
): number {
  const tumbleRamp = fanSmootherstep(0, 0.1, phaseU);
  const tumbleDecay =
    1 -
    fanSmootherstep(
      IN_PLACE_HANDOFF_TUMBLE_DECAY_START_U,
      IN_PLACE_HANDOFF_TUMBLE_DECAY_END_U,
      phaseU
    );
  return resolvePreviewTumbleIntensity(fx) * whooshScale * tumbleRamp * tumbleDecay;
}

/** Handoff-end orientation — matches approach step+1 entry (C⁰ at step seam). */
export function resolveInPlaceHandoffEndRotation(
  step: number,
  faceRotation: THREE.Euler,
  exit: THREE.Euler,
  motionSeed: number,
  rotationMode: CubeRotationMode,
  speedMul: number,
  profile: FanTimelineProfile,
  fx: CubeShowcaseFxOptions
): THREE.Euler {
  const bounds = getStepPhaseBoundaryMs(step, profile, speedMul);
  const orientEnd = slerpCubeTransition(
    faceRotation,
    exit,
    retreatOrientEase(1),
    step,
    rotationMode
  );
  let rotation = applyTimelineYawAfterShowcase(
    orientEnd,
    step,
    bounds.stepEndMs,
    bounds.showcaseEndMs,
    motionSeed,
    rotationMode,
    speedMul,
    profile,
    fx
  );
  if (isFanMotionExportRecording()) {
    const handoffTi = exportTransitTumbleIntensity("handoff", 1, FAN_SCALE_RETREAT);
    if (handoffTi > 0.001) {
      rotation = fanAxisTumble(
        rotation,
        step,
        bounds.retreatMs + bounds.gapMs,
        motionSeed,
        handoffTi,
        { wobble: fx.cubeComplexRotationEnabled }
      );
    }
  }
  return rotation;
}

/** Handoff-start orientation (retreat end) — matches handoff u=0 for C¹ seam. */
export function resolveInPlaceHandoffStartRotation(
  step: number,
  faceRotation: THREE.Euler,
  exit: THREE.Euler,
  motionSeed: number,
  rotationMode: CubeRotationMode,
  speedMul: number,
  profile: FanTimelineProfile,
  fx: CubeShowcaseFxOptions
): THREE.Euler {
  const bounds = getStepPhaseBoundaryMs(step, profile, speedMul);
  const orientBase = slerpCubeTransition(
    faceRotation,
    exit,
    retreatOrientEase(1),
    step,
    rotationMode
  );
  const motionElapsed = bounds.showcaseEndMs + bounds.retreatMs;
  let rotation = applyTimelineYawAfterShowcase(
    orientBase,
    step,
    motionElapsed,
    bounds.showcaseEndMs,
    motionSeed,
    rotationMode,
    speedMul,
    profile,
    fx
  );
  if (isFanMotionExportRecording()) {
    const retreatEndScale = sampleRetreatPresentationScale(1);
    const retreatEndTi = exportTransitTumbleIntensity("retreat", 1, retreatEndScale);
    if (retreatEndTi > 0.001) {
      rotation = fanAxisTumble(
        rotation,
        step,
        bounds.retreatMs,
        motionSeed,
        retreatEndTi,
        { wobble: fx.cubeComplexRotationEnabled }
      );
    }
  }
  return rotation;
}

/** Apply in-place handoff tail settle when u passes {@link IN_PLACE_HANDOFF_SETTLE_START_U}. */
export function applyInPlaceHandoffSettle(
  rotation: THREE.Euler,
  phaseU: number,
  endRotation: THREE.Euler
): THREE.Euler {
  if (phaseU <= IN_PLACE_HANDOFF_SETTLE_START_U) {
    return rotation;
  }
  const settleT = fanSmootherstep(IN_PLACE_HANDOFF_SETTLE_START_U, 1, phaseU);
  return slerpEuler(rotation, endRotation, settleT);
}

function baseInPlaceTumbleIntensity(fx: CubeShowcaseFxOptions): number {
  if (!fx.cubeComplexRotationEnabled) {
    return 0;
  }
  return fx.cubeComplexRotationIntensity;
}

/**
 * Single approach progress for path align + yaw revs (in-place / default).
 * Whoosh mode blends scale-coupled integration with the same envelope.
 */
export function resolveApproachAlignProgress(
  phaseU: number,
  step: number,
  fx: CubeShowcaseFxOptions
): number {
  const motionEnvelope = approachSpinEase(phaseU, step > 0);
  if (!shouldScaleCoupleSpin(fx)) {
    return motionEnvelope;
  }
  const integrated = integratePresentationSpinProgress(
    sampleApproachPresentationScale,
    "approach",
    phaseU
  );
  const intensity = fx.cubeAcceleratedSpinIntensity;
  return integrated * intensity + motionEnvelope * (1 - intensity);
}

function resolveTimelineYawRevs(
  stepElapsedMs: number,
  step: number,
  speedMul: number,
  profile: FanTimelineProfile,
  rotationMode: CubeRotationMode,
  fx: CubeShowcaseFxOptions
): number {
  const mode = isFanMotionExportRecording()
    ? resolveExportRotationMode(rotationMode)
    : rotationMode;
  return getScaleGatedRevsWithinStep(
    stepElapsedMs,
    step,
    speedMul,
    profile,
    mode,
    fx
  );
}

/** Layer 1 — styled path toward face. */
export function composePathRotation(
  from: THREE.Euler,
  to: THREE.Euler,
  alignProgress: number,
  step: number,
  rotationMode: CubeRotationMode,
  styled = true
): THREE.Euler {
  const alpha = Math.min(1, Math.max(0, alignProgress));
  if (alpha <= 0) {
    return from.clone();
  }
  if (styled) {
    return slerpCubeTransition(from, to, alpha, step, rotationMode);
  }
  return slerpEuler(from, to, alpha);
}

/** Layer 2 — world-Y yaw; revScale fades yaw as path curve absorbs motion. */
export function composeYawRotation(
  pathRotation: THREE.Euler,
  ctx: FanMotionRuntimeContext,
  revScale = 1,
  yawRevs?: number
): THREE.Euler {
  const { step, stepElapsed, motionSeed, rotationMode, speedMul, profile, fx } = ctx;
  const entranceYaw =
    profile === "entrance_processional" &&
    (rotationMode === "yaw_cw" || rotationMode === "yaw_ccw");
  const yawSign = resolveSpinYawSign(rotationMode, step);
  const scale = Math.max(0, Math.min(1, revScale));
  const revs =
    (yawRevs ??
      resolveTimelineYawRevs(
        stepElapsed,
        step,
        speedMul,
        profile,
        rotationMode,
        fx
      )) * scale;
  const spin = entranceYaw ? revs * yawSign : revs;
  return fanSpinEuler(motionSeed, step, pathRotation, spin);
}

/** Layer 3 — local pitch/roll tumble. */
export function composeTumbleRotation(
  rotation: THREE.Euler,
  ctx: FanMotionRuntimeContext,
  intensity: number,
  tumbleElapsedMs: number
): THREE.Euler {
  if (intensity <= 0.001) {
    return rotation;
  }
  const { step, motionSeed, fx } = ctx;
  return fanAxisTumble(rotation, step, tumbleElapsedMs, motionSeed, intensity, {
    wobble: tumbleUsesWobble(fx),
  });
}

/** Layer 4 — face-forward settle (approach phase only). */
export function composeFaceSettleRotation(
  rotation: THREE.Euler,
  faceForward: THREE.Euler,
  motionScale: number,
  phaseU: number
): THREE.Euler {
  return blendRotationTowardFaceAtPeak(
    rotation,
    faceForward,
    motionScale,
    phaseU,
    "approach"
  );
}

export interface InPlaceApproachRotationInput {
  ctx: FanMotionRuntimeContext;
  entry: THREE.Euler;
  faceRotation: THREE.Euler;
  yawBase: THREE.Euler;
  motionScale: number;
  alignProgress: number;
}

/**
 * In-place approach — simplified: path only.
 * Complex FX: path → yaw (step 0) → tumble → face settle.
 */
export function composeInPlaceApproachRotation(
  input: InPlaceApproachRotationInput
): THREE.Euler {
  const { ctx, entry, faceRotation, yawBase, motionScale, alignProgress } = input;
  const { state, step, fx } = ctx;
  const pathFrom = step === 0 ? entry : yawBase;

  const pathRotation = composePathRotation(
    pathFrom,
    faceRotation,
    alignProgress,
    step,
    ctx.rotationMode,
    true
  );

  let rotation: THREE.Euler;
  if (step > 0) {
    rotation = pathRotation;
  } else {
    const yawRevScale = 1 - approachSpinToPathHandoffBlend(state.phaseU);
    const approachYawRevs = getApproachYawRevsOnly(
      ctx.stepElapsed,
      step,
      ctx.speedMul,
      ctx.profile,
      ctx.rotationMode,
      fx
    );
    const gatedApproachYaw = isFanMotionExportRecording()
      ? approachYawRevs * rotationMotionGate(motionScale, "approach", state.phaseU)
      : approachYawRevs;
    rotation = composeYawRotation(pathRotation, ctx, yawRevScale, gatedApproachYaw);
  }

  const tumbleStrength = isFanMotionExportRecording()
    ? exportTransitTumbleIntensity("approach", state.phaseU, motionScale)
    : baseInPlaceTumbleIntensity(fx);
  const tumbleRamp = fanSmootherstep(0, 0.14, state.phaseU);
  const tumbleGate = isFanMotionExportRecording()
    ? rotationMotionGate(motionScale, "approach", state.phaseU)
    : 1;
  const tumbleI =
    tumbleStrength * tumbleGate * approachSpinEnvelope(state.phaseU) * tumbleRamp;

  if (tumbleI > 0.001) {
    const mul = fanSpeedMul(ctx.speedMul);
    const gapMs = FAN_GAP_MS / mul;
    const tumbleElapsed =
      (step > 0 ? gapMs : 0) +
      approachWanderEffectiveMs(state.phaseElapsed, state.phaseDuration, fx);
    rotation = composeTumbleRotation(rotation, ctx, tumbleI, tumbleElapsed);
  }

  return composeFaceSettleRotation(
    rotation,
    faceRotation,
    motionScale,
    state.phaseU
  );
}

export interface InPlaceRetreatRotationInput {
  ctx: FanMotionRuntimeContext;
  faceRotation: THREE.Euler;
  exit: THREE.Euler;
  motionScale: number;
  motionStepElapsed: number;
  showcaseEndMs: number;
}

/**
 * In-place retreat — path → yaw → (export tumble) → handoff-start blend
 */
export function composeInPlaceRetreatRotation(
  input: InPlaceRetreatRotationInput
): THREE.Euler {
  const { ctx, faceRotation, exit, motionScale, motionStepElapsed, showcaseEndMs } =
    input;
  const { state, step, motionSeed, rotationMode, speedMul, profile, fx } = ctx;
  const orientBase = slerpCubeTransition(
    faceRotation,
    exit,
    retreatOrientEase(state.phaseU),
    step,
    rotationMode
  );
  let rotation = applyTimelineYawAfterShowcase(
    orientBase,
    step,
    motionStepElapsed,
    showcaseEndMs,
    motionSeed,
    rotationMode,
    speedMul,
    profile,
    fx
  );
  if (isFanMotionExportRecording()) {
    const ti = exportTransitTumbleIntensity("retreat", state.phaseU, motionScale);
    if (ti > 0.001) {
      rotation = applyAxisTumble(
        rotation,
        step,
        state.phaseElapsed,
        motionSeed,
        ti,
        fx
      );
    }
  }
  if (state.phaseU > IN_PLACE_RETREAT_HANDOFF_BLEND_START_U) {
    const handoffStart = resolveInPlaceHandoffStartRotation(
      step,
      faceRotation,
      exit,
      motionSeed,
      rotationMode,
      speedMul,
      profile,
      fx
    );
    rotation = slerpEuler(
      rotation,
      handoffStart,
      fanSmootherstep(IN_PLACE_RETREAT_HANDOFF_BLEND_START_U, 1, state.phaseU)
    );
  }
  return rotation;
}

export interface InPlaceHandoffRotationInput {
  ctx: FanMotionRuntimeContext;
  faceRotation: THREE.Euler;
  exit: THREE.Euler;
  motionScale: number;
  motionElapsed: number;
  showcaseEndMs: number;
  retreatMs: number;
}

/**
 * In-place handoff — path → yaw → tumble → settle-to-end
 */
export function composeInPlaceHandoffRotation(
  input: InPlaceHandoffRotationInput
): THREE.Euler {
  const {
    ctx,
    faceRotation,
    exit,
    motionScale,
    motionElapsed,
    showcaseEndMs,
    retreatMs,
  } = input;
  const { state, step, motionSeed, rotationMode, speedMul, profile, fx } = ctx;
  const whooshSpin = shouldScaleCoupleSpin(fx);
  const orientBase = slerpCubeTransition(
    faceRotation,
    exit,
    retreatOrientEase(1),
    step,
    rotationMode
  );
  let rotation = applyTimelineYawAfterShowcase(
    orientBase,
    step,
    motionElapsed,
    showcaseEndMs,
    motionSeed,
    rotationMode,
    speedMul,
    profile,
    fx
  );

  if (isFanMotionExportRecording()) {
    const tumbleI = resolveExportHandoffTumbleIntensity(state.phaseU, motionScale);
    if (tumbleI > 0.001) {
      rotation = applyAxisTumble(
        rotation,
        step,
        retreatMs + state.phaseElapsed,
        motionSeed,
        tumbleI,
        fx
      );
    }
  } else {
    const tumbleI = resolvePreviewHandoffTumbleIntensity(
      state.phaseU,
      fx,
      whooshSpin ? 0.58 : 0.3
    );
    if (tumbleI > 0.001) {
      const tumbleElapsed = whooshSpin
        ? scaleCoupledMotionElapsed(
            state.phaseElapsed,
            state.phaseDuration,
            () => sampleHandoffPresentationScale(),
            "handoff"
          )
        : state.phaseElapsed;
      rotation = applyAxisTumble(
        rotation,
        step,
        tumbleElapsed,
        motionSeed,
        tumbleI,
        fx
      );
    }
  }

  const endRot = resolveInPlaceHandoffEndRotation(
    step,
    faceRotation,
    exit,
    motionSeed,
    rotationMode,
    speedMul,
    profile,
    fx
  );
  return applyInPlaceHandoffSettle(rotation, state.phaseU, endRot);
}

export interface ZoomApproachRotationInput {
  ctx: FanMotionRuntimeContext;
  entry: THREE.Euler;
  faceRotation: THREE.Euler;
  /** Step>0 handoff-end pose — same seam as in-place approach. */
  yawBase?: THREE.Euler;
  motionScale: number;
  pathAlignU: number;
  alignU: number;
  entranceYaw: boolean;
}

/** Zoom / whoosh approach — path → yaw → tumble → face settle */
export function composeZoomApproachRotation(input: ZoomApproachRotationInput): THREE.Euler {
  const {
    ctx,
    entry,
    faceRotation,
    yawBase,
    motionScale,
    pathAlignU,
    alignU,
    entranceYaw,
  } = input;
  const { state, step, stepElapsed, motionSeed, rotationMode, speedMul, profile, fx } = ctx;
  const whooshSpin = shouldScaleCoupleSpin(fx);
  const motionGate = rotationMotionGate(motionScale, "approach", state.phaseU);
  const wanderIntensity = motionGate * approachSpinEnvelope(state.phaseU);
  const showcaseSettle = motionGate;
  const gapMs = FAN_GAP_MS / fanSpeedMul(speedMul);

  const pathFrom = step === 0 ? entry.clone() : (yawBase ?? entry.clone());

  let faceTarget = faceRotation.clone();
  if (entranceYaw) {
    const fromFace =
      step === 0
        ? entry.clone()
        : getCubeShowcaseRootRotation(getPresentationFace(step - 1));
    faceTarget = slerpEuler(fromFace, faceRotation, alignU);
  }
  const pathRotation =
    step > 0 && yawBase
      ? composePathRotation(
          pathFrom,
          faceTarget,
          pathAlignU,
          step,
          rotationMode,
          !entranceYaw
        )
      : slerpEuler(pathFrom, faceTarget, pathAlignU);
  const wanderElapsedMs = approachWanderEffectiveMs(
    state.phaseElapsed,
    state.phaseDuration,
    fx
  );
  const tumbleElapsedMs = whooshSpin
    ? (step > 0 ? gapMs * 0.55 : 0) +
      scaleCoupledMotionElapsed(
        state.phaseElapsed,
        state.phaseDuration,
        sampleApproachPresentationScale,
        "approach"
      )
    : (step > 0 ? gapMs : 0) + wanderElapsedMs;

  let yawRotation: THREE.Euler;
  if (step === 0) {
    yawRotation = applyTimelineYaw(
      pathRotation,
      step,
      stepElapsed,
      motionSeed,
      rotationMode,
      speedMul,
      profile,
      fx
    );
  } else if (whooshSpin) {
    const approachYawRevs = getApproachYawRevsOnly(
      stepElapsed,
      step,
      speedMul,
      profile,
      rotationMode,
      fx
    );
    const gatedApproachYaw = isFanMotionExportRecording()
      ? approachYawRevs * motionGate
      : approachYawRevs;
    yawRotation = composeYawRotation(pathRotation, ctx, 1, gatedApproachYaw);
  } else {
    yawRotation = pathRotation;
  }
  const targetTumbleI = isFanMotionExportRecording()
    ? exportTransitTumbleIntensity("approach", state.phaseU, motionScale)
    : wanderIntensity * resolvePreviewTumbleIntensity(fx) * showcaseSettle;
  const tumbleRamp = fanSmootherstep(0, 0.14, state.phaseU);
  const tumbleI =
    step > 0 ? targetTumbleI * tumbleRamp : targetTumbleI * showcaseSettle;
  let rotation = applyAxisTumble(
    yawRotation,
    step,
    tumbleElapsedMs,
    motionSeed,
    tumbleI,
    fx
  );
  return blendRotationTowardFaceAtPeak(
    rotation,
    faceRotation,
    motionScale,
    state.phaseU,
    "approach"
  );
}

export interface ZoomRetreatRotationInput {
  ctx: FanMotionRuntimeContext;
  faceRotation: THREE.Euler;
  exit: THREE.Euler;
  motionScale: number;
  motionStepElapsed: number;
  showcaseEndMs: number;
  entranceYaw: boolean;
  orientEase: number;
}

/** Zoom / whoosh retreat — orient → yaw → shrink gate → tumble */
export function composeZoomRetreatRotation(input: ZoomRetreatRotationInput): THREE.Euler {
  const {
    ctx,
    faceRotation,
    exit,
    motionScale,
    motionStepElapsed,
    showcaseEndMs,
    entranceYaw,
    orientEase,
  } = input;
  const { state, step, motionSeed, rotationMode, speedMul, profile, fx } = ctx;
  const whooshSpin = shouldScaleCoupleSpin(fx);
  const shrinkGate = fx.cubeShowcaseZoomEnabled
    ? rotationMotionGate(motionScale, "retreat")
    : 1;
  const inPlace = !fx.cubeShowcaseZoomEnabled;
  const orientBase =
    entranceYaw || inPlace
      ? faceRotation.clone()
      : slerpEuler(faceRotation, exit, orientEase);
  const showcaseSettled = faceRotation.clone();
  let rotation = applyTimelineYawAfterShowcase(
    orientBase,
    step,
    motionStepElapsed,
    showcaseEndMs,
    motionSeed,
    rotationMode,
    speedMul,
    profile,
    fx
  );
  if (isFanMotionExportRecording()) {
    const ti = exportTransitTumbleIntensity("retreat", state.phaseU, motionScale);
    if (ti > 0.001) {
      rotation = applyAxisTumble(
        rotation,
        step,
        state.phaseElapsed,
        motionSeed,
        ti,
        fx
      );
    }
    return rotation;
  }
  if (shrinkGate < 0.999) {
    rotation = slerpEuler(showcaseSettled, rotation, shrinkGate);
  }
  if (whooshSpin && shrinkGate > 0.001) {
    const tumbleElapsed = scaleCoupledMotionElapsed(
      state.phaseElapsed,
      state.phaseDuration,
      sampleRetreatPresentationScale,
      "retreat"
    );
    const whooshI =
      resolvePreviewTumbleIntensity(fx) *
      shrinkGate *
      (0.45 + 0.55 * retreatOrientEase(state.phaseU));
    rotation = applyAxisTumble(
      rotation,
      step + 1,
      tumbleElapsed,
      motionSeed,
      whooshI,
      fx
    );
  }
  return rotation;
}

export interface ZoomHandoffRotationInput {
  ctx: FanMotionRuntimeContext;
  faceRotation: THREE.Euler;
  exit: THREE.Euler;
  motionScale: number;
  motionElapsed: number;
  showcaseEndMs: number;
  entranceYaw: boolean;
  inPlace: boolean;
}

/** Zoom / whoosh handoff — orient → yaw → tumble (no in-place settle) */
export function composeZoomHandoffRotation(input: ZoomHandoffRotationInput): THREE.Euler {
  const {
    ctx,
    faceRotation,
    exit,
    motionScale,
    motionElapsed,
    showcaseEndMs,
    entranceYaw,
    inPlace,
  } = input;
  const { state, step, motionSeed, rotationMode, speedMul, profile, fx } = ctx;
  const whooshSpin = shouldScaleCoupleSpin(fx);
  const orientBase =
    entranceYaw || inPlace
      ? faceRotation.clone()
      : slerpEuler(faceRotation, exit, retreatOrientEase(1));
  let rotation = applyTimelineYawAfterShowcase(
    orientBase,
    step,
    motionElapsed,
    showcaseEndMs,
    motionSeed,
    rotationMode,
    speedMul,
    profile,
    fx
  );
  if (isFanMotionExportRecording()) {
    const tumbleI = resolveExportHandoffTumbleIntensity(state.phaseU, motionScale);
    if (tumbleI > 0.001) {
      rotation = applyAxisTumble(
        rotation,
        step + 1,
        state.phaseElapsed,
        motionSeed,
        tumbleI,
        fx
      );
    }
    return rotation;
  }
  const tumbleI = resolvePreviewHandoffTumbleIntensity(
    state.phaseU,
    fx,
    whooshSpin ? 0.58 : 0.3
  );
  if (tumbleI > 0.001) {
    const tumbleElapsed = whooshSpin
      ? scaleCoupledMotionElapsed(
          state.phaseElapsed,
          state.phaseDuration,
          () => sampleHandoffPresentationScale(),
          "handoff"
        )
      : state.phaseElapsed;
    rotation = applyAxisTumble(
      rotation,
      step + 1,
      tumbleElapsed,
      motionSeed,
      tumbleI,
      fx
    );
  }
  return rotation;
}
