import {
  startJewelPhotoMorph,
  tickJewelPhotoMorph,
} from "../../babylon/jewelCubePhotoMorph";
import { tickShowcasePresentation, computeIntegralEaseSpinSpeedY } from "../showcasePresentation";
import type { ShowcasePipelineStage } from "../types";

/** L2 채널 모핑 — 단방향 회전·부유·카메라 유지. */
export const morphStage: ShowcasePipelineStage = {
  id: "morph",
  enter(ctx) {
    if (!ctx.rig || ctx.imageUrls.length <= 1) {
      return;
    }
    const nextIndex = (ctx.imageIndex + 1) % ctx.imageUrls.length;
    const nextContent = ctx.runtime.getHoloContent(ctx.imageUrls[nextIndex]!);
    ctx.stageState.morphTargetIndex = nextIndex;
    startJewelPhotoMorph(ctx.rig, nextContent, ctx.config.morphDurationMs, ctx.rig.photoMorph);
  },
  tick(ctx, dtMs) {
    if (!ctx.rig) {
      return "complete";
    }
    if (ctx.imageUrls.length <= 1) {
      return "complete";
    }

    const morphSpin = computeIntegralEaseSpinSpeedY(
      ctx.phaseElapsedMs,
      dtMs,
      ctx.config.morphDurationMs,
      ctx.config.morphRotateSpeedY
    );

    tickShowcasePresentation(ctx, dtMs, {
      spinSpeedY: morphSpin,
      parallaxStrength: 0.22,
    });

    const nextIndex = (ctx.stageState.morphTargetIndex as number) ?? ctx.imageIndex;
    const nextContent = ctx.runtime.getHoloContent(ctx.imageUrls[nextIndex]!);

    if (tickJewelPhotoMorph(ctx.rig, dtMs, ctx.rig.photoMorph, nextContent)) {
      ctx.imageIndex = nextIndex;
      return "complete";
    }
    return "continue";
  },
};
