import * as THREE from "three";

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * cs5 Photo Slideshow 3D Version 2 — per-photo motion reimplemented in TS.
 * Phases: fly-in (depth) → dolly → showcase orbit → fly-out (handoff).
 * Reference: Videohive 3D Photos Slideshow v2 (~2m15 / many placeholders ≈ brisk card transitions).
 */

export const PHOTO_SLIDESHOW_FLY_IN_MS = 1_100;
export const PHOTO_SLIDESHOW_DOLLY_MS = 850;
export const PHOTO_SLIDESHOW_SHOWCASE_MS = 2_400;
export const PHOTO_SLIDESHOW_FLY_OUT_MS = 750;

export const PHOTO_SLIDESHOW_STEP_MS =
  PHOTO_SLIDESHOW_FLY_IN_MS +
  PHOTO_SLIDESHOW_DOLLY_MS +
  PHOTO_SLIDESHOW_SHOWCASE_MS +
  PHOTO_SLIDESHOW_FLY_OUT_MS;

export interface PhotoSlideshow3dPhaseTiming {
  flyInMs: number;
  dollyMs: number;
  showcaseMs: number;
  flyOutMs: number;
}

export const DEFAULT_PHOTO_SLIDESHOW_3D_TIMING: PhotoSlideshow3dPhaseTiming = {
  flyInMs: PHOTO_SLIDESHOW_FLY_IN_MS,
  dollyMs: PHOTO_SLIDESHOW_DOLLY_MS,
  showcaseMs: PHOTO_SLIDESHOW_SHOWCASE_MS,
  flyOutMs: PHOTO_SLIDESHOW_FLY_OUT_MS,
};

export interface PhotoSlideshow3dMotionSample {
  rotation: THREE.Euler;
  position: THREE.Vector3;
  presentationScale: number;
  cameraZ: number;
  fieldOfView: number;
  cameraOffsetX: number;
  cameraOffsetY: number;
  parallaxAmount: number;
  focusPulse: number;
  /** Mat/frame highlight 0–1 (showcase peak). */
  borderPulse: number;
}

type SlideshowPhase = "fly_in" | "dolly" | "showcase" | "fly_out";

function getSlideshowPhase(
  stepElapsed: number,
  timing: PhotoSlideshow3dPhaseTiming
): { phase: SlideshowPhase; alpha: number; localT: number } {
  const { flyInMs, dollyMs, showcaseMs, flyOutMs } = timing;
  const dollyStart = flyInMs;
  const showcaseStart = dollyStart + dollyMs;
  const flyOutStart = showcaseStart + showcaseMs;

  if (stepElapsed < flyInMs) {
    const alpha = easeOutCubic(stepElapsed / flyInMs);
    return { phase: "fly_in", alpha, localT: stepElapsed / flyInMs };
  }
  if (stepElapsed < showcaseStart) {
    const alpha = easeInOut((stepElapsed - dollyStart) / dollyMs);
    return { phase: "dolly", alpha, localT: (stepElapsed - dollyStart) / dollyMs };
  }
  if (stepElapsed < flyOutStart) {
    const localT = (stepElapsed - showcaseStart) / showcaseMs;
    return { phase: "showcase", alpha: 1, localT };
  }
  const alpha = easeInOut((stepElapsed - flyOutStart) / flyOutMs);
  return { phase: "fly_out", alpha, localT: (stepElapsed - flyOutStart) / flyOutMs };
}

function entrySide(step: number, motionSeed: number): 1 | -1 {
  return ((step + (motionSeed & 1)) & 1) === 0 ? 1 : -1;
}

export function getPhotoSlideshow3dStepSegmentMs(
  _step = 0,
  timing: PhotoSlideshow3dPhaseTiming = DEFAULT_PHOTO_SLIDESHOW_3D_TIMING
): number {
  return timing.flyInMs + timing.dollyMs + timing.showcaseMs + timing.flyOutMs;
}

