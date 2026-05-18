import * as THREE from "three";
import type { PresentationEffectId } from "./presentationEffects";
import type { StepMotionVariety, StepPhaseTiming } from "./cubeMotionVariety";
import {
  resolveCubeRotation,
  sampleCubeContinuousMotion,
  type CubeMotionSample,
} from "./cubeContinuousMotion";
import { PERCEPTUAL_FOCUS_SCALE_GAIN } from "./perceptualMotion";
import {
  CORNER_REST_ROTATION,
  DEFAULT_CAMERA_Z,
  DEFAULT_FOV,
  FRONT_CAMERA_Z,
  FRONT_FOV,
  PARALLAX_MS,
  PRESENTATION_ZOOM_SCALE,
  RESET_MS,
  ROTATE_MS,
  ZOOM_MS,
  getFaceRotation,
  getParallaxAmount,
  getPresentationFace,
  slerpEuler,
} from "./cubeSequence";

export const DEFAULT_STEP_PHASE_TIMING: StepPhaseTiming = {
  rotateMs: ROTATE_MS,
  zoomMs: ZOOM_MS,
  parallaxMs: PARALLAX_MS,
  resetMs: RESET_MS,
};

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

function getCubeCameraState(sample: CubeMotionSample): { cameraZ: number; fieldOfView: number } {
  const farZ = DEFAULT_CAMERA_Z;
  const closeZ = DEFAULT_CAMERA_Z / PRESENTATION_ZOOM_SCALE;
  const dolly = sample.focusDolly;
  const cameraZ = THREE.MathUtils.lerp(farZ, closeZ, dolly);
  const fieldOfView = THREE.MathUtils.lerp(DEFAULT_FOV, FRONT_FOV, dolly * 0.92);
  return { cameraZ, fieldOfView };
}

function easeInOutSine(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return (-(Math.cos(Math.PI * x) - 1)) / 2;
}

function computeCubeFrame(
  step: number,
  stepElapsed: number,
  currentFace: number,
  presentationCount: number,
  timing: StepPhaseTiming = DEFAULT_STEP_PHASE_TIMING
): PresentationFrame {
  const motion = sampleCubeContinuousMotion(
    step,
    stepElapsed,
    timing,
    currentFace,
    presentationCount
  );
  const rotation = resolveCubeRotation(step, motion, currentFace, presentationCount);
  const camera = getCubeCameraState(motion);
  const scale = 1 + motion.focusDolly * PERCEPTUAL_FOCUS_SCALE_GAIN;

  return {
    ...camera,
    cameraOffsetX: 0,
    cameraOffsetY: 0,
    parallaxAmount: motion.parallaxAmount,
    applyRootTransform: (root) => {
      root.rotation.set(rotation.x, rotation.y, rotation.z);
      root.position.set(0, 0, 0);
      root.scale.set(scale, scale, scale);
    },
  };
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
      root.rotation.set(-0.12 + wobble.pitch, angle, wobble.roll);
      root.position.set(0, 0, 0);
      root.scale.set(1, 1, 1);
    },
  };
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
}

/** Seam for preview loop: last cube face → step-0 entry pose (t=0). */
export function computeCubeLoopBridgeFrame(
  bridgeElapsed: number,
  bridgeMs: number,
  lastStep: number
): PresentationFrame {
  const alpha = easeInOutSine(Math.min(1, Math.max(0, bridgeElapsed / Math.max(bridgeMs, 1))));
  const fromRotation = getFaceRotation(getPresentationFace(lastStep));
  const toRotation = CORNER_REST_ROTATION.clone();
  const rotation = slerpEuler(fromRotation, toRotation, alpha);
  const farZ = DEFAULT_CAMERA_Z;
  const closeZ = DEFAULT_CAMERA_Z / PRESENTATION_ZOOM_SCALE;

  return {
    cameraZ: THREE.MathUtils.lerp(closeZ, farZ, alpha),
    fieldOfView: THREE.MathUtils.lerp(FRONT_FOV, DEFAULT_FOV, alpha * 0.92),
    cameraOffsetX: 0,
    cameraOffsetY: 0,
    parallaxAmount: 0,
    applyRootTransform: (root) => {
      root.rotation.set(rotation.x, rotation.y, rotation.z);
      root.position.set(0, 0, 0);
      root.scale.set(1, 1, 1);
    },
  };
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
      return computeTurntableFrame(step, stepElapsed, presentationCount, timing, variety);
    case "orbit_gallery":
      return computeOrbitFrame(step, stepElapsed, presentationCount, timing, variety);
    case "album_flip":
      return computeAlbumFrame(step, stepElapsed, presentationCount, timing);
    case "cube_focus":
    default:
      return computeCubeFrame(step, stepElapsed, currentFace, presentationCount, timing);
  }
}
