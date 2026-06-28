import {
  startJewelPhotoMorph,
  tickJewelPhotoMorph,
} from "../../babylon/jewelCubePhotoMorph";
import {
  shouldBindPerFaceCubePhotos,
  syncJewelRigFacePhotos,
} from "../../babylon/jewelPhotoCore";
import { resolvePresentationSpinDirection, presentationSpinDirectionToSign } from "../showcasePresentationPreferences";
import {
  resolveMorphHoldPosition,
  tickShowcasePresentation,
} from "../showcasePresentation";
import { computeIntegralEaseInCruiseSpinSpeedY } from "../showcaseSpinMotion";
import { getMorphPhaseStartMs, getRotateMorphSegmentMs } from "../pipelineOrder";
import type { ShowcasePipelineStage } from "../types";

function beginMorphSubPhase(ctx: Parameters<ShowcasePipelineStage["tick"]>[0]): void {
  if (
    ctx.stageState.morphStarted ||
    !ctx.rig ||
    ctx.imageUrls.length <= 1 ||
    shouldBindPerFaceCubePhotos(ctx.rig.photoLayout, ctx.imageUrls.length)
  ) {
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
    const perFaceCube =
      ctx.rig != null && shouldBindPerFaceCubePhotos(ctx.rig.photoLayout, imageCount);
    const morphOverlapMs = perFaceCube ? 0 : ctx.config.morphOverlapMs ?? 0;
    const morphStartMs = getMorphPhaseStartMs(
      ctx.config.rotateDurationMs,
      morphOverlapMs,
      imageCount
    );
    const segmentMs = perFaceCube
      ? ctx.config.rotateDurationMs
      : getRotateMorphSegmentMs(
          ctx.config.rotateDurationMs,
          ctx.config.morphDurationMs,
          imageCount,
          morphOverlapMs
        );
    const inMorphPhase = !perFaceCube && imageCount > 1 && ctx.phaseElapsedMs >= morphStartMs;

    if (inMorphPhase) {
      beginMorphSubPhase(ctx);
    }

    const spinSpeedY = computeIntegralEaseInCruiseSpinSpeedY(
      ctx.phaseElapsedMs,
      dtMs,
      segmentMs,
      ctx.config.rotateSpeedY,
      ctx.presentationCycle > 0 ? 0.32 : 0.4,
      0.22
    );

    const morphElapsed = inMorphPhase
      ? ctx.phaseElapsedMs - morphStartMs
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
      if (perFaceCube && imageCount > 1) {
        ctx.imageIndex = (ctx.imageIndex + 1) % imageCount;
        syncJewelRigFacePhotos(ctx.rig, ctx.runtime, ctx.imageUrls, ctx.imageIndex);
      }
      return "complete";
    }
    return "continue";
  },
};
