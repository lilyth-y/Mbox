import { OUTER_SIZE } from "../babylon/jewelCubeMaterials";
import type { ShowcasePipelineStageId } from "./types";

/** Collider half-extent — jewel rest center Y when ground is at y=0. */
export const JEWEL_CUBE_HALF_EXTENT = OUTER_SIZE / 2;

/** Rotate + photo morph share one ease-in/out spin; morph may overlap rotate tail. */
export function resolveMorphOverlapMs(
  rotateDurationMs: number,
  morphDurationMs: number,
  morphOverlapMs: number,
  imageCount: number
): number {
  if (imageCount <= 1) {
    return 0;
  }
  return Math.max(0, Math.min(morphOverlapMs, rotateDurationMs, morphDurationMs));
}

export function getMorphPhaseStartMs(
  rotateDurationMs: number,
  morphOverlapMs: number,
  imageCount: number
): number {
  if (imageCount <= 1) {
    return rotateDurationMs;
  }
  return rotateDurationMs - Math.max(0, Math.min(morphOverlapMs, rotateDurationMs));
}

export function getRotateMorphSegmentMs(
  rotateDurationMs: number,
  morphDurationMs: number,
  imageCount: number,
  morphOverlapMs = 0
): number {
  const overlap = resolveMorphOverlapMs(
    rotateDurationMs,
    morphDurationMs,
    morphOverlapMs,
    imageCount
  );
  return rotateDurationMs + (imageCount > 1 ? morphDurationMs - overlap : 0);
}

export const SHOWCASE_ROTATION_PIPELINE: ShowcasePipelineStageId[] = [
  "reveal",
  "rotate",
  "pull",
  "ascend",
];

export function resolveActiveShowcasePipeline(): ShowcasePipelineStageId[] {
  return SHOWCASE_ROTATION_PIPELINE;
}

export function describeShowcasePipeline(): string {
  return "표출 → 회전·모핑 → 정면 강조 → 복귀";
}
