import * as THREE from "three";

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Mesh-card showcase: fly-in → dolly → hold → fly-out per photo. */
export const SHOWCASE_FLY_IN_MS = 1_100;
export const SHOWCASE_DOLLY_MS = 900;
export const SHOWCASE_HOLD_MS = 2_600;
export const SHOWCASE_FLY_OUT_MS = 800;

export const SHOWCASE_STEP_MS =
  SHOWCASE_FLY_IN_MS + SHOWCASE_DOLLY_MS + SHOWCASE_HOLD_MS + SHOWCASE_FLY_OUT_MS;

export interface ShowcasePhaseTiming {
  flyInMs: number;
  dollyMs: number;
  holdMs: number;
  flyOutMs: number;
}

export const DEFAULT_SHOWCASE_TIMING: ShowcasePhaseTiming = {
  flyInMs: SHOWCASE_FLY_IN_MS,
  dollyMs: SHOWCASE_DOLLY_MS,
  holdMs: SHOWCASE_HOLD_MS,
  flyOutMs: SHOWCASE_FLY_OUT_MS,
};

export interface ShowcaseCardMotionSample {
  rotation: THREE.Euler;
  position: THREE.Vector3;
  presentationScale: number;
  cameraZ: number;
  fieldOfView: number;
  cameraOffsetX: number;
  cameraOffsetY: number;
  parallaxAmount: number;
  focusPulse: number;
  /** Crystal frame sparkle / specular envelope 0–1. */
  borderPulse: number;
}

type ShowcasePhase = "fly_in" | "dolly" | "hold" | "fly_out";

function getShowcasePhase(
  stepElapsed: number,
  timing: ShowcasePhaseTiming
): { phase: ShowcasePhase; alpha: number; localT: number } {
  const { flyInMs, dollyMs, holdMs, flyOutMs } = timing;
  const dollyStart = flyInMs;
  const holdStart = dollyStart + dollyMs;
  const flyOutStart = holdStart + holdMs;

  if (stepElapsed < flyInMs) {
    const alpha = easeOutCubic(stepElapsed / flyInMs);
    return { phase: "fly_in", alpha, localT: stepElapsed / flyInMs };
  }
  if (stepElapsed < holdStart) {
    const alpha = easeInOut((stepElapsed - dollyStart) / dollyMs);
    return { phase: "dolly", alpha, localT: (stepElapsed - dollyStart) / dollyMs };
  }
  if (stepElapsed < flyOutStart) {
    const localT = (stepElapsed - holdStart) / holdMs;
    return { phase: "hold", alpha: 1, localT };
  }
  const alpha = easeInOut((stepElapsed - flyOutStart) / flyOutMs);
  return { phase: "fly_out", alpha, localT: (stepElapsed - flyOutStart) / flyOutMs };
}

function entrySide(step: number, motionSeed: number): 1 | -1 {
  return ((step + (motionSeed & 1)) & 1) === 0 ? 1 : -1;
}

export function getShowcaseStepSegmentMs(
  timing: ShowcasePhaseTiming = DEFAULT_SHOWCASE_TIMING
): number {
  return timing.flyInMs + timing.dollyMs + timing.holdMs + timing.flyOutMs;
}

