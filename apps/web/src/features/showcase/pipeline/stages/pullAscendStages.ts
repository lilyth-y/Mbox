import {
  getJewelCubeYawRadians,
  tickShowcaseAscendReturn,
  tickShowcasePullEmphasis,
} from "../showcasePresentation";
import {
  captureAscendReturnTargets,
  resetShowcaseCameraSpring,
} from "../showcaseCamera";
import { resetHoloDepthParallax } from "../holoDisplayStack";
import { updateCubePhotoFaceVisibility } from "../../babylon/jewelPhotoCore";
import type { ShowcasePipelineStage } from "../types";

/** 모핑 후 추가 회전 → 정면 강조 + 카메라 당김. */
export const pullStage: ShowcasePipelineStage = {
  id: "pull",
  enter(ctx) {
    if (!ctx.rig) {
      return;
    }
    ctx.stageState.pullStartYaw = getJewelCubeYawRadians(ctx.rig);
    ctx.stageState.pullEntrySpinY = Math.max(
      Math.abs(ctx.spinOmegaY),
      ctx.config.rotateSpeedY * 0.85
    );
    ctx.stageState.pullAlignCaptured = false;
    delete ctx.stageState.pullAlignStartYaw;
    resetHoloDepthParallax(ctx.rig);
  },
  tick(ctx, dtMs) {
    if (!ctx.rig) {
      return "complete";
    }
    return tickShowcasePullEmphasis(ctx, dtMs);
  },
  exit(ctx) {
    if (ctx.rig) {
      updateCubePhotoFaceVisibility(ctx.rig, ctx.camera.globalPosition, false);
    }
  },
};

/** 복귀 — hero 줌아웃을 pull과 대칭 ease-in-out. */
export const ascendStage: ShowcasePipelineStage = {
  id: "ascend",
  enter(ctx) {
    if (!ctx.rig) {
      return;
    }
    resetShowcaseCameraSpring(ctx.camera);
    captureAscendReturnTargets(ctx);
    const target = ctx.camera.target;
    ctx.stageState.returnStartAlpha = ctx.camera.alpha;
    ctx.stageState.returnStartBeta = ctx.camera.beta;
    ctx.stageState.returnStartRadius = ctx.camera.radius;
    ctx.stageState.returnStartTarget = {
      x: target.x,
      y: target.y,
      z: target.z,
    };
    resetHoloDepthParallax(ctx.rig);
  },
  tick(ctx, dtMs) {
    if (!ctx.rig) {
      return "complete";
    }
    return tickShowcaseAscendReturn(ctx, dtMs);
  },
};
