import type { ProcessedImage } from "../../shared/types";
import { RESET_MS, ROTATE_MS } from "./cubeSequence";

/** Per-step motion tweaks — subtle enough to feel organic, not chaotic. */
export interface StepMotionVariety {
  rotateMsScale: number;
  resetMsScale: number;
  spinDirection: 1 | -1;
  swingYawScale: number;
  swingPitchScale: number;
  restTiltOffset: { x: number; y: number; z: number };
  orbitDirection: 1 | -1;
}

function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createPresentationMotionSeed(
  images: ProcessedImage[],
  presentationKey: number
): number {
  let hash = presentationKey | 0;
  for (const image of images) {
    hash = (Math.imul(hash, 31) + image.id) | 0;
    hash = (Math.imul(hash, 17) + (image.sequenceOrder ?? 0)) | 0;
  }
  return hash;
}

export function getStepMotionVariety(seed: number, step: number): StepMotionVariety {
  const random = mulberry32(seed + step * 9_973);
  const spinDirection: 1 | -1 = random() > 0.48 ? 1 : -1;
  const orbitDirection: 1 | -1 = random() > 0.5 ? 1 : -1;

  return {
    rotateMsScale: 0.94 + random() * 0.12,
    resetMsScale: 0.95 + random() * 0.1,
    spinDirection,
    swingYawScale: 0.9 + random() * 0.18,
    swingPitchScale: 0.88 + random() * 0.2,
    restTiltOffset: {
      x: (random() - 0.5) * 0.07,
      y: (random() - 0.5) * 0.09,
      z: (random() - 0.5) * 0.05,
    },
    orbitDirection,
  };
}

export interface StepPhaseTiming {
  rotateMs: number;
  zoomMs: number;
  parallaxMs: number;
  resetMs: number;
}

export function getStepPhaseTiming(
  seed: number,
  step: number,
  zoomMs: number,
  parallaxMs: number
): StepPhaseTiming {
  const variety = getStepMotionVariety(seed, step);
  return {
    rotateMs: Math.round(ROTATE_MS * variety.rotateMsScale),
    zoomMs,
    parallaxMs,
    resetMs: Math.round(RESET_MS * variety.resetMsScale),
  };
}

export function getStepSegmentMs(
  seed: number,
  step: number,
  zoomMs: number,
  parallaxMs: number
): number {
  const timing = getStepPhaseTiming(seed, step, zoomMs, parallaxMs);
  return timing.rotateMs + timing.zoomMs + timing.parallaxMs + timing.resetMs;
}

export function sumSegmentDurations(segmentMs: number[]): number {
  return segmentMs.reduce((total, value) => total + value, 0);
}

export function resolvePresentationStep(
  elapsed: number,
  segmentMs: number[]
): { step: number; stepElapsed: number } {
  if (segmentMs.length === 0) {
    return { step: 0, stepElapsed: 0 };
  }

  let accumulated = 0;
  for (let step = 0; step < segmentMs.length; step += 1) {
    const segment = segmentMs[step] ?? 0;
    if (elapsed < accumulated + segment) {
      return { step, stepElapsed: elapsed - accumulated };
    }
    accumulated += segment;
  }

  const last = segmentMs.length - 1;
  const lastSegment = segmentMs[last] ?? 1;
  return { step: last, stepElapsed: Math.max(0, lastSegment - 1) };
}

export function formatPresentationDurationMs(totalMs: number): string {
  const totalSec = Math.max(0, Math.round(totalMs / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  if (minutes === 0) {
    return `${seconds}초`;
  }
  return `${minutes}분 ${seconds.toString().padStart(2, "0")}초`;
}
