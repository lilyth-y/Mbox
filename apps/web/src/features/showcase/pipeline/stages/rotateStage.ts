import {
  startJewelPhotoMorph,
  tickJewelPhotoMorph,
} from "../../babylon/jewelCubePhotoMorph";
import { resolvePresentationSpinDirection, presentationSpinDirectionToSign } from "../showcasePresentationPreferences";
import {
  resolveMorphHoldPosition,
  tickShowcasePresentation,
} from "../showcasePresentation";
import { computeIntegralEaseInCruiseSpinSpeedY } from "../showcaseSpinMotion";
import { getRotateMorphSegmentMs } from "../pipelineOrder";
import type { ShowcasePipelineStage } from "../types";

function beginMorphSubPhase(ctx: Parameters<ShowcasePipelineStage["tick"]>[0]): void {
  if (ctx.stageState.morphStarted || !ctx.rig || ctx.imageUrls.length <= 1) {
    return;
  }
  const nextIndex = (ctx.imageIndex + 1) % ctx.imageUrls.length;
  let nextContent;
  try {
    nextContent = ctx.runtime.getHoloContent(ctx.imageUrls[nextIndex]!);
  } catch {
    return;
  }
  const pos = ctx.rig.collider.getAbsolutePosition();
  const aerialY = ctx.config.showcaseCenter.y;
  if (pos.y < aerialY - 0.06) {
    ctx.stageState.morphLiftStartY = pos.y;
  }
  ctx.stageState.morphTargetIndex = nextIndex;
  startJewelPhotoMorph(
    ctx.rig,
    nextContent,
    ctx.config.morphDurationMs,
    ctx.rig.photoMorph
  );
  ctx.stageState.morphStarted = true;
}

/** Continuous Y spin across rotate + photo morph — single ease-in/out envelope. */
export const rotateStage: ShowcasePipelineStage = {
  id: "rotate",
  enter(ctx) {
    ctx.spinDirection = resolvePresentationSpinDirection(
      ctx.presentationCycle,
      ctx.presentationPrefs
    );
    ctx.spinSign = presentationSpinDirectionToSign(ctx.spinDirection);
    ctx.stageState.morphStarted = false;
    delete ctx.stageState.morphTargetIndex;
    delete ctx.stageState.morphLiftStartY;
  },
  tick(ctx, dtMs) {
    if (!ctx.rig) {
      return "complete";
    }

    const imageCount = ctx.imageUrls.length;
    const segmentMs = getRotateMorphSegmentMs(
      ctx.config.rotateDurationMs,
      ctx.config.morphDurationMs,
      imageCount
    );
    const inMorphPhase = imageCount > 1 && ctx.phaseElapsedMs >= ctx.config.rotateDurationMs;

    if (inMorphPhase) {
      beginMorphSubPhase(ctx);
    }

    const spinSpeedY = computeIntegralEaseInCruiseSpinSpeedY(
      ctx.phaseElapsedMs,
      dtMs,
      segmentMs,
      ctx.config.rotateSpeedY,
      ctx.presentationCycle > 0 ? 0.12 : 0.2
    );

    const morphElapsed = inMorphPhase
      ? ctx.phaseElapsedMs - ctx.config.rotateDurationMs
      : undefined;

    tickShowcasePresentation(ctx, dtMs, {
      spinSpeedY,
      parallaxStrength: 0.04,
      followTarget: "cube",
      ...(morphElapsed !== undefined
        ? { holdPosition: resolveMorphHoldPosition(ctx, morphElapsed) }
        : {}),
    });

    if (inMorphPhase && ctx.stageState.morphStarted) {
      const nextIndex = (ctx.stageState.morphTargetIndex as number) ?? ctx.imageIndex;
      let nextContent;
      try {
        nextContent = ctx.runtime.getHoloContent(ctx.imageUrls[nextIndex]!);
      } catch {
        return "continue";
      }
      if (tickJewelPhotoMorph(ctx.rig, dtMs, ctx.rig.photoMorph, nextContent)) {
        ctx.imageIndex = nextIndex;
      }
    }

    if (ctx.phaseElapsedMs >= segmentMs) {
      return "complete";
    }
    return "continue";
  },
};
