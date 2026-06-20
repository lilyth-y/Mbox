import { OUTER_SIZE } from "../../babylon/jewelCubeMaterials";
import { tickShowcaseCameraFollow } from "../showcaseCamera";
import { tickHoloDisplayStack } from "../holoDisplayStack";
import type { ShowcasePipelineStage } from "../types";

/** 바닥 충돌 후 안착 — bounce 단계 (다음 마일스톤). */
export const bounceStage: ShowcasePipelineStage = {
  id: "bounce",
  enter(ctx) {
    ctx.stageState.settleStableMs = 0;
  },
  tick(ctx, dtMs) {
    if (!ctx.rig) {
      return "complete";
    }
    const pos = ctx.rig.collider.getAbsolutePosition();
    tickShowcaseCameraFollow(ctx, dtMs, "bounce");
    tickHoloDisplayStack(ctx, dtMs, 0.35);
    const body = ctx.rig.aggregate.body;
    const linSpeed = body.getLinearVelocity().length();
    const angSpeed = body.getAngularVelocity().length();
    const nearGround = pos.y < ctx.config.jewelRestCenterY + OUTER_SIZE * 0.18;
    const calm =
      linSpeed < ctx.config.settleLinearThreshold &&
      angSpeed < ctx.config.settleAngularThreshold &&
      nearGround;

    let settleStableMs = (ctx.stageState.settleStableMs as number) ?? 0;
    settleStableMs = calm ? settleStableMs + dtMs : 0;
    ctx.stageState.settleStableMs = settleStableMs;

    if (settleStableMs >= ctx.config.settleHoldMs) {
      return "complete";
    }
    return "continue";
  },
};
