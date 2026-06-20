import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { OUTER_SIZE } from "../../babylon/jewelCubeMaterials";
import { tickShowcaseCameraFollow } from "../showcaseCamera";
import { tickHoloDisplayStack } from "../holoDisplayStack";
import { getHeroFramingQuaternion } from "../showcasePresentation";
import { launchJewelCubeFall, repositionJewelCube } from "../physicsHelpers";
import type { ShowcasePipelineStage } from "../types";

function randomSpawnOffset(exportRecording: boolean): { x: number; z: number } {
  if (exportRecording) {
    return { x: 0, z: 0 };
  }
  const spread = OUTER_SIZE * 0.42;
  return {
    x: (Math.random() - 0.5) * spread,
    z: (Math.random() - 0.5) * spread * 0.75,
  };
}

/** Havok 중력 낙하 — 큐브 높이 기준 짧은 드롭. */
export const fallStage: ShowcasePipelineStage = {
  id: "fall",
  enter(ctx) {
    if (!ctx.rig) {
      return;
    }
    const center = ctx.config.showcaseCenter;
    const offset = randomSpawnOffset(ctx.exportRecording);
    const spawnY = center.y + ctx.config.fallDropHeight;
    const spawn = new Vector3(center.x + offset.x, spawnY, center.z + offset.z);
    repositionJewelCube(
      ctx.rig,
      spawn,
      getHeroFramingQuaternion(spawn, ctx.camera, ctx.config)
    );
    launchJewelCubeFall(ctx.rig, 1);
    ctx.stageState.fallStarted = true;
  },
  tick(ctx, dtMs) {
    if (!ctx.rig) {
      return "complete";
    }

    const pos = ctx.rig.collider.getAbsolutePosition();
    const linSpeed = ctx.rig.aggregate.body.getLinearVelocity().length();
    tickShowcaseCameraFollow(ctx, dtMs, "fall");
    tickHoloDisplayStack(ctx, dtMs, 0.4);

    const restY = ctx.config.jewelRestCenterY;
    const nearFloor = pos.y < restY + OUTER_SIZE * 0.12;
    const slowed = linSpeed < 2.4;
    const timedOut = ctx.phaseElapsedMs >= ctx.config.fallMaxMs;

    if ((nearFloor && slowed) || timedOut) {
      return "complete";
    }
    return "continue";
  },
};
