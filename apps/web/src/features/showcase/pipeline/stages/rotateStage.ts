import { tickShowcasePresentation } from "../showcasePresentation";
import type { ShowcasePipelineStage } from "../types";

/** Y축 단방향 회전 + 허공 부유 + 호흡 줌아웃. */
export const rotateStage: ShowcasePipelineStage = {
  id: "rotate",
  enter() {
    /* spin continues from reveal */
  },
  tick(ctx, dtMs) {
    if (!ctx.rig) {
      return "complete";
    }

    tickShowcasePresentation(ctx, dtMs, {
      spinSpeedY: ctx.config.rotateSpeedY,
      parallaxStrength: 0.22,
    });

    if (ctx.phaseElapsedMs >= ctx.config.rotateDurationMs) {
      return "complete";
    }
    return "continue";
  },
};
