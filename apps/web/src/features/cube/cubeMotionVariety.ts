import type { ProcessedImage } from "../../shared/types";
import type { PresentationEffectId } from "./presentationEffects";
import {
  PHOTO_SLIDESHOW_DOLLY_MS,
  PHOTO_SLIDESHOW_FLY_IN_MS,
  PHOTO_SLIDESHOW_FLY_OUT_MS,
  PHOTO_SLIDESHOW_SHOWCASE_MS,
  getPhotoSlideshow3dStepSegmentMs,
} from "./photoSlideshow3dTimeline";
import {
  FAN_LOOP_BRIDGE_MS,
  getFanStepSegmentMs,
  type FanTimelineProfile,
} from "./cubeFanTimeline";
import {
  CUBE_RESET_MS,
  RESET_MS,
  ROTATE_MS,
  TRAVEL_OUT_MS,
} from "./cubeSequence";

export function getLoopBridgeMs(
  effect: PresentationEffectId,
  presentationCount: number
): number {
  if (effect !== "cube_focus" || presentationCount < 2) {
    return 0;
  }
  return FAN_LOOP_BRIDGE_MS;
}

/** Per-step timing / orbit tweaks (cube rotation ignores orbit fields). */
export interface StepMotionVariety {
  rotateMsScale: number;
  resetMsScale: number;
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
  const directionRandom = mulberry32(seed);
  const orbitDirection: 1 | -1 = directionRandom() > 0.5 ? 1 : -1;

  return {
    rotateMsScale: 0.97 + random() * 0.06,
    resetMsScale: 0.97 + random() * 0.06,
    orbitDirection,
  };
}

export interface StepPhaseTiming {
  rotateMs: number;
  zoomMs: number;
  parallaxMs: number;
  resetMs: number;
  /** Outbound spin toward next face (cube linked mode). */
  travelOutMs?: number;
}

export function getStepPhaseTiming(
  seed: number,
  step: number,
  zoomMs: number,
  parallaxMs: number,
  effect: PresentationEffectId = "cube_focus",
  presentationCount = 1
): StepPhaseTiming {
  const variety = getStepMotionVariety(seed, step);
  const isLinkedCube = effect === "cube_focus";
  const isLastStep = step + 1 >= presentationCount;
  if (effect === "photo_slideshow_3d") {
    return {
      rotateMs: PHOTO_SLIDESHOW_FLY_IN_MS,
      zoomMs: PHOTO_SLIDESHOW_DOLLY_MS,
      parallaxMs: PHOTO_SLIDESHOW_SHOWCASE_MS,
      resetMs: PHOTO_SLIDESHOW_FLY_OUT_MS,
    };
  }
  return {
    rotateMs: isLinkedCube
      ? step === 0
        ? Math.round(ROTATE_MS * variety.rotateMsScale)
        : 0
      : Math.round(ROTATE_MS * variety.rotateMsScale),
    zoomMs,
    parallaxMs,
    resetMs: isLinkedCube
      ? CUBE_RESET_MS
      : Math.round(RESET_MS * variety.resetMsScale),
    travelOutMs:
      isLinkedCube && !isLastStep
        ? Math.round(TRAVEL_OUT_MS * variety.resetMsScale)
        : 0,
  };
}

export function getStepSegmentMs(
  seed: number,
  step: number,
  zoomMs: number,
  parallaxMs: number,
  effect: PresentationEffectId = "cube_focus",
  presentationCount = 1,
  fanTimelineProfile: FanTimelineProfile = "wedding_default"
): number {
  if (effect === "cube_focus") {
    return getFanStepSegmentMs(step, fanTimelineProfile);
  }
  if (effect === "photo_slideshow_3d") {
    return getPhotoSlideshow3dStepSegmentMs(step);
  }

  const timing = getStepPhaseTiming(
    seed,
    step,
    zoomMs,
    parallaxMs,
    effect,
    presentationCount
  );
  return (
    timing.rotateMs +
    timing.zoomMs +
    timing.parallaxMs +
    timing.resetMs +
    (timing.travelOutMs ?? 0)
  );
}

export function sumSegmentDurations(segmentMs: number[]): number {
  return segmentMs.reduce((total, value) => total + value, 0);
}

export type PresentationTimeline =
  | { kind: "step"; step: number; stepElapsed: number }
  | { kind: "loop_bridge"; bridgeElapsed: number; lastStep: number };

export function resolvePresentationTimeline(
  elapsed: number,
  segmentMs: number[],
  loopBridgeMs = 0
): PresentationTimeline {
  const contentMs = sumSegmentDurations(segmentMs);
  if (loopBridgeMs > 0 && elapsed >= contentMs) {
    return {
      kind: "loop_bridge",
      bridgeElapsed: Math.min(elapsed - contentMs, loopBridgeMs),
      lastStep: Math.max(0, segmentMs.length - 1),
    };
  }

  const { step, stepElapsed } = resolvePresentationStep(elapsed, segmentMs);
  return { kind: "step", step, stepElapsed };
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
