import type { CubeShowcaseFxOptions } from "@mbox/shared";
import type { CubeRotationMode } from "./cubeTransitionRotation";
import type { FanPhaseState, FanTimelineProfile } from "./fanTiming";

/**
 * Runtime inputs shared by phase samplers and {@link fanRotationComposer}.
 * Keeps motion math independent of presentation scale / camera merge.
 */
export interface FanMotionRuntimeContext {
  state: FanPhaseState;
  step: number;
  stepElapsed: number;
  motionSeed: number;
  rotationMode: CubeRotationMode;
  speedMul: number;
  profile: FanTimelineProfile;
  fx: CubeShowcaseFxOptions;
}

/** Documented composition order — one stack, no hidden multiplies elsewhere. */
export const FAN_ROTATION_LAYER_ORDER = [
  "path",
  "yaw",
  "tumble",
  "faceSettle",
] as const;

export type FanRotationLayer = (typeof FAN_ROTATION_LAYER_ORDER)[number];

/**
 * Effect overlap index — what stacks where, and what wins at peak scale.
 * Used to avoid duplicate gates / competing slerps in phase samplers.
 */
export const FAN_MOTION_EFFECT_INDEX = {
  /** ω→0 only at FAN_SCALE_PEAK; gates yaw + export tumble. */
  peakScaleGate: "rotationMotionGate",
  /** Approach only: face-forward slerp (never retreat/handoff). */
  faceSettle: "blendRotationTowardFaceAtPeak",
  /** Whoosh zoom: scale-first retreat orient + shrinkGate. */
  retreatShrink: "rotationMotionGate(retreat)",
  /** Step seam: linear blend (not easeInOut) for C¹ ω carry. */
  stepSeam: "stepSeamCrossfadeT",
  /** Phase seam: smootherstep blend (approach↔showcase↔retreat). */
  phaseSeam: "phaseCrossfadeT",
  /** Preview only: angular inertia spring on root (off when recording). */
  angularInertia: "cubeAngularInertia",
  /** Preview only: camera parallax coupling (off when recording). */
  rotationParallax: "CubeView.updateRotationParallax",
} as const;
