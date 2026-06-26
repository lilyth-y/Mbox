import type { ShowcaseStageContext } from "./types";

const GENERATION_KEY = "jewelSpawnGeneration";

export function getJewelSpawnGeneration(
  ctx: Pick<ShowcaseStageContext, "stageState">
): number {
  return (ctx.stageState[GENERATION_KEY] as number | undefined) ?? 0;
}

/** Invalidate in-flight jewel spawns (shape/profile change or pipeline reset). */
export function bumpJewelSpawnGeneration(
  ctx: Pick<ShowcaseStageContext, "stageState">
): number {
  const next = getJewelSpawnGeneration(ctx) + 1;
  ctx.stageState[GENERATION_KEY] = next;
  return next;
}

export function isJewelSpawnTokenValid(
  ctx: Pick<ShowcaseStageContext, "stageState">,
  token: number
): boolean {
  return getJewelSpawnGeneration(ctx) === token;
}
