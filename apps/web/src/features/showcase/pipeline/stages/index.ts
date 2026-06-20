import type { ShowcasePipelineStage, ShowcasePipelineStageId } from "../types";
import { revealStage } from "./revealStage";
import { rotateStage } from "./rotateStage";
import { fallStage } from "./fallStage";
import { bounceStage } from "./bounceStage";
import { pullStage, ascendStage } from "./pullAscendStages";
import { morphStage } from "./morphStage";

const STAGE_REGISTRY: Record<ShowcasePipelineStageId, ShowcasePipelineStage> = {
  reveal: revealStage,
  rotate: rotateStage,
  fall: fallStage,
  bounce: bounceStage,
  pull: pullStage,
  ascend: ascendStage,
  morph: morphStage,
  swap: morphStage,
};

export function getShowcasePipelineStage(id: ShowcasePipelineStageId): ShowcasePipelineStage {
  return STAGE_REGISTRY[id];
}

export function resolveShowcasePipelineStages(
  order: ShowcasePipelineStageId[]
): ShowcasePipelineStage[] {
  return order.map((id) => STAGE_REGISTRY[id]);
}
