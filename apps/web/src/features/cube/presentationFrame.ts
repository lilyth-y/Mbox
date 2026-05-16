import * as THREE from "three";
import type { PresentationEffectId } from "./presentationEffects";
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
  getParallaxAmount,
  lerpEuler,
} from "./cubeSequence";

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export interface PresentationFrame {
  cameraZ: number;
  fieldOfView: number;
  parallaxAmount: number;
  applyRootTransform: (root: THREE.Object3D, step: number, presentationCount: number) => void;
}

function getPhase(stepElapsed: number) {
  if (stepElapsed < ROTATE_MS) {
    return {
      phase: "rotate" as const,
      alpha: easeInOut(stepElapsed / ROTATE_MS),
    };
  }
  if (stepElapsed < ROTATE_MS + ZOOM_MS) {
    return {
      phase: "zoom" as const,
      alpha: easeInOut((stepElapsed - ROTATE_MS) / ZOOM_MS),
    };
  }
  if (stepElapsed < ROTATE_MS + ZOOM_MS + PARALLAX_MS) {
    return {
      phase: "parallax" as const,
      alpha: 1,
    };
  }
  return {
    phase: "reset" as const,
    alpha: easeInOut((stepElapsed - ROTATE_MS - ZOOM_MS - PARALLAX_MS) / RESET_MS),
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

function getParallaxAmountForElapsed(stepElapsed: number): number {
  const parallaxStart = ROTATE_MS + ZOOM_MS;
  if (stepElapsed < parallaxStart || stepElapsed >= parallaxStart + PARALLAX_MS) {
    return 0;
  }
  return getParallaxAmount(stepElapsed - parallaxStart);
}

function computeCubeFrame(_step: number, stepElapsed: number, currentFace: number): PresentationFrame {
  const phase = getPhase(stepElapsed);
  const camera = getCameraState(phase);
  const targetRotation = getFaceRotation(currentFace);
  const restRotation = CORNER_REST_ROTATION;

  let rotationAlpha = 1;
  let fromRotation = restRotation;
  let toRotation = targetRotation;

  if (phase.phase === "rotate") {
    rotationAlpha = phase.alpha;
    fromRotation = restRotation;
    toRotation = targetRotation;
  } else if (phase.phase === "reset") {
    rotationAlpha = phase.alpha;
    fromRotation = targetRotation;
    toRotation = restRotation;
  } else {
    fromRotation = targetRotation;
    toRotation = targetRotation;
  }

  const nextRotation = lerpEuler(fromRotation, toRotation, rotationAlpha);

  return {
    ...camera,
    parallaxAmount: getParallaxAmountForElapsed(stepElapsed),
    applyRootTransform: (root) => {
      root.rotation.set(nextRotation.x, nextRotation.y, nextRotation.z);
      root.position.set(0, 0, 0);
      root.scale.set(1, 1, 1);
    },
  };
}

function computeTurntableFrame(step: number, stepElapsed: number, presentationCount: number): PresentationFrame {
  const phase = getPhase(stepElapsed);
  const camera = getCameraState(phase);
  const stepAngle = (Math.PI * 2) / Math.max(presentationCount, 1);
  const toAngle = step * stepAngle;
  const fromAngle = toAngle - stepAngle;
  const angle =
    phase.phase === "rotate"
      ? THREE.MathUtils.lerp(fromAngle, toAngle, easeOutCubic(phase.alpha))
      : toAngle;

  return {
    ...camera,
    parallaxAmount: getParallaxAmountForElapsed(stepElapsed),
    applyRootTransform: (root) => {
      root.rotation.set(-0.12, angle, 0);
      root.position.set(0, 0, 0);
      root.scale.set(1, 1, 1);
    },
  };
}

function computeOrbitFrame(step: number, stepElapsed: number, presentationCount: number): PresentationFrame {
  const phase = getPhase(stepElapsed);
  const camera = getCameraState(phase);
  const stepAngle = (Math.PI * 2) / Math.max(presentationCount, 1);
  const toAngle = step * stepAngle;
  const fromAngle = toAngle - stepAngle;
  const angle =
    phase.phase === "rotate"
      ? THREE.MathUtils.lerp(fromAngle, toAngle, easeOutCubic(phase.alpha))
      : toAngle;
  const breathe = phase.phase === "parallax" ? Math.sin(stepElapsed * 0.0012) * 0.04 : 0;

  return {
    ...camera,
    parallaxAmount: getParallaxAmountForElapsed(stepElapsed),
    applyRootTransform: (root) => {
      root.rotation.set(0.18 + breathe, angle, 0.04);
      root.position.set(0, 0.05, 0);
      root.scale.set(1, 1, 1);
    },
  };
}

function computeBookFrame(stepElapsed: number): PresentationFrame {
  const phase = getPhase(stepElapsed);
  const camera = getCameraState(phase);
  const closedTilt = -0.42;
  const openTilt = 0.18;
  const tilt =
    phase.phase === "rotate"
      ? THREE.MathUtils.lerp(closedTilt, openTilt, easeOutCubic(phase.alpha))
      : phase.phase === "reset"
        ? THREE.MathUtils.lerp(openTilt, closedTilt, phase.alpha)
        : openTilt;

  return {
    ...camera,
    parallaxAmount: getParallaxAmountForElapsed(stepElapsed),
    applyRootTransform: (root) => {
      root.rotation.set(0, tilt, 0);
      root.position.set(0, -0.08, 0);
      root.scale.set(1, 1, 1);
    },
  };
}

function computeAlbumFrame(stepElapsed: number): PresentationFrame {
  const phase = getPhase(stepElapsed);
  const camera = getCameraState(phase);
  const closedAngle = Math.PI * 0.46;
  const openAngle = 0;
  const angle =
    phase.phase === "rotate"
      ? THREE.MathUtils.lerp(closedAngle, openAngle, easeOutCubic(phase.alpha))
      : phase.phase === "reset"
        ? THREE.MathUtils.lerp(openAngle, closedAngle, phase.alpha)
        : openAngle;

  return {
    ...camera,
    parallaxAmount: getParallaxAmountForElapsed(stepElapsed),
    applyRootTransform: (root) => {
      root.rotation.set(0, angle, 0);
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
  currentFace: number
): PresentationFrame {
  switch (effect) {
    case "book_spread":
      return computeBookFrame(stepElapsed);
    case "turntable":
      return computeTurntableFrame(step, stepElapsed, presentationCount);
    case "orbit_gallery":
      return computeOrbitFrame(step, stepElapsed, presentationCount);
    case "album_flip":
      return computeAlbumFrame(stepElapsed);
    case "cube_focus":
    default:
      return computeCubeFrame(step, stepElapsed, currentFace);
  }
}
