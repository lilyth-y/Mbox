import {
  createJewelCubePhysicsRig,
  createJewelCubePhysicsRigStaged,
  attachJewelCrystalShell,
  forceCompileJewelRigShaders,
  shouldStageJewelCubeSpawn,
  isJewelShellRenderable,
} from "../../babylon/jewelCubeFactory";
import { markShowcaseJewelSpawn } from "../../babylon/showcaseInitProfiler";
import { bindShowcaseCameraToCube } from "../showcaseCamera";
import {
  getHeroFramingQuaternion,
  getShowcaseFloatPosition,
  tickShowcasePresentation,
} from "../showcasePresentation";
import { computeIntegralEaseInCruiseSpinSpeedY } from "../showcaseSpinMotion";
import { repositionJewelCube } from "../physicsHelpers";
import { bindShowcaseShellGlow } from "../../babylon/showcaseShellGlow";
import { resolveShowcaseSubsystemFlags } from "../../showcaseGpuProfile";
import { applyJewelCrystalScale, getJewelCrystalFramingExtent } from "../../babylon/showcaseJewelScale";
import { waitGpuFrames } from "../../babylon/showcaseGpuLoadScheduler";
import { withPausedShowcaseRender } from "../../babylon/showcaseRenderControl";
import { isBabylonGlContextLost, waitForGpuStableFrames } from "../../babylon/babylonCanvasGuard";
import {
  markShowcaseGlassUpgradeReady,
  markShowcaseGlassUpgradeSkipped,
  runShowcaseShellUpgrade,
} from "../../babylon/showcaseGlassUpgrade";
import { markShowcaseInitPhase } from "../../babylon/showcaseInitProfiler";
import { isLocalGpuSession, isLocalhostInteractivePreview } from "../../../../shared/lib/gpuSession";
import type { Engine } from "@babylonjs/core/Engines/engine";
import type { JewelCubePhysicsRig } from "../../babylon/jewelCubeFactory";
import {
  getJewelSpawnGeneration,
  isJewelSpawnTokenValid,
} from "../showcaseJewelSpawnToken";
import type { ShowcasePipelineStage } from "../types";

async function waitForExportGpuReady(engine: Engine): Promise<void> {
  if (!isLocalGpuSession()) {
    return;
  }
  for (let i = 0; i < 90; i += 1) {
    if (!isBabylonGlContextLost(engine)) {
      await waitGpuFrames(8);
      if (!isBabylonGlContextLost(engine)) {
        return;
      }
    }
    await waitGpuFrames(4);
  }
}

function disposeStaleRevealJewelRig(rig: JewelCubePhysicsRig): void {
  try {
    rig.dispose();
  } catch {
    // ignore — stale async spawn cleanup
  }
}

async function commitRevealJewelRig(
  ctx: Parameters<NonNullable<ShowcasePipelineStage["tick"]>>[0],
  rig: JewelCubePhysicsRig,
  floatPos: ReturnType<typeof getShowcaseFloatPosition>,
  options?: { shadersAlreadyCompiled?: boolean; spawnToken?: number }
): Promise<void> {
  const spawnToken = options?.spawnToken ?? getJewelSpawnGeneration(ctx);
  const engine = ctx.scene.getEngine() as Engine;
  try {
    await waitForExportGpuReady(engine);
    if (!options?.shadersAlreadyCompiled) {
      await forceCompileJewelRigShaders(rig);
    }
    await ctx.scene.whenReadyAsync();
    await waitGpuFrames(6);
  } catch {
    // continue — rig may still be usable
  }
  if (!isJewelSpawnTokenValid(ctx, spawnToken)) {
    disposeStaleRevealJewelRig(rig);
    return;
  }
  if (!ctx.stageState.jewelSpawnStarted) {
    disposeStaleRevealJewelRig(rig);
    return;
  }
  if (ctx.rig && ctx.rig !== rig) {
    try {
      ctx.rig.dispose();
    } catch {
      // ignore
    }
    ctx.rig = null;
  }
  ctx.rig = rig;
  finalizeRevealSpawn(ctx, floatPos, spawnToken);
}