export function samplePhotoSlideshow3dMotion(
  step: number,
  stepElapsed: number,
  presentationCount: number,
  motionSeed = 0,
  timing: PhotoSlideshow3dPhaseTiming = DEFAULT_PHOTO_SLIDESHOW_3D_TIMING
): PhotoSlideshow3dMotionSample {
  const { phase, alpha, localT } = getSlideshowPhase(stepElapsed, timing);
  const side = entrySide(step, motionSeed);
  const isLast = step + 1 >= presentationCount;

  const entryYaw = side * 0.62;
  const exitYaw = -side * 0.48;
  const bridgeYaw = side * 0.18;

  const entryX = side * 0.22;
  const entryZ = -1.05;
  const centerZ = 0.12;
  const exitZ = -0.85;

  let rotY = 0;
  let rotX = 0;
  let posX = 0;
  let posY = 0;
  let posZ = centerZ;
  let scale = 1;
  let cameraZ = 5;
  let fov = 75;
  let parallax = 0;
  let focusPulse = 0;
  let borderPulse = 0;
  let camOffX = 0;
  let camOffY = 0;

  const prevBridgeYaw = step === 0 ? entryYaw * 1.15 : bridgeYaw;
  const nextBridgeYaw = isLast ? exitYaw * 0.65 : bridgeYaw;

  if (phase === "fly_in") {
    let fromYaw = prevBridgeYaw;
    let fromX = entryX;
    let fromZ = entryZ;
    let fromScale = 0.68;
    let fromRotX = -0.12;
    if (step > 0) {
      const prevEnd = samplePhotoSlideshow3dMotion(
        step - 1,
        getPhotoSlideshow3dStepSegmentMs(step - 1) - 1,
        presentationCount,
        motionSeed,
        timing
      );
      fromYaw = prevEnd.rotation.y;
      fromX = prevEnd.position.x;
      fromZ = prevEnd.position.z;
      fromScale = prevEnd.presentationScale;
      fromRotX = prevEnd.rotation.x;
    } else if (presentationCount > 1) {
      const lastStep = presentationCount - 1;
      const prevEnd = samplePhotoSlideshow3dMotion(
        lastStep,
        getPhotoSlideshow3dStepSegmentMs(lastStep) - 1,
        presentationCount,
        motionSeed,
        timing
      );
      fromYaw = prevEnd.rotation.y;
      fromX = prevEnd.position.x;
      fromZ = prevEnd.position.z;
      fromScale = prevEnd.presentationScale;
      fromRotX = prevEnd.rotation.x;
    }
    rotY = THREE.MathUtils.lerp(fromYaw, 0, alpha);
    rotX = THREE.MathUtils.lerp(fromRotX, 0.04, alpha);
    posX = THREE.MathUtils.lerp(fromX, 0, alpha);
    posY = THREE.MathUtils.lerp(-0.04, 0, alpha);
    posZ = THREE.MathUtils.lerp(fromZ, centerZ * 0.6, alpha);
    scale = THREE.MathUtils.lerp(fromScale, 0.92, alpha);
    cameraZ = THREE.MathUtils.lerp(5.1, 5.05, alpha);
    parallax = alpha * 0.12;
  } else if (phase === "dolly") {
    rotY = THREE.MathUtils.lerp(0, side * 0.04, alpha);
    rotX = THREE.MathUtils.lerp(0.04, 0.02, alpha);
    posZ = THREE.MathUtils.lerp(centerZ * 0.6, centerZ, alpha);
    scale = THREE.MathUtils.lerp(0.92, 1.06, alpha);
    cameraZ = THREE.MathUtils.lerp(5.05, 4.35, alpha);
    fov = THREE.MathUtils.lerp(75, 68, alpha);
    parallax = THREE.MathUtils.lerp(0.12, 0.42, alpha);
    focusPulse = alpha * 0.55;
    borderPulse = alpha * 0.35;
  } else if (phase === "showcase") {
    const orbit = Math.sin(localT * Math.PI * 2) * 0.06;
    rotY = side * 0.04 + orbit * 0.35;
    rotX = 0.02 + Math.sin(localT * Math.PI * 2 + 0.4) * 0.018;
    posX = Math.sin(localT * Math.PI * 2) * 0.04;
    posY = Math.cos(localT * Math.PI * 2) * 0.025;
    posZ = centerZ;
    scale = 1.04 + Math.sin(localT * Math.PI * 2) * 0.015;
    cameraZ = 4.35;
    fov = 68;
    parallax = 0.48 + Math.sin(localT * Math.PI * 2) * 0.08;
    focusPulse = 0.72 + Math.sin(localT * Math.PI * 2) * 0.12;
    borderPulse = 0.55 + Math.sin(localT * Math.PI * 2 + 0.2) * 0.15;
    camOffX = Math.sin(localT * Math.PI * 2) * 0.045;
    camOffY = Math.cos(localT * Math.PI * 2) * 0.028;
  } else {
    rotY = THREE.MathUtils.lerp(0, nextBridgeYaw, alpha);
    rotX = THREE.MathUtils.lerp(0.02, -0.08, alpha);
    posX = THREE.MathUtils.lerp(0, -side * 0.14, alpha);
    posY = THREE.MathUtils.lerp(0, -0.04, alpha);
    posZ = THREE.MathUtils.lerp(centerZ, exitZ, alpha);
    scale = THREE.MathUtils.lerp(1.04, 0.78, alpha);
    cameraZ = THREE.MathUtils.lerp(4.35, 5.1, alpha);
    fov = THREE.MathUtils.lerp(68, 75, alpha);
    parallax = THREE.MathUtils.lerp(0.38, 0.05, alpha);
    focusPulse = THREE.MathUtils.lerp(0.65, 0, alpha);
    borderPulse = THREE.MathUtils.lerp(0.4, 0, alpha);
  }

  return {
    rotation: new THREE.Euler(rotX, rotY, 0),
    position: new THREE.Vector3(posX, posY, posZ),
    presentationScale: scale,
    cameraZ,
    fieldOfView: fov,
    cameraOffsetX: camOffX,
    cameraOffsetY: camOffY,
    parallaxAmount: parallax,
    focusPulse,
    borderPulse,
  };
}

/** Seamless handoff: end of step N should match start of step N+1 fly_in bridge pose. */
export function samplePhotoSlideshow3dHandoffPose(
  step: number,
  presentationCount: number,
  motionSeed = 0
): Pick<PhotoSlideshow3dMotionSample, "rotation" | "position" | "presentationScale"> {
  const isLast = step + 1 >= presentationCount;
  const side = entrySide(step + 1, motionSeed);
  const bridgeYaw = isLast ? -entrySide(step, motionSeed) * 0.48 * 0.65 : side * 0.18;
  return {
    rotation: new THREE.Euler(-0.08, bridgeYaw, 0),
    position: new THREE.Vector3(-side * 0.14, -0.04, -0.85),
    presentationScale: 0.78,
  };
}
