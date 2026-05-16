import * as THREE from "three";
import type { PresentationEffectId } from "./presentationEffects";
import type { StepMotionVariety, StepPhaseTiming } from "./cubeMotionVariety";
import {
  CORNER_REST_ROTATION,
  DEFAULT_CAMERA_Z,
  DEFAULT_FOV,
  FRONT_CAMERA_Z,
  FRONT_FOV,
  PARALLAX_MS,
  RESET_MS,
  ROTATE_MS,
  ZOOM_MS,
  getFaceRotation,
  getPresentationFace,
  getParallaxAmount,
  lerpEuler,
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
  return getParallaxAmount(stepElapsed - parallaxStart);
}

const SCENE_BRIDGE_BLEND = 0.22;

function getSceneBridgeRotation(step: number, presentationCount: number): THREE.Euler {
  if (presentationCount <= 1) {
    return getFaceRotation(getPresentationFace(step));
  }
  const fromFace = getPresentationFace(step);
  const toFace = getPresentationFace((step + 1) % presentationCount);
  return slerpEuler(getFaceRotation(fromFace), getFaceRotation(toFace), SCENE_BRIDGE_BLEND);
}

/** Opening pose for the first scene in a continuous reel. */
function getCubeRestRotation(step: number, variety?: StepMotionVariety): THREE.Euler {
  const variants = [
    CORNER_REST_ROTATION,
    new THREE.Euler(-0.28, 0.88, -0.1),
    new THREE.Euler(-0.48, 0.45, 0.16),
    new THREE.Euler(-0.22, 0.72, 0.22),
  ];
  const base = variants[step % variants.length]!.clone();
  if (variety) {
    base.x += variety.restTiltOffset.x;
    base.y += variety.restTiltOffset.y;
    base.z += variety.restTiltOffset.z;
  }
  return base;
}

function getCubeCameraDrift(
  stepElapsed: number,
  step: number,
  timing: StepPhaseTiming = DEFAULT_STEP_PHASE_TIMING
): { x: number; y: number } {
  const parallaxStart = timing.rotateMs + timing.zoomMs;
  if (stepElapsed < parallaxStart || stepElapsed >= parallaxStart + timing.parallaxMs) {
    return { x: 0, y: 0 };
  }
  const t = stepElapsed - parallaxStart;
  const wobble = step * 0.7;
  return {
    x: Math.sin(t * 0.0024 + wobble) * 0.68,
    y: Math.cos(t * 0.0017 + wobble * 0.6) * 0.3,
  };
}

function applyCubeMotionAccent(
  rotation: THREE.Euler,
  phase: ReturnType<typeof getPhase>,
  step: number,
  stepElapsed: number,
  variety?: StepMotionVariety
): THREE.Euler {
  const accent = rotation.clone();
  const spinDir = variety?.spinDirection ?? (step % 2 === 0 ? 1 : -1);
  const yawScale = variety?.swingYawScale ?? 1;
  const pitchScale = variety?.swingPitchScale ?? 1;

  if (phase.phase === "rotate" || phase.phase === "reset") {
    const swing = Math.sin(phase.alpha * Math.PI);
    const swingStrength = phase.phase === "reset" ? 0.28 : 0.82;
    accent.y += swing * swingStrength * spinDir * yawScale;
    accent.x += swing * 0.22 * pitchScale * (phase.phase === "reset" ? 0.35 : 1);
    accent.z += swing * 0.1 * -spinDir * yawScale * (phase.phase === "reset" ? 0.35 : 1);
  }

  if (phase.phase === "zoom") {
    accent.y += Math.sin(stepElapsed * 0.0015 + step) * 0.06;
  } else if (phase.phase === "parallax") {
    accent.y += Math.sin(stepElapsed * 0.0012 + step) * 0.04;
  }

  return accent;
}

function getCubeScale(
  phase: ReturnType<typeof getPhase>,
  stepElapsed: number,
  timing: StepPhaseTiming = DEFAULT_STEP_PHASE_TIMING
): number {
  if (phase.phase === "zoom") {
    return THREE.MathUtils.lerp(1, 1.045, phase.alpha);
  }
  if (phase.phase === "parallax") {
    const t = stepElapsed - timing.rotateMs - timing.zoomMs;
    return 1 + Math.sin(t * 0.0028) * 0.055;
  }
  return 1;
}

function computeCubeFrame(
  step: number,
  stepElapsed: number,
  currentFace: number,
  presentationCount: number,
  timing: StepPhaseTiming = DEFAULT_STEP_PHASE_TIMING,
  variety?: StepMotionVariety
): PresentationFrame {
  const phase = getPhase(stepElapsed, timing);
  const camera = getCameraState(phase);
  const cameraDrift = getCubeCameraDrift(stepElapsed, step, timing);
  const targetRotation = getFaceRotation(currentFace);
  const entryRotation =
    step === 0 ? getCubeRestRotation(step, variety) : getSceneBridgeRotation(step - 1, presentationCount);
  const exitRotation = getSceneBridgeRotation(step, presentationCount);

  let rotationAlpha = 1;
  let fromRotation = entryRotation;
  let toRotation = targetRotation;

  if (phase.phase === "rotate") {
    rotationAlpha = easeOutCubic(phase.alpha);
    fromRotation = entryRotation;
    toRotation = targetRotation;
  } else if (phase.phase === "reset") {
    rotationAlpha = easeInOut(phase.alpha);
    fromRotation = targetRotation;
    toRotation = exitRotation;
  } else {
    fromRotation = targetRotation;
    toRotation = targetRotation;
  }

  const baseRotation =
    phase.phase === "reset" || phase.phase === "rotate"
      ? slerpEuler(fromRotation, toRotation, rotationAlpha)
      : lerpEuler(fromRotation, toRotation, rotationAlpha);
  const nextRotation = applyCubeMotionAccent(baseRotation, phase, step, stepElapsed, variety);
  const scale = getCubeScale(phase, stepElapsed, timing);

  return {
    ...camera,
    cameraOffsetX: cameraDrift.x,
    cameraOffsetY: cameraDrift.y,
    parallaxAmount: getParallaxAmountForElapsed(stepElapsed, timing),
    applyRootTransform: (root) => {
      root.rotation.set(nextRotation.x, nextRotation.y, nextRotation.z);
      root.position.set(0, 0, 0);
      root.scale.set(scale, scale, scale);
    },
  };
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

  return {
    ...camera,
    parallaxAmount: getParallaxAmountForElapsed(stepElapsed, timing),
    applyRootTransform: (root) => {
      root.rotation.set(-0.12, angle, 0);
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
  const breathe = phase.phase === "parallax" ? Math.sin(stepElapsed * 0.0014 + step) * 0.07 : 0;

  return {
    ...camera,
    parallaxAmount: getParallaxAmountForElapsed(stepElapsed, timing),
    applyRootTransform: (root) => {
      root.rotation.set(0.18 + breathe, angle, 0.04);
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
  const closedTilt = -0.42;
  const openTilt = 0.18;
  const bridgeTilt = -0.14;
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
  const closedAngle = Math.PI * 0.46;
  const openAngle = 0;
  const bridgeAngle = Math.PI * 0.16;
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
      return computeCubeFrame(step, stepElapsed, currentFace, presentationCount, timing, variety);
  }
}
