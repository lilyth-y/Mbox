import type { ShowcasePipelineStage, ShowcasePipelineStageId } from "../types";
import { revealStage } from "./revealStage";
import { rotateStage } from "./rotateStage";
import { pullStage, ascendStage } from "./pullAscendStages";

const STAGE_REGISTRY: Record<ShowcasePipelineStageId, ShowcasePipelineStage> = {
  reveal: revealStage,
  rotate: rotateStage,
  pull: pullStage,
  ascend: ascendStage,
};

export function getShowcasePipelineStage(id: ShowcasePipelineStageId): ShowcasePipelineStage {
  return STAGE_REGISTRY[id];
}

export function resolveShowcasePipelineStages(
  order: ShowcasePipelineStageId[]
): ShowcasePipelineStage[] {
  return order.map((id) => STAGE_REGISTRY[id]);
}
