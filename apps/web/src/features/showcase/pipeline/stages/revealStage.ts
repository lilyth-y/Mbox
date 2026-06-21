import { createJewelCubePhysicsRig } from "../../babylon/jewelCubeFactory";
import { bindShowcaseCameraToCube } from "../showcaseCamera";
import {
  getHeroFramingQuaternion,
  getShowcaseFloatPosition,
  computeIntegralEaseSpinSpeedY,
  tickShowcasePresentation,
} from "../showcasePresentation";
import { repositionJewelCube } from "../physicsHelpers";
import { bindShowcaseShellGlow } from "../../babylon/showcaseShellGlow";
import { applyJewelCrystalScale } from "../../babylon/showcaseJewelScale";
import type { ShowcasePipelineStage } from "../types";

/** 홀로 디스플레이 전원 ON — L0–L3 ramp. */
export const revealStage: ShowcasePipelineStage = {
  id: "reveal",
  enter(ctx) {
    ctx.stageState.revealSpawned = false;
  },
  tick(ctx, dtMs) {
    if (ctx.imageUrls.length === 0) {
      return "continue";
    }

    if (!ctx.rig) {
      const floatPos = getShowcaseFloatPosition(ctx.config, 0);
      const holoContent = ctx.runtime.getHoloContent(ctx.imageUrls[ctx.imageIndex]!);
      const shapeId = ctx.catalog.shapeId;
      const photoLayout = ctx.catalog.photoLayout;
      const framePresetId = ctx.catalog.framePresetId;
      ctx.rig = createJewelCubePhysicsRig(ctx.scene, {
        holoContent,
        envTexture: ctx.scene.environmentTexture,
        shapeId,
        photoLayout,
        framePresetId,
        photoFrameColorHex: ctx.catalog.photoFrameColorHex,
        spawnX: floatPos.x,
        spawnY: floatPos.y,
        spawnZ: floatPos.z,
      });
      bindShowcaseCameraToCube(ctx.camera, ctx.config, floatPos);
      repositionJewelCube(
        ctx.rig,
        floatPos,
        getHeroFramingQuaternion(floatPos, ctx.camera, ctx.config, ctx.rig)
      );
      ctx.stageState.revealSpawned = true;
      bindShowcaseShellGlow(ctx.rig.shellMesh, ctx.rig.shellInnerMesh);
      applyJewelCrystalScale(ctx.rig, ctx.catalog.crystalSizeScale);
      ctx.phaseElapsedMs = 0;
      return "continue";
    }

    const revealSpin = computeIntegralEaseSpinSpeedY(
      ctx.phaseElapsedMs,
      dtMs,
      ctx.config.revealHoldMs,
      ctx.config.rotateSpeedY
    );

    tickShowcasePresentation(ctx, dtMs, {
      spinSpeedY: revealSpin,
      parallaxStrength: 0.2,
    });

    if (ctx.phaseElapsedMs >= ctx.config.revealHoldMs) {
      return "complete";
    }
    return "continue";
  },
};
