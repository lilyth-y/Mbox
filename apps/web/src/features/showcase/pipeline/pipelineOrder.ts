import { OUTER_SIZE } from "../babylon/jewelCubeMaterials";
import type { ShowcasePipelineStageId } from "./types";

/** Collider half-extent — floor rest center Y when ground is at y=0. */
export const JEWEL_CUBE_HALF_EXTENT = OUTER_SIZE / 2;

/** Drop height above showcase hold position (~1.2× cube edge — ~0.7s free fall). */
export const DEFAULT_FALL_DROP_HEIGHT = OUTER_SIZE * 1.2;

export function resolveActiveShowcasePipeline(
  fallPhysicsEnabled: boolean
): ShowcasePipelineStageId[] {
  return fallPhysicsEnabled
    ? ["reveal", "rotate", "fall", "bounce", "morph", "pull", "ascend"]
    : ["reveal", "rotate", "morph", "pull", "ascend"];
}

export function describeShowcasePipeline(fallPhysicsEnabled: boolean): string {
  return fallPhysicsEnabled
    ? "표출 → 회전 → 낙하 → 안착 → 모핑 → 정면 강조 → 복귀"
    : "표출 → 회전 → 모핑 → 정면 강조 → 복귀";
}
