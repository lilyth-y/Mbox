import { computeIntegralEaseSpinSpeedY, tickShowcasePresentation } from "../showcasePresentation";
import type { ShowcasePipelineStage } from "../types";

/** Y축 ease-in/out 회전 + 허공 부유 + 호흡 줌아웃. */
export const rotateStage: ShowcasePipelineStage = {
  id: "rotate",
  enter() {
    /* spin continues from reveal */
  },
  tick(ctx, dtMs) {
    if (!ctx.rig) {
      return "complete";
    }

    const spinSpeedY = computeIntegralEaseSpinSpeedY(
      ctx.phaseElapsedMs,
      dtMs,
      ctx.config.rotateDurationMs,
      ctx.config.rotateSpeedY
    );

    tickShowcasePresentation(ctx, dtMs, {
      spinSpeedY,
      parallaxStrength: 0.22,
    });

    if (ctx.phaseElapsedMs >= ctx.config.rotateDurationMs) {
      return "complete";
    }
    return "continue";
  },
};
