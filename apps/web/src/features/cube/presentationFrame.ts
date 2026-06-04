import * as THREE from "three";
import type { PresentationEffectId } from "./presentationEffects";
import type { StepMotionVariety, StepPhaseTiming } from "./cubeMotionVariety";
import {
  sampleFanCubeMotion,
  computeFanLoopBridgeFrame,
  type FanTimelineProfile,
} from "./cubeFanTimeline";
import type { CubeRotationMode } from "./cubeTransitionRotation";
import {
  samplePhotoSlideshow3dMotion,
} from "./photoSlideshow3dTimeline";
import { applyExportPresentationOverrides } from "./presentationExport";
import type { ImageCenter } from "../../shared/types";
import {
  DEFAULT_CAMERA_Z,
  DEFAULT_FOV,
  FRONT_CAMERA_Z,
  FRONT_FOV,
  PARALLAX_MS,
  RESET_MS,
  ROTATE_MS,
  ZOOM_MS,
  getParallaxAmount,
} from "./cubeSequence";

export const DEFAULT_STEP_PHASE_TIMING: StepPhaseTiming = {
  rotateMs: ROTATE_MS,
  zoomMs: ZOOM_MS,
  parallaxMs: PARALLAX_MS,
  resetMs: RESET_MS,
};

/** Computes the 0→1 focus-pulse envelope:
 *  bell-curve that peaks at the middle of the showcase window and
 *  fades before the cube starts rotating away again.
 */
