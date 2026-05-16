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
  /** Subtle camera drift around the subject (parallax / hold phases). */
  cameraOffsetX?: number;
  cameraOffsetY?: number;
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

/** Alternate corner poses so each photo transition feels distinct. */
function getCubeRestRotation(step: number): THREE.Euler {
  const variants = [
    CORNER_REST_ROTATION,
    new THREE.Euler(-0.28, 0.88, -0.1),
    new THREE.Euler(-0.48, 0.45, 0.16),
    new THREE.Euler(-0.22, 0.72, 0.22),
  ];
  return variants[step % variants.length]!.clone();
}

function getCubeCameraDrift(stepElapsed: number, step: number): { x: number; y: number } {
  const parallaxStart = ROTATE_MS + ZOOM_MS;
  if (stepElapsed < parallaxStart || stepElapsed >= parallaxStart + PARALLAX_MS) {
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
  stepElapsed: number
): THREE.Euler {
  const accent = rotation.clone();
  const spinDir = step % 2 === 0 ? 1 : -1;

  if (phase.phase === "rotate" || phase.phase === "reset") {
    const swing = Math.sin(phase.alpha * Math.PI);
    accent.y += swing * 0.82 * spinDir;
    accent.x += swing * 0.22;
    accent.z += swing * 0.1 * -spinDir;
  }

  if (phase.phase === "zoom") {
    accent.y += Math.sin(stepElapsed * 0.0015 + step) * 0.06;
  } else if (phase.phase === "parallax") {
    accent.y += Math.sin(stepElapsed * 0.0012 + step) * 0.04;
  }

  return accent;
}

function getCubeScale(phase: ReturnType<typeof getPhase>, stepElapsed: number): number {
  if (phase.phase === "zoom") {
    return THREE.MathUtils.lerp(1, 1.045, phase.alpha);
  }
  if (phase.phase === "parallax") {
    const t = stepElapsed - ROTATE_MS - ZOOM_MS;
    return 1 + Math.sin(t * 0.0028) * 0.055;
  }
  return 1;
}

function computeCubeFrame(step: number, stepElapsed: number, currentFace: number): PresentationFrame {
  const phase = getPhase(stepElapsed);
  const camera = getCameraState(phase);
  const cameraDrift = getCubeCameraDrift(stepElapsed, step);
  const targetRotation = getFaceRotation(currentFace);
  const restRotation = getCubeRestRotation(step);

  let rotationAlpha = 1;
  let fromRotation = restRotation;
  let toRotation = targetRotation;

  if (phase.phase === "rotate") {
    rotationAlpha = easeOutCubic(phase.alpha);
    fromRotation = restRotation;
    toRotation = targetRotation;
  } else if (phase.phase === "reset") {
    rotationAlpha = phase.alpha;
    fromRotation = targetRotation;
    toRotation = getCubeRestRotation(step + 1);
  } else {
    fromRotation = targetRotation;
    toRotation = targetRotation;
  }

  const baseRotation = lerpEuler(fromRotation, toRotation, rotationAlpha);
  const nextRotation = applyCubeMotionAccent(baseRotation, phase, step, stepElapsed);
  const scale = getCubeScale(phase, stepElapsed);

  return {
    ...camera,
    cameraOffsetX: cameraDrift.x,
    cameraOffsetY: cameraDrift.y,
    parallaxAmount: getParallaxAmountForElapsed(stepElapsed),
    applyRootTransform: (root) => {
      root.rotation.set(nextRotation.x, nextRotation.y, nextRotation.z);
      root.position.set(0, 0, 0);
      root.scale.set(scale, scale, scale);
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
  const breathe = phase.phase === "parallax" ? Math.sin(stepElapsed * 0.0014 + step) * 0.07 : 0;

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
