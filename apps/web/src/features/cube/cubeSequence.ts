import * as THREE from "three";
import {
  PERCEPTUAL_CORNER_REST,
  PERCEPTUAL_DEPTH_EMPHASIS,
  PERCEPTUAL_PARALLAX_MS,
  PERCEPTUAL_PARALLAX_RATE_PER_SEC,
  PERCEPTUAL_CUBE_RESET_MS,
  PERCEPTUAL_LOOP_BRIDGE_MS,
  PERCEPTUAL_RESET_MS,
  PERCEPTUAL_TRAVEL_IN_MS,
  PERCEPTUAL_TRAVEL_OUT_MS,
  PERCEPTUAL_ZOOM_MS,
  PERCEPTUAL_ZOOM_SCALE,
  bellParallaxAmount,
  rampParallaxAmount,
} from "./perceptualMotion";

export const CUBE_FACE_ORDER = [4, 0, 1, 2, 3, 5] as const;
export const CUBE_FACE_COUNT = CUBE_FACE_ORDER.length;
export const CUBE_EDGE_LENGTH = 2.5;
export const CORNER_REST_ROTATION = new THREE.Euler(
  PERCEPTUAL_CORNER_REST.x,
  PERCEPTUAL_CORNER_REST.y,
  PERCEPTUAL_CORNER_REST.z
);

const FACE_ROTATIONS: Record<number, THREE.Euler> = {
  4: new THREE.Euler(0, 0, 0),
  5: new THREE.Euler(0, Math.PI, 0),
  0: new THREE.Euler(0, -Math.PI / 2, 0),
  1: new THREE.Euler(0, Math.PI / 2, 0),
  2: new THREE.Euler(-Math.PI / 2, 0, 0),
  3: new THREE.Euler(Math.PI / 2, 0, 0),
};

export const DEFAULT_CAMERA_Z = 5;
export const PRESENTATION_ZOOM_SCALE = PERCEPTUAL_ZOOM_SCALE;
export const FRONT_CAMERA_Z = DEFAULT_CAMERA_Z / PRESENTATION_ZOOM_SCALE;
export const DEFAULT_FOV = 75;
export const FRONT_FOV = DEFAULT_FOV;

export const ROTATE_MS = PERCEPTUAL_TRAVEL_IN_MS;
export const TRAVEL_OUT_MS = PERCEPTUAL_TRAVEL_OUT_MS;
export const ZOOM_MS = PERCEPTUAL_ZOOM_MS;
export const PARALLAX_MS = PERCEPTUAL_PARALLAX_MS;
export const PARALLAX_RATE_PER_SEC = PERCEPTUAL_PARALLAX_RATE_PER_SEC;
export const PARALLAX_MAX = PARALLAX_RATE_PER_SEC * (PARALLAX_MS / 1_000);
export const DEPTH_EMPHASIS = PERCEPTUAL_DEPTH_EMPHASIS;
export const RESET_MS = PERCEPTUAL_RESET_MS;
export const CUBE_RESET_MS = PERCEPTUAL_CUBE_RESET_MS;
export const LOOP_BRIDGE_MS = PERCEPTUAL_LOOP_BRIDGE_MS;
export const PHOTO_SEGMENT_MS = ROTATE_MS + ZOOM_MS + PARALLAX_MS + RESET_MS;
export const CUBE_PHOTO_SEGMENT_MS = ROTATE_MS + ZOOM_MS + PARALLAX_MS + CUBE_RESET_MS;

export function getParallaxAmount(
  parallaxElapsedMs: number,
  parallaxHoldMs: number = PARALLAX_MS
): number {
  return rampParallaxAmount(parallaxElapsedMs, parallaxHoldMs, PARALLAX_MAX);
}

export function getLinkedParallaxAmount(
  parallaxElapsedMs: number,
  parallaxHoldMs: number = PARALLAX_MS
): number {
  return bellParallaxAmount(parallaxElapsedMs, parallaxHoldMs, PARALLAX_MAX);
}

export function getPresentationFace(step: number): number {
  return CUBE_FACE_ORDER[step % CUBE_FACE_ORDER.length] ?? CUBE_FACE_ORDER[0];
}

export function getFaceRotation(faceIndex: number): THREE.Euler {
  return FACE_ROTATIONS[faceIndex]?.clone() ?? new THREE.Euler(0, 0, 0);
}

export function lerpEuler(current: THREE.Euler, target: THREE.Euler, alpha: number): THREE.Euler {
  return new THREE.Euler(
    THREE.MathUtils.lerp(current.x, target.x, alpha),
    THREE.MathUtils.lerp(current.y, target.y, alpha),
    THREE.MathUtils.lerp(current.z, target.z, alpha)
  );
}

/** Spherical interpolation avoids harsh axis flips between scene poses. */
export function slerpEuler(current: THREE.Euler, target: THREE.Euler, alpha: number): THREE.Euler {
  const from = new THREE.Quaternion().setFromEuler(current);
  const to = new THREE.Quaternion().setFromEuler(target);
  const blended = new THREE.Quaternion().slerpQuaternions(from, to, alpha);
  return new THREE.Euler().setFromQuaternion(blended, current.order);
}

export function getSequenceDurationMs(faceCount: number): number {
  if (faceCount <= 0) {
    return 0;
  }

  return faceCount * PHOTO_SEGMENT_MS;
}