export function computeFocusPulse(focusDolly: number): number {
  // peaks when focusDolly == 1 (hold phase), fades on entry/exit
  return focusDolly * focusDolly;
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export interface PresentationFrame {
  cameraZ: number;
  fieldOfView: number;
  /** Subtle camera drift around the subject (parallax / hold phases). */
  cameraOffsetX?: number;
  cameraOffsetY?: number;
  parallaxAmount: number;
  /** 0-1 pulse for shader Z-push effect; peaks at full showcase focus. */
  focusPulse?: number;
  applyRootTransform: (root: THREE.Object3D, step: number, presentationCount: number) => void;
}

function getPhase(stepElapsed: number, timing: StepPhaseTiming = DEFAULT_STEP_PHASE_TIMING) {
  const { rotateMs, zoomMs, parallaxMs, resetMs } = timing;
  const zoomStart = rotateMs;
  const parallaxStart = rotateMs + zoomMs;
  const resetStart = parallaxStart + parallaxMs;

  if (stepElapsed < rotateMs) {
    return {
      phase: "rotate" as const,
      alpha: easeInOut(stepElapsed / rotateMs),
    };
  }
  if (stepElapsed < zoomStart + zoomMs) {
    return {
      phase: "zoom" as const,
      alpha: easeInOut((stepElapsed - zoomStart) / zoomMs),
    };
  }
  if (stepElapsed < resetStart) {
    return {
      phase: "parallax" as const,
      alpha: 1,
    };
  }
  return {
    phase: "reset" as const,
    alpha: easeInOut((stepElapsed - resetStart) / resetMs),
  };
}

function getCameraState(phase: ReturnType<typeof getPhase>) {
  if (phase.phase === "rotate") {
    return { cameraZ: DEFAULT_CAMERA_Z, fieldOfView: DEFAULT_FOV };
  }
  if (phase.phase === "zoom") {
    return {
      cameraZ: THREE.MathUtils.lerp(DEFAULT_CAMERA_Z, FRONT_CAMERA_Z, phase.alpha),
      fieldOfView: THREE.MathUtils.lerp(DEFAULT_FOV, FRONT_FOV, phase.alpha),
    };
  }
  if (phase.phase === "parallax") {
    return { cameraZ: FRONT_CAMERA_Z, fieldOfView: FRONT_FOV };
  }
  return {
    cameraZ: THREE.MathUtils.lerp(FRONT_CAMERA_Z, DEFAULT_CAMERA_Z, phase.alpha),
    fieldOfView: THREE.MathUtils.lerp(FRONT_FOV, DEFAULT_FOV, phase.alpha),
  };
}

function getParallaxAmountForElapsed(
  stepElapsed: number,
  timing: StepPhaseTiming = DEFAULT_STEP_PHASE_TIMING
): number {
  const parallaxStart = timing.rotateMs + timing.zoomMs;
  if (stepElapsed < parallaxStart || stepElapsed >= parallaxStart + timing.parallaxMs) {
    return 0;
  }
  return getParallaxAmount(stepElapsed - parallaxStart, timing.parallaxMs);
}

function computeCubeFrame(
  step: number,
  stepElapsed: number,
  currentFace: number,
  presentationCount: number,
  _timing: StepPhaseTiming = DEFAULT_STEP_PHASE_TIMING,
  _center?: ImageCenter,
  rotationMode: CubeRotationMode = "auto",
  exportRecording = false,
  motionSeed = 0,
  fanTimelineProfile: FanTimelineProfile = "wedding_default",
  hologramMode = false
): PresentationFrame {
  const fan = sampleFanCubeMotion(
    step,
    stepElapsed,
    currentFace,
    presentationCount,
    motionSeed,
    rotationMode,
    fanTimelineProfile
  );

  const frame: PresentationFrame = {
    cameraZ: DEFAULT_CAMERA_Z,
    fieldOfView: DEFAULT_FOV,
    cameraOffsetX: 0,
    cameraOffsetY: 0,
    parallaxAmount: fan.parallaxAmount,
    focusPulse: fan.focusPulse,
    applyRootTransform: (root) => {
      root.rotation.set(fan.rotation.x, fan.rotation.y, fan.rotation.z);
      root.position.set(0, 0, 0);
      root.scale.set(fan.presentationScale, fan.presentationScale, fan.presentationScale);
    },
  };
  return exportRecording
    ? applyExportPresentationOverrides(frame, { hologramMode })
    : frame;
}

/** Subtle music-box motion for turntable / orbit templates. */
function getOrgelWobble(
  phase: ReturnType<typeof getPhase>,
  stepElapsed: number,
  step: number
): { pitch: number; roll: number } {
  if (phase.phase === "parallax") {
    const wobble = Math.sin(stepElapsed * 0.0011 + step * 0.55);
    return { pitch: wobble * 0.028, roll: wobble * 0.012 };
  }
  if (phase.phase === "zoom") {
    const wobble = Math.sin(stepElapsed * 0.00125 + step * 0.4);
    return { pitch: wobble * 0.014, roll: wobble * 0.006 };
  }
  return { pitch: 0, roll: 0 };
}

function computeTurntableFrame(
  step: number,
  stepElapsed: number,
  presentationCount: number,
  timing: StepPhaseTiming = DEFAULT_STEP_PHASE_TIMING,
  variety?: StepMotionVariety,
  exportRecording = false
): PresentationFrame {
  const phase = getPhase(stepElapsed, timing);
  const camera = getCameraState(phase);
  const dir = variety?.orbitDirection ?? 1;
  const stepAngle = ((Math.PI * 2) / Math.max(presentationCount, 1)) * dir;
  const toAngle = step * stepAngle;
  const fromAngle = toAngle - stepAngle;
  const angle =
    phase.phase === "rotate"
      ? THREE.MathUtils.lerp(fromAngle, toAngle, easeOutCubic(phase.alpha))
      : toAngle;
  const wobble = getOrgelWobble(phase, stepElapsed, step);

  const frame: PresentationFrame = {
    ...camera,
    parallaxAmount: getParallaxAmountForElapsed(stepElapsed, timing) * 0.38,
    applyRootTransform: (root) => {
      root.rotation.set(-0.12 + wobble.pitch * 0.5, angle, wobble.roll * 0.5);
      root.position.set(0, 0, 0);
      root.scale.set(1, 1, 1);
    },
  };
  return exportRecording ? applyExportPresentationOverrides(frame) : frame;
}

function computeOrbitFrame(
  step: number,
  stepElapsed: number,
  presentationCount: number,
  timing: StepPhaseTiming = DEFAULT_STEP_PHASE_TIMING,
  variety?: StepMotionVariety
): PresentationFrame {
  const phase = getPhase(stepElapsed, timing);
  const camera = getCameraState(phase);
  const dir = variety?.orbitDirection ?? 1;
  const stepAngle = ((Math.PI * 2) / Math.max(presentationCount, 1)) * dir;
  const toAngle = step * stepAngle;
  const fromAngle = toAngle - stepAngle;
  const angle =
    phase.phase === "rotate"
      ? THREE.MathUtils.lerp(fromAngle, toAngle, easeOutCubic(phase.alpha))
      : toAngle;
  const wobble = getOrgelWobble(phase, stepElapsed, step);

  return {
    ...camera,
    parallaxAmount: getParallaxAmountForElapsed(stepElapsed, timing),
    applyRootTransform: (root) => {
      root.rotation.set(0.14 + wobble.pitch, angle, 0.03 + wobble.roll);
      root.position.set(0, 0.05, 0);
      root.scale.set(1, 1, 1);
    },
  };
}

function computeBookFrame(
  step: number,
  stepElapsed: number,
  presentationCount: number,
  timing: StepPhaseTiming = DEFAULT_STEP_PHASE_TIMING
): PresentationFrame {
  const phase = getPhase(stepElapsed, timing);
  const camera = getCameraState(phase);
  const closedTilt = -0.36;
  const openTilt = 0.14;
  const bridgeTilt = -0.11;
  const entryTilt = step === 0 ? closedTilt : bridgeTilt;
  const exitTilt = step + 1 < presentationCount ? bridgeTilt : closedTilt * 0.55;
  const tilt =
    phase.phase === "rotate"
      ? THREE.MathUtils.lerp(entryTilt, openTilt, easeOutCubic(phase.alpha))
      : phase.phase === "reset"
        ? THREE.MathUtils.lerp(openTilt, exitTilt, easeInOut(phase.alpha))
        : openTilt;

  return {
    ...camera,
    parallaxAmount: getParallaxAmountForElapsed(stepElapsed, timing),
    applyRootTransform: (root) => {
      root.rotation.set(0, tilt, 0);
      root.position.set(0, -0.08, 0);
      root.scale.set(1, 1, 1);
    },
  };
}

function computePhotoSlideshow3dFrame(
  step: number,
  stepElapsed: number,
  presentationCount: number,
  exportRecording = false,
  motionSeed = 0
): PresentationFrame {
  const sample = samplePhotoSlideshow3dMotion(
    step,
    stepElapsed,
    presentationCount,
    motionSeed
  );

  const frame: PresentationFrame = {
    cameraZ: sample.cameraZ,
    fieldOfView: sample.fieldOfView,
    cameraOffsetX: sample.cameraOffsetX,
    cameraOffsetY: sample.cameraOffsetY,
    parallaxAmount: sample.parallaxAmount,
    focusPulse: sample.focusPulse,
    applyRootTransform: (root) => {
      root.rotation.copy(sample.rotation);
      root.position.copy(sample.position);
      root.scale.set(
        sample.presentationScale,
        sample.presentationScale,
        sample.presentationScale
      );
    },
  };
  return exportRecording ? applyExportPresentationOverrides(frame) : frame;
}

function computeAlbumFrame(
  step: number,
  stepElapsed: number,
  presentationCount: number,
  timing: StepPhaseTiming = DEFAULT_STEP_PHASE_TIMING
): PresentationFrame {
  const phase = getPhase(stepElapsed, timing);
  const camera = getCameraState(phase);
  const closedAngle = Math.PI * 0.4;
  const openAngle = 0;
  const bridgeAngle = Math.PI * 0.13;
  const entryAngle = step === 0 ? closedAngle : bridgeAngle;
  const exitAngle = step + 1 < presentationCount ? bridgeAngle : closedAngle * 0.6;
  const angle =
    phase.phase === "rotate"
      ? THREE.MathUtils.lerp(entryAngle, openAngle, easeOutCubic(phase.alpha))
      : phase.phase === "reset"
        ? THREE.MathUtils.lerp(openAngle, exitAngle, easeInOut(phase.alpha))
        : openAngle;

  return {
    ...camera,
    parallaxAmount: getParallaxAmountForElapsed(stepElapsed, timing),
    applyRootTransform: (root) => {
      root.rotation.set(0, angle, 0);
      root.position.set(0, 0, 0);
      root.scale.set(1, 1, 1);
    },
  };
}

export interface PresentationMotionContext {
  timing?: StepPhaseTiming;
  variety?: StepMotionVariety;
  /** Current step image center, used for face-directed camera drift (cube_focus only). */
  imageCenter?: ImageCenter;
  cubeRotationMode?: CubeRotationMode;
  exportRecording?: boolean;
  /** Seeded fan spin (cube_focus). */
  motionSeed?: number;
  /** Fan wedding timeline profile (cube_focus only). */
  fanTimelineProfile?: FanTimelineProfile;
  /** Hologram disc export path — stronger parallax/focus in MP4. */
  hologramMode?: boolean;
}

/** Seam for preview loop: last cube face → step-0 entry pose (t=0). */
export function computeCubeLoopBridgeFrame(
  bridgeElapsed: number,
  bridgeMs: number,
  lastStep: number,
  motion: PresentationMotionContext = {}
): PresentationFrame {
  const fan = computeFanLoopBridgeFrame(
    bridgeElapsed,
    bridgeMs,
    lastStep,
    motion.motionSeed ?? 0,
    motion.cubeRotationMode ?? "auto",
    motion.fanTimelineProfile ?? "wedding_default"
  );
  return {
    cameraZ: fan.cameraZ,
    fieldOfView: fan.fieldOfView,
    cameraOffsetX: 0,
    cameraOffsetY: 0,
    parallaxAmount: fan.parallaxAmount,
    applyRootTransform: (root) => {
      fan.applyRootTransform(root);
    },
  };
}

/** Loop bridge only applies to cube_focus; other effects should pass loopBridgeMs = 0. */
export function computePresentationLoopBridgeFrame(
  effect: PresentationEffectId,
  bridgeElapsed: number,
  bridgeMs: number,
  lastStep: number,
  motion: PresentationMotionContext = {}
): PresentationFrame {
  if (effect !== "cube_focus" || bridgeMs <= 0) {
    return computePresentationFrame(effect, lastStep, 0, lastStep + 1, 0, motion);
  }
  return computeCubeLoopBridgeFrame(bridgeElapsed, bridgeMs, lastStep, motion);
}

export function computePresentationFrame(
  effect: PresentationEffectId,
  step: number,
  stepElapsed: number,
  presentationCount: number,
  currentFace: number,
  motion: PresentationMotionContext = {}
): PresentationFrame {
  const timing = motion.timing ?? DEFAULT_STEP_PHASE_TIMING;
  const variety = motion.variety;

  switch (effect) {
    case "book_spread":
      return computeBookFrame(step, stepElapsed, presentationCount, timing);
    case "turntable":
      return computeTurntableFrame(
        step,
        stepElapsed,
        presentationCount,
        timing,
        variety,
        motion.exportRecording
      );
    case "orbit_gallery":
      return computeOrbitFrame(step, stepElapsed, presentationCount, timing, variety);
    case "album_flip":
      return computeAlbumFrame(step, stepElapsed, presentationCount, timing);
    case "photo_slideshow_3d":
      return computePhotoSlideshow3dFrame(
        step,
        stepElapsed,
        presentationCount,
        motion.exportRecording,
        motion.motionSeed ?? 0
      );
    case "cube_focus":
    default:
      return computeCubeFrame(
        step,
        stepElapsed,
        currentFace,
        presentationCount,
        timing,
        motion.imageCenter,
        motion.cubeRotationMode ?? "auto",
        motion.exportRecording,
        motion.motionSeed ?? 0,
        motion.fanTimelineProfile ?? "wedding_default",
        motion.hologramMode ?? false
      );
  }
}
