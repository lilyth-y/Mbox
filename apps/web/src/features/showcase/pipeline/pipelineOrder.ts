import { OUTER_SIZE } from "../babylon/jewelCubeMaterials";
import type { ShowcasePipelineStageId } from "./types";

/** Collider half-extent — jewel rest center Y when ground is at y=0. */
export const JEWEL_CUBE_HALF_EXTENT = OUTER_SIZE / 2;

/** Rotate + photo morph share one ease-in/out spin (no stop at the boundary). */
export function getRotateMorphSegmentMs(
  rotateDurationMs: number,
  morphDurationMs: number,
  imageCount: number
): number {
  return rotateDurationMs + (imageCount > 1 ? morphDurationMs : 0);
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