export function sampleShowcaseCardMotion(
  step: number,
  stepElapsed: number,
  presentationCount: number,
  motionSeed = 0,
  timing: ShowcasePhaseTiming = DEFAULT_SHOWCASE_TIMING
): ShowcaseCardMotionSample {
  const { phase, alpha, localT } = getShowcasePhase(stepElapsed, timing);
  const side = entrySide(step, motionSeed);
  const isLast = step + 1 >= presentationCount;

  const entryYaw = side * 0.58;
  const exitYaw = -side * 0.44;
  const bridgeYaw = side * 0.16;

  const entryX = side * 0.24;
  const entryZ = -1.1;
  const centerZ = 0.1;
  const exitZ = -0.9;

  let rotY = 0;
  let rotX = 0;
  let posX = 0;
  let posY = 0;
  let posZ = centerZ;
  let scale = 1;
  let cameraZ = 5.2;
  let fov = 75;
  let parallax = 0;
  let focusPulse = 0;
  let borderPulse = 0;
  let camOffX = 0;
  let camOffY = 0;

  const prevBridgeYaw = step === 0 ? entryYaw * 1.12 : bridgeYaw;
  const nextBridgeYaw = isLast ? exitYaw * 0.62 : bridgeYaw;

  if (phase === "fly_in") {
    let fromYaw = prevBridgeYaw;
    let fromX = entryX;
    let fromZ = entryZ;
    let fromScale = 0.64;
    let fromRotX = -0.14;
    if (step > 0) {
      const prevEnd = sampleShowcaseCardMotion(
        step - 1,
        getShowcaseStepSegmentMs(timing) - 1,
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
      const prevEnd = sampleShowcaseCardMotion(
        lastStep,
        getShowcaseStepSegmentMs(timing) - 1,
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
    rotX = THREE.MathUtils.lerp(fromRotX, 0.03, alpha);
    posX = THREE.MathUtils.lerp(fromX, 0, alpha);
    posY = THREE.MathUtils.lerp(-0.05, 0, alpha);
    posZ = THREE.MathUtils.lerp(fromZ, centerZ * 0.55, alpha);
    scale = THREE.MathUtils.lerp(fromScale, 0.9, alpha);
    cameraZ = THREE.MathUtils.lerp(5.25, 5.05, alpha);
    parallax = alpha * 0.1;
    borderPulse = alpha * 0.25;
  } else if (phase === "dolly") {
    rotY = THREE.MathUtils.lerp(0, side * 0.035, alpha);
    rotX = THREE.MathUtils.lerp(0.03, 0.015, alpha);
    posZ = THREE.MathUtils.lerp(centerZ * 0.55, centerZ, alpha);
    scale = THREE.MathUtils.lerp(0.9, 1.08, alpha);
    cameraZ = THREE.MathUtils.lerp(5.05, 4.2, alpha);
    fov = THREE.MathUtils.lerp(75, 66, alpha);
    parallax = THREE.MathUtils.lerp(0.1, 0.38, alpha);
    focusPulse = alpha * 0.6;
    borderPulse = THREE.MathUtils.lerp(0.35, 0.72, alpha);
  } else if (phase === "hold") {
    const orbit = Math.sin(localT * Math.PI * 2) * 0.055;
    rotY = side * 0.035 + orbit * 0.3;
    rotX = 0.015 + Math.sin(localT * Math.PI * 2 + 0.35) * 0.016;
    posX = Math.sin(localT * Math.PI * 2) * 0.035;
    posY = Math.cos(localT * Math.PI * 2) * 0.022;
    posZ = centerZ;
    scale = 1.06 + Math.sin(localT * Math.PI * 2) * 0.018;
    cameraZ = 4.2;
    fov = 66;
    parallax = 0.42 + Math.sin(localT * Math.PI * 2) * 0.07;
    focusPulse = 0.78 + Math.sin(localT * Math.PI * 2) * 0.14;
    borderPulse = 0.82 + Math.sin(localT * Math.PI * 2 + 0.25) * 0.18;
    camOffX = Math.sin(localT * Math.PI * 2) * 0.04;
    camOffY = Math.cos(localT * Math.PI * 2) * 0.026;
  } else {
    rotY = THREE.MathUtils.lerp(0, nextBridgeYaw, alpha);
    rotX = THREE.MathUtils.lerp(0.015, -0.09, alpha);
    posX = THREE.MathUtils.lerp(0, -side * 0.16, alpha);
    posY = THREE.MathUtils.lerp(0, -0.05, alpha);
    posZ = THREE.MathUtils.lerp(centerZ, exitZ, alpha);
    scale = THREE.MathUtils.lerp(1.06, 0.74, alpha);
    cameraZ = THREE.MathUtils.lerp(4.2, 5.25, alpha);
    fov = THREE.MathUtils.lerp(66, 75, alpha);
    parallax = THREE.MathUtils.lerp(0.35, 0.04, alpha);
    focusPulse = THREE.MathUtils.lerp(0.7, 0, alpha);
    borderPulse = THREE.MathUtils.lerp(0.55, 0.08, alpha);
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

/** Safe window to swap textures without a visible pop (early fly-in / late fly-out). */
export function shouldSwapShowcaseTexture(
  stepElapsed: number,
  timing: ShowcasePhaseTiming = DEFAULT_SHOWCASE_TIMING
): boolean {
  const seg = getShowcaseStepSegmentMs(timing);
  const flyInEnd = timing.flyInMs;
  const flyOutStart = timing.flyInMs + timing.dollyMs + timing.holdMs;
  if (stepElapsed < flyInEnd * 0.18) {
    return true;
  }
  if (stepElapsed > flyOutStart + timing.flyOutMs * 0.72) {
    return true;
  }
  if (stepElapsed >= seg - 2) {
    return true;
  }
  return false;
}

export function resolveShowcaseTimelineStep(
  elapsedMs: number,
  presentationCount: number,
  timing: ShowcasePhaseTiming = DEFAULT_SHOWCASE_TIMING
): { step: number; stepElapsed: number } {
  if (presentationCount <= 0) {
    return { step: 0, stepElapsed: 0 };
  }
  const seg = getShowcaseStepSegmentMs(timing);
  const loopMs = seg * presentationCount;
  const t = loopMs > 0 ? elapsedMs % loopMs : 0;
  const step = Math.min(presentationCount - 1, Math.floor(t / seg));
  const stepElapsed = t - step * seg;
  return { step, stepElapsed };
}