function finalizeRevealSpawn(
  ctx: Parameters<NonNullable<ShowcasePipelineStage["tick"]>>[0],
  floatPos: ReturnType<typeof getShowcaseFloatPosition>,
  spawnToken: number
): void {
  if (!ctx.rig) {
    return;
  }
  const shapeId = ctx.catalog.shapeId;
  const photoLayout = ctx.catalog.photoLayout;
  markShowcaseJewelSpawn(`${shapeId}/${photoLayout}`);
  applyJewelCrystalScale(ctx.rig, ctx.catalog.crystalSizeScale);
  bindShowcaseCameraToCube(
    ctx.camera,
    ctx.config,
    floatPos,
    getJewelCrystalFramingExtent(shapeId, ctx.rig.crystalSizeScale)
  );
  repositionJewelCube(
    ctx.rig,
    floatPos,
    getHeroFramingQuaternion(floatPos, ctx.camera, ctx.config, ctx.rig)
  );
  ctx.stageState.revealSpawned = true;
  const shellGlow = resolveShowcaseSubsystemFlags().shellGlow;
  if (shellGlow && ctx.rig && isJewelShellRenderable(ctx.rig)) {
    if (shouldStageJewelCubeSpawn()) {
      void waitGpuFrames(12).then(() => {
        if (
          ctx.rig &&
          isJewelSpawnTokenValid(ctx, spawnToken) &&
          isJewelShellRenderable(ctx.rig)
        ) {
          bindShowcaseShellGlow(ctx.rig.shellMesh, ctx.rig.shellInnerMesh);
        }
      });
    } else {
      bindShowcaseShellGlow(ctx.rig.shellMesh, ctx.rig.shellInnerMesh);
    }
  }
  const subsystems = resolveShowcaseSubsystemFlags();
  if (
    subsystems.crystalShell &&
    shouldStageJewelCubeSpawn() &&
    ctx.rig &&
    ctx.rig.shellMesh.name.includes("pending")
  ) {
    const rig = ctx.rig;
    const envTexture = ctx.scene.environmentTexture;
    void (async () => {
      const shellDelay = isLocalhostInteractivePreview() ? 72 : 48;
      await waitGpuFrames(shellDelay);
      if (!ctx.rig || ctx.rig !== rig || !isJewelSpawnTokenValid(ctx, spawnToken)) {
        return;
      }
      const engine = ctx.scene.getEngine() as Engine;
      if (isBabylonGlContextLost(engine)) {
        markShowcaseGlassUpgradeSkipped();
        return;
      }
      const stable = await waitForGpuStableFrames(engine, 6, undefined, 12_000);
      if (stable !== "stable" || isBabylonGlContextLost(engine)) {
        markShowcaseGlassUpgradeSkipped();
        return;
      }
      await runShowcaseShellUpgrade(async () => {
        await withPausedShowcaseRender(engine, async () => {
          if (isBabylonGlContextLost(engine)) {
            throw new Error("context lost before shell attach");
          }
          attachJewelCrystalShell(rig, ctx.scene, envTexture);
          if (isBabylonGlContextLost(engine)) {
            throw new Error("context lost after shell attach");
          }
          await forceCompileJewelRigShaders(rig, { shellOnly: true });
          await waitGpuFrames(isLocalhostInteractivePreview() ? 24 : 6);
        });
        if (
          !ctx.rig ||
          !isJewelSpawnTokenValid(ctx, spawnToken) ||
          !isJewelShellRenderable(ctx.rig)
        ) {
          throw new Error("shell not renderable after attach");
        }
        const shellGlow = resolveShowcaseSubsystemFlags().shellGlow;
        if (shellGlow) {
          bindShowcaseShellGlow(ctx.rig.shellMesh, ctx.rig.shellInnerMesh);
        }
        markShowcaseInitPhase(
          "glass_shell",
          isLocalhostInteractivePreview() ? "lite" : "full"
        );
        markShowcaseGlassUpgradeReady();
        return true;
      });
    })();
  }
  ctx.phaseElapsedMs = 0;
}

/** 홀로 디스플레이 전원 ON — L0–L3 ramp. */
export const revealStage: ShowcasePipelineStage = {
  id: "reveal",
  enter(ctx) {
    ctx.stageState.revealSpawned = false;
    ctx.stageState.jewelSpawnStarted = false;
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
      const spawnOptions = {
        holoContent,
        envTexture: ctx.scene.environmentTexture,
        shapeId,
        photoLayout,
        framePresetId,
        photoFrameColorHex: ctx.catalog.photoFrameColorHex,
        spawnX: floatPos.x,
        spawnY: floatPos.y,
        spawnZ: floatPos.z,
      };

      if (shouldStageJewelCubeSpawn()) {
        if (!ctx.stageState.jewelSpawnStarted) {
          ctx.stageState.jewelSpawnStarted = true;
          const spawnToken = getJewelSpawnGeneration(ctx);
          void createJewelCubePhysicsRigStaged(ctx.scene, spawnOptions).then((rig) =>
            commitRevealJewelRig(ctx, rig, floatPos, {
              shadersAlreadyCompiled: true,
              spawnToken,
            })
          );
        }
        return "continue";
      }

      ctx.stageState.jewelSpawnStarted = true;
      const spawnToken = getJewelSpawnGeneration(ctx);
      const engine = ctx.scene.getEngine() as Engine;
      void withPausedShowcaseRender(engine, async () => {
        const rig = createJewelCubePhysicsRig(ctx.scene, spawnOptions);
        await commitRevealJewelRig(ctx, rig, floatPos, { spawnToken });
      });
      return "continue";
    }

    const revealSpin = computeIntegralEaseInCruiseSpinSpeedY(
      ctx.phaseElapsedMs,
      dtMs,
      ctx.config.revealHoldMs,
      ctx.config.rotateSpeedY,
      0.55
    );

    tickShowcasePresentation(ctx, dtMs, {
      spinSpeedY: revealSpin,
      parallaxStrength: 0.06,
      followTarget: "cube",
    });

    if (ctx.phaseElapsedMs >= ctx.config.revealHoldMs) {
      return "complete";
    }
    return "continue";
  },
};
