import * as THREE from "three";

function easeInQuad(t: number): number {
  return t * t;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function dampedBounce(t: number, bounces = 3): number {
  const x = Math.max(0, Math.min(1, t));
  const decay = Math.exp(-x * 4.2);
  const wave = Math.abs(Math.cos(x * Math.PI * bounces));
  return decay * wave;
}

/** Fall from sky → bounce → pull to front → showcase → ascend. */
export const JEWEL_FALL_MS = 1_350;
export const JEWEL_BOUNCE_MS = 1_050;
export const JEWEL_PULL_MS = 950;
export const JEWEL_SHOWCASE_MS = 2_800;
export const JEWEL_ASCEND_MS = 1_200;

export const JEWEL_STEP_MS =
  JEWEL_FALL_MS + JEWEL_BOUNCE_MS + JEWEL_PULL_MS + JEWEL_SHOWCASE_MS + JEWEL_ASCEND_MS;

export interface JewelCinematicTiming {
  fallMs: number;
  bounceMs: number;
  pullMs: number;
  showcaseMs: number;
  ascendMs: number;
}

export const DEFAULT_JEWEL_CINEMATIC_TIMING: JewelCinematicTiming = {
  fallMs: JEWEL_FALL_MS,
  bounceMs: JEWEL_BOUNCE_MS,
  pullMs: JEWEL_PULL_MS,
  showcaseMs: JEWEL_SHOWCASE_MS,
  ascendMs: JEWEL_ASCEND_MS,
};

export type JewelCinematicPhase = "fall" | "bounce" | "pull" | "showcase" | "ascend";

export interface JewelCinematicSample {
  phase: JewelCinematicPhase;
  rotation: THREE.Euler;
  position: THREE.Vector3;
  presentationScale: number;
  cameraZ: number;
  fieldOfView: number;
  cameraOffsetX: number;
  cameraOffsetY: number;
  focusPulse: number;
  borderPulse: number;
  gemPulse: number;
}

function getJewelPhase(
  stepElapsed: number,
  timing: JewelCinematicTiming
): { phase: JewelCinematicPhase; alpha: number; localT: number } {
  const { fallMs, bounceMs, pullMs, showcaseMs, ascendMs } = timing;
  const bounceStart = fallMs;
  const pullStart = bounceStart + bounceMs;
  const showcaseStart = pullStart + pullMs;
  const ascendStart = showcaseStart + showcaseMs;

  if (stepElapsed < fallMs) {
    const localT = stepElapsed / Math.max(fallMs, 1);
    return { phase: "fall", alpha: easeInQuad(localT), localT };
  }
  if (stepElapsed < pullStart) {
    const localT = (stepElapsed - bounceStart) / Math.max(bounceMs, 1);
    return { phase: "bounce", alpha: localT, localT };
  }
  if (stepElapsed < showcaseStart) {
    const localT = (stepElapsed - pullStart) / Math.max(pullMs, 1);
    return { phase: "pull", alpha: easeOutCubic(localT), localT };
  }
  if (stepElapsed < ascendStart) {
    const localT = (stepElapsed - showcaseStart) / Math.max(showcaseMs, 1);
    return { phase: "showcase", alpha: 1, localT };
  }
  const localT = (stepElapsed - ascendStart) / Math.max(ascendMs, 1);
  return { phase: "ascend", alpha: easeInOut(localT), localT };
}

function entrySpinSign(step: number, seed: number): 1 | -1 {
  return ((step + (seed & 1)) & 1) === 0 ? 1 : -1;
}

export function getJewelStepSegmentMs(
  timing: JewelCinematicTiming = DEFAULT_JEWEL_CINEMATIC_TIMING
): number {
  return timing.fallMs + timing.bounceMs + timing.pullMs + timing.showcaseMs + timing.ascendMs;
}

export function sampleJewelCinematicMotion(
  step: number,
  stepElapsed: number,
  motionSeed = 0,
  timing: JewelCinematicTiming = DEFAULT_JEWEL_CINEMATIC_TIMING
): JewelCinematicSample {
  const { phase, alpha, localT } = getJewelPhase(stepElapsed, timing);
  const spin = entrySpinSign(step, motionSeed);

  const groundY = -1.85;
  const fallTopY = 7.2;
  const bounceAmp = 1.35;
  const center = new THREE.Vector3(0, 0.05, 0.12);
  const showcaseScale = 1.12;

  let rotX = 0.2;
  let rotY = spin * 0.9;
  let rotZ = spin * 0.15;
  let posX = spin * 0.35;
  let posY = fallTopY;
  let posZ = -0.4;
  let scale = 0.72;
  let cameraZ = 6.2;
  let fov = 78;
  let focusPulse = 0;
  let borderPulse = 0.2;
  let gemPulse = 0.15;
  let camOffX = 0;
  let camOffY = 0;

  if (phase === "fall") {
    posY = THREE.MathUtils.lerp(fallTopY, groundY + 0.15, alpha);
    posX = THREE.MathUtils.lerp(spin * 0.55, spin * 0.12, alpha);
    posZ = THREE.MathUtils.lerp(-0.55, 0, alpha);
    rotX = THREE.MathUtils.lerp(0.35, -0.08, alpha);
    rotY += alpha * spin * 2.4;
    rotZ = THREE.MathUtils.lerp(spin * 0.35, spin * 0.08, alpha);
    scale = THREE.MathUtils.lerp(0.68, 0.88, alpha);
    cameraZ = THREE.MathUtils.lerp(6.4, 5.6, alpha);
    gemPulse = 0.2 + alpha * 0.25;
  } else if (phase === "bounce") {
    const bounceY = groundY + bounceAmp * dampedBounce(localT, 4);
    posY = bounceY;
    posX = THREE.MathUtils.lerp(spin * 0.12, 0, localT * 0.65);
    rotY += localT * spin * 0.85;
    rotX = THREE.MathUtils.lerp(-0.08, 0.04, localT);
    scale = THREE.MathUtils.lerp(0.88, 0.96, localT);
    cameraZ = 5.5;
    borderPulse = 0.35 + dampedBounce(localT, 4) * 0.45;
    gemPulse = 0.35 + dampedBounce(localT, 4) * 0.5;
  } else if (phase === "pull") {
    posX = THREE.MathUtils.lerp(0, center.x, alpha);
    posY = THREE.MathUtils.lerp(groundY, center.y, alpha);
    posZ = THREE.MathUtils.lerp(0, center.z, alpha);
    rotX = THREE.MathUtils.lerp(0.04, 0.02, alpha);
    rotY = THREE.MathUtils.lerp(rotY, spin * 0.06, alpha);
    rotZ = THREE.MathUtils.lerp(rotZ, 0, alpha);
    scale = THREE.MathUtils.lerp(0.96, showcaseScale, alpha);
    cameraZ = THREE.MathUtils.lerp(5.5, 4.15, alpha);
    fov = THREE.MathUtils.lerp(76, 64, alpha);
    focusPulse = alpha * 0.55;
    borderPulse = THREE.MathUtils.lerp(0.45, 0.78, alpha);
    gemPulse = THREE.MathUtils.lerp(0.5, 0.82, alpha);
  } else if (phase === "showcase") {
    const orbit = Math.sin(localT * Math.PI * 2) * 0.05;
    posX = center.x + orbit * 0.35;
    posY = center.y + Math.sin(localT * Math.PI * 2) * 0.02;
    posZ = center.z;
    rotY = spin * 0.06 + orbit * 0.25;
    rotX = 0.02 + Math.sin(localT * Math.PI * 2 + 0.3) * 0.012;
    scale = showcaseScale + Math.sin(localT * Math.PI * 2) * 0.015;
    cameraZ = 4.15;
    fov = 64;
    camOffX = Math.sin(localT * Math.PI * 2) * 0.035;
    camOffY = Math.cos(localT * Math.PI * 2) * 0.022;
    focusPulse = 0.82 + Math.sin(localT * Math.PI * 2) * 0.12;
    borderPulse = 0.92 + Math.sin(localT * Math.PI * 2 + 0.2) * 0.08;
    gemPulse = 0.95 + Math.sin(localT * Math.PI * 2 + 0.4) * 0.05;
  } else {
    posX = THREE.MathUtils.lerp(center.x, spin * 0.2, alpha);
    posY = THREE.MathUtils.lerp(center.y, fallTopY + 1.2, alpha);
    posZ = THREE.MathUtils.lerp(center.z, -0.35, alpha);
    rotX = THREE.MathUtils.lerp(0.02, 0.28, alpha);
    rotY += alpha * spin * 1.6;
    rotZ = THREE.MathUtils.lerp(0, spin * 0.2, alpha);
    scale = THREE.MathUtils.lerp(showcaseScale, 0.62, alpha);
    cameraZ = THREE.MathUtils.lerp(4.15, 6.5, alpha);
    fov = THREE.MathUtils.lerp(64, 78, alpha);
    focusPulse = THREE.MathUtils.lerp(0.75, 0, alpha);
    borderPulse = THREE.MathUtils.lerp(0.7, 0.15, alpha);
    gemPulse = THREE.MathUtils.lerp(0.85, 0.25, alpha);
  }

  return {
    phase,
    rotation: new THREE.Euler(rotX, rotY, rotZ),
    position: new THREE.Vector3(posX, posY, posZ),
    presentationScale: scale,
    cameraZ,
    fieldOfView: fov,
    cameraOffsetX: camOffX,
    cameraOffsetY: camOffY,
    focusPulse,
    borderPulse,
    gemPulse,
  };
}

/** Swap photo while cube is high / small (ascend tail or fall head). */
export function shouldSwapJewelTexture(
  stepElapsed: number,
  timing: JewelCinematicTiming = DEFAULT_JEWEL_CINEMATIC_TIMING
): boolean {
  const seg = getJewelStepSegmentMs(timing);
  const ascendStart =
    timing.fallMs + timing.bounceMs + timing.pullMs + timing.showcaseMs;
  if (stepElapsed < timing.fallMs * 0.22) {
    return true;
  }
  if (stepElapsed > ascendStart + timing.ascendMs * 0.55) {
    return true;
  }
  if (stepElapsed >= seg - 2) {
    return true;
  }
  return false;
}

export function resolveJewelTimelineStep(
  elapsedMs: number,
  presentationCount: number,
  timing: JewelCinematicTiming = DEFAULT_JEWEL_CINEMATIC_TIMING
): { step: number; stepElapsed: number } {
  if (presentationCount <= 0) {
    return { step: 0, stepElapsed: 0 };
  }
  const seg = getJewelStepSegmentMs(timing);
  const loopMs = seg * presentationCount;
  const t = loopMs > 0 ? elapsedMs % loopMs : 0;
  const step = Math.min(presentationCount - 1, Math.floor(t / seg));
  const stepElapsed = t - step * seg;
  return { step, stepElapsed };
}
