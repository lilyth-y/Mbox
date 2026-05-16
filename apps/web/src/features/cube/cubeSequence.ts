import * as THREE from "three";

export const CUBE_FACE_ORDER = [4, 0, 1, 2, 3, 5] as const;
export const CUBE_FACE_COUNT = CUBE_FACE_ORDER.length;
export const CUBE_EDGE_LENGTH = 2.5;
export const CORNER_REST_ROTATION = new THREE.Euler(-0.38, 0.62, 0.05);

const FACE_ROTATIONS: Record<number, THREE.Euler> = {
  4: new THREE.Euler(0, 0, 0),
  5: new THREE.Euler(0, Math.PI, 0),
  0: new THREE.Euler(0, -Math.PI / 2, 0),
  1: new THREE.Euler(0, Math.PI / 2, 0),
  2: new THREE.Euler(-Math.PI / 2, 0, 0),
  3: new THREE.Euler(Math.PI / 2, 0, 0),
};

export const DEFAULT_CAMERA_Z = 5;
/** Stronger push-in before the depth (parallax) hold. */
export const PRESENTATION_ZOOM_SCALE = 1.32;
export const FRONT_CAMERA_Z = DEFAULT_CAMERA_Z / PRESENTATION_ZOOM_SCALE;
export const DEFAULT_FOV = 75;
export const FRONT_FOV = DEFAULT_FOV;

export const ROTATE_MS = 1_200;
export const ZOOM_MS = 800;
/** Longer hold while depth separation is applied. */
export const PARALLAX_MS = 3_200;
export const PARALLAX_RATE_PER_SEC = 0.052;
export const PARALLAX_MAX = PARALLAX_RATE_PER_SEC * (PARALLAX_MS / 1_000);
/** Applied to material parallax amount (shader strength). */
export const DEPTH_EMPHASIS = 1.85;
export const RESET_MS = 600;
export const PHOTO_SEGMENT_MS = ROTATE_MS + ZOOM_MS + PARALLAX_MS + RESET_MS;

export function getParallaxAmount(parallaxElapsedMs: number): number {
  return Math.min(PARALLAX_MAX, (parallaxElapsedMs / 1_000) * PARALLAX_RATE_PER_SEC);
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

export function getSequenceDurationMs(faceCount: number): number {
  if (faceCount <= 0) {
    return 0;
  }

  return faceCount * PHOTO_SEGMENT_MS;
}
